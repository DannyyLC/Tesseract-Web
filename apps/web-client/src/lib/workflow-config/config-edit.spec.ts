import {
  deleteAtPath,
  diffLocal,
  isEqualConfig,
  lintConfig,
  nodesReferencingAgent,
  renameKey,
  setAtPath,
} from './config-edit';

/** Config de forma realista: incluye claves que ningún formulario del editor toca. */
const baseConfig = () => ({
  type: 'agent',
  post_turn_actions: [{ id: 'share_catalog_media', action: 'send_drive_folder_media' }],
  graph: {
    type: 'pipeline',
    schema_version: 1,
    nodes: [
      { id: 'check_route', type: 'condition', config: { mode: 'router', routes: { general: 'agente_general' }, fallback: 'agente_general' } },
      { id: 'agente_general', type: 'agent', agent: 'general', max_iterations: 3 },
      { id: 'notify', type: 'tool', config: { tool_instance: 'uuid-tool-1', function: 'send' } },
    ],
    edges: [
      { from: 'START', to: 'check_route' },
      { from: 'agente_general', to: 'END' },
    ],
    persist_variables: ['intent'],
    variable_reducers: { media_url: { mode: 'join', separator: ',' } },
  },
  agents: {
    general: { model: 'gpt-5.4-mini', temperature: 0.7, system_prompt: 'Eres un asesor.' },
  },
});

describe('setAtPath — la garantía de no perder datos', () => {
  it('cambia solo la ruta indicada y conserva todo lo demás', () => {
    const before = baseConfig();
    const after = setAtPath(before, ['agents', 'general', 'system_prompt'], 'Nuevo prompt');

    expect(after.agents.general.system_prompt).toBe('Nuevo prompt');
    // Lo que ningún formulario conoce debe sobrevivir intacto.
    expect(after.post_turn_actions).toEqual(before.post_turn_actions);
    expect(after.graph.variable_reducers).toEqual(before.graph.variable_reducers);
    expect(after.graph.persist_variables).toEqual(before.graph.persist_variables);
    expect(after.agents.general.temperature).toBe(0.7);
  });

  it('no muta el objeto original', () => {
    const before = baseConfig();
    setAtPath(before, ['agents', 'general', 'system_prompt'], 'otro');
    expect(before.agents.general.system_prompt).toBe('Eres un asesor.');
  });

  it('comparte por referencia las ramas que no cambian, para que editar 100 KB sea barato', () => {
    const before = baseConfig();
    const after = setAtPath(before, ['agents', 'general', 'system_prompt'], 'otro');
    expect(after.graph).toBe(before.graph);
    expect(after.post_turn_actions).toBe(before.post_turn_actions);
  });

  it('escribe dentro de arrays por índice', () => {
    const before = baseConfig();
    const after = setAtPath(before, ['graph', 'nodes', 1, 'max_iterations'], 5);

    expect(after.graph.nodes[1].max_iterations).toBe(5);
    expect(after.graph.nodes[0]).toBe(before.graph.nodes[0]);
    expect(Array.isArray(after.graph.nodes)).toBe(true);
  });
});

describe('deleteAtPath', () => {
  // El motor distingue "sin temperature" de "temperature = 0": vaciar el campo debe
  // borrar la clave, no escribir un cero.
  it('borra la clave en vez de dejarla vacía', () => {
    const before = baseConfig();
    const after = deleteAtPath(before, ['agents', 'general', 'temperature']);

    expect('temperature' in after.agents.general).toBe(false);
    expect(after.agents.general.system_prompt).toBe('Eres un asesor.');
  });
});

describe('renameKey', () => {
  it('conserva el orden de las claves', () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(Object.keys(renameKey(obj, 'b', 'z'))).toEqual(['a', 'z', 'c']);
  });
});

describe('diffLocal / isEqualConfig', () => {
  it('un prompt editado produce exactamente un cambio', () => {
    const before = baseConfig();
    const after = setAtPath(before, ['agents', 'general', 'system_prompt'], 'Nuevo');

    const changes = diffLocal(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe('agents.general.system_prompt');
  });

  it('ignora el reordenamiento de claves', () => {
    expect(isEqualConfig({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });
});

describe('lintConfig — referencias sin integridad referencial', () => {
  it('acepta un config coherente', () => {
    const issues = lintConfig(baseConfig(), ['uuid-tool-1']);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  // El caso que motiva el linter: renombrar un agente sin actualizar sus nodos deja
  // un workflow que guarda bien y falla en producción.
  it('detecta un nodo que apunta a un agente inexistente', () => {
    const config = baseConfig();
    config.agents = { ventas: config.agents.general } as any;

    const errors = lintConfig(config, ['uuid-tool-1']).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('general'))).toBe(true);
  });

  it('detecta una ruta de condition hacia un nodo que no existe', () => {
    const config = baseConfig();
    (config.graph.nodes[0] as any).config.routes.general = 'nodo_fantasma';

    const errors = lintConfig(config, ['uuid-tool-1']).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('nodo_fantasma'))).toBe(true);
  });

  it('detecta una tool instance que no pertenece a la organización', () => {
    const errors = lintConfig(baseConfig(), ['otro-uuid']).filter((i) => i.severity === 'error');
    expect(errors.some((e) => e.message.includes('uuid-tool-1'))).toBe(true);
  });

  it('no inventa errores de tools cuando no se le pasa la lista', () => {
    const errors = lintConfig(baseConfig(), []).filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('avisa de nodos huérfanos como advertencia, no como error', () => {
    const config = baseConfig();
    config.graph.nodes.push({ id: 'suelto', type: 'set_variables', config: {} } as any);

    const issues = lintConfig(config, ['uuid-tool-1']);
    const orphan = issues.find((i) => i.message.includes('suelto'));
    expect(orphan?.severity).toBe('warning');
  });
});

describe('nodesReferencingAgent', () => {
  it('lista los nodos que hay que actualizar al renombrar un agente', () => {
    expect(nodesReferencingAgent(baseConfig(), 'general')).toEqual(['agente_general']);
  });
});
