"""
gRPC Servicer — implementación del contrato AgentsService.

Adapta la lógica existente de api/routes.py al transporte gRPC.
La lógica de negocio (build_context, create_agent_graph, tokens) no cambia.
"""

import os
import hmac
import time
import logging
from typing import AsyncIterator
import grpc
from google.protobuf import json_format
from agents.v1 import agents_pb2, agents_pb2_grpc
from langchain_core.messages import HumanMessage
from api.deps import AgentExecutionRequest, validate_request, build_context
from core.agent_factory import create_agent_graph
from core.message_utils import (
    convert_message_history_to_langchain,
    convert_langchain_messages_to_dict,
    extract_human_handoff_from_messages,
)

logger = logging.getLogger(__name__)


# ── Auth helper ───────────────────────────────────────────────────────────────
def _verify_token(context: grpc.aio.ServicerContext, expected: str) -> bool:
    if not expected:
        return True
    metadata = dict(context.invocation_metadata())
    token = metadata.get("x-internal-token", "")
    return hmac.compare_digest(token, expected)


# ── Proto ↔ dict converters ───────────────────────────────────────────────────

def _proto_to_pydantic_request(req: agents_pb2.AgentExecutionRequest) -> AgentExecutionRequest:
    """Convierte un proto AgentExecutionRequest al modelo Pydantic existente."""
    agents_config = {
        name: {
            "model": cfg.model,
            "temperature": cfg.temperature,
            "system_prompt": cfg.system_prompt,
            "max_tokens": cfg.max_tokens or None,
            "fallbacks": list(cfg.fallbacks),
            "max_retries": cfg.max_retries or None,
            "timeout": cfg.timeout or None,
            "api_base": cfg.api_base or None,
        }
        for name, cfg in req.agents_config.items()
    }

    agent_tool_instances = {
        agent_name: {
            tool_uuid: {
                "tool_name": tool.tool_name,
                "display_name": tool.display_name,
                "config": json_format.MessageToDict(tool.config),
                "enabled_functions": list(tool.enabled_functions),
                "credentials": json_format.MessageToDict(tool.credentials),
            }
            for tool_uuid, tool in tool_map.tools.items()
        }
        for agent_name, tool_map in req.agent_tool_instances.items()
    }

    return AgentExecutionRequest(
        tenant_id=req.tenant_id,
        workflow_id=req.workflow_id,
        conversation_id=req.conversation_id,
        user_type=req.user_type,
        user_id=req.user_id,
        channel=req.channel,
        user_message=req.user_message,
        graph_config=json_format.MessageToDict(req.graph_config),
        agents_config=agents_config,
        agent_tool_instances=agent_tool_instances,
        message_history=[
            {"role": m.role, "content": m.content} for m in req.message_history
        ],
        user_metadata=json_format.MessageToDict(req.user_metadata),
        timezone=req.timezone or "UTC",
    )


def _build_execution_metadata(
    execution_time_ms: int,
    graph_type: str,
    agents_count: int,
    usage_by_model: dict,
    human_handoff: dict | None,
) -> agents_pb2.ExecutionMetadata:
    total_input = sum(v["input_tokens"] for v in usage_by_model.values())
    total_output = sum(v["output_tokens"] for v in usage_by_model.values())

    model_usage_proto = {
        name: agents_pb2.ModelUsage(
            input_tokens=v["input_tokens"],
            output_tokens=v["output_tokens"],
            total_tokens=v["total_tokens"],
        )
        for name, v in usage_by_model.items()
    }

    handoff_proto = agents_pb2.HumanHandoff(
        requested=human_handoff.get("requested", False) if human_handoff else False,
        reason=human_handoff.get("reason", "") if human_handoff else "",
        tool_name=human_handoff.get("tool_name", "") if human_handoff else "",
    )

    return agents_pb2.ExecutionMetadata(
        execution_time_ms=execution_time_ms,
        graph_type=graph_type,
        agents_count=agents_count,
        input_tokens=total_input,
        output_tokens=total_output,
        total_tokens=total_input + total_output,
        usage_by_model=model_usage_proto,
        human_handoff_requested=handoff_proto,
    )


def _dict_to_struct(d: dict):
    s = agents_pb2.Struct()
    s.update(d or {})
    return s


# ── Servicer ──────────────────────────────────────────────────────────────────

class AgentsServicer(agents_pb2_grpc.AgentsServiceServicer):

    def __init__(self) -> None:
        self._internal_secret: str = os.getenv("AGENTS_INTERNAL_SECRET", "")
        if self._internal_secret:
            logger.info("Internal token auth enabled")
        else:
            logger.warning("AGENTS_INTERNAL_SECRET not set — auth disabled")

    async def Execute(
        self,
        request: agents_pb2.AgentExecutionRequest,
        context: grpc.aio.ServicerContext,
    ) -> agents_pb2.AgentExecutionResponse:
        if not _verify_token(context, self._internal_secret):
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid internal token")

        conversation_id = request.conversation_id
        start_time = time.time()

        try:
            logger.info(
                "TEMP-DIAG Execute raw: graph_config=%s agents_config_keys=%s channel=%s",
                json_format.MessageToDict(request.graph_config),
                list(request.agents_config.keys()),
                request.channel,
            )
            pydantic_req = _proto_to_pydantic_request(request)
            validated = validate_request(pydantic_req)
            ctx = build_context(validated)
            graph = create_agent_graph(ctx)

            messages = convert_message_history_to_langchain(validated.message_history)
            messages.append(HumanMessage(content=validated.user_message))

            result = graph.invoke({"messages": messages, "iteration_count": 0})
            execution_time_ms = int((time.time() - start_time) * 1000)

            output_messages = result.get("messages", [])

            usage_by_model: dict[str, dict] = {}
            max_input_per_model: dict[str, int] = {}

            for msg in output_messages:
                if not (hasattr(msg, "usage_metadata") and msg.usage_metadata):
                    continue
                usage = msg.usage_metadata
                input_tokens = usage.get("input_tokens", 0)
                output_tokens = usage.get("output_tokens", 0)
                model_name = "unknown"
                if hasattr(msg, "response_metadata") and msg.response_metadata:
                    model_name = (
                        msg.response_metadata.get("model_name")
                        or msg.response_metadata.get("model", "unknown")
                    )
                if model_name == "unknown":
                    default_agent = ctx.get_agent_config("default") or {}
                    model_name = default_agent.get("model", "unknown")

                if model_name not in usage_by_model:
                    usage_by_model[model_name] = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
                    max_input_per_model[model_name] = 0

                if input_tokens > max_input_per_model[model_name]:
                    max_input_per_model[model_name] = input_tokens
                usage_by_model[model_name]["output_tokens"] += output_tokens

            for name in usage_by_model:
                usage_by_model[name]["input_tokens"] = max_input_per_model[name]
                usage_by_model[name]["total_tokens"] = (
                    max_input_per_model[name] + usage_by_model[name]["output_tokens"]
                )

            all_messages = convert_langchain_messages_to_dict(output_messages)
            human_handoff = extract_human_handoff_from_messages(output_messages)
            response_messages = [m for m in all_messages if m.get("role") == "assistant"]

            proto_messages = [
                agents_pb2.Message(role=m["role"], content=m["content"])
                for m in response_messages
            ]

            metadata = _build_execution_metadata(
                execution_time_ms=execution_time_ms,
                graph_type=ctx.graph_config.get("type", ""),
                agents_count=len(ctx.agents_config),
                usage_by_model=usage_by_model,
                human_handoff=human_handoff,
            )

            return agents_pb2.AgentExecutionResponse(
                conversation_id=conversation_id,
                messages=proto_messages,
                metadata=metadata,
            )

        except Exception as e:
            logger.error(f"[{conversation_id}] Execute failed: {e}", exc_info=True)
            await context.abort(grpc.StatusCode.INTERNAL, str(e))

    async def ExecuteStream(
        self,
        request: agents_pb2.AgentExecutionRequest,
        context: grpc.aio.ServicerContext,
    ) -> AsyncIterator[agents_pb2.AgentStreamEvent]:
        if not _verify_token(context, self._internal_secret):
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid internal token")
            return

        conversation_id = request.conversation_id
        start_time = time.time()

        usage_by_model: dict[str, dict] = {}
        max_input_per_model: dict[str, int] = {}
        human_handoff: dict | None = None

        try:
            logger.info(
                "TEMP-DIAG ExecuteStream raw: graph_config=%s agents_config_keys=%s channel=%s",
                json_format.MessageToDict(request.graph_config),
                list(request.agents_config.keys()),
                request.channel,
            )
            pydantic_req = _proto_to_pydantic_request(request)
            validated = validate_request(pydantic_req)
            ctx = build_context(validated, streaming=True)
            graph = create_agent_graph(ctx)

            messages = convert_message_history_to_langchain(validated.message_history)
            messages.append(HumanMessage(content=validated.user_message))

            async for event in graph.astream_events(
                {"messages": messages, "iteration_count": 0},
                version="v2",
            ):
                event_type = event.get("event", "")

                if event_type == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield agents_pb2.AgentStreamEvent(type="token", content=chunk.content)

                elif event_type == "on_tool_start":
                    tool_name = event.get("name", "unknown")
                    tool_input = event.get("data", {}).get("input", {})
                    from google.protobuf.struct_pb2 import Struct
                    meta = Struct()
                    meta.update({"tool_name": tool_name, "input": str(tool_input)[:200]})
                    yield agents_pb2.AgentStreamEvent(
                        type="tool_start",
                        content=f"Usando herramienta: {tool_name}",
                        metadata=meta,
                    )

                elif event_type == "on_tool_end":
                    tool_name = event.get("name", "unknown")
                    tool_output = event.get("data", {}).get("output", "")

                    if str(tool_name).startswith("request_human_handoff"):
                        import json
                        reason = "Necesita atencion humana"
                        if isinstance(tool_output, str) and tool_output.strip():
                            try:
                                parsed = json.loads(tool_output)
                                if isinstance(parsed, dict):
                                    reason = str(parsed.get("reason") or reason)
                            except Exception:
                                reason = tool_output.strip()
                        human_handoff = {"requested": True, "reason": reason, "tool_name": str(tool_name)}

                    from google.protobuf.struct_pb2 import Struct
                    meta = Struct()
                    meta.update({"tool_name": tool_name, "output": str(tool_output)[:200]})
                    yield agents_pb2.AgentStreamEvent(
                        type="tool_end",
                        content=f"Herramienta completada: {tool_name}",
                        metadata=meta,
                    )

                elif event_type == "on_chat_model_end":
                    output = event.get("data", {}).get("output")
                    if not output:
                        continue
                    usage = getattr(output, "usage_metadata", None)
                    if isinstance(output, dict):
                        usage = output.get("usage_metadata")
                    if not usage:
                        continue

                    input_tokens = usage.get("input_tokens", 0)
                    output_tokens = usage.get("output_tokens", 0)
                    model_name = "unknown"
                    if hasattr(output, "response_metadata") and output.response_metadata:
                        model_name = (
                            output.response_metadata.get("model_name")
                            or output.response_metadata.get("model", "unknown")
                        )
                    if model_name == "unknown" and ctx:
                        model_name = (ctx.get_agent_config("default") or {}).get("model", "unknown")

                    if model_name not in usage_by_model:
                        usage_by_model[model_name] = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
                        max_input_per_model[model_name] = 0
                    if input_tokens > max_input_per_model[model_name]:
                        max_input_per_model[model_name] = input_tokens
                    usage_by_model[model_name]["output_tokens"] += output_tokens

            # Calcular totales
            for name in usage_by_model:
                usage_by_model[name]["input_tokens"] = max_input_per_model[name]
                usage_by_model[name]["total_tokens"] = (
                    max_input_per_model[name] + usage_by_model[name]["output_tokens"]
                )

            execution_time_ms = int((time.time() - start_time) * 1000)
            total_input = sum(v["input_tokens"] for v in usage_by_model.values())
            total_output = sum(v["output_tokens"] for v in usage_by_model.values())

            from google.protobuf.struct_pb2 import Struct
            meta_struct = Struct()
            meta_struct.update({
                "execution_time_ms": execution_time_ms,
                "input_tokens": total_input,
                "output_tokens": total_output,
                "total_tokens": total_input + total_output,
                "usage_by_model": usage_by_model,
                "human_handoff_requested": human_handoff,
            })
            yield agents_pb2.AgentStreamEvent(type="metadata", content="", metadata=meta_struct)
            yield agents_pb2.AgentStreamEvent(type="end", content="")

        except Exception as e:
            logger.error(f"[{conversation_id}] ExecuteStream failed: {e}", exc_info=True)
            yield agents_pb2.AgentStreamEvent(type="error", content=str(e))
