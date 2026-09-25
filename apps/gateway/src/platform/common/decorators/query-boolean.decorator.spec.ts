import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryLlmModelsDto } from '@/automation/llm-models/dto/query-llm-model.dto';
import { QueryLlmCategoryDto } from '@/automation/llm-models/dto/query-llm-category.dto';
import { QueryWorkflowsAdminDto } from '@/automation/workflows/dto/admin/query-workflows-admin.dto';
import { QueryOrganizationsAdminDto } from '@/identity/organizations/dto/query-organizations-admin.dto';
import { QueryConversationsAdminDto } from '@/messaging/conversations/dto/query-conversations-admin.dto';

// Lo mismo que hace el ValidationPipe global con `transform: true`: el query string llega como
// texto y se convierte con los decoradores del DTO.
function parse<T extends object>(dto: new () => T, query: Record<string, string>) {
  const instance = plainToInstance(dto, query);
  return { instance, errors: validateSync(instance) };
}

const ORG = '00000000-0000-4000-8000-000000000001';
const WORKFLOW = '00000000-0000-4000-8000-000000000002';

const cases: Array<[string, new () => object, string, Record<string, string>]> = [
  ['QueryWorkflowsAdminDto', QueryWorkflowsAdminDto, 'includeDeleted', {}],
  ['QueryOrganizationsAdminDto', QueryOrganizationsAdminDto, 'isActive', {}],
  ['QueryLlmModelsDto', QueryLlmModelsDto, 'isActive', {}],
  ['QueryLlmCategoryDto', QueryLlmCategoryDto, 'isActive', {}],
  [
    'QueryConversationsAdminDto',
    QueryConversationsAdminDto,
    'onlyErrors',
    { organizationId: ORG, workflowId: WORKFLOW },
  ],
];

describe('QueryBoolean', () => {
  describe.each(cases)('%s.%s', (_name, dto, field, base) => {
    it("convierte 'false' en false (antes Boolean('false') daba true)", () => {
      const { instance, errors } = parse(dto, { ...base, [field]: 'false' });
      expect(errors).toHaveLength(0);
      expect((instance as Record<string, unknown>)[field]).toBe(false);
    });

    it("convierte 'true' en true", () => {
      const { instance, errors } = parse(dto, { ...base, [field]: 'true' });
      expect(errors).toHaveLength(0);
      expect((instance as Record<string, unknown>)[field]).toBe(true);
    });

    it('lo deja sin definir cuando no viene', () => {
      const { instance, errors } = parse(dto, base);
      expect(errors).toHaveLength(0);
      expect((instance as Record<string, unknown>)[field]).toBeUndefined();
    });

    it('rechaza un valor que no es booleano', () => {
      const { errors } = parse(dto, { ...base, [field]: 'yes' });
      expect(errors.map((e) => e.property)).toContain(field);
    });
  });
});
