# Hero outfits

This folder ships the **per-archetype 3D character outfits** rendered in the
Hero tab. The composer at `lib/core/utils/armory_model_composer.dart` loads
one of these gltfs per hero archetype and detaches a small set of
accessory meshes (hood / pauldron) when the matching gear slot is locked
or hidden.

The actual files live in [`heroes/`](heroes/). Everything else dropped into
this folder by previous experiments is unused and can be deleted from disk
(see "Cleanup" below).

## Layout

```
assets/armory/modular/
└── heroes/
    ├── wayfarer.gltf      ← Male_Peasant outfit (light traveler)
    ├── wayfarer.bin
    ├── warden.gltf        ← Male_Ranger outfit (with pauldrons + hood)
    ├── warden.bin
    ├── seer.gltf          ← Female_Ranger outfit (hooded mystic)
    ├── seer.bin
    ├── rider.gltf         ← Female_Peasant outfit (light rider)
    ├── rider.bin
    ├── T_Peasant_BaseColor.png    + Normal/ORM       (peasant outfit)
    ├── T_Ranger_BaseColor.png     + Normal/ORM       (ranger outfit)
    ├── T_Regular_Male_*.png       (Male skin tones)
    └── T_Regular_Female_*.png     (Female skin tones)
```

Each outfit is a self-contained, skinned glTF rigged to the same UE-style
base skeleton. The textures are downscaled to **512×512** to keep the
bundle small (~8 MB total).

## Per-archetype outfit table

| Archetype  | File              | Source                | Detachable gear meshes                          |
| ---------- | ----------------- | --------------------- | ----------------------------------------------- |
| `wayfarer` | `wayfarer.gltf`   | Male Peasant outfit   | (none — peasant has no accessories)             |
| `warden`   | `warden.gltf`     | Male Ranger outfit    | `Male_Ranger_Head_Hood`, `Male_Ranger_Acc_Pauldron` |
| `seer`     | `seer.gltf`       | Female Ranger outfit  | `Female_Ranger_Head_Hood`, `Female_Ranger_Acc_Pauldrons` |
| `rider`    | `rider.gltf`      | Female Peasant outfit | (none)                                          |

Toggling the **Head** or **Mantle** slot in the loadout strip detaches the
matching node above. Other gear slots (chest/legs/boots/etc.) are part of
the body silhouette — they always render so the character is never
"headless" or "legless".

## Source pack

The outfits were extracted from:

- **Modular Character Outfits — Fantasy** by NaughtyMonkeys (Standard licence)
- **Universal Base Characters** (Standard licence) — provides the underlying
  skeleton these outfits are rigged to (we don't ship the base body itself
  because the outfits already include their own body coverage).

## Cleanup (one-time, on your machine)

The original drop included Unity FBX exports, full base-body gltfs, hair
variants, and all the unscaled 4K textures. None of that is bundled
(pubspec.yaml only declares `assets/armory/modular/heroes/`), but the files
are still sitting on disk eating space in the repo.

From the project root, run:

```
rm -rf "assets/armory/modular/Modular Character Outfits - Fantasy[Standard]"
rm -rf "assets/armory/modular/Universal Base Characters[Standard]"
rm -rf assets/armory/quaternius             # old experimental drop, unused
rm -rf assets/armory/quaternius_runtime     # old experimental drop, unused
rm -rf assets/armory/quaternius_rpg         # old Quaternius RPG models, no longer used
```

(I tried to do this from my sandbox but the user-mounted folder is
read-only to me, so it has to happen from your terminal.)

## Adding a new outfit

1. Drop a new `<name>.gltf` + `<name>.bin` + textures into `heroes/`.
2. Add a new case to `_HeroRecipe.forPreset()` in
   `lib/core/utils/armory_model_composer.dart` with the asset path and the
   names of any detachable hood/pauldron mesh nodes.
3. Add a matching entry to `_ArmoryHeroViewerCatalog._configs` in
   `lib/ui/widgets/armory_hero_viewer.dart` (camera framing + exposure).
4. Add the new id to `ArmoryProgressionBuilder.heroPresets` in
   `lib/core/utils/armory_progression.dart` so it appears in the
   customization chips.

## Animations

These outfits have **no baked animations** — the character renders as a
static T-pose with the auto-rotate giving it life. The original Quaternius
RPG models had Idle/Walk/Sword_Attack animations; if you want those back,
import an idle clip in Blender and re-export the outfit gltfs with the clip
attached. (Mixamo's "Idle" works once retargeted to the UE5 Mannequin
skeleton these outfits use.)
