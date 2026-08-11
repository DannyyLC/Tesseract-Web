"""
Autenticación del canal Gateway → Agents.

El servicio de agentes es alcanzable desde internet, así que `AGENTS_INTERNAL_SECRET` es lo
único que separa la ejecución de workflows de cualquiera en la red. Estos tests fijan las dos
mitades del arreglo:

- `_verify_token` falla cerrado: sin secreto configurado no pasa nadie (antes pasaba todo el
  mundo, y el único rastro era un warning en el arranque).
- `validate_env` impide que una revisión sin secreto llegue siquiera a servir tráfico en
  producción, para que el rechazo de arriba no se traduzca en un servicio caído pero "sano" a
  ojos de Cloud Run.
"""

import sys
from pathlib import Path

src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

import pytest  # noqa: E402

from core.env_validation import validate_env  # noqa: E402


SECRET = "un-secreto-de-prueba"


class FakeGrpcContext:
    """Mismo patrón que en test_node_catalog.py."""

    def __init__(self, metadata=None):
        self._metadata = metadata or []
        self.aborted_with = None

    def invocation_metadata(self):
        return self._metadata

    async def abort(self, code, details):
        self.aborted_with = code
        raise RuntimeError(f"aborted: {code} {details}")


class TestVerifyToken:

    def test_sin_secreto_configurado_no_deja_pasar(self):
        """El corazón del cambio: `expected` vacío ya no es una puerta abierta."""
        from grpc_servicer import _verify_token

        context = FakeGrpcContext([("x-internal-token", "lo-que-sea")])
        assert _verify_token(context, "") is False

    def test_token_correcto_pasa(self):
        from grpc_servicer import _verify_token

        context = FakeGrpcContext([("x-internal-token", SECRET)])
        assert _verify_token(context, SECRET) is True

    def test_token_incorrecto_no_pasa(self):
        from grpc_servicer import _verify_token

        context = FakeGrpcContext([("x-internal-token", "otro")])
        assert _verify_token(context, SECRET) is False

    def test_sin_metadata_no_pasa(self):
        from grpc_servicer import _verify_token

        assert _verify_token(FakeGrpcContext([]), SECRET) is False


class TestRpcRechaza:

    @pytest.mark.asyncio
    async def test_servicer_sin_secreto_aborta_unauthenticated(self, monkeypatch):
        """
        La misma regla, vista desde el RPC: un servicer construido sin la variable no responde
        el catálogo. Es el escenario que se daba al recrear el servicio en GCP y perder las
        variables de entorno.
        """
        import grpc
        from grpc_servicer import AgentsServicer
        from agents.v1 import agents_pb2

        monkeypatch.delenv("AGENTS_INTERNAL_SECRET", raising=False)
        context = FakeGrpcContext([])

        with pytest.raises(RuntimeError, match="aborted"):
            await AgentsServicer().GetNodeCatalog(
                agents_pb2.NodeCatalogRequest(graph_type="pipeline"), context
            )
        assert context.aborted_with == grpc.StatusCode.UNAUTHENTICATED


class TestValidateEnv:

    @pytest.fixture(autouse=True)
    def _clean_env(self, monkeypatch):
        monkeypatch.delenv("K_SERVICE", raising=False)
        monkeypatch.delenv("NODE_ENV", raising=False)
        monkeypatch.delenv("AGENTS_INTERNAL_SECRET", raising=False)

    def test_en_produccion_sin_secreto_corta_el_arranque(self, monkeypatch):
        monkeypatch.setenv("K_SERVICE", "agents")

        with pytest.raises(SystemExit) as exc:
            validate_env()
        assert exc.value.code == 1

    def test_en_produccion_con_secreto_arranca(self, monkeypatch):
        monkeypatch.setenv("K_SERVICE", "agents")
        monkeypatch.setenv("AGENTS_INTERNAL_SECRET", SECRET)

        validate_env()  # no revienta

    def test_en_local_sin_secreto_no_revienta(self):
        """
        Fuera de Cloud Run el servicio levanta igual: el dev que no configuró la variable ve el
        warning del arranque y un UNAUTHENTICATED al llamar, no un proceso que no inicia.
        """
        validate_env()

    def test_secreto_vacio_cuenta_como_faltante(self, monkeypatch):
        """Una variable definida en blanco es el mismo agujero que no definirla."""
        monkeypatch.setenv("K_SERVICE", "agents")
        monkeypatch.setenv("AGENTS_INTERNAL_SECRET", "")

        with pytest.raises(SystemExit):
            validate_env()
