import { toText } from './to-text';

describe('toText', () => {
  it.each([
    ['hola', 'hola'],
    [42, '42'],
    [true, 'true'],
    [null, ''],
    [undefined, ''],
    [['a', 'b', 3], 'a,b,3'],
    [{ a: 1 }, '{"a":1}'],
  ])('%p → %p', (input, expected) => {
    expect(toText(input)).toBe(expected);
  });
});
