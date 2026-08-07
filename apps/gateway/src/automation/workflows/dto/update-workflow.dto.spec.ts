import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateWorkflowDto } from './update-workflow.dto';

/**
 * El selector de zona del modal de edición depende de que `null` pase la validación y
 * `''` no. Si `@IsOptional()` desapareciera, o alguien cambiara el front para mandar
 * cadena vacía, volver a "heredar de la organización" empezaría a devolver 400 sin que
 * ningún otro test se entere.
 */
describe('UpdateWorkflowDto — timezone', () => {
  const validateTimezone = async (timezone: unknown) => {
    const dto = plainToInstance(UpdateWorkflowDto, { timezone });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    return errors.filter((error) => error.property === 'timezone');
  };

  it('acepta null: es como el front limpia el override para volver a heredar', async () => {
    expect(await validateTimezone(null)).toEqual([]);
  });

  it('acepta que el campo no venga: editar el nombre no debe tocar la zona', async () => {
    const dto = plainToInstance(UpdateWorkflowDto, { name: 'Otro nombre' });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'timezone')).toEqual([]);
    expect(dto.timezone).toBeUndefined();
  });

  it('acepta un identificador IANA válido', async () => {
    expect(await validateTimezone('America/Monterrey')).toEqual([]);
  });

  it('rechaza la cadena vacía, por eso el front manda null y no ""', async () => {
    expect(await validateTimezone('')).not.toEqual([]);
  });

  it('rechaza una zona inventada antes de que llegue al AT TIME ZONE', async () => {
    expect(await validateTimezone('Mexico City')).not.toEqual([]);
  });
});
