import { ApiKeyUtil } from './api-key.util';
import * as bcrypt from 'bcrypt';

// Mock bcrypt functions
const mockHash = jest.fn();
const mockCompare = jest.fn();

jest.mock('bcrypt', () => ({
  hash: (...args: any[]) => mockHash(...args),
  compare: (...args: any[]) => mockCompare(...args),
}));

describe('ApiKeyUtil', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // HASH TESTS
  // ============================================================================

  describe('hash', () => {
    it('debería hashear un API key usando bcrypt', async () => {
      // Arrange
      const apiKey = 'ak_live_test1234567890abcdefghijklmno';
      const expectedHash = '$2b$10$hashedapikey';
      mockHash.mockResolvedValue(expectedHash);

      // Act
      const result = await ApiKeyUtil.hash(apiKey);

      // Assert
      expect(result).toBe(expectedHash);
      expect(mockHash).toHaveBeenCalledWith(apiKey, 10);
    });

    it('debería usar 10 salt rounds', async () => {
      // Arrange
      const apiKey = 'ak_test_key';
      mockHash.mockResolvedValue('hash');

      // Act
      await ApiKeyUtil.hash(apiKey);

      // Assert
      expect(mockHash).toHaveBeenCalledWith(apiKey, 10);
    });
  });

  // ============================================================================
  // COMPARE TESTS
  // ============================================================================

  describe('compare', () => {
    it('debería comparar un API key con su hash y retornar true si coinciden', async () => {
      // Arrange
      const apiKey = 'ak_live_test1234567890abcdefghijklmno';
      const hash = '$2b$10$hashedapikey';
      mockCompare.mockResolvedValue(true);

      // Act
      const result = await ApiKeyUtil.compare(apiKey, hash);

      // Assert
      expect(result).toBe(true);
      expect(mockCompare).toHaveBeenCalledWith(apiKey, hash);
    });

    it('debería retornar false si no coinciden', async () => {
      // Arrange
      const apiKey = 'ak_live_wrongkey';
      const hash = '$2b$10$hashedapikey';
      mockCompare.mockResolvedValue(false);

      // Act
      const result = await ApiKeyUtil.compare(apiKey, hash);

      // Assert
      expect(result).toBe(false);
      expect(mockCompare).toHaveBeenCalledWith(apiKey, hash);
    });
  });

  // ============================================================================
  // EXTRACT PREFIX TESTS
  // ============================================================================

  describe('extractPrefix', () => {
    it('debería extraer los primeros 16 caracteres del API key', () => {
      // Arrange
      const apiKey = 'ak_live_test1234567890abcdefghijklmno';

      // Act
      const prefix = ApiKeyUtil.extractPrefix(apiKey);

      // Assert
      expect(prefix).toBe('ak_live_test1234');
      expect(prefix.length).toBe(16);
    });

    it('debería retornar el API key completo si es menor a 16 caracteres', () => {
      // Arrange
      const apiKey = 'short_key';

      // Act
      const prefix = ApiKeyUtil.extractPrefix(apiKey);

      // Assert
      expect(prefix).toBe('short_key');
    });

    it('debería manejar API keys con formato test', () => {
      // Arrange
      const apiKey = 'ak_test_abc123xyz456def789ghi012jkl345';

      // Act
      const prefix = ApiKeyUtil.extractPrefix(apiKey);

      // Assert
      expect(prefix).toBe('ak_test_abc123xy');
      expect(prefix.length).toBe(16);
    });
  });

  // ============================================================================
  // GENERATE TESTS
  // ============================================================================

  describe('generate', () => {
    it('debería generar un API key con formato ak_live_ por defecto', () => {
      // Act
      const apiKey = ApiKeyUtil.generate();

      // Assert
      expect(apiKey).toMatch(/^ak_live_[a-zA-Z0-9]{32}$/);
      expect(apiKey.length).toBe(40); // 'ak_live_' (8) + 32 random chars
    });

    it('debería generar un API key con formato ak_test_ cuando env es test', () => {
      // Act
      const apiKey = ApiKeyUtil.generate('test');

      // Assert
      expect(apiKey).toMatch(/^ak_test_[a-zA-Z0-9]{32}$/);
      expect(apiKey.length).toBe(40); // 'ak_test_' (8) + 32 random chars
    });

    it('debería generar un API key con formato ak_live_ cuando env es live', () => {
      // Act
      const apiKey = ApiKeyUtil.generate('live');

      // Assert
      expect(apiKey).toMatch(/^ak_live_[a-zA-Z0-9]{32}$/);
    });

    it('debería generar API keys únicos en múltiples llamadas', () => {
      // Act
      const apiKey1 = ApiKeyUtil.generate();
      const apiKey2 = ApiKeyUtil.generate();
      const apiKey3 = ApiKeyUtil.generate();

      // Assert
      expect(apiKey1).not.toBe(apiKey2);
      expect(apiKey2).not.toBe(apiKey3);
      expect(apiKey1).not.toBe(apiKey3);
    });

    it('debería generar la parte aleatoria con exactamente 32 caracteres', () => {
      // Act
      const apiKey = ApiKeyUtil.generate();
      const randomPart = apiKey.substring(8); // Quitar 'ak_live_'

      // Assert
      expect(randomPart.length).toBe(32);
      expect(randomPart).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('debería generar API keys solo con caracteres alfanuméricos', () => {
      // Act
      const apiKeys = Array.from({ length: 10 }, () => ApiKeyUtil.generate());

      // Assert
      apiKeys.forEach((apiKey) => {
        const randomPart = apiKey.substring(8);
        expect(randomPart).toMatch(/^[a-zA-Z0-9]+$/);
      });
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration Tests', () => {
    it('debería poder hashear y comparar un API key generado', async () => {
      // Arrange
      const apiKey = ApiKeyUtil.generate();
      const mockHashValue = '$2b$10$mockedhash123';

      mockHash.mockResolvedValue(mockHashValue);
      mockCompare.mockImplementation((data: string, hash: string) => {
        return Promise.resolve(data === apiKey && hash === mockHashValue);
      });

      // Act
      const hash = await ApiKeyUtil.hash(apiKey);
      const isMatch = await ApiKeyUtil.compare(apiKey, hash);
      const isNotMatch = await ApiKeyUtil.compare('wrong_key', hash);

      // Assert
      expect(isMatch).toBe(true);
      expect(isNotMatch).toBe(false);
    });

    it('debería generar hashes diferentes para el mismo API key (salt)', async () => {
      // Arrange
      const apiKey = 'ak_live_test123';
      let callCount = 0;

      mockHash.mockImplementation(() => {
        callCount++;
        return Promise.resolve(`$2b$10$mockedhash${callCount}`);
      });

      mockCompare.mockImplementation((data: string, hash: string) => {
        return Promise.resolve(
          data === apiKey && hash.startsWith('$2b$10$mockedhash'),
        );
      });

      // Act
      const hash1 = await ApiKeyUtil.hash(apiKey);
      const hash2 = await ApiKeyUtil.hash(apiKey);

      // Assert
      expect(hash1).not.toBe(hash2);

      // Pero ambos deberían verificarse correctamente
      const match1 = await ApiKeyUtil.compare(apiKey, hash1);
      const match2 = await ApiKeyUtil.compare(apiKey, hash2);
      expect(match1).toBe(true);
      expect(match2).toBe(true);
    });

    it('debería extraer prefijo que coincida con los primeros 16 caracteres', () => {
      // Arrange
      const apiKey = ApiKeyUtil.generate('live');

      // Act
      const prefix = ApiKeyUtil.extractPrefix(apiKey);
      const expectedPrefix = apiKey.substring(0, 16);

      // Assert
      expect(prefix).toBe(expectedPrefix);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('extractPrefix debería manejar strings vacíos', () => {
      // Act
      const prefix = ApiKeyUtil.extractPrefix('');

      // Assert
      expect(prefix).toBe('');
    });

    it('extractPrefix debería manejar API keys muy cortos', () => {
      // Arrange
      const shortKey = 'ak_';

      // Act
      const prefix = ApiKeyUtil.extractPrefix(shortKey);

      // Assert
      expect(prefix).toBe('ak_');
    });

    it('generate debería crear API keys válidos incluso con muchas llamadas', () => {
      // Act
      const apiKeys = Array.from({ length: 100 }, () => ApiKeyUtil.generate());

      // Assert
      const uniqueKeys = new Set(apiKeys);
      expect(uniqueKeys.size).toBe(100); // Todos deben ser únicos

      apiKeys.forEach((key) => {
        expect(key).toMatch(/^ak_live_[a-zA-Z0-9]{32}$/);
      });
    });
  });
});
