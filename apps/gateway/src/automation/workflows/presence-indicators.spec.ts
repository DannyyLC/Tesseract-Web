import { resolvePresenceIndicators } from './presence-indicators';

describe('resolvePresenceIndicators', () => {
  it('queda encendido cuando el workflow no configura nada', () => {
    // El default importa: es el comportamiento que tenían todos los workflows antes de la opción.
    for (const config of [null, undefined, {}, { presenceIndicators: null }]) {
      expect(resolvePresenceIndicators(config)).toBe(true);
    }
  });

  it('respeta el booleano configurado', () => {
    expect(resolvePresenceIndicators({ presenceIndicators: true })).toBe(true);
    expect(resolvePresenceIndicators({ presenceIndicators: false })).toBe(false);
  });

  it('ignora valores que no son booleanos en vez de apagarlos', () => {
    for (const value of ['false', 0, 'no', {}]) {
      expect(resolvePresenceIndicators({ presenceIndicators: value })).toBe(true);
    }
  });
});
