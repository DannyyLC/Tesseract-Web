/**
 * Cal.com configuration
 */
export const CAL_CONFIG = {
  /** Shows all available event types for the account (Opción A) */
  allEvents: 'fractal-splfqv',
  /** Individual event types */
  events: {
    nuevoWorkflow: 'fractal-splfqv/nuevo-workflow',
    soporte: 'fractal-splfqv/soporte-tecnico-y-debugging',
    consultoria: 'fractal-splfqv/consultoria-estrategica-y-tecnica',
    demo: 'fractal-splfqv/demo',
  },

  /** Cal.com embed namespace — must match the one used in getCalApi() */
  namespace: 'sesion-de-soporte',

  /** Default layout for embeds */
  defaultLayout: 'month_view' as const,
} as const;
