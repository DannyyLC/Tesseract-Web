import { validate } from 'class-validator';
import {
  COUNTRY_CURRENCY,
  COUNTRY_GROUPS,
  FALLBACK_BILLING_CURRENCY,
  SUPPORTED_COUNTRIES,
  formatCountryName,
  isSupportedCountry,
  resolveBillingCurrency,
} from '@tesseract/types';
import { IsCountry } from './resolve-country';

class CountryDto {
  @IsCountry()
  country!: string;
}

describe('resolve-country', () => {
  describe('isSupportedCountry', () => {
    it('acepta los códigos del catálogo', () => {
      expect(isSupportedCountry('MX')).toBe(true);
      expect(isSupportedCountry('US')).toBe(true);
    });

    it('rechaza lo que no sabemos facturar', () => {
      // Minúsculas incluidas: el catálogo es alpha-2 en mayúsculas y aceptar 'mx' abriría la
      // puerta a dos representaciones del mismo país en la columna.
      expect(isSupportedCountry('mx')).toBe(false);
      expect(isSupportedCountry('JP')).toBe(false);
      expect(isSupportedCountry('')).toBe(false);
      expect(isSupportedCountry(null)).toBe(false);
      expect(isSupportedCountry(undefined)).toBe(false);
      expect(isSupportedCountry(42)).toBe(false);
    });
  });

  describe('resolveBillingCurrency', () => {
    it('cobra en pesos solo a México', () => {
      expect(resolveBillingCurrency('MX')).toBe('mxn');
      expect(resolveBillingCurrency('US')).toBe('usd');
      expect(resolveBillingCurrency('CO')).toBe('usd');
    });

    it('cae a la moneda de respaldo cuando aún no hay país', () => {
      // Organizaciones anteriores al campo, o que nunca han contratado. MXN porque el grueso
      // de los clientes es de México.
      expect(resolveBillingCurrency(null)).toBe(FALLBACK_BILLING_CURRENCY);
      expect(resolveBillingCurrency(undefined)).toBe(FALLBACK_BILLING_CURRENCY);
      expect(FALLBACK_BILLING_CURRENCY).toBe('mxn');
    });

    it('no confía en un país fuera del catálogo', () => {
      expect(resolveBillingCurrency('JP')).toBe(FALLBACK_BILLING_CURRENCY);
    });
  });

  describe('IsCountry', () => {
    const validateCountry = async (value: unknown) => {
      const dto = new CountryDto();
      (dto as unknown as { country: unknown }).country = value;
      return validate(dto);
    };

    it('deja pasar un país soportado', async () => {
      expect(await validateCountry('MX')).toHaveLength(0);
    });

    it('rechaza un país fuera del catálogo', async () => {
      const errors = await validateCountry('JP');
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isCountry');
    });
  });

  // El catálogo vive en @tesseract/types y se comprueba aquí porque ese paquete no tiene
  // jest. El cruce que importa: que todo lo que ofrecemos elegir sepamos cobrarlo.
  describe('catálogo compartido de países (@tesseract/types)', () => {
    it('todo país del selector pasa el validador del gateway', () => {
      const invalid = SUPPORTED_COUNTRIES.filter((code) => !isSupportedCountry(code));
      expect(invalid).toEqual([]);
    });

    it('todo país tiene una moneda asignada', () => {
      const sinMoneda = SUPPORTED_COUNTRIES.filter((code) => !COUNTRY_CURRENCY[code]);
      expect(sinMoneda).toEqual([]);
    });

    it('no tiene duplicados entre regiones', () => {
      expect(new Set(SUPPORTED_COUNTRIES).size).toBe(SUPPORTED_COUNTRIES.length);
    });

    it('ninguna región queda vacía', () => {
      COUNTRY_GROUPS.forEach((group) => expect(group.countries.length).toBeGreaterThan(0));
    });

    it('usa códigos alpha-2 en mayúsculas', () => {
      // Postgres compara texto sensible a mayúsculas, así que una mezcla de 'MX' y 'mx' en la
      // columna partiría en dos las consultas por país.
      const malFormados = SUPPORTED_COUNTRIES.filter((code) => !/^[A-Z]{2}$/.test(code));
      expect(malFormados).toEqual([]);
    });

    it('solo México cobra en una moneda distinta de USD', () => {
      const noUsd = SUPPORTED_COUNTRIES.filter((code) => COUNTRY_CURRENCY[code] !== 'usd');
      expect(noUsd).toEqual(['MX']);
    });

    it('resuelve nombres legibles para todo el catálogo', () => {
      // Si Intl no conoce un código devuelve el propio código; eso delataría una errata.
      const sinNombre = SUPPORTED_COUNTRIES.filter((code) => formatCountryName(code) === code);
      expect(sinNombre).toEqual([]);
    });
  });
});
