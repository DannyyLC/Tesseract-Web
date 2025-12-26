import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * SecretsService
 * 
 * Servicio de abstracción para obtener credenciales de herramientas externas.
 * 
 * Desarrollo:
 *   - Lee credenciales desde archivo 'secrets.local.json'
 *   - Las keys son los credentialPath de TenantTool
 *   - Retorna objetos JSON con las credenciales
 * 
 * Producción:
 *   - Se conectará a Google Secret Manager
 *   - Usará el credentialPath como identificador del secret
 * 
 * Ejemplo de uso:
 *   const creds = await secretsService.getCredentials('projects/tesseract/secrets/org-123-hubspot');
 *   // Retorna: { apiKey: "xxx", clientId: "yyy", clientSecret: "zzz" }
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly isProduction: boolean;
  private localSecrets: Record<string, any> = {};

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    
    if (!this.isProduction) {
      this.loadLocalSecrets();
    }
  }

  /**
   * Carga credenciales desde archivo local para desarrollo
   * Busca el archivo secrets.local.json en la raíz del proyecto
   */
  private loadLocalSecrets() {
    try {
      const secretsPath = join(process.cwd(), 'secrets.local.json');
      const secretsData = readFileSync(secretsPath, 'utf-8');
      this.localSecrets = JSON.parse(secretsData);
      this.logger.log('✅ Local secrets loaded from secrets.local.json');
    } catch (error) {
      this.logger.warn('⚠️  No secrets.local.json found. Using empty credentials.');
      this.localSecrets = {};
    }
  }

  /**
   * Obtiene credenciales desde Secret Manager o almacenamiento local
   * 
   * @param credentialPath - Ruta del secret (ej: "projects/tesseract/secrets/org-123-hubspot")
   * @returns Objeto con las credenciales en formato JSON
   * 
   * @example
   * // En desarrollo lee desde secrets.local.json:
   * // {
   * //   "projects/tesseract/secrets/org-123-hubspot": {
   * //     "apiKey": "test-key-123",
   * //     "clientId": "test-client"
   * //   }
   * // }
   * const creds = await getCredentials('projects/tesseract/secrets/org-123-hubspot');
   * // Retorna: { apiKey: "test-key-123", clientId: "test-client" }
   */
  async getCredentials(credentialPath: string): Promise<Record<string, any>> {
    if (!credentialPath) {
      return {};
    }

    if (this.isProduction) {
      return this.getFromGoogleSecretManager(credentialPath);
    } else {
      return this.getFromLocalStorage(credentialPath);
    }
  }

  /**
   * Obtiene credenciales desde almacenamiento local (desarrollo)
   * Lee del objeto cargado desde secrets.local.json
   */
  private getFromLocalStorage(credentialPath: string): Record<string, any> {
    const credentials = this.localSecrets[credentialPath];
    
    if (!credentials) {
      this.logger.warn(`⚠️  No credentials found for path: ${credentialPath}`);
      return {};
    }

    this.logger.debug(`✅ Retrieved local credentials for: ${credentialPath}`);
    return credentials;
  }

  /**
   * Obtiene credenciales desde Google Secret Manager (producción)
   * 
   * TODO: Implementar cuando vayamos a producción
   * Pasos necesarios:
   *   1. Instalar: npm install @google-cloud/secret-manager
   *   2. Configurar Service Account en GCP
   *   3. Descomentar código abajo
   */
  private async getFromGoogleSecretManager(
    credentialPath: string,
  ): Promise<Record<string, any>> {
    // Implementación futura para producción:
    // 
    // const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
    // const client = new SecretManagerServiceClient();
    // 
    // try {
    //   const [version] = await client.accessSecretVersion({ 
    //     name: credentialPath 
    //   });
    //   
    //   const payload = version.payload.data.toString();
    //   return JSON.parse(payload);
    // } catch (error) {
    //   this.logger.error(`Error accessing secret: ${credentialPath}`, error);
    //   throw new Error(`Failed to retrieve credentials from Secret Manager`);
    // }

    this.logger.error('Google Secret Manager not implemented yet');
    throw new Error('Google Secret Manager not available in production mode');
  }
}
