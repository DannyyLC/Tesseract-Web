import { plainToInstance } from 'class-transformer';
import { NormalizeEmail, normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('pasa a minúsculas y recorta espacios', () => {
    expect(normalizeEmail('  Juan@Empresa.COM  ')).toBe('juan@empresa.com');
  });

  it('deja intacto un email que ya está en forma canónica', () => {
    expect(normalizeEmail('juan@empresa.com')).toBe('juan@empresa.com');
  });

  it('hace que las variantes de capitalización colapsen en el mismo valor', () => {
    const variantes = ['juan@empresa.com', 'JUAN@EMPRESA.COM', 'Juan@Empresa.com', ' jUaN@eMpReSa.CoM '];
    expect(new Set(variantes.map((v) => normalizeEmail(v))).size).toBe(1);
  });

  it('devuelve undefined para valores ausentes', () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });

  it('no toca los espacios interiores, que harían inválido el email', () => {
    // Se recorta el borde, pero no se "arregla" un email roto: de eso se encarga @IsEmail
    expect(normalizeEmail('  ju an@empresa.com ')).toBe('ju an@empresa.com');
  });
});

describe('@NormalizeEmail', () => {
  class Dto {
    @NormalizeEmail()
    email: string;
  }

  it('normaliza el campo al transformar el payload', () => {
    const dto = plainToInstance(Dto, { email: '  Juan@Empresa.COM ' });
    expect(dto.email).toBe('juan@empresa.com');
  });

  it('deja pasar valores que no son string para que los rechace la validación', () => {
    const dto = plainToInstance(Dto, { email: 42 as unknown as string });
    expect(dto.email).toBe(42);
  });
});
