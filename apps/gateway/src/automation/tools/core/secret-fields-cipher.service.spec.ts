import { ENCRYPTED_PREFIX, SecretFieldsCipher } from './secret-fields-cipher.service';

describe('SecretFieldsCipher', () => {
  let kms: { encrypt: jest.Mock; decrypt: jest.Mock };
  let cipher: SecretFieldsCipher;

  beforeEach(() => {
    kms = {
      encrypt: jest.fn(async (plain: string, aad?: string) => `enc(${plain}|${aad})`),
      decrypt: jest.fn(async (cipherText: string) => cipherText.replace(/^enc\((.*)\|.*\)$/, '$1')),
    };
    cipher = new SecretFieldsCipher(kms as any);
  });

  const data = { phoneNumberId: '123', appSecret: 'sec', accessToken: 'tok' };
  const fields = ['appSecret', 'accessToken'] as const;

  describe('encryptFields', () => {
    it('cifra solo los campos secretos, con el AAD contexto:campo', async () => {
      const out = await cipher.encryptFields(data, fields, 'ctx');

      expect(out.phoneNumberId).toBe('123');
      expect(out.appSecret).toBe(`${ENCRYPTED_PREFIX}enc(sec|ctx:appSecret)`);
      expect(out.accessToken).toBe(`${ENCRYPTED_PREFIX}enc(tok|ctx:accessToken)`);
      expect(kms.encrypt).toHaveBeenCalledWith('sec', 'ctx:appSecret');
    });

    it('no muta el objeto original', async () => {
      await cipher.encryptFields(data, fields, 'ctx');
      expect(data.appSecret).toBe('sec');
    });

    it('no vuelve a cifrar un valor ya cifrado ni cifra vacíos', async () => {
      const out = await cipher.encryptFields(
        { appSecret: `${ENCRYPTED_PREFIX}abc`, accessToken: '' },
        fields,
        'ctx',
      );
      expect(kms.encrypt).not.toHaveBeenCalled();
      expect(out.appSecret).toBe(`${ENCRYPTED_PREFIX}abc`);
    });

    it('propaga el error de KMS', async () => {
      kms.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));
      await expect(cipher.encryptFields(data, fields, 'ctx')).rejects.toThrow('Encryption failed');
    });
  });

  describe('decryptFields', () => {
    it('hace ida y vuelta con el mismo contexto', async () => {
      const encrypted = await cipher.encryptFields(data, fields, 'ctx');
      expect(await cipher.decryptFields(encrypted, fields, 'ctx')).toEqual(data);
      expect(kms.decrypt).toHaveBeenCalledWith('enc(sec|ctx:appSecret)', 'ctx:appSecret');
    });

    it('deja pasar un valor en claro previo a esta capa, sin llamar a KMS', async () => {
      const out = await cipher.decryptFields(data, fields, 'ctx');
      expect(out).toEqual(data);
      expect(kms.decrypt).not.toHaveBeenCalled();
    });

    it('devuelve null/undefined tal cual', async () => {
      expect(await cipher.decryptFields(null, fields, 'ctx')).toBeNull();
      expect(await cipher.decryptFields(undefined, fields, 'ctx')).toBeUndefined();
    });

    it('lanza si KMS falla, no devuelve un secreto vacío', async () => {
      kms.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));
      await expect(
        cipher.decryptFields({ appSecret: `${ENCRYPTED_PREFIX}abc` }, fields, 'ctx'),
      ).rejects.toThrow('Decryption failed');
    });

    it('cachea: la segunda lectura del mismo valor no llama a KMS', async () => {
      const encrypted = await cipher.encryptFields(data, fields, 'ctx');
      await cipher.decryptFields(encrypted, fields, 'ctx');
      kms.decrypt.mockClear();

      await cipher.decryptFields(encrypted, fields, 'ctx');

      expect(kms.decrypt).not.toHaveBeenCalled();
    });

    it('el caché no cruza contextos: mismo ciphertext, otro contexto, vuelve a KMS', async () => {
      const encrypted = { appSecret: `${ENCRYPTED_PREFIX}abc` };
      await cipher.decryptFields(encrypted, fields, 'ctx-1');
      await cipher.decryptFields(encrypted, fields, 'ctx-2');
      expect(kms.decrypt).toHaveBeenCalledTimes(2);
    });

    it('el caché expira', async () => {
      jest.useFakeTimers();
      try {
        const encrypted = { appSecret: `${ENCRYPTED_PREFIX}abc` };
        await cipher.decryptFields(encrypted, fields, 'ctx');
        jest.advanceTimersByTime(5 * 60 * 1000 + 1);
        await cipher.decryptFields(encrypted, fields, 'ctx');
        expect(kms.decrypt).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
