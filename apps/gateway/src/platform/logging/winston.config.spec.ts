import { readFileSync } from 'fs';
import { join } from 'path';
import { Writable } from 'stream';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import {
  buildLogFormat,
  buildWinstonOptions,
  LOG_LEVELS,
  resolveLogLevel,
} from './winston.config';

/**
 * El bug que originó este spec: Winston estaba configurado y el mapeo de severidad era
 * correcto, pero `main.ts` nunca llamaba a `app.useLogger()`. Los servicios que usan
 * `new Logger(X.name)` —incluido el filtro global de excepciones— seguían saliendo por
 * el ConsoleLogger de Nest, en texto plano y sin `severity`. Leyendo el código no se ve;
 * solo se detecta ejecutándolo.
 */

/**
 * Levanta un módulo con el formato y el nivel reales, pero escribiendo a un stream
 * propio en vez de a Console.
 *
 * El transport de Console de Winston emite por `console.log`, que Jest intercepta por
 * archivo de test: capturando la salida del proceso, el spec pasa aislado y falla —o
 * peor, pasa sin comprobar nada— dentro de la suite completa. Lo que interesa verificar
 * es el formato y el cableado de `useLogger`, y eso es idéntico en cualquier transport.
 */
async function capturarSalida(
  isProduction: boolean,
  emitir: (logger: Logger) => void,
): Promise<string[]> {
  const lineas: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lineas.push(chunk.toString());
      callback();
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [
      WinstonModule.forRoot({
        levels: LOG_LEVELS,
        transports: [
          new winston.transports.Stream({
            stream,
            level: resolveLogLevel(isProduction),
            format: buildLogFormat(isProduction),
          }),
        ],
      }),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  await app.init();

  // El arranque de Nest emite sus propias líneas; solo interesan las del test.
  lineas.length = 0;

  try {
    emitir(new Logger('PruebaDeSeveridad'));
    // Winston escribe de forma asíncrona.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    await app.close();
  }

  return lineas
    .join('')
    .split('\n')
    .filter((linea) => linea.trim().length > 0);
}

describe('configuración de Winston', () => {
  const envOriginal = process.env.LOG_LEVEL;

  afterEach(() => {
    if (envOriginal === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = envOriginal;
  });

  describe('en producción', () => {
    it('un logger.error de Nest sale como JSON con severity ERROR', async () => {
      const [linea] = await capturarSalida(true, (logger) => logger.error('algo tronó'));

      const entrada = JSON.parse(linea);
      expect(entrada.severity).toBe('ERROR');
      expect(entrada.message).toBe('algo tronó');
      expect(entrada.context).toBe('PruebaDeSeveridad');
    });

    it('mapea cada nivel a la severidad que Cloud Logging entiende', async () => {
      const casos: Array<[keyof Logger, string]> = [
        ['error', 'ERROR'],
        ['warn', 'WARNING'],
        ['log', 'INFO'],
      ];

      for (const [metodo, severity] of casos) {
        const [linea] = await capturarSalida(true, (logger) =>
          (logger[metodo] as (m: string) => void)('mensaje'),
        );
        expect(JSON.parse(linea).severity).toBe(severity);
      }
    });

    it('escribe una sola línea por entrada, para que Cloud Logging no la parta', async () => {
      const lineas = await capturarSalida(true, (logger) =>
        logger.error('con salto\nde línea dentro'),
      );

      expect(lineas).toHaveLength(1);
      expect(JSON.parse(lineas[0]).message).toBe('con salto\nde línea dentro');
    });

    it('no emite códigos de color, que en Cloud Logging son basura', async () => {
      const [linea] = await capturarSalida(true, (logger) => logger.error('sin ansi'));

      // eslint-disable-next-line no-control-regex
      expect(linea).not.toMatch(/\x1B\[/);
    });

    it('descarta los debug: son de depuración local y en prod solo cuestan', async () => {
      const lineas = await capturarSalida(true, (logger) => logger.debug('no debe salir'));

      expect(lineas).toHaveLength(0);
    });

    it('LOG_LEVEL permite subir la verbosidad sin tocar código', async () => {
      process.env.LOG_LEVEL = 'debug';
      const [linea] = await capturarSalida(true, (logger) => logger.debug('ahora sí'));

      expect(JSON.parse(linea).severity).toBe('DEBUG');
    });
  });

  describe('buildWinstonOptions', () => {
    it('en prod manda todo a Console y no escribe archivos', () => {
      // El filesystem de Cloud Run es efímero y en memoria: un transport de fichero ahí
      // no sirve para leer nada y además consume RAM del contenedor.
      const transports = buildWinstonOptions(true).transports as winston.transport[];

      expect(transports).toHaveLength(1);
      expect(transports[0]).toBeInstanceOf(winston.transports.Console);
      expect(transports[0].level).toBe('info');
    });

    it('fuera de prod añade el fichero rotado y baja a debug', () => {
      delete process.env.LOG_LEVEL;
      const transports = buildWinstonOptions(false).transports as winston.transport[];

      expect(transports).toHaveLength(2);
      expect(transports[0].level).toBe('debug');
    });
  });

  describe('cableado en main.ts', () => {
    // Los tests de arriba instalan el logger ellos mismos, así que seguirían pasando si
    // alguien borra la línea de `main.ts` — que es exactamente el bug que hubo. Arrancar
    // el `bootstrap()` real aquí no es viable (abre puerto y necesita base de datos), así
    // que se comprueba sobre el fuente. Es tosco, pero cubre el único fallo que importa:
    // que la configuración exista y nadie pase por ella.
    const fuente = readFileSync(join(__dirname, '..', '..', 'main.ts'), 'utf8');

    it('instala el logger de Winston como logger de la aplicación', () => {
      expect(fuente).toMatch(/useLogger\(\s*app\.get\(WINSTON_MODULE_NEST_PROVIDER\)\s*\)/);
    });

    it('bufferea los logs de arranque para que no se escapen sin severidad', () => {
      expect(fuente).toMatch(/bufferLogs:\s*true/);
    });

    it('instala el logger antes que el filtro global de excepciones', () => {
      expect(fuente.indexOf('useLogger')).toBeLessThan(fuente.indexOf('useGlobalFilters'));
    });
  });

  describe('resolveLogLevel', () => {
    it('cae en info en prod y en debug fuera, cuando LOG_LEVEL no está', () => {
      delete process.env.LOG_LEVEL;
      expect(resolveLogLevel(true)).toBe('info');
      expect(resolveLogLevel(false)).toBe('debug');
    });

    it('respeta LOG_LEVEL cuando está definido', () => {
      process.env.LOG_LEVEL = 'warn';
      expect(resolveLogLevel(true)).toBe('warn');
      expect(resolveLogLevel(false)).toBe('warn');
    });
  });
});
