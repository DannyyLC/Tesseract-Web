import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';

export interface EnqueueTaskInput {
  /** Ruta relativa del worker, sin el host. Ej: `/api/whatsapp-config/internal/...`. */
  path: string;
  /** Cuerpo JSON que recibirá el worker. */
  payload: Record<string, unknown>;
  /** Retraso antes de despachar. Se usa para la ventana de agregación. */
  delaySeconds?: number;
  /**
   * Identificador estable de la tarea. Cloud Tasks rechaza nombres repetidos, así
   * que sirve de deduplicación sin necesidad de un lock propio. Debe limitarse a
   * `[A-Za-z0-9_-]` y no pasar de 500 caracteres.
   */
  taskId?: string;
}

export interface EnqueueTaskResult {
  /** `false` cuando ya existía una tarea con ese `taskId`. */
  created: boolean;
}

/**
 * Encolado de trabajo diferido en Cloud Tasks.
 *
 * Existe para que los webhooks no tengan que elegir entre responder rápido y
 * terminar su trabajo. Antes el handler respondía 200 y seguía procesando fuera del
 * ciclo de la request; en Cloud Run eso significa que la CPU se estrangula en cuanto
 * la respuesta sale, y si la instancia se recicla el trabajo desaparece sin dejar ni
 * un log. Con una tarea de por medio, el trabajo llega como una request normal —con
 * CPU asignada— y la cola se encarga de reintentarlo si falla.
 *
 * Se habla con la API REST en vez de con `@google-cloud/tasks` por dos razones: el
 * cliente oficial es ESM y este build es CommonJS, y arrastra gRPC y protobuf, que
 * en un servicio que escala a cero encarecen cada arranque en frío. Crear una tarea
 * es un POST.
 */
@Injectable()
export class CloudTasksService {
  private readonly logger = new Logger(CloudTasksService.name);
  private readonly auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  private readonly projectId: string;
  private readonly location: string;
  private readonly queue: string;
  private readonly serviceAccountEmail: string;
  private readonly workerBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.projectId = this.configService.get<string>('GCP_PROJECT_ID', '');
    this.location = this.configService.get<string>('GCP_TASKS_LOCATION', 'us-central1');
    this.queue = this.configService.get<string>('GCP_TASKS_QUEUE', '');
    this.serviceAccountEmail = this.configService.get<string>('GCP_TASKS_SERVICE_ACCOUNT', '');
    this.workerBaseUrl = this.configService
      .get<string>('GCP_TASKS_WORKER_BASE_URL', '')
      .replace(/\/$/, '');
  }

  /** `true` si hay configuración suficiente para encolar. */
  isConfigured(): boolean {
    return Boolean(
      this.projectId &&
        this.location &&
        this.queue &&
        this.serviceAccountEmail &&
        this.workerBaseUrl,
    );
  }

  async enqueue(input: EnqueueTaskInput): Promise<EnqueueTaskResult> {
    if (!this.isConfigured()) {
      throw new Error(
        'Cloud Tasks no está configurado: se requieren GCP_PROJECT_ID, GCP_TASKS_LOCATION, ' +
          'GCP_TASKS_QUEUE, GCP_TASKS_SERVICE_ACCOUNT y GCP_TASKS_WORKER_BASE_URL',
      );
    }

    const queuePath = `projects/${this.projectId}/locations/${this.location}/queues/${this.queue}`;
    const url = `${this.workerBaseUrl}${input.path}`;

    const task: Record<string, unknown> = {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(input.payload)).toString('base64'),
        // El worker vive en el mismo servicio público que el webhook, así que la
        // identidad OIDC es lo único que lo separa de internet. `audience` se fija a
        // la URL exacta para que un token emitido para otro endpoint no sirva.
        oidcToken: {
          serviceAccountEmail: this.serviceAccountEmail,
          audience: url,
        },
      },
    };

    if (input.taskId) {
      task.name = `${queuePath}/tasks/${input.taskId}`;
    }

    if (input.delaySeconds && input.delaySeconds > 0) {
      task.scheduleTime = new Date(Date.now() + input.delaySeconds * 1000).toISOString();
    }

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(`https://cloudtasks.googleapis.com/v2/${queuePath}/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task }),
    });

    if (response.status === 409) {
      // Esperado: otro mensaje de la misma ventana ya agendó el procesamiento.
      this.logger.debug(`Tarea ${input.taskId} ya existía, no se encola de nuevo`);
      return { created: false };
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cloud Tasks rechazó la tarea (${response.status}): ${body}`);
    }

    return { created: true };
  }

  /**
   * Normaliza un texto para usarlo dentro de un `taskId`. Cloud Tasks solo acepta
   * `[A-Za-z0-9_-]`, y los números de teléfono traen `+`.
   */
  static sanitizeIdPart(value: string): string {
    return value.replace(/[^A-Za-z0-9_-]/g, '');
  }
}
