import { FacturapiClient } from './facturapi.client';

describe('FacturapiClient', () => {
  const clientWithKey = (apiKey: string | undefined) =>
    new FacturapiClient({ get: () => apiKey } as any);

  describe('sin FACTURAPI_API_KEY', () => {
    it('arranca sin lanzar', () => {
      // El gateway no puede negarse a levantar porque falte el PAC: es una dependencia de una
      // funcionalidad concreta (facturar a clientes mexicanos), no del sistema. En producción
      // la variable es obligatoria y el proceso muere antes, en env-validation.
      const client = clientWithKey(undefined);

      expect(() => client.onModuleInit()).not.toThrow();
      expect(client.isConfigured).toBe(false);
    });

    it('falla solo al intentar usar el SDK', () => {
      const client = clientWithKey(undefined);
      client.onModuleInit();

      // Este error acaba clasificado como INTERNAL —no trae `status`—, o sea el mismo camino
      // que un PAC caído: factura pendiente, reintento nocturno y alerta.
      expect(() => client.invoices).toThrow(/FACTURAPI_API_KEY is not configured/);
    });
  });

  describe('con llave', () => {
    it('queda operativo y detecta el sandbox', () => {
      const client = clientWithKey('sk_test_123');
      client.onModuleInit();

      expect(client.isConfigured).toBe(true);
      expect(client.isTestMode).toBe(true);
    });

    it('reconoce una llave de producción', () => {
      const client = clientWithKey('sk_live_123');
      client.onModuleInit();

      expect(client.isTestMode).toBe(false);
    });
  });

  describe('isEnabled', () => {
    const clientWithFlag = (flag: string | undefined) =>
      new FacturapiClient({
        get: (key: string) => (key === 'CFDI_ENABLED' ? flag : 'sk_test_123'),
      } as any);

    it('queda habilitada si la variable no está declarada', () => {
      // El default importa: los entornos que no la declaran —local, y producción antes de este
      // cambio— tienen que seguir comportándose igual.
      expect(clientWithFlag(undefined).isEnabled).toBe(true);
    });

    it('solo la apaga el literal "false"', () => {
      expect(clientWithFlag('false').isEnabled).toBe(false);
      expect(clientWithFlag('true').isEnabled).toBe(true);
      expect(clientWithFlag('').isEnabled).toBe(true);
    });

    it('es independiente de que haya llave', () => {
      // Son dos preguntas distintas: `isConfigured` es "hay llave", `isEnabled` es "queremos
      // usarla". Con la facturación apagada da igual que la llave siga puesta.
      const client = clientWithFlag('false');
      client.onModuleInit();

      expect(client.isConfigured).toBe(true);
      expect(client.isEnabled).toBe(false);
    });
  });
});
