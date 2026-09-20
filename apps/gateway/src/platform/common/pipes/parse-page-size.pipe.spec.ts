import { BadRequestException } from '@nestjs/common';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@tesseract/types';
import { ParsePageSizePipe } from './parse-page-size.pipe';

describe('ParsePageSizePipe', () => {
  const pipe = new ParsePageSizePipe();

  it('usa el default cuando no llega valor', () => {
    expect(pipe.transform(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(pipe.transform('')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('acepta enteros dentro del rango', () => {
    expect(pipe.transform('1')).toBe(1);
    expect(pipe.transform('50')).toBe(50);
    expect(pipe.transform(String(MAX_PAGE_SIZE))).toBe(MAX_PAGE_SIZE);
  });

  it.each(['0', '-5', String(MAX_PAGE_SIZE + 1), '100000', 'abc', '1.5', '1e2', ' 20', '20 ', '0x10'])(
    'rechaza %p',
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );
});
