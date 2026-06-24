# Formula-Traceable Tank Calculator

React/Vite tank volume and fill calculator with formula-backed shapes, certified table import, and English/Bulgarian UI.

## Local Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run build
```

## GitHub Pages

The app is configured with `base: './'` in `vite.config.ts`, so the production build uses relative asset paths and can be hosted from a GitHub Pages project URL.

1. Run `npm run build`.
2. Publish the generated `dist/` folder with your preferred GitHub Pages workflow.
3. Keep `public/.nojekyll`; it is copied into `dist/` and prevents Jekyll processing.

No server runtime is required.
