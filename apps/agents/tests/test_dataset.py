"""
Tests para tools/dataset.py — la tool que consulta los catálogos propios del cliente.

Lo que de verdad importa verificar aquí es la FIRMA: que el tipo de cada columna se traduzca al
parámetro correcto y que los valores de un `select` viajen dentro del esquema. Eso es lo que impide
que el modelo pida un valor inexistente y reciba cero resultados sin ningún error.
"""

import json
import sys
from pathlib import Path
from unittest.mock import Mock, patch

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from tools.dataset import load_dataset_tools  # noqa: E402

FIELDS = [
    {"key": "nombre", "label": "Nombre", "type": "text"},
    {"key": "marca", "label": "Marca", "type": "select", "options": ["Toyota", "Ford"]},
    {"key": "precio", "label": "Precio", "type": "number"},
    {"key": "ingreso", "label": "Fecha de ingreso", "type": "date"},
    {"key": "viejo", "label": "Columna vieja", "type": "text", "deletedAt": "2026-01-01"},
]

CONFIG = {
    "dataset_id": "ds-1",
    "dataset_name": "Autos",
    "dataset_description": "Inventario disponible.",
    "fields": FIELDS,
    "api_base": "https://gateway.test",
}

CREDENTIALS = {"access_token": "token-123"}


_UNSET = object()


def make_tools(config=_UNSET, credentials=_UNSET):
    return load_dataset_tools(
        CREDENTIALS if credentials is _UNSET else credentials,
        CONFIG if config is _UNSET else config,
    )


def by_name(tools, name):
    return next(tool for tool in tools if tool.name == name)


def fake_response(payload):
    response = Mock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


class TestFirma:
    def test_expone_las_tres_funciones(self):
        names = {tool.name for tool in make_tools()}
        assert names == {"search_dataset", "get_dataset_item", "list_dataset_values"}

    def test_select_lleva_sus_valores_en_la_firma(self):
        schema = by_name(make_tools(), "search_dataset").args_schema.model_json_schema()

        # Los valores válidos viajan en la descripción del parámetro: el modelo no puede pedir
        # una marca que no exista porque solo ve las que existen.
        assert "Toyota" in schema["properties"]["marca"]["description"]
        assert "Ford" in schema["properties"]["marca"]["description"]

    def test_numero_y_fecha_se_vuelven_rangos(self):
        properties = by_name(make_tools(), "search_dataset").args_schema.model_json_schema()[
            "properties"
        ]

        assert "precio_min" in properties and "precio_max" in properties
        assert "ingreso_desde" in properties and "ingreso_hasta" in properties
        # Un rango, no un valor suelto: el modelo confunde los operadores mucho más que los pares.
        assert "precio" not in properties

    def test_el_texto_se_colapsa_en_un_solo_query(self):
        properties = by_name(make_tools(), "search_dataset").args_schema.model_json_schema()[
            "properties"
        ]

        assert "query" in properties
        assert "nombre" not in properties
        assert "Nombre" in properties["query"]["description"]

    def test_ignora_las_columnas_borradas(self):
        schema = json.dumps(
            by_name(make_tools(), "search_dataset").args_schema.model_json_schema()
        )

        assert "viejo" not in schema

    def test_sort_by_solo_ofrece_columnas_ordenables(self):
        properties = by_name(make_tools(), "search_dataset").args_schema.model_json_schema()[
            "properties"
        ]
        description = properties["sort_by"]["description"]

        assert "precio" in description and "ingreso" in description
        assert "marca" not in description

    def test_sin_configuracion_no_devuelve_tools(self):
        # Anunciarle al cliente una búsqueda que va a fallar en cada intento es peor que no tenerla.
        assert make_tools(config={**CONFIG, "api_base": ""}) == []
        assert make_tools(credentials={}) == []


class TestBusqueda:
    def test_traduce_los_argumentos_al_cuerpo_del_gateway(self):
        tool = by_name(make_tools(), "search_dataset")
        payload = {"total": 0, "items": []}

        with patch("tools.dataset.httpx.request", return_value=fake_response(payload)) as request:
            tool.invoke(
                {
                    "marca": ["Toyota", "Ford"],
                    "precio_min": 200000,
                    "precio_max": 300000,
                    "ingreso_desde": "2026-01-01",
                    "query": "blindado",
                    "sort_by": "-precio",
                }
            )

        body = request.call_args.kwargs["json"]
        assert body["select"] == {"marca": ["Toyota", "Ford"]}
        assert body["range"] == {
            "precio": {"min": 200000, "max": 300000},
            "ingreso": {"min": "2026-01-01"},
        }
        assert body["query"] == "blindado"
        assert body["sortBy"] == "-precio"

    def test_manda_el_token_con_alcance(self):
        tool = by_name(make_tools(), "search_dataset")

        with patch(
            "tools.dataset.httpx.request", return_value=fake_response({"total": 0, "items": []})
        ) as request:
            tool.invoke({})

        assert request.call_args.kwargs["headers"]["Authorization"] == "Bearer token-123"
        assert request.call_args[0][1] == "https://gateway.test/internal/datasets/search"

    def test_devuelve_el_total_y_aplana_las_filas(self):
        tool = by_name(make_tools(), "search_dataset")
        payload = {
            "total": 47,
            "items": [{"id": "r1", "data": {"nombre": "Land Cruiser", "precio": 320000}}],
        }

        with patch("tools.dataset.httpx.request", return_value=fake_response(payload)):
            result = json.loads(tool.invoke({}))

        # El total sirve para contestar "¿cuántos tienes?" sin traerse las 47 filas.
        assert result["total"] == 47
        assert result["mostrando"] == 1
        assert result["resultados"][0] == {"id": "r1", "nombre": "Land Cruiser", "precio": 320000}

    def test_recorta_el_limit_al_maximo(self):
        tool = by_name(make_tools(), "search_dataset")

        with patch(
            "tools.dataset.httpx.request", return_value=fake_response({"total": 0, "items": []})
        ) as request:
            tool.invoke({"limit": 5000})

        assert request.call_args.kwargs["json"]["limit"] == 50

    def test_un_error_del_gateway_no_revienta_la_conversacion(self):
        import httpx

        tool = by_name(make_tools(), "search_dataset")
        response = Mock()
        response.status_code = 401

        with patch(
            "tools.dataset.httpx.request",
            side_effect=httpx.HTTPStatusError("no", request=Mock(), response=response),
        ):
            result = json.loads(tool.invoke({}))

        assert result["ok"] is False
        assert "401" in result["error"]


class TestDescripcion:
    def test_advierte_que_el_contenido_son_datos_y_no_instrucciones(self):
        # Única garantía posible: no hay filtrado semántico, y el contenido lo controla el cliente.
        for tool in make_tools():
            assert "no instrucciones" in tool.description

    def test_nombra_el_catalogo_y_sus_columnas(self):
        description = by_name(make_tools(), "search_dataset").description

        assert "Autos" in description
        assert "Marca" in description and "Precio" in description
