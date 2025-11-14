#!/bin/bash

# 🚀 Setup Rápido - Workflow Automation Platform
# Este script configura todo lo necesario para empezar a testear

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}🚀 Setup Workflow Automation Platform${NC}"
echo "================================================"
echo ""

# 1. Verificar dependencias
echo -e "${BOLD}1. Verificando dependencias...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js no está instalado${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}⚠️  Docker no está instalado${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠️  docker-compose no está instalado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node --version)${NC}"
echo -e "${GREEN}✅ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
echo ""

# 2. Verificar/crear .env
echo -e "${BOLD}2. Configurando .env...${NC}"

if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creando .env desde .env.example${NC}"
    cp .env.example .env
    
    # Generar JWT secrets
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    SUPER_ADMIN_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Actualizar .env con valores generados
    sed -i "s|your-super-secret-jwt-key-change-this-in-production|$JWT_SECRET|g" .env
    sed -i "s|your-super-secret-refresh-key-change-this-in-production|$JWT_REFRESH_SECRET|g" .env
    sed -i "s|your-ultra-secret-super-admin-jwt-key-must-be-very-long|$SUPER_ADMIN_SECRET|g" .env
    
    echo -e "${GREEN}✅ .env creado con secrets generados${NC}"
else
    echo -e "${GREEN}✅ .env ya existe${NC}"
fi
echo ""

# 3. Instalar dependencias
echo -e "${BOLD}3. Instalando dependencias...${NC}"
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
else
    echo -e "${GREEN}✅ Dependencias ya instaladas${NC}"
fi
echo ""

# 4. Levantar PostgreSQL
echo -e "${BOLD}4. Iniciando PostgreSQL...${NC}"
docker-compose up -d

# Esperar a que PostgreSQL esté listo
echo -e "${YELLOW}⏳ Esperando a que PostgreSQL inicie...${NC}"
sleep 5

if docker ps | grep -q workflow-postgres; then
    echo -e "${GREEN}✅ PostgreSQL está corriendo${NC}"
else
    echo -e "${YELLOW}⚠️  PostgreSQL no inició correctamente${NC}"
    docker-compose logs postgres
    exit 1
fi
echo ""

# 5. Generar Prisma Client
echo -e "${BOLD}5. Generando Prisma Client...${NC}"
npm run prisma:generate
echo -e "${GREEN}✅ Prisma Client generado${NC}"
echo ""

# 6. Aplicar migraciones
echo -e "${BOLD}6. Aplicando migraciones...${NC}"
npm run prisma:migrate:deploy
echo -e "${GREEN}✅ Migraciones aplicadas${NC}"
echo ""

# 7. Configurar Super Admin
echo -e "${BOLD}7. Configurando Super Admin...${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Configura tu super admin${NC}"
echo -e "Ejecuta este comando y sigue las instrucciones:"
echo -e "${BLUE}npx ts-node apps/gateway/src/admin/scripts/generate-super-admin-config.ts${NC}"
echo ""
echo -e "Luego, copia la configuración generada al archivo ${BOLD}.env${NC}"
echo ""

# 8. Resumen
echo -e "${BOLD}================================================${NC}"
echo -e "${GREEN}✅ Setup completado!${NC}"
echo -e "${BOLD}================================================${NC}"
echo ""
echo -e "${BOLD}📋 Próximos pasos:${NC}"
echo ""
echo -e "1️⃣  Configura el Super Admin:"
echo -e "   ${BLUE}npx ts-node apps/gateway/src/admin/scripts/generate-super-admin-config.ts${NC}"
echo ""
echo -e "2️⃣  Inicia el servidor:"
echo -e "   ${BLUE}npm run dev:gateway${NC}"
echo ""
echo -e "3️⃣  Abre Prisma Studio (opcional):"
echo -e "   ${BLUE}npm run prisma:studio${NC}"
echo ""
echo -e "4️⃣  Ejecuta los tests:"
echo -e "   ${BLUE}./test-api.sh${NC}"
echo ""
echo -e "${GREEN}🎉 ¡Listo para empezar!${NC}"
