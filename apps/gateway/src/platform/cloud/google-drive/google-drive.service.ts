import { Injectable, BadRequestException } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import { toText } from '@/platform/common/utils/to-text';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  type: 'document' | 'video' | 'unknown';
  downloadUrl: string;
}

@Injectable()
export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor() {
    // No private_key or client_email needed!
    // Google SDK automatically pulls credentials from the cloud environment.
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    this.drive = google.drive({ version: 'v3', auth });
  }

  async getFilesFromPublicFolder(folderUrl: string): Promise<DriveFileItem[]> {
    const folderId = this.extractFolderId(folderUrl);
    if (!folderId) {
      throw new BadRequestException('El enlace de Google Drive no es válido.');
    }

    try {
      // Listamos los archivos dentro de la carpeta pública
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType)',
        supportsAllDrives: true, // Fixes corporate shared drive barriers
        includeItemsFromAllDrives: true, // Fixes corporate shared drive barriers
        corpora: 'allDrives', // Tells Google to look outside your personal 'user' scope
      });

      const files = response.data.files ?? [];

      // Mapeamos y clasificamos los archivos según su MimeType
      // Sin id, nombre o tipo no hay archivo que enviar: se descartan en vez de afirmarlos.
      const complete = files.filter(
        (file): file is drive_v3.Schema$File & { id: string; name: string; mimeType: string } =>
          Boolean(file.id && file.name && file.mimeType),
      );
      return complete.map((file) => {
        let type: 'document' | 'video' | 'unknown' = 'unknown';

        if (file.mimeType === 'application/pdf') {
          type = 'document';
        } else if (file.mimeType?.startsWith('video/')) {
          type = 'video';
        }

        return {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          type,
          // Generamos el link de descarga directa que requiere yCloud
          downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
        };
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : toText(error);
      throw new BadRequestException(`Error al acceder a la carpeta: ${reason}`);
    }
  }

  private extractFolderId(url: string): string | null {
    const match = /\/folders\/([a-zA-Z0-9-_]+)/.exec(url);
    return match ? match[1] : null;
  }
}
