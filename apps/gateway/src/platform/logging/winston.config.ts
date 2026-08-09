import type { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

/**
 * Configuración de Winston del gateway.
 *
 * Vive fuera de `AppModule` para poder probarla: el bug que originó este módulo era que
 * la configuración existía y era correcta, pero la mitad de la aplicación no pasaba por
 * ella. Eso no se ve leyendo el código —hay que ejecutarlo— así que la config tiene que
 * ser importable desde un spec.
 *
 * El servicio de agents tiene su espejo en `apps/agents/src/core/logging_config.py`.
 * Los dos escriben al mismo Cloud Logging y conviene que se vean igual.
 */

// Cloud Logging clasifica cada entrada por el campo `severity`. Winston escribe
// `level`, que Cloud Logging ignora, así que sin este mapeo TODO el JSON entra
// como INFO —- incluidos los logger.error— y filtrar por severidad en Cloud Run
// no devuelve nada.
export const GCP_SEVERITY_BY_LEVEL: Record<string, string> = {
  fatal: 'CRITICAL',
  error: 'ERROR',
  warn: 'WARNING',
  info: 'INFO',
  http: 'INFO',
  verbose: 'DEBUG',
  debug: 'DEBUG',
  silly: 'DEBUG',
};

// `fatal` no existe en los niveles npm de Winston, pero nest-winston lo emite cuando
// algo llama a `logger.fatal()` —Nest lo usa para fallos de arranque—. Sin declararlo,
// Winston no reconoce el nivel y la entrada se pierde justo en el peor momento. Va por
// encima de `error` (0 es la prioridad más alta) y el resto conserva la escala npm.
export const LOG_LEVELS = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  http: 4,
  verbose: 5,
  debug: 6,
  silly: 7,
};

// Los colores del formato legible se resuelven por nivel y `colorize` los aplica sin
// comprobar que existan: `colors[undefined](message)` revienta. Al declarar un nivel
// propio hay que declarar también su color, o el primer `logger.fatal()` en local mata
// el formatter en vez de mostrar el error.
winston.addColors({
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'green',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'magenta',
});

const gcpSeverity = winston.format((info) => {
  info.severity = GCP_SEVERITY_BY_LEVEL[info.level] ?? 'DEFAULT';
  return info;
});

const readableLogFormatter = winston.format.printf(
  ({ timestamp, level, message, context, stack, ...meta }) => {
    const base = `${timestamp} [${level}]${context ? ` [${context}]` : ''} ${stack ?? message}`;
    const metaKeys = Object.keys(meta);
    if (metaKeys.length === 0) {
      return base;
    }

    return `${base} ${JSON.stringify(meta)}`;
  },
);

/**
 * En prod nos quedamos en `info`: los `logger.debug` del código son de depuración local
 * y en Cloud Run solo generan ruido y costo. LOG_LEVEL permite subir la verbosidad sin
 * tocar código, y es opcional a propósito — las variables de entorno del servicio viven
 * solo en la consola de GCP, así que el default tiene que ser el correcto.
 */
export function resolveLogLevel(isProduction: boolean): string {
  return process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug');
}

/**
 * Formato de una entrada de log.
 *
 * Separado del transport a propósito: es lo que decide si Cloud Logging puede clasificar
 * y filtrar, y por tanto lo que hay que poder verificar en un spec. El transport de
 * Console escribe por `console.log`, que Jest intercepta, así que probarlo capturando la
 * salida del proceso da falsos verdes; el spec monta este mismo formato sobre un stream
 * propio.
 */
export function buildLogFormat(isProduction: boolean): winston.Logform.Format {
  return isProduction
    ? winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        gcpSeverity(),
        winston.format.json(),
      )
    : winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.colorize({ all: true }),
        readableLogFormatter,
      );
}

export function buildWinstonOptions(isProduction: boolean): WinstonModuleOptions {
  return {
    levels: LOG_LEVELS,
    transports: [
      // En produccion (Cloud Run) los logs van a stdout -> Cloud Logging los
      // captura automaticamente. El filesystem del contenedor es efimero y en
      // memoria, asi que NO escribimos archivos en prod.
      new winston.transports.Console({
        level: resolveLogLevel(isProduction),
        format: buildLogFormat(isProduction),
      }),
      // Solo en desarrollo: archivos rotados en ./logs para inspeccion local.
      ...(!isProduction
        ? [
            new winston.transports.DailyRotateFile({
              filename: 'logs/app-%DATE%.log',
              datePattern: 'YYYY-MM-DD',
              zippedArchive: false,
              maxSize: '20m',
              maxFiles: '14d',
              level: 'info',
              format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                readableLogFormatter,
              ),
            }),
          ]
        : []),
    ],
  };
}
