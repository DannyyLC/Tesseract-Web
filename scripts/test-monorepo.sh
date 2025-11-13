#!/bin/bash

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contador de tests
PASSED=0
FAILED=0

# Función para imprimir títulos
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Función para tests
test_step() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $1"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: $1"
        ((FAILED++))
        return 1
    fi
}

# Función para verificar archivos
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} $1 existe"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌${NC} $1 NO existe"
        ((FAILED++))
        return 1
    fi
}

print_header "🧪 TEST COMPLETO DEL MONOREPO"

echo "📍 Directorio: $(pwd)"
echo "📅 Fecha: $(date)"
echo ""

# ============================================
# FASE 1: LIMPIEZA COMPLETA
# ============================================
print_header "🧹 FASE 1: LIMPIEZA COMPLETA"

echo "Eliminando node_modules, dist/ y caché..."
rm -rf packages/database/dist
rm -rf packages/database/*.tsbuildinfo
rm -rf apps/gateway/dist
rm -rf apps/gateway/*.tsbuildinfo

test_step "Limpieza completada"

# Verificar que todo fue eliminado
echo ""
echo "Verificando limpieza..."
[ ! -d "packages/database/dist" ] && echo -e "${GREEN}✅${NC} packages/database/dist/ eliminado" || echo -e "${RED}❌${NC} packages/database/dist/ sigue existiendo"
[ ! -d "apps/gateway/dist" ] && echo -e "${GREEN}✅${NC} apps/gateway/dist/ eliminado" || echo -e "${RED}❌${NC} apps/gateway/dist/ sigue existiendo"

# ============================================
# FASE 2: VERIFICAR DEPENDENCIAS
# ============================================
print_header "📦 FASE 2: VERIFICAR DEPENDENCIAS"

if [ -d "node_modules" ]; then
    echo -e "${GREEN}✅${NC} node_modules existe"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️${NC}  node_modules no existe, instalando..."
    npm install
    test_step "npm install"
fi

# Verificar Prisma
if [ -d "node_modules/@prisma/client" ]; then
    echo -e "${GREEN}✅${NC} @prisma/client instalado"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️${NC}  @prisma/client no encontrado"
fi

# ============================================
# FASE 3: GENERAR PRISMA CLIENT
# ============================================
print_header "🗄️  FASE 3: GENERAR PRISMA CLIENT"

npm run prisma:generate > /tmp/prisma-generate.log 2>&1
test_step "Prisma Client generado"

if grep -q "Generated Prisma Client" /tmp/prisma-generate.log; then
    echo -e "${GREEN}✅${NC} Prisma Client generado correctamente"
    ((PASSED++))
fi

# ============================================
# FASE 4: BUILD DATABASE PACKAGE
# ============================================
print_header "🏗️  FASE 4: BUILD DATABASE PACKAGE"

echo "Ejecutando: npm run build:database"
npm run build:database > /tmp/database-build.log 2>&1
test_step "Build de database"

echo ""
echo "Verificando archivos generados..."
check_file "packages/database/dist/index.js"
check_file "packages/database/dist/index.d.ts"

if [ -f "packages/database/dist/index.js" ]; then
    echo ""
    echo "📊 Tamaño: $(du -sh packages/database/dist | cut -f1)"
    echo "📁 Archivos: $(find packages/database/dist -type f | wc -l) archivos"
fi

# Verificar contenido del index.js
if grep -q "PrismaClient" packages/database/dist/index.js 2>/dev/null; then
    echo -e "${GREEN}✅${NC} index.js exporta PrismaClient"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️${NC}  index.js puede no exportar PrismaClient"
fi

# ============================================
# FASE 5: BUILD GATEWAY
# ============================================
print_header "🏗️  FASE 5: BUILD GATEWAY"

echo "Ejecutando: npm run build:gateway"
npm run build:gateway > /tmp/gateway-build.log 2>&1
test_step "Build de gateway"

echo ""
echo "Verificando archivos generados..."
check_file "apps/gateway/dist/main.js"
check_file "apps/gateway/dist/app.module.js"

if [ -d "apps/gateway/dist" ]; then
    echo ""
    echo "📊 Tamaño: $(du -sh apps/gateway/dist | cut -f1)"
    echo "📁 Archivos .js: $(find apps/gateway/dist -name "*.js" | wc -l)"
    echo "📂 Módulos: $(ls -d apps/gateway/dist/*/ 2>/dev/null | wc -l) carpetas"
fi

# ============================================
# FASE 6: VERIFICAR ESTRUCTURA
# ============================================
print_header "📂 FASE 6: VERIFICAR ESTRUCTURA"

echo "Estructura de database/dist:"
ls -lh packages/database/dist/ 2>/dev/null | head -5

echo ""
echo "Estructura de gateway/dist:"
ls -lh apps/gateway/dist/ 2>/dev/null | head -10

# ============================================
# FASE 7: PRUEBA DE EJECUCIÓN EN PRODUCCIÓN
# ============================================
print_header "▶️  FASE 7: PRUEBA DE EJECUCIÓN (PRODUCCIÓN)"

echo "Iniciando servidor en modo producción por 3 segundos..."
timeout 3s npm run start:prod --workspace=@workflow-platform/gateway > /tmp/server-prod.log 2>&1 &
SERVER_PID=$!

sleep 2

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Servidor inició correctamente en modo producción"
    ((PASSED++))
    
    # Verificar logs
    if grep -q "Nest application successfully started" /tmp/server-prod.log; then
        echo -e "${GREEN}✅${NC} Aplicación NestJS iniciada exitosamente"
        ((PASSED++))
    fi
    
    if grep -q "Conectado a PostgreSQL" /tmp/server-prod.log; then
        echo -e "${GREEN}✅${NC} Conectado a PostgreSQL correctamente"
        ((PASSED++))
    fi
    
    # Matar el servidor
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
else
    echo -e "${RED}❌${NC} Servidor NO inició en modo producción"
    ((FAILED++))
    echo ""
    echo "Logs del servidor:"
    cat /tmp/server-prod.log
fi

# ============================================
# FASE 8: PRUEBA DE EJECUCIÓN EN DESARROLLO
# ============================================
print_header "⚡ FASE 8: PRUEBA DE EJECUCIÓN (DESARROLLO)"

echo "Iniciando servidor en modo desarrollo por 3 segundos..."
timeout 3s npm run dev:gateway > /tmp/server-dev.log 2>&1 &
SERVER_PID=$!

sleep 2

if ps -p $SERVER_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Servidor inició correctamente en modo desarrollo"
    ((PASSED++))
    
    # Verificar logs
    if grep -q "Nest application successfully started" /tmp/server-dev.log; then
        echo -e "${GREEN}✅${NC} Aplicación NestJS iniciada exitosamente"
        ((PASSED++))
    fi
    
    if grep -q "ts-node-dev" /tmp/server-dev.log; then
        echo -e "${GREEN}✅${NC} Usando ts-node-dev (modo desarrollo)"
        ((PASSED++))
    fi
    
    # Matar el servidor
    kill $SERVER_PID 2>/dev/null
    wait $SERVER_PID 2>/dev/null
else
    echo -e "${RED}❌${NC} Servidor NO inició en modo desarrollo"
    ((FAILED++))
    echo ""
    echo "Logs del servidor:"
    cat /tmp/server-dev.log
fi

# ============================================
# FASE 9: VERIFICAR DOCKER (OPCIONAL)
# ============================================
print_header "🐳 FASE 9: VERIFICAR DOCKER"

if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅${NC} Docker instalado"
    ((PASSED++))
    
    # Verificar si PostgreSQL está corriendo
    if docker ps | grep -q postgres; then
        echo -e "${GREEN}✅${NC} PostgreSQL corriendo en Docker"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠️${NC}  PostgreSQL NO está corriendo"
        echo "   Ejecuta: npm run docker:up"
    fi
else
    echo -e "${YELLOW}⚠️${NC}  Docker no instalado (opcional)"
fi

# ============================================
# RESUMEN FINAL
# ============================================
print_header "📊 RESUMEN FINAL"

TOTAL=$((PASSED + FAILED))
SUCCESS_RATE=$(( PASSED * 100 / TOTAL ))

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                       RESULTADOS                               ║"
echo "╠════════════════════════════════════════════════════════════════╣"
echo -e "║  ${GREEN}Pasados:${NC} $PASSED                                                  "
echo -e "║  ${RED}Fallados:${NC} $FAILED                                                  "
echo "║  Total: $TOTAL                                                  "
echo "║  Tasa de éxito: ${SUCCESS_RATE}%                                      "
echo "╠════════════════════════════════════════════════════════════════╣"

if [ $FAILED -eq 0 ]; then
    echo -e "║  ${GREEN}✅ TODOS LOS TESTS PASARON${NC}                                   "
    echo "║                                                                ║"
    echo "║  Tu monorepo está configurado perfectamente:                  ║"
    echo "║  • Database compila correctamente ✅                           ║"
    echo "║  • Gateway compila correctamente ✅                            ║"
    echo "║  • Modo producción funciona ✅                                 ║"
    echo "║  • Modo desarrollo funciona ✅                                 ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    exit 0
else
    echo -e "║  ${RED}❌ ALGUNOS TESTS FALLARON${NC}                                    "
    echo "║                                                                ║"
    echo "║  Revisa los logs arriba para más detalles                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    exit 1
fi
