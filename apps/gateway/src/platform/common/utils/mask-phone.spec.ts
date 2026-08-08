import { maskPhone } from './mask-phone';

describe('maskPhone', () => {
  it('deja reconocible el número sin exponerlo completo', () => {
    expect(maskPhone('+5215512345678')).toBe('+52*******5678');
    expect(maskPhone('5512345678')).toBe('55****5678');
  });

  it('ignora separadores para que el mismo número dé siempre el mismo resultado', () => {
    // YCloud y la UI no siempre mandan el número con el mismo formato; si el
    // enmascarado dependiera de los espacios, no se podría buscar en los logs.
    const variantes = ['+52 155 1234 5678', '+52-155-1234-5678', '+5215512345678'];
    for (const variante of variantes) {
      expect(maskPhone(variante)).toBe('+52*******5678');
    }
  });

  it('oculta por completo los números demasiado cortos para partir', () => {
    expect(maskPhone('+521234')).toBe('+******');
    expect(maskPhone('123')).toBe('***');
  });

  it('nunca devuelve el número original', () => {
    for (const phone of ['+5215512345678', '5512345678', '+14155552671', '123']) {
      expect(maskPhone(phone)).not.toBe(phone);
    }
  });

  it('no deja cuatro dígitos consecutivos del centro del número', () => {
    // El riesgo real es un cambio que conserve de más: esto falla si alguien sube
    // PREFIX_LENGTH o baja el enmascarado.
    expect(maskPhone('+5215512345678')).not.toContain('1234');
  });

  it('tolera entradas vacías o inválidas sin lanzar', () => {
    expect(maskPhone(undefined)).toBe('<sin número>');
    expect(maskPhone(null)).toBe('<sin número>');
    expect(maskPhone('')).toBe('<sin número>');
    expect(maskPhone('   ')).toBe('<sin número>');
    expect(maskPhone('sin-dígitos')).toBe('<número inválido>');
  });
});
