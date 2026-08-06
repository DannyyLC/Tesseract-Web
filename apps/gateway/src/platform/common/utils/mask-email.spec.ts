import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('deja reconocible la cuenta sin exponer el email completo', () => {
    expect(maskEmail('persona@ejemplo.com')).toBe('p***a@ejemplo.com');
  });

  it('no filtra la parte local en emails cortos', () => {
    expect(maskEmail('ab@x.com')).toBe('a***@x.com');
    expect(maskEmail('a@x.com')).toBe('a***@x.com');
  });

  it('nunca devuelve el email original', () => {
    for (const email of ['persona@ejemplo.com', 'nombre.apellido@empresa.com.mx', 'x@y.z']) {
      expect(maskEmail(email)).not.toBe(email);
    }
  });

  it('tolera entradas vacías o inválidas sin lanzar', () => {
    expect(maskEmail(undefined)).toBe('<sin email>');
    expect(maskEmail(null)).toBe('<sin email>');
    expect(maskEmail('')).toBe('<sin email>');
    expect(maskEmail('sin-arroba')).toBe('<email inválido>');
    expect(maskEmail('@solo-dominio')).toBe('<email inválido>');
  });

  it('usa la última arroba, por si la parte local trae una', () => {
    expect(maskEmail('raro@cosa@dominio.com')).toBe('r***a@dominio.com');
  });
});
