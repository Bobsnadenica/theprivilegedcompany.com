# 3D Armory Assets

Atlas now uses full authored fantasy characters from Quaternius instead of the
earlier stitched head/body runtime experiment.

Source pack:

- `RPG Character Pack`
- Author: Quaternius
- License: CC0 / public domain

Why this pack:

- Each hero is a complete, coherent character model with authored head, body,
  armor, and hands
- The shipped `.gltf` files are self-contained, which makes them reliable in
  Flutter and iOS WebView
- The pack includes idle, walk, and run clips, so Atlas gets a real standing
  character instead of a custom fake-pose rig

Preset mapping:

- `Wayfarer` -> `Rogue.gltf`
- `Warden` -> `Warrior.gltf`
- `Seer` -> `Wizard.gltf`
- `Rider` -> `Ranger.gltf`

Bundled assets:

- `assets/armory/quaternius_rpg/Rogue.gltf`
- `assets/armory/quaternius_rpg/Warrior.gltf`
- `assets/armory/quaternius_rpg/Wizard.gltf`
- `assets/armory/quaternius_rpg/Ranger.gltf`

Current direction:

- The base hero is a full authored character from the RPG pack
- Earned Atlas slots are now layered on top through a mix of:
  - authored built-in weapons, cloaks, pouches, and shoulder pieces already in
    the RPG characters
  - generated low-poly armory pieces mounted to stable rig nodes
- This keeps the body coherent while still letting achievements show up as
  visible gear on the live model
- The experimental runtime modular folders are kept out of `pubspec.yaml` so
  they do not bloat release builds or destabilize iOS WebView rendering
- Hair tone was removed from the live Atlas customization flow because it was
  not producing a real visible result on-device
