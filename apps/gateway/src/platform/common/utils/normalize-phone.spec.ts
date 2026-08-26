import { plainToInstance } from 'class-transformer';
import { NormalizePhone, normalizePhone, phoneNumberVariants } from './normalize-phone';

describe('normalizePhone', () => {
  it('deja `+` y dígitos, quitando separadores', () => {
    expect(normalizePhone('+52 55 1234 5678')).toBe('+525512345678');
    expect(normalizePhone('(55) 1234-5678')).toBe('+5512345678');
    expect(normalizePhone('  +52.55.1234.5678  ')).toBe('+525512345678');
  });

  it('agrega el `+` a un número que se guardó sin él', () => {
    expect(normalizePhone('525512345678')).toBe('+525512345678');
  });

  it('es idempotente', () => {
    const once = normalizePhone('+52 55 1234 5678');
    expect(normalizePhone(once)).toBe(once);
  });

  it('devuelve undefined cuando no queda ningún dígito', () => {
    expect(normalizePhone(undefined)).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
    expect(normalizePhone('')).toBeUndefined();
    expect(normalizePhone('sin número')).toBeUndefined();
  });

  it('no inventa lada: un número local no se vuelve mexicano', () => {
    expect(normalizePhone('5512345678')).toBe('+5512345678');
  });
});

describe('phoneNumberVariants', () => {
  it('hace empatar las dos formas mexicanas, con y sin el `1` de móvil', () => {
    const conUno = phoneNumberVariants('+5215512345678');
    const sinUno = phoneNumberVariants('+525512345678');

    expect(conUno).toContain('+525512345678');
    expect(conUno).toContain('+5215512345678');
    expect(sinUno).toContain('+5215512345678');
    expect(sinUno).toContain('+525512345678');
  });

  it('incluye cada forma con y sin `+`, porque la columna no tiene formato obligatorio', () => {
    expect(phoneNumberVariants('+5215512345678')).toEqual(
      expect.arrayContaining(['+5215512345678', '5215512345678', '+525512345678', '525512345678']),
    );
  });

  it('parte del número tecleado con separadores, no solo del canónico', () => {
    expect(phoneNumberVariants('+52 1 55 1234 5678')).toContain('+525512345678');
  });

  it('no aplica la regla mexicana a otras ladas', () => {
    // +1 (EEUU/Canadá): quitarle el `1` daría un número de otro país.
    expect(phoneNumberVariants('+15551234567')).toEqual(['+15551234567', '15551234567']);
  });

  it('no aplica la regla a un `52…` de largo distinto al mexicano', () => {
    expect(phoneNumberVariants('+52551234')).toEqual(['+52551234', '52551234']);
  });

  it('devuelve una lista vacía si no hay número', () => {
    expect(phoneNumberVariants(undefined)).toEqual([]);
    expect(phoneNumberVariants('sin número')).toEqual([]);
  });
});

describe('@NormalizePhone', () => {
  class Dto {
    @NormalizePhone()
    phoneNumber: string;
  }

  it('normaliza el campo al transformar el payload', () => {
    const dto = plainToInstance(Dto, { phoneNumber: '+52 55 1234 5678' });
    expect(dto.phoneNumber).toBe('+525512345678');
  });

  it('deja pasar lo que no tiene dígitos para que lo rechace la validación', () => {
    const dto = plainToInstance(Dto, { phoneNumber: 'sin número' });
    expect(dto.phoneNumber).toBe('sin número');
  });

  it('deja pasar valores que no son string', () => {
    const dto = plainToInstance(Dto, { phoneNumber: 42 as unknown as string });
    expect(dto.phoneNumber).toBe(42);
  });
});
