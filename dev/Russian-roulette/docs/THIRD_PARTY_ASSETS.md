# Third-Party Assets

## Optional Sketchfab 9 mm Prop

- **Model:** `9 mm`
- **Creator:** Slava Zemlyanik (`@reijin`)
- **Source:** https://sketchfab.com/3d-models/9-mm-5124e7fe60fb4d3ab62460609d23f365
- **License shown on Sketchfab:** Free Standard
- **Attribution shown on Sketchfab:** not required by the page metadata inspected on June 20, 2026
- **NoAI notice:** the model may not be used in datasets, development of, or as input to generative AI programs

This importer is kept for local visual experiments. The release runtime does not prefer this model; it uses the generated, committed original cinematic roulette prop `toy-roulette.glb` by default.

If you still want to keep an experimental copy, install it at:

```text
packages/client/public/assets/cinematic/sketchfab-9mm.glb
```

Install from a downloaded GLB:

```bash
npm run install:sketchfab-9mm -- /absolute/path/to/downloaded-file.glb
```

Install with a Sketchfab API token:

```bash
SKETCHFAB_TOKEN=... npm run install:sketchfab-9mm
```

The generated `toy-roulette.glb` release prop is original, non-functional game art and safe to commit with the project.
