import { defineConfig } from 'vite';

// Source lives in portal/src/. The build writes the deployable files up into
// portal/ itself (index.html + assets/) so GitHub Pages serves them directly at
// /portal/. emptyOutDir:false leaves src/, config.js and README in place.
export default defineConfig({
  root: 'src',
  base: '/portal/',
  build: {
    outDir: '..',
    emptyOutDir: false,
    assetsDir: 'assets',
  },
});
