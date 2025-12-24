"""
Tesseract Agents - Servicio de ejecución de agentes AI.

Este servicio recibe requests del Gateway con un TenantContext completo
y ejecuta los agentes de LangGraph según la configuración del Workflow.

ARQUITECTURA STATELESS:
- No se conecta a la base de datos
- Recibe toda la configuración desde el Gateway
- Ejecuta el agente y retorna el resultado
- Múltiples conversaciones pueden procesarse en el mismo contenedor

ENDPOINTS:
- POST /api/v1/agents/execute - Ejecutar un agente
- GET /health - Health check
"""

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

# Cargar .env desde el root del proyecto
root_dir = Path(__file__).parent.parent.parent.parent
env_path = root_dir / ".env"
load_dotenv(dotenv_path=env_path)
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

# ==========================================
# Configuración de Logging
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


# ==========================================
# Lifecycle Events
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Maneja el ciclo de vida de la aplicación.
    Se ejecuta al inicio y al finalizar el servidor.
    """
    # Startup
    logger.info("Starting Tesseract Agents service...")
    logger.info("Service ready to process agent executions")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Tesseract Agents service...")


# ==========================================
# Crear aplicación FastAPI
# ==========================================
app = FastAPI(
    title="Tesseract Agents",
    description="AI Agents execution service powered by LangGraph",
    version="0.1.0",
    lifespan=lifespan
)


# ==========================================
# Middleware - CORS
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# Manejadores de Errores Globales
# ==========================================
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Maneja errores de validación de Pydantic."""
    logger.error(f"Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "details": exc.errors(),
            "body": exc.body
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Maneja errores no capturados."""
    logger.error(f"Unhandled error on {request.url}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": str(exc)
        }
    )


# ==========================================
# Health Check
# ==========================================
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Health check endpoint.
    
    Retorna el estado del servicio.
    Útil para Docker healthchecks y load balancers.
    """
    return {
        "status": "healthy",
        "service": "tesseract-agents",
        "version": "0.1.0"
    }


# ==========================================
# Incluir Routers
# ==========================================
from api.routes import router as agents_router

app.include_router(
    agents_router,
    prefix="/api/v1",
    tags=["Agents"]
)


# ==========================================
# Root Endpoint
# ==========================================
@app.get("/", tags=["Root"])
async def root():
    """
    Root endpoint con información del servicio.
    """
    return {
        "service": "Tesseract Agents",
        "version": "0.1.0",
        "description": "AI Agents execution service powered by LangGraph",
        "endpoints": {
            "health": "/health",
            "execute": "/api/v1/agents/execute",
            "docs": "/docs"
        }
    }


# ==========================================
# Entry Point (para desarrollo local)
# ==========================================
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload en desarrollo
        log_level="info"
    )
