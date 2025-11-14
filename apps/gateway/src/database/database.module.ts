import { Module, Global } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Modulo global que proporciona acceso a la base de datos
 * Al ser @Global(), PrismaService esta disponible en todos los modulos
 * sin necesidad de importar DatabaseModule en cada uno
 */

@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class DatabaseModule {}
