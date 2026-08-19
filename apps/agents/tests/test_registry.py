"""
Tests para tools/registry.py.

Cubre:
- _filter_tool_functions()
- load_specific_tool()
- load_tools()
- get_llm()
"""

import pytest
import re
import sys
from pathlib import Path
from unittest.mock import patch, Mock, MagicMock

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from core.context import TenantContext
from tools.registry import _filter_tool_functions, load_specific_tool, load_tools


# ──────────────────────────────────────────────
# Fixture helper
# ──────────────────────────────────────────────

def make_ctx(**kwargs) -> TenantContext:
    defaults = dict(
        tenant_id="test-tenant",
        workflow_id="test-workflow",
        conversation_id="test-conv",
        user_type="internal",
        user_id="test-user",
        channel="dashboard",
        agents_config={"default": {"model": "gpt-4o", "temperature": 0.7}},
        streaming=False,
    )
    defaults.update(kwargs)
    return TenantContext(**defaults)


def make_tool(name: str, description: str = "A tool") -> Mock:
    tool = Mock()
    tool.name = name
    tool.description = description
    return tool


# ──────────────────────────────────────────────
# _filter_tool_functions
# ──────────────────────────────────────────────

class TestFilterToolFunctions:

    def test_returns_all_when_no_filter(self):
        tools = [make_tool(f"tool_{i}") for i in range(3)]
        result = _filter_tool_functions(tools, [])
        assert result == tools

    def test_filters_by_name(self):
        t1 = make_tool("calculator")
        t2 = make_tool("percentage")
        t3 = make_tool("currency_convert")

        result = _filter_tool_functions([t1, t2, t3], ["calculator", "percentage"])

        assert len(result) == 2
        assert t1 in result
        assert t2 in result
        assert t3 not in result

    def test_returns_empty_when_no_matches(self):
        result = _filter_tool_functions([make_tool("calculator")], ["inexistente"])
        assert result == []

    def test_handles_single_tool_object(self):
        tool = make_tool("calculator")
        result = _filter_tool_functions(tool, ["calculator"])
        assert len(result) == 1
        assert result[0] is tool

    def test_handles_empty_tools_list(self):
        result = _filter_tool_functions([], ["calculator"])
        assert result == []

    def test_handles_none_as_tools(self):
        result = _filter_tool_functions(None, ["calculator"])
        assert result == []

    def test_all_match_returns_all(self):
        tools = [make_tool("a"), make_tool("b"), make_tool("c")]
        result = _filter_tool_functions(tools, ["a", "b", "c"])
        assert len(result) == 3


# ──────────────────────────────────────────────
# load_specific_tool
# ──────────────────────────────────────────────

class TestLoadSpecificTool:

    @patch("tools.calculator.load_calculator_tools")
    def test_loads_calculator(self, mock_loader):
        mock_tools = [make_tool("calculator"), make_tool("percentage")]
        mock_loader.return_value = mock_tools
        ctx = make_ctx()

        result = load_specific_tool("calculator", {}, {}, ctx)

        mock_loader.assert_called_once()
        assert result == mock_tools

    @patch("tools.human_handoff.load_human_handoff_tools")
    def test_loads_human_handoff(self, mock_loader):
        mock_tools = [make_tool("request_human_handoff")]
        mock_loader.return_value = mock_tools
        ctx = make_ctx()

        result = load_specific_tool("human_handoff", {}, {}, ctx)

        mock_loader.assert_called_once()
        assert result == mock_tools

    @patch("tools.google.calendar.load_google_calendar_tools")
    def test_loads_google_calendar(self, mock_loader):
        creds = {"accessToken": "xxx"}
        config = {"calendar_id": "primary"}
        mock_tools = [make_tool("check_calendar_availability")]
        mock_loader.return_value = mock_tools
        ctx = make_ctx(timezone="America/Mexico_City")

        result = load_specific_tool("google_calendar", creds, config, ctx)

        mock_loader.assert_called_once_with(
            creds, {"calendar_id": "primary", "timezone": "America/Mexico_City"}
        )
        assert result == mock_tools

    @patch("tools.google.calendar.load_google_calendar_tools")
    def test_google_calendar_inherits_workflow_timezone(self, mock_loader):
        """Sin timezone en el config, la tool usa la del workflow (no UTC)."""
        mock_loader.return_value = []
        ctx = make_ctx(timezone="America/Mexico_City")

        load_specific_tool("google_calendar", {}, {"calendar_id": "primary"}, ctx)

        _, passed_config = mock_loader.call_args[0]
        assert passed_config["timezone"] == "America/Mexico_City"
        assert passed_config["calendar_id"] == "primary"

    @patch("tools.google.calendar.load_google_calendar_tools")
    def test_google_calendar_config_timezone_overrides_workflow(self, mock_loader):
        """Un calendario que vive en otra zona conserva su override explícito."""
        mock_loader.return_value = []
        ctx = make_ctx(timezone="America/Mexico_City")

        load_specific_tool(
            "google_calendar", {}, {"timezone": "America/Tijuana"}, ctx
        )

        _, passed_config = mock_loader.call_args[0]
        assert passed_config["timezone"] == "America/Tijuana"

    def test_unknown_tool_returns_empty_list(self):
        ctx = make_ctx()
        result = load_specific_tool("herramienta_desconocida", {}, {}, ctx)
        assert result == []

    @patch("tools.calculator.load_calculator_tools")
    def test_wraps_single_tool_in_list(self, mock_loader):
        single_tool = make_tool("calculator")
        mock_loader.return_value = single_tool  # retorna objeto, no lista
        ctx = make_ctx()

        result = load_specific_tool("calculator", {}, {}, ctx)

        assert isinstance(result, list)
        assert result[0] is single_tool


# ──────────────────────────────────────────────
# load_tools
# ──────────────────────────────────────────────

class TestLoadTools:

    def test_returns_empty_when_no_agent_tool_instances(self):
        ctx = make_ctx()  # agent_tool_instances vacío por defecto
        result = load_tools(ctx, "default")
        assert result == []

    def test_returns_empty_when_agent_not_in_instances(self):
        ctx = make_ctx(agent_tool_instances={"otro_agente": {}})
        result = load_tools(ctx, "default")
        assert result == []

    @patch("tools.calculator.load_calculator_tools")
    def test_loads_tool_and_adds_display_suffix(self, mock_loader):
        tool = make_tool("calculator")
        mock_loader.return_value = [tool]

        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-123": {
                    "tool_name": "calculator",
                    "display_name": "Calc Ventas",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": None,
                }
            }
        })

        result = load_tools(ctx, "default")

        assert len(result) == 1
        assert "Calc_Ventas" in result[0].name

    @patch("tools.calculator.load_calculator_tools")
    def test_filters_enabled_functions(self, mock_loader):
        t1 = make_tool("calculator")
        t2 = make_tool("percentage")
        mock_loader.return_value = [t1, t2]

        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-123": {
                    "tool_name": "calculator",
                    "display_name": "Calc",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": ["calculator"],
                }
            }
        })

        result = load_tools(ctx, "default")

        assert len(result) == 1
        assert "calculator" in result[0].name

    @patch("tools.calculator.load_calculator_tools")
    def test_no_filtering_when_enabled_functions_is_none(self, mock_loader):
        t1 = make_tool("calculator")
        t2 = make_tool("percentage")
        mock_loader.return_value = [t1, t2]

        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-123": {
                    "tool_name": "calculator",
                    "display_name": "Calc",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": None,
                }
            }
        })

        result = load_tools(ctx, "default")
        assert len(result) == 2

    def test_skips_instance_with_missing_tool_name(self):
        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-bad": {
                    # tool_name ausente → KeyError → se omite
                    "display_name": "Bad Tool",
                    "credentials": {},
                }
            }
        })

        # No debe lanzar excepción
        result = load_tools(ctx, "default")
        assert result == []

    @patch("tools.calculator.load_calculator_tools")
    def test_appends_display_name_to_description(self, mock_loader):
        tool = make_tool("calculator", "Realiza cálculos")
        mock_loader.return_value = [tool]

        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-123": {
                    "tool_name": "calculator",
                    "display_name": "Mi Calculadora",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": None,
                }
            }
        })

        result = load_tools(ctx, "default")
        assert "Mi Calculadora" in result[0].description

    @patch("tools.calculator.load_calculator_tools")
    def test_multiple_instances_of_same_tool(self, mock_loader):
        mock_loader.return_value = [make_tool("calculator")]

        ctx = make_ctx(agent_tool_instances={
            "default": {
                "uuid-1": {
                    "tool_name": "calculator",
                    "display_name": "Calc A",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": None,
                },
                "uuid-2": {
                    "tool_name": "calculator",
                    "display_name": "Calc B",
                    "credentials": {},
                    "config": {},
                    "enabled_functions": None,
                },
            }
        })

        result = load_tools(ctx, "default")
        names = [t.name for t in result]
        assert any("Calc_A" in n for n in names)
        assert any("Calc_B" in n for n in names)


# ──────────────────────────────────────────────
# _normalize_tool_names (ejercitado vía load_tools)
# ──────────────────────────────────────────────

# Lo que OpenAI valida en tools[N].function.name; 400 si no casa.
OPENAI_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
OPENAI_NAME_MAX_LENGTH = 64


def make_instances(*pairs) -> dict:
    """agent_tool_instances para load_tools, desde pares (tool_name, display_name)."""
    return {
        "default": {
            f"uuid-{i}": {
                "tool_name": tool_name,
                "display_name": display_name,
                "credentials": {},
                "config": {},
                "enabled_functions": None,
            }
            for i, (tool_name, display_name) in enumerate(pairs)
        }
    }


class TestToolNameNormalization:

    @patch("tools.dataset.load_dataset_tools")
    def test_strips_invalid_chars_and_accents(self, mock_loader):
        # El Gateway nombra las instancias de dataset `Datos: <catálogo>`: los dos puntos
        # rompen el patrón siempre, y el acento lo agrava.
        mock_loader.return_value = [make_tool("search_dataset")]

        ctx = make_ctx(agent_tool_instances=make_instances(
            ("dataset", "Datos: Vehículos blindados"),
        ))

        name = load_tools(ctx, "default")[0].name

        assert OPENAI_NAME_PATTERN.match(name)
        # El acento cae a su letra base, no a un guion bajo.
        assert "Vehiculos_blindados" in name

    @patch("tools.dataset.load_dataset_tools")
    def test_caps_name_at_provider_limit(self, mock_loader):
        mock_loader.return_value = [make_tool("list_dataset_values")]

        ctx = make_ctx(agent_tool_instances=make_instances(
            ("dataset", "Datos: Catálogo de vehículos blindados y equipo especializado"),
        ))

        name = load_tools(ctx, "default")[0].name

        assert len(name) <= OPENAI_NAME_MAX_LENGTH
        assert OPENAI_NAME_PATTERN.match(name)
        # El recorte sale del sufijo: el nombre base queda entero.
        assert name.startswith("list_dataset_values_")

    @patch("tools.calculator.load_calculator_tools")
    def test_dedupes_display_names_that_collapse(self, mock_loader):
        # "Ventas MX" y "Ventas-MX" son distintos para el índice único de tenant_tools,
        # pero colapsan al mismo nombre al normalizar.
        mock_loader.return_value = [make_tool("calculator")]

        ctx = make_ctx(agent_tool_instances=make_instances(
            ("calculator", "Ventas MX"),
            ("calculator", "Ventas-MX"),
        ))

        result = load_tools(ctx, "default")
        names = [t.name for t in result]

        assert len(result) == 2
        assert len(set(names)) == 2, "una tool taparía a la otra en tools_by_name"
        assert all(OPENAI_NAME_PATTERN.match(n) for n in names)
        assert all(t.metadata["base_name"] == "calculator" for t in result)

    @patch("tools.calculator.load_calculator_tools")
    def test_signal_tool_colliding_with_instance_survives(self, mock_loader):
        mock_loader.return_value = [make_tool("calculator")]

        ctx = make_ctx(
            agents_config={
                "default": {
                    "model": "gpt-4o",
                    "signal_tools": [{
                        "name": "calculator_Ventas",
                        "description": "Señal que choca con el nombre de la instancia",
                    }],
                }
            },
            agent_tool_instances=make_instances(("calculator", "Ventas")),
        )

        result = load_tools(ctx, "default")
        names = [t.name for t in result]

        assert len(result) == 2
        assert len(set(names)) == 2
        # La signal conserva su base_name crudo: es lo que referencia la config.
        signal = next(t for t in result if t.metadata.get("signal"))
        assert signal.metadata["base_name"] == "calculator_Ventas"

    @patch("tools.calculator.load_calculator_tools")
    def test_display_name_without_valid_chars_falls_back_to_base(self, mock_loader):
        mock_loader.return_value = [make_tool("calculator")]

        ctx = make_ctx(agent_tool_instances=make_instances(("calculator", "✅")))

        assert load_tools(ctx, "default")[0].name == "calculator"

    @patch("tools.dataset.load_dataset_tools")
    def test_config_still_resolves_tool_by_base_name(self, mock_loader):
        # disable_tools_if / set_variables_on_tool_call referencian el nombre sin sufijo.
        from graphs.pipeline.nodes.agent import tool_name_matches

        mock_loader.return_value = [make_tool("search_dataset")]

        ctx = make_ctx(agent_tool_instances=make_instances(
            ("dataset", "Datos: Vehículos blindados"),
        ))

        tool = load_tools(ctx, "default")[0]

        assert tool.name != "search_dataset"
        assert tool_name_matches("search_dataset", tool)


# ──────────────────────────────────────────────
# get_llm
# ──────────────────────────────────────────────

class TestGetLlm:

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_returns_llm_with_model_config(self, mock_chat_class):
        mock_llm = Mock()
        mock_chat_class.return_value = mock_llm

        ctx = make_ctx(agents_config={
            "default": {
                "model": "gpt-4o",
                "temperature": 0.5,
            }
        })

        from tools.registry import get_llm
        result = get_llm(ctx, "default")

        mock_chat_class.assert_called_once()
        call_kwargs = mock_chat_class.call_args[1]
        assert call_kwargs["model"] == "gpt-4o"
        assert call_kwargs["temperature"] == 0.5
        assert result is mock_llm

    def test_raises_when_no_model_config(self):
        ctx = make_ctx(agents_config={})

        from tools.registry import get_llm
        with pytest.raises(ValueError, match="No model configuration"):
            get_llm(ctx, "default")

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_raises_when_model_name_missing(self, mock_chat_class):
        ctx = make_ctx(agents_config={
            "default": {"temperature": 0.7}  # sin "model"
        })

        from tools.registry import get_llm
        with pytest.raises(ValueError, match="missing 'model'"):
            get_llm(ctx, "default")

    @patch("langchain_community.chat_models.ChatLiteLLM")
    def test_passes_streaming_flag(self, mock_chat_class):
        mock_chat_class.return_value = Mock()

        ctx = make_ctx(
            agents_config={"default": {"model": "gpt-4o"}},
            streaming=True,
        )

        from tools.registry import get_llm
        get_llm(ctx, "default")

        call_kwargs = mock_chat_class.call_args[1]
        assert call_kwargs["streaming"] is True
