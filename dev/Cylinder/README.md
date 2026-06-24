# Formula-Traceable Tank Calculator

React/Vite tank volume and fill calculator with formula-backed shapes, certified table import, and English/Bulgarian UI.

## Supported Calculation Modes

- Open analytical geometry: vertical cylinders, vertical cylinders with conical bottoms, horizontal circular and elliptical cylinders, tilted horizontal cylinders, hemispherical/ellipsoidal heads, rectangular and sloped rectangular tanks, spheres, ellipsoids, cones, and frustums.
- Certified table mode: height-volume rows are parsed, previewed, checksummed, and used through linear interpolation.
- Standards references are context only. The app does not reproduce licensed ISO/BDS procedures without supplied certified tables or source material.

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

The test suite covers formula benchmarks, height-volume round trips, validation warnings, calibration-table parsing/interpolation, report aggregation, and UI accessibility basics.

## GitHub Pages

The app is configured with `base: './'` in `vite.config.ts`, so the production build uses relative asset paths and can be hosted from a GitHub Pages project URL.

1. Run `npm run build`.
2. Publish the generated `dist/` folder with your preferred GitHub Pages workflow.
3. Keep `public/.nojekyll`; it is copied into `dist/` and prevents Jekyll processing.

No server runtime is required.
