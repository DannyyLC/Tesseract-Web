"""
gRPC server entry point.
"""

import asyncio
import logging
import signal
import sys
from pathlib import Path
from dotenv import load_dotenv
root_dir = Path(__file__).parent.parent.parent.parent
load_dotenv(dotenv_path=root_dir / ".env")
import grpc
import grpc.aio
from grpc_health.v1 import health_pb2, health_pb2_grpc
from grpc_health.v1.health import HealthServicer
from agents.v1 import agents_pb2_grpc
from grpc_servicer import AgentsServicer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

_GRPC_PORT = 50051


async def serve() -> None:
    server = grpc.aio.server()

    agents_pb2_grpc.add_AgentsServiceServicer_to_server(AgentsServicer(), server)

    health_servicer = HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    health_servicer.set("tesseract.agents.v1.AgentsService", health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port(f"[::]:{_GRPC_PORT}")
    await server.start()
    logger.info("Tesseract Agents gRPC server listening on port %d", _GRPC_PORT)

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    def _shutdown(sig: signal.Signals) -> None:
        logger.info("Received %s — shutting down", sig.name)
        loop.call_soon_threadsafe(stop_event.set)

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _shutdown, sig)

    await stop_event.wait()
    await server.stop(grace=5)
    logger.info("Server stopped")


if __name__ == "__main__":
    asyncio.run(serve())
