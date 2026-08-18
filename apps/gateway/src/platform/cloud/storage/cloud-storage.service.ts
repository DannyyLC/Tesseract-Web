import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

/**
 * Acceso a Google Cloud Storage.
 *
 * Deliberadamente genérico: el primer consumidor son los XML y PDF de los CFDI, pero está
 * pensado para los adjuntos y exportaciones que vengan después. No conoce ningún caso de uso.
 *
 * Las credenciales van por ADC, igual que `KmsService`: en Cloud Run las toma de la service
 * account del servicio y en local del `gcloud auth application-default login`. Nunca hay un
 * archivo de llave en el repositorio.
 *
 * ## Descargar: `download` o `getSignedUrl`
 *
 * Las dos formas están disponibles porque resuelven problemas distintos:
 *
 * - `download` devuelve los bytes y el Gateway los reenvía. La autorización queda donde está
 *   la del resto de la aplicación (guard + organización del token) y **ninguna URL
 *   descargable sale del sistema**. Es lo correcto para archivos pequeños y sensibles.
 * - `getSignedUrl` genera una URL temporal que descarga directo de GCS, sin pasar por el
 *   Gateway. Es lo correcto para archivos grandes, donde hacer de tubería desperdicia
 *   memoria y tiempo de instancia. Pero la URL firmada **es una credencial**: quien la tenga
 *   descarga sin autenticarse, y viaja en la barra de direcciones, con lo que acaba en el
 *   historial, en la cabecera `Referer` y en los logs de cualquier proxy intermedio.
 *
 * Los CFDI usan `download`: son unos pocos KB y contienen datos fiscales.
 */
@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);
  private readonly storage: Storage;

  constructor() {
    this.storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
    });
  }

  /** Sube un objeto y devuelve su ruta dentro del bucket. */
  async upload(
    bucketName: string,
    objectPath: string,
    contents: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      await this.storage.bucket(bucketName).file(objectPath).save(contents, {
        contentType,
        // Los objetos que guardamos son inmutables (un CFDI timbrado no cambia nunca), pero
        // el bucket es privado y se sirven por el Gateway, así que la caché pública no aplica.
        resumable: false,
      });
      return objectPath;
    } catch (error) {
      this.logger.error(
        `upload >> Error subiendo ${objectPath} a ${bucketName}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /** Descarga un objeto completo en memoria. Solo para archivos pequeños. */
  async download(bucketName: string, objectPath: string): Promise<Buffer> {
    try {
      const [contents] = await this.storage.bucket(bucketName).file(objectPath).download();
      return contents;
    } catch (error) {
      this.logger.error(
        `download >> Error descargando ${objectPath} de ${bucketName}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async exists(bucketName: string, objectPath: string): Promise<boolean> {
    const [found] = await this.storage.bucket(bucketName).file(objectPath).exists();
    return found;
  }

  /**
   * URL temporal de descarga directa desde GCS.
   *
   * **Requisito de IAM que no se ve venir:** sin archivo de llave no hay clave privada local
   * con la que firmar, así que el SDK firma llamando a la API de IAM Credentials
   * (`signBlob`). Eso exige que la service account tenga `roles/iam.serviceAccountTokenCreator`
   * **sobre sí misma** y que `iamcredentials.googleapis.com` esté habilitada. Sin eso falla
   * en runtime con `Cannot sign data without client_email`, un mensaje que no menciona IAM
   * por ningún lado.
   */
  async getSignedUrl(
    bucketName: string,
    objectPath: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const [url] = await this.storage
      .bucket(bucketName)
      .file(objectPath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresInSeconds * 1000,
      });
    return url;
  }
}
