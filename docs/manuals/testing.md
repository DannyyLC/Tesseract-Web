---
title: 'Guia de Testing'
description: 'Como escribir, organizar y correr tests en el Gateway (NestJS), Web-Client y Agents (Python).'
---

Tesseract usa Jest para TypeScript y Pytest para Python. Esta guia explica como correr los tests existentes y como escribir nuevos.

## 1. Comandos principales

Desde la **raiz del monorepo**:

```bash
# Correr todos los tests del monorepo (Gateway + packages + Pytest)
npm run test:all

# Solo el Gateway
npm run test --workspace=apps/gateway

# Con reporte de cobertura
npm run test --workspace=apps/gateway -- --coverage
```

Desde **`apps/gateway/`** directamente (mas rapido durante desarrollo):

```bash
# Todos los tests del gateway
npx jest

# Un solo archivo
npx jest src/billing/billing.service.spec.ts

# Todos los tests de un modulo
npx jest src/billing/

# Modo watch (re-corre al guardar)
npx jest --watch
```

---

## 2. Tests del Gateway (NestJS)

### Donde viven

Los tests unitarios se colocan **junto al archivo que prueban**, con el sufijo `.spec.ts`:

```
src/
└── billing/
    ├── billing.service.ts
    ├── billing.service.spec.ts   <- test unitario
    └── billing.controller.ts
```

Los tests E2E viven en una carpeta separada:

```
apps/gateway/
└── test/
    └── billing.e2e-spec.ts
```

### Estructura de un test unitario de Service

Este es el patron estandar para testear un Service de NestJS. Usa el `TestingModule` para crear un modulo aislado sin levantar toda la aplicacion:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BillingService', () => {
  let service: BillingService;

  // Mock del PrismaService para no depender de la BD real
  const mockPrismaService = {
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  // Limpia los mocks entre cada test
  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return active subscription for an organization', async () => {
    const mockSub = { id: 'uuid-1', plan: 'PRO', status: 'ACTIVE' };
    mockPrismaService.subscription.findUnique.mockResolvedValue(mockSub);

    const result = await service.getActiveSubscription('org-uuid-1');

    expect(result).toEqual(mockSub);
    expect(mockPrismaService.subscription.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-uuid-1' },
    });
  });
});
```

### Que se debe testear (y que no)

**Testea en los Services:**

- Logica de negocio: calculos de creditos, validaciones, reglas de planes
- Comportamiento ante errores: que pasa si Prisma devuelve `null`
- Que los mocks fueron llamados con los argumentos correctos

---

## 3. Tests de Python (Agents)

Los tests del microservicio de Python usan **Pytest** y viven en `apps/agents/tests/`.

### Convencion de archivos

```
apps/agents/
├── src/
│   └── tools/
│       └── pdf_parser.py
└── tests/
    └── test_pdf_parser.py     <- prefijo test_ obligatorio
```

### Correr los tests

```bash
cd apps/agents

# Todos los tests
poetry run pytest

# Un archivo especifico
poetry run pytest tests/test_pdf_parser.py

# Solo tests marcados como unitarios (rapidos)
poetry run pytest -m unit

# Solo tests que NO requieren API key real
poetry run pytest -m "not requires_api"

# Con detalle de cada test
poetry run pytest -v
```

### Markers disponibles

El `pytest.ini` define estos markers para categorizar los tests:

| Marker                      | Uso                                           |
| --------------------------- | --------------------------------------------- |
| `@pytest.mark.unit`         | Tests rapidos, sin dependencias externas      |
| `@pytest.mark.integration`  | Tests que dependen de servicios externos o BD |
| `@pytest.mark.slow`         | Tests que tardan varios segundos              |
| `@pytest.mark.requires_api` | Requieren API keys reales (ej. OpenAI)        |

### Estructura de un test en Python

```python
import pytest
from src.tools.pdf_parser import extract_text

@pytest.mark.unit
def test_extract_text_returns_string():
    """Verifica que el parser devuelve texto plano de un PDF valido."""
    result = extract_text("tests/fixtures/sample.pdf")
    assert isinstance(result, str)
    assert len(result) > 0

@pytest.mark.unit
def test_extract_text_raises_on_invalid_file():
    """Verifica que se lanza excepcion con un archivo invalido."""
    with pytest.raises(FileNotFoundError):
        extract_text("archivo_inexistente.pdf")
```

---

## 4. Cobertura de tests

El Gateway esta configurado para medir cobertura sobre todos los archivos en `src/`, excluyendo modulos, interfaces y el entry point `main.ts`.

```bash
# Genera reporte de cobertura en /coverage/apps/gateway/
npx jest --coverage --workspace=apps/gateway
```

El reporte en HTML se genera en `coverage/apps/gateway/lcov-report/index.html` y muestra linea por linea que codigo fue ejecutado por los tests.

No existe un porcentaje minimo de cobertura forzado actualmente. Como referencia, apuntar a **+70% en Services** es un objetivo razonable para el estado actual del proyecto.
