import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  compiler: {
    // `no-console` en eslint es solo un aviso, y los avisos se ignoran: así llegó a
    // producción un console.log que imprimía las invitaciones pendientes completas en
    // la consola del navegador. Esto los quita del bundle en el build. Se conservan
    // `error` y `warn`, que son los que sirven para diagnosticar en un cliente real.
    removeConsole: { exclude: ['error', 'warn'] },
  },
  async headers() {
    return [
      {
        // La página raíz tiene WebGL (Three.js), no puede sobrevivir al bfcache.
        // no-store excluye la página del bfcache para que al volver atrás
        // el browser haga un fresh load y el Canvas siempre inicialice limpio.
        source: '/',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
