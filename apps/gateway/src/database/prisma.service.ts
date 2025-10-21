import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor() {
        super({
            log: process.env.NODE_ENV === "development" 
            ? ['query', 'error', 'warn']
            : ['error'],
        });
    }

    /**
     * Se ejecuta cuando NestJS inicia
    */
   async onModuleInit() {
        try {
            await this.$conect();
            this.logger.log('Conectado a PostgreSQL');
        } catch (error) {
            this.logger.error('Error al conectar a PostgreSQL', error);
            throw error;
        }
    }

    /**
     * Se ejecuta cuando NestJS se cierra 
    */
    async onModuleDestroy() {
        await this.$disconnect();
        this.logger.log('Desconectado de PostgreSQL');
    }
}