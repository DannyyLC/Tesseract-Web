"""
Tests del catálogo de nodos (editor-readiness):
- get_node_catalog: tipos, schemas y contrato de templates
- Aristas con puerto desde conditions (forma del editor) — declarativas
- RPC GetNodeCatalog del servicer
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402
from langchain_core.messages import AIMessage, HumanMessage  # noqa: E402
from core.context import TenantContext  # noqa: E402
from graphs.pipeline import (  # noqa: E402
    SUPPORTED_SCHEMA_VERSION,
    create_pipeline_agent,
    get_node_catalog,
)


class TestGetNodeCatalog:

    def test_contains_all_node_types_with_schemas(self):
        catalog = get_node_catalog()
        assert set(catalog["node_types"]) == {
            "agent", "tool", "set_variables", "condition", "synthesizer",
        }
        for node_type, meta in catalog["node_types"].items():
            assert meta["type"] == node_type
            assert meta["label"]
            assert meta["description"]
            assert meta["config_schema"]["type"] == "object"
            assert "inputs" in meta["ports"]

    def test_schema_version_matches_engine(self):
        catalog = get_node_catalog()
        assert catalog["schema_version"] == SUPPORTED_SCHEMA_VERSION
        assert catalog["graph_type"] == "pipeline"

    def test_declares_template_namespaces(self):
        catalog = get_node_catalog()
        assert "variables" in catalog["templates"]["namespaces"]
        assert "context" in catalog["templates"]["namespaces"]

    def test_is_json_serializable(self):
        assert json.loads(json.dumps(get_node_catalog()))


class TestEdgeOutputPorts:

    def test_edges_from_condition_with_output_are_declarative(self):
        # Forma del editor: la arista desde la condition documenta el puerto;
        # el ruteo real lo resuelve la condition. El grafo compila y rutea igual.
        graph_config = {
            "type": "pipeline",
            "nodes": [
                {"id": "cond", "type": "condition", "config": {
                    "mode": "switch", "source": "variables.x",
                    "branches": {"a": "nodo_a", "default": "nodo_b"},
                }},
                {"id": "nodo_a", "type": "agent", "agent": "a"},
                {"id": "nodo_b", "type": "agent", "agent": "a"},
            ],
            "edges": [
                {"from": "START", "to": "cond"},
                {"from": "cond", "output": "a", "to": "nodo_a"},
                {"from": "cond", "output": "default", "to": "nodo_b"},
                {"from": "nodo_a", "to": "END"},
                {"from": "nodo_b", "to": "END"},
            ],
        }

        class FakeLLM:
            def invoke(self, messages, config=None):
                return AIMessage(content="ok")

        ctx = TenantContext(
            tenant_id="t", workflow_id="wf", conversation_id="c",
            user_type="internal", user_id="u", channel="dashboard",
            graph_config=graph_config,
            agents_config={"a": {"model": "m", "system_prompt": "x"}},
        )
        with patch("tools.registry.get_llm", return_value=FakeLLM()):
            graph = create_pipeline_agent(ctx)

        result = graph.invoke({
            "messages": [HumanMessage(content="hola")],
            "variables": {"x": "a"},
            "current_node": "", "execution_path": [], "iteration_count": 0,
            "specialist_outputs": [], "internal_usage": [], "parallel_mode": False,
        })
        assert "nodo_a" in result["execution_path"]
        assert "nodo_b" not in result["execution_path"]


class TestGetNodeCatalogRpc:

    class FakeGrpcContext:
        def invocation_metadata(self):
            return []

        async def abort(self, code, details):
            raise RuntimeError(f"aborted: {code} {details}")

    @pytest.mark.asyncio
    async def test_returns_catalog_json(self):
        from grpc_servicer import AgentsServicer
        from agents.v1 import agents_pb2

        servicer = AgentsServicer()
        response = await servicer.GetNodeCatalog(
            agents_pb2.NodeCatalogRequest(graph_type="pipeline"),
            self.FakeGrpcContext(),
        )
        catalog = json.loads(response.catalog_json)
        assert catalog["graph_type"] == "pipeline"
        assert "agent" in catalog["node_types"]

    @pytest.mark.asyncio
    async def test_empty_graph_type_defaults_to_pipeline(self):
        from grpc_servicer import AgentsServicer
        from agents.v1 import agents_pb2

        servicer = AgentsServicer()
        response = await servicer.GetNodeCatalog(
            agents_pb2.NodeCatalogRequest(graph_type=""),
            self.FakeGrpcContext(),
        )
        assert json.loads(response.catalog_json)["graph_type"] == "pipeline"

    @pytest.mark.asyncio
    async def test_unknown_graph_type_aborts(self):
        from grpc_servicer import AgentsServicer
        from agents.v1 import agents_pb2

        servicer = AgentsServicer()
        with pytest.raises(RuntimeError, match="aborted"):
            await servicer.GetNodeCatalog(
                agents_pb2.NodeCatalogRequest(graph_type="react"),
                self.FakeGrpcContext(),
            )
