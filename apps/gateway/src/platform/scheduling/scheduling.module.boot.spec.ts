import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { SchedulingModule } from './scheduling.module';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';

// En la app real el logger lo registra AppModule con WinstonModule.forRoot(),
// que nest-winston marca @Global(). Este grafo aislado no incluye AppModule, así
// que se replica el mismo alcance global para los servicios que lo inyectan.
@Global()
@Module({
  providers: [{ provide: WINSTON_MODULE_PROVIDER, useValue: { error: jest.fn(), log: jest.fn() } }],
  exports: [WINSTON_MODULE_PROVIDER],
})
class FakeWinstonModule {}

// Verifica que, con ScheduleModule.forRoot() viviendo dentro de SchedulingModule
// (y no en AppModule), el discovery global de @nestjs/schedule sigue encontrando
// y registrando los @Cron de CronJobsService. Replica el setup real: PrismaService
// llega vía el DatabaseModule @Global; aqui lo override para no conectar a la BD.
describe('SchedulingModule cron discovery', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      // ConfigModule global replica AppModule: SchedulingModule ahora arrastra
      // ToolsModule (por el sondeo de credenciales) y sus servicios leen env vars.
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        FakeWinstonModule,
        DatabaseModule,
        SchedulingModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    await moduleRef.init(); // dispara onModuleInit -> explore()
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('registers all 7 cron jobs', () => {
    const registry = moduleRef.get(SchedulerRegistry);
    const crons = registry.getCronJobs();
    expect(crons.size).toBe(7);
  });
});
