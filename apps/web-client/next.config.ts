import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
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
