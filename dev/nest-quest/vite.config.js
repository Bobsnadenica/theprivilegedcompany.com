import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: `${here}src`,
  publicDir: `${here}public`,
  base: '/dev/nest-quest/',
  define: { global: 'globalThis' },
  plugins: [{
    name: 'existing-public-account-config',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!['/portal/config.js', '/dev/nest-quest/portal/config.js'].includes(request.url?.split('?')[0])) return next();
        try {
          const config = await readFile(new URL('../../portal/config.js', import.meta.url));
          response.setHeader('Content-Type', 'text/javascript'); response.setHeader('Cache-Control', 'no-store'); response.end(config);
        } catch { response.statusCode = 404; response.end(); }
      });
    },
  }],
  server: { fs: { allow: [here, fileURLToPath(new URL('../../portal', import.meta.url))] } },
  build: {
    outDir: `${here}dist`, emptyOutDir: true,
    rollupOptions: { input: { landing: `${here}src/index.html`, play: `${here}src/play.html`, privacy: `${here}src/privacy.html` } },
  },
});
