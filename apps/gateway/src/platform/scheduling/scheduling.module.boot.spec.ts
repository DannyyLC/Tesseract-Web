import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulingModule } from './scheduling.module';
import { DatabaseModule } from '../database/database.module';
import { PrismaService } from '../database/prisma.service';

// Verifica que, con ScheduleModule.forRoot() viviendo dentro de SchedulingModule
// (y no en AppModule), el discovery global de @nestjs/schedule sigue encontrando
// y registrando los @Cron de CronJobsService. Replica el setup real: PrismaService
// llega vía el DatabaseModule @Global; aqui lo override para no conectar a la BD.
describe('SchedulingModule cron discovery', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, SchedulingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    await moduleRef.init(); // dispara onModuleInit -> explore()
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('registers all 4 cron jobs', () => {
    const registry = moduleRef.get(SchedulerRegistry);
    const crons = registry.getCronJobs();
    expect(crons.size).toBe(4);
  });
});
