import { diffConfigs, hashConfig, stableStringify } from './workflow-config.utils';

describe('stableStringify / hashConfig', () => {
  it('ignora el orden de las claves', () => {
    const a = { type: 'agent', graph: { type: 'pipeline', schema_version: 1 } };
    const b = { graph: { schema_version: 1, type: 'pipeline' }, type: 'agent' };

    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(hashConfig(a)).toBe(hashConfig(b));
  });

  it('respeta el orden de los arrays: las aristas de un grafo no son un conjunto', () => {
    const a = { edges: [{ from: 'START' }, { from: 'n1' }] };
    const b = { edges: [{ from: 'n1' }, { from: 'START' }] };

    expect(hashConfig(a)).not.toBe(hashConfig(b));
  });

  it('detecta un cambio real en un prompt', () => {
    const before = { agents: { general: { system_prompt: 'Eres un asesor.' } } };
    const after = { agents: { general: { system_prompt: 'Eres un asesor formal.' } } };

    expect(hashConfig(before)).not.toBe(hashConfig(after));
  });

  it('distingue null de undefined y de string vacío', () => {
    expect(hashConfig({ a: null })).not.toBe(hashConfig({ a: '' }));
    expect(hashConfig({ a: null })).not.toBe(hashConfig({}));
  });
});

describe('diffConfigs', () => {
  it('no reporta nada cuando los configs son equivalentes', () => {
    const a = { type: 'agent', agents: { general: { model: 'gpt-5.4-mini' } } };
    const b = { agents: { general: { model: 'gpt-5.4-mini' } }, type: 'agent' };

    expect(diffConfigs(a, b)).toEqual([]);
  });

  it('reporta una sola entrada por prompt cambiado, con la ruta completa', () => {
    const before = { agents: { general: { system_prompt: 'antes', temperature: 0.7 } } };
    const after = { agents: { general: { system_prompt: 'después', temperature: 0.7 } } };

    const entries = diffConfigs(before, after);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      path: 'agents.general.system_prompt',
      op: 'changed',
      before: 'antes',
      after: 'después',
    });
  });

  // Este caso es el que rompía una versión anterior del walker: al toparse con la
  // primera clave nueva cortaba el recorrido y se perdían las demás.
  it('reporta TODAS las claves agregadas de un mismo objeto', () => {
    const before = { agents: { general: {} } };
    const after = { agents: { general: {}, ventas: {}, soporte: {} } };

    const paths = diffConfigs(before, after).map((e) => e.path);

    expect(paths).toHaveLength(2);
    expect(paths).toEqual(expect.arrayContaining(['agents.ventas', 'agents.soporte']));
  });

  it('distingue agregado, removido y cambiado', () => {
    const before = { a: 1, b: 2 };
    const after = { b: 99, c: 3 };

    const entries = diffConfigs(before, after);
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));

    expect(byPath['a']).toMatchObject({ op: 'removed', before: 1 });
    expect(byPath['b']).toMatchObject({ op: 'changed', before: 2, after: 99 });
    expect(byPath['c']).toMatchObject({ op: 'added', after: 3 });
  });

  it('indexa los elementos de un array en la ruta', () => {
    const before = { graph: { nodes: [{ id: 'a', type: 'agent' }] } };
    const after = { graph: { nodes: [{ id: 'a', type: 'synthesizer' }] } };

    expect(diffConfigs(before, after)[0].path).toBe('graph.nodes[0].type');
  });

  it('recorta valores largos y lo marca, para no devolver el documento entero', () => {
    const before = { agents: { general: { system_prompt: 'x'.repeat(5000) } } };
    const after = { agents: { general: { system_prompt: 'y'.repeat(5000) } } };

    const [entry] = diffConfigs(before, after);

    expect(entry.truncated).toBe(true);
    expect((entry.after as string).length).toBeLessThan(5000);
  });

  // El caso real: un prompt de 4 000 caracteres al que se le cambia el final.
  // Recortando desde el inicio, ambos lados salían idénticos y el diff no servía
  // para nada — justo en el escenario para el que se construyó.
  it('muestra el cambio aunque esté al final de un prompt largo', () => {
    const prompt = 'Eres un asesor de ventas. '.repeat(200); // ~5 200 caracteres
    const before = { agents: { general: { system_prompt: `${prompt}Cierra siempre con un saludo.` } } };
    const after = { agents: { general: { system_prompt: `${prompt}Cierra siempre con una despedida formal.` } } };

    const [entry] = diffConfigs(before, after);

    expect(entry.truncated).toBe(true);
    expect(entry.before).not.toEqual(entry.after);
    expect(entry.before as string).toContain('un saludo');
    expect(entry.after as string).toContain('una despedida formal');
  });

  it('conserva contexto antes del punto de divergencia para ubicar el cambio', () => {
    const head = 'A'.repeat(3000);
    const before = { p: `${head}ANTES${'B'.repeat(3000)}` };
    const after = { p: `${head}DESPUES${'B'.repeat(3000)}` };

    const [entry] = diffConfigs(before, after);

    expect(entry.before as string).toContain('ANTES');
    expect(entry.after as string).toContain('DESPUES');
    // Se recortó por ambos lados: el valor devuelto no es el documento completo.
    expect((entry.before as string).length).toBeLessThan(3000);
  });

  it('no pierde las claves que ningún formulario toca', () => {
    const before = {
      agents: { general: { system_prompt: 'antes' } },
      post_turn_actions: [{ id: 'share', action: 'send_drive_folder_media' }],
      graph: { variable_reducers: { media_url: { mode: 'join' } } },
    };
    const after = structuredClone(before);
    after.agents.general.system_prompt = 'después';

    const entries = diffConfigs(before, after);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('agents.general.system_prompt');
  });
});
