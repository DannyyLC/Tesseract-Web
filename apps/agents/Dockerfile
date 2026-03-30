FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    POETRY_VERSION=2.0.1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false

# Installer dependencias del sistema requeridas para compilar algunos paquetes Python
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip && \
    pip install --default-timeout=100 --retries=10 --no-cache-dir poetry==$POETRY_VERSION

WORKDIR /app

COPY pyproject.toml poetry.lock ./

RUN poetry install --only main --no-root

COPY src/ ./src/

# Exponer el puerto
EXPOSE 8000

# Añadir a PYTHONPATH para que Uvicorn encuentre módulos hijos sin el prefijo "src."
ENV PYTHONPATH="/app/src:${PYTHONPATH}"

# Comando de inicio
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]

