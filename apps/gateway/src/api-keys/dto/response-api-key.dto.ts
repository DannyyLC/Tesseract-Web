export class ApiKeyResponseDto {
  id: string;
  name: string;
  apiKey: string;
  keyPrefix: string;
  isActive: boolean;
  scopes?: any;
  expiresAt: Date;
  lastUsedAt: Date;
  createsAt: Date;
}

export class ApiKeyListDto {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: Date;
  expiresAt: Date;
  createsAt: Date;
}
