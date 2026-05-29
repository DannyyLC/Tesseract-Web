.PHONY: install build dev gateway web agents proto db-up db-down db-logs clean \
        prisma-migrate prisma-deploy prisma-studio prisma-generate prisma-seed prisma-reset \
        test test-gateway test-unit test-e2e

# ── Install ───────────────────────────────────────────────────────────────────
install:
	pnpm install

# ── Build ─────────────────────────────────────────────────────────────────────
build:
	pnpm run build:all

# ── Dev ───────────────────────────────────────────────────────────────────────
dev: db-up
	@trap 'kill 0' SIGINT; \
	pnpm run dev:gateway & \
	pnpm run dev:web & \
	$(MAKE) agents & \
	wait

gateway:
	pnpm run dev:gateway

web:
	pnpm run dev:web

agents:
	cd apps/agents && VIRTUAL_ENV= poetry run python src/grpc_server.py

# ── Proto ─────────────────────────────────────────────────────────────────────
proto:
	cd apps/agents && VIRTUAL_ENV= poetry run python -m grpc_tools.protoc \
	  -I ../../packages/contracts/proto \
	  --python_out=src \
	  --grpc_python_out=src \
	  ../../packages/contracts/proto/agents/v1/agents.proto

# ── Database (Docker) ─────────────────────────────────────────────────────────
db-up:
	docker-compose up -d

db-down:
	docker-compose down

db-logs:
	docker-compose logs -f

# ── Prisma ────────────────────────────────────────────────────────────────────
prisma-generate:
	pnpm run prisma:generate

prisma-migrate:
	pnpm run prisma:migrate

prisma-deploy:
	pnpm run prisma:migrate:deploy

prisma-reset:
	pnpm run prisma:reset

prisma-studio:
	pnpm run prisma:studio

prisma-seed:
	pnpm run prisma:seed

# ── Test ──────────────────────────────────────────────────────────────────────
# test         -> toda la suite del monorepo (todos los paquetes)
# test-gateway -> gateway completo (unitarios + e2e)
# test-unit    -> solo unitarios del gateway
# test-e2e     -> solo e2e del gateway
test:
	pnpm run test:all

test-gateway:
	pnpm run test:gateway

test-unit:
	pnpm run test:gateway:unit

test-e2e:
	pnpm run test:gateway:e2e

# ── Clean ─────────────────────────────────────────────────────────────────────
clean:
	pnpm run clean:all
