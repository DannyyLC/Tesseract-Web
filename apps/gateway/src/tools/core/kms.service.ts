import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KeyManagementServiceClient } from '@google-cloud/kms';

@Injectable()
export class KmsService implements OnModuleInit {
  private readonly logger = new Logger(KmsService.name);
  private kmsClient: KeyManagementServiceClient;

  private readonly projectId = process.env.GCP_PROJECT_ID || 'tesseract-dev';
  private readonly locationId = process.env.GCP_KMS_LOCATION || 'global';
  private readonly keyRingId = process.env.GCP_KMS_KEY_RING || 'tesseract-key-ring';
  private readonly cryptoKeyId = process.env.GCP_KMS_CRYPTO_KEY || 'oauth-tokens-key';
  
  private keyName: string;

  constructor() {
    this.kmsClient = new KeyManagementServiceClient();
  }

  async onModuleInit() {
    this.keyName = this.kmsClient.cryptoKeyPath(
      this.projectId,
      this.locationId,
      this.keyRingId,
      this.cryptoKeyId,
    );
    this.logger.log(`KMS Service initialized with key: ${this.keyName}`);
  }

  /**
   * Encrypts a plaintext string (e.g. Access Token)
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return plaintext;
    try {
      // NOTE: Using direct KMS encryption for MVP. Envelope encryption with Tink 
      // can be swapped in here transparently as it scales.
      const buffer = Buffer.from(plaintext, 'utf8');
      const [result] = await this.kmsClient.encrypt({
        name: this.keyName,
        plaintext: buffer,
      });
      return result.ciphertext ? Buffer.from(result.ciphertext).toString('base64') : '';
    } catch (error) {
      this.logger.error(`Failed to encrypt data: ${(error as Error).message}`);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypts a ciphertext string
   */
  async decrypt(ciphertextBase64: string): Promise<string> {
    if (!ciphertextBase64) return ciphertextBase64;
    try {
      const buffer = Buffer.from(ciphertextBase64, 'base64');
      const [result] = await this.kmsClient.decrypt({
        name: this.keyName,
        ciphertext: buffer,
      });
      return result.plaintext ? Buffer.from(result.plaintext).toString('utf8') : '';
    } catch (error) {
      this.logger.error(`Failed to decrypt data: ${(error as Error).message}`);
      throw new Error('Decryption failed');
    }
  }
}
