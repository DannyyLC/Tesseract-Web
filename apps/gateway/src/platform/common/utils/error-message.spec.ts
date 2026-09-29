import { AxiosError, AxiosHeaders } from 'axios';
import { errorMessage, httpErrorDetail, oauthErrorDescription } from './error-message';

const axiosError = (data: unknown) =>
  new AxiosError('Request failed with status code 400', '400', undefined, undefined, {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('error-message', () => {
  it('errorMessage lee Error, string y cae al fallback', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('texto')).toBe('texto');
    expect(errorMessage({ raro: true })).toBe('Unknown error');
    expect(errorMessage(null, 'otro')).toBe('otro');
  });

  it('httpErrorDetail prefiere el cuerpo de la respuesta', () => {
    expect(httpErrorDetail(axiosError({ error: 'invalid number' }))).toBe(
      '{"error":"invalid number"}',
    );
    expect(httpErrorDetail(new Error('sin respuesta'))).toBe('sin respuesta');
  });

  it('oauthErrorDescription prefiere error_description', () => {
    expect(oauthErrorDescription(axiosError({ error_description: 'Bad Request' }))).toBe(
      'Bad Request',
    );
    expect(oauthErrorDescription(axiosError({}))).toBe('Request failed with status code 400');
  });
});
