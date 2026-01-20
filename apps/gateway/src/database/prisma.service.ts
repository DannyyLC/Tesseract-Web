import { EventsService } from '../events/services/events.service';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  
  constructor(
    private readonly eventsService: EventsService
  ) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

  const sseNotifierExtension = Prisma.defineExtension({
  name: 'sseNotifier',
  query: {
    $allModels: {
      async $allOperations({model, operation, args, query}) {
        const result = await query(args);
        console.log(`Prisma SSE Notifier Extension Triggered ${operation} on ${model}`);
        const mutationOperations = ['create', 'update', 'delete', 'upsert', 'updateMany', 'deleteMany', 'createMany'];
        if (mutationOperations.includes(operation)) {
          console.log(`Model ${model} has been ${operation}d.`);
          //here the Subject publishes the event to all subscribers
          eventsService.emitEvent(model, operation, result);
        }
       
        return result;
    }
  
    }
  }
});
    const extendedPrismaClient = this.$extends(sseNotifierExtension);
    Object.assign(this, extendedPrismaClient);
    // Configurar listeners para logging
    this.setupLogging();
  }


  /**
   * Configura los event listeners para logging de queries y errores
   */
  private setupLogging() {
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        this.logger.debug(`Query: ${e.query}`);
        this.logger.debug(`Duration: ${e.duration}ms`);
      });
    }

    this.$on('error' as never, (e: Prisma.LogEvent) => {
      this.logger.error('Prisma Error:', e.message);
    });

    this.$on('warn' as never, (e: Prisma.LogEvent) => {
      this.logger.warn('Prisma Warning:', e.message);
    });
  }

  /**
   * Se ejecuta cuando NestJS inicia
   * Intenta conectar con retry logic
   */
  async onModuleInit() {
    const maxRetries = 5;
    const retryDelay = 3000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Conectado a PostgreSQL exitosamente');

        // Verificar la salud de la conexión
        await this.healthCheck();
        return;
      } catch (error) {
        this.logger.error(
          `Error al conectar a PostgreSQL (intento ${attempt}/${maxRetries})`,
          error instanceof Error ? error.message : error,
        );

        if (attempt === maxRetries) {
          this.logger.error('No se pudo conectar a la base de datos después de múltiples intentos');
          throw error;
        }

        this.logger.log(`Reintentando en ${retryDelay / 1000} segundos...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * Se ejecuta cuando NestJS se cierra
   * Limpia las conexiones activas
   */
  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Desconectado de PostgreSQL');
    } catch (error) {
      this.logger.error('Error al desconectar de PostgreSQL', error);
    }
  }

  /**
   * Verifica la salud de la conexión a la base de datos
   * Útil para health checks y monitoring
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Health check falló:', error);
      return false;
    }
  }

  /**
   * Ejecuta una operación con reintentos automáticos
   * Útil para operaciones críticas que pueden fallar temporalmente
   */
  async withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        this.logger.warn(`Operación falló (intento ${attempt}/${maxRetries}), reintentando...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
    throw new Error('Operación falló después de múltiples reintentos');
  }

  /**
   * Habilita los shutdown hooks para cerrar la conexión correctamente
   * cuando la aplicación recibe señales del sistema (SIGINT, SIGTERM)
   */
  enableShutdownHooks(app: any) {
    this.$on('beforeExit' as never, () => {
      app.close().catch((error: Error) => {
        this.logger.error('Error during shutdown:', error);
      });
    });
  }
}
