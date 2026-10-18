import { parseJsonObjectEnv } from './parse-json-env';

describe('parseJsonObjectEnv', () => {
  it('vacía o ausente es un objeto vacío', () => {
    expect(parseJsonObjectEnv('X', undefined)).toEqual({});
    expect(parseJsonObjectEnv('X', '   ')).toEqual({});
  });

  it('lee un objeto JSON', () => {
    expect(parseJsonObjectEnv('X', '{"reasoning_effort":"none"}')).toEqual({
      reasoning_effort: 'none',
    });
  });

  it('JSON inválido o que no es objeto lanza con el nombre de la variable', () => {
    expect(() => parseJsonObjectEnv('COMPACTION_EXTRA_PARAMS', 'none')).toThrow(
      /COMPACTION_EXTRA_PARAMS/,
    );
    expect(() => parseJsonObjectEnv('X', '["a"]')).toThrow(/objeto JSON/);
    expect(() => parseJsonObjectEnv('X', '"texto"')).toThrow(/objeto JSON/);
  });
});
