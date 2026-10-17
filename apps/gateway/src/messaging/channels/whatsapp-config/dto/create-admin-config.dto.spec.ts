import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdminConfigDto } from './create-config.dto';
import { UpdateAdminWhatsappConfigDto } from './update-config.dto';

const base = { workflowId: 'wf-1', phoneNumber: '+525512345678' };

async function errorsFor(input: object): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAdminConfigDto, { ...base, ...input }));
  return errors.map((e) => e.property).sort();
}

describe('CreateAdminConfigDto', () => {
  it('ycloud (o sin provider) no exige credenciales', async () => {
    expect(await errorsFor({})).toEqual([]);
    expect(await errorsFor({ provider: 'ycloud' })).toEqual([]);
  });

  it('meta exige phoneNumberId, appSecret y accessToken', async () => {
    expect(await errorsFor({ provider: 'meta' })).toEqual(['accessToken', 'appSecret', 'phoneNumberId']);
    expect(await errorsFor({ provider: 'meta', phoneNumberId: '1', appSecret: 's', accessToken: 't' })).toEqual([]);
  });

  it('meta rechaza credenciales que son solo espacios', async () => {
    expect(
      await errorsFor({ provider: 'meta', phoneNumberId: '  ', appSecret: 's', accessToken: 't' }),
    ).toEqual(['phoneNumberId']);
  });

  it('rechaza un provider desconocido', async () => {
    expect(await errorsFor({ provider: 'twilio' })).toEqual(['provider']);
  });
});

describe('UpdateAdminWhatsappConfigDto', () => {
  const check = async (input: object) =>
    (await validate(plainToInstance(UpdateAdminWhatsappConfigDto, input))).map((e) => e.property);

  it('sin phoneNumber es válido (no lo toca)', async () => {
    expect(await check({ displayName: 'x' })).toEqual([]);
  });

  it('normaliza el teléfono a formato canónico', async () => {
    const dto = plainToInstance(UpdateAdminWhatsappConfigDto, { phoneNumber: '+52 55 2222 2222' });
    expect(dto.phoneNumber).toBe('+525522222222');
    expect(await validate(dto)).toEqual([]);
  });

  it('rechaza un teléfono demasiado corto', async () => {
    expect(await check({ phoneNumber: '+123' })).toEqual(['phoneNumber']);
  });
});

describe('UpdateAdminWhatsappConfigDto credenciales', () => {
  const check = async (input: object) =>
    (await validate(plainToInstance(UpdateAdminWhatsappConfigDto, input))).map((e) => e.property).sort();

  it('todas son opcionales', async () => {
    expect(await check({})).toEqual([]);
    expect(await check({ accessToken: 'nuevo' })).toEqual([]);
  });

  it('un string vacío o de espacios es error (no borra el valor guardado)', async () => {
    expect(await check({ appSecret: '', accessToken: '   ' })).toEqual(['accessToken', 'appSecret']);
  });

  it('recorta los espacios', () => {
    const dto = plainToInstance(UpdateAdminWhatsappConfigDto, { accessToken: '  tok  ' });
    expect(dto.accessToken).toBe('tok');
  });
});
