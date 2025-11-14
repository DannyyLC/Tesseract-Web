import { PrismaClient } from '@prisma/client';

/**
 * Singleton de Prisma Client
 * Previene múltiples instancias en desarrollo con hot-reload
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
  });

// En desarrollo, guardar la instancia globalmente para reutilizar en hot-reload
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Exportar todos los tipos generados por Prisma
export * from '@prisma/client';
export { PrismaClient } from '@prisma/client';