import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onloadend?.();
      },
      (error) => this.onerror?.(error)
    );
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      },
      (error) => this.onerror?.(error)
    );
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../packages/client/public/assets/cinematic");
const waterOutputDir = path.join(outputDir, "effects");
const characterOutputDir = path.join(outputDir, "characters");
const exporter = new GLTFExporter();

const palette = {
  brass: 0xd6a84e,
  felt: 0x9f2d22,
  walnut: 0x542313,
  darkWood: 0x241008,
  wall: 0x1f0e08,
  floor: 0x261108,
  cardFace: 0xf7e4b2,
  cardBack: 0x27563e,
  toyBlue: 0x2bc9ff,
  toyOrange: 0xff8f24,
  toyYellow: 0xf8dc57,
  toyGreen: 0x71ff95,
  danger: 0xff4b2b
};

await mkdir(outputDir, { recursive: true });
await mkdir(waterOutputDir, { recursive: true });

await exportGlb("bar-room.glb", createBarRoom());
await exportGlb("card-table.glb", createCardTable());
await exportGlb("playing-card.glb", createPlayingCard());
await exportGlb("characters.glb", createCharacters());
await exportGlb("toy-roulette.glb", createToyRoulette());
await writeWaterEffectAssets();
await repairCharacterAtlasEyes();

console.log(`Generated cinematic GLB assets in ${outputDir}`);

async function exportGlb(filename, object) {
  const scene = new THREE.Scene();
  scene.name = filename.replace(".glb", "");
  scene.add(object);
  const result = await exporter.parseAsync(scene, { binary: true });
  await writeFile(path.join(outputDir, filename), Buffer.from(result));
}

function createBarRoom() {
  const group = new THREE.Group();
  group.name = "BarRoom";

  const wallMat = mat("warm smoke wall", palette.wall, 0.86);
  const floorMat = mat("dark plank floor", palette.floor, 0.72);
  const amberMat = mat("amber lamp shade", 0xff9f3a, 0.36, 0.35);

  addMesh(group, "Floor", new THREE.PlaneGeometry(18, 18), floorMat, [0, -0.82, 0], [-Math.PI / 2, 0, 0]);
  addMesh(group, "BackWall", new THREE.PlaneGeometry(16, 8), wallMat, [0, 2.2, -6.2]);
  addMesh(group, "LeftWall", new THREE.PlaneGeometry(10, 8), wallMat, [-7.8, 2.2, -1.6], [0, Math.PI / 2, 0]);
  addMesh(group, "RightWall", new THREE.PlaneGeometry(10, 8), wallMat, [7.8, 2.2, -1.6], [0, -Math.PI / 2, 0]);

  [-3.2, 0, 3.2].forEach((x, index) => {
    addMesh(group, `PendantShade_${index}`, new THREE.ConeGeometry(0.48, 0.48, 36, 1, true), amberMat, [x, 4.42, -0.12], [Math.PI, 0, 0]);
    addMesh(group, `PendantCord_${index}`, new THREE.CylinderGeometry(0.018, 0.018, 1.4, 8), mat("cord", 0x0b0705, 0.7), [x, 5.0, -0.12]);
  });

  for (let index = 0; index < 10; index += 1) {
    const x = -6.2 + index * 1.38;
    const z = 3.8 + (index % 2) * 0.35;
    addMesh(group, `FloorBoard_${index}`, new THREE.BoxGeometry(1.05, 0.025, 5.6), mat("plank variation", index % 2 ? 0x30150a : 0x1f0d06, 0.76), [x, -0.8, z], [0, 0.08 * (index % 3), 0]);
  }

  return group;
}

function createCardTable() {
  const group = new THREE.Group();
  group.name = "CinematicTable";
  const wood = mat("polished walnut table", palette.walnut, 0.62, 0.08);
  const darkWood = mat("dark carved table underside", palette.darkWood, 0.7, 0.06);
  const felt = mat("wine red felt", palette.felt, 0.78);
  const brass = mat("brass rim", palette.brass, 0.36, 0.62);
  const shadow = mat("deep table shadow bevel", 0x120704, 0.8, 0.04);

  const top = addMesh(group, "TableTop", new THREE.CylinderGeometry(4.35, 4.5, 0.34, 128), wood, [0, 0, 0], [0, 0, 0], [1.18, 1, 0.78]);
  top.castShadow = true;
  top.receiveShadow = true;
  addMesh(group, "TableApron", new THREE.CylinderGeometry(4.28, 4.55, 0.5, 128), darkWood, [0, -0.32, 0], [0, 0, 0], [1.18, 1, 0.78]);
  addMesh(group, "LowerShadowLip", new THREE.CylinderGeometry(4.42, 4.5, 0.08, 128), shadow, [0, -0.62, 0], [0, 0, 0], [1.18, 1, 0.78]);
  addMesh(group, "FeltInset", new THREE.CylinderGeometry(3.86, 3.9, 0.07, 128), felt, [0, 0.25, 0], [0, 0, 0], [1.14, 1, 0.74]);
  addMesh(group, "RaisedInnerFeltBevel", new THREE.TorusGeometry(3.92, 0.025, 10, 128), brass, [0, 0.32, 0], [Math.PI / 2, 0, 0], [1.14, 0.74, 1]);
  addMesh(group, "PaddedOuterRail", new THREE.TorusGeometry(4.55, 0.12, 18, 128), wood, [0, 0.36, 0], [Math.PI / 2, 0, 0], [1.18, 0.78, 1]);
  addMesh(group, "BrassRim", new THREE.TorusGeometry(4.5, 0.035, 12, 128), brass, [0, 0.49, 0], [Math.PI / 2, 0, 0], [1.18, 0.78, 1]);
  addMesh(group, "UnderBrassBand", new THREE.TorusGeometry(4.34, 0.026, 10, 128), brass, [0, -0.08, 0], [Math.PI / 2, 0, 0], [1.18, 0.78, 1]);

  addMesh(group, "CentralPedestal", new THREE.CylinderGeometry(0.62, 0.82, 1.08, 48), darkWood, [0, -1.05, 0]);
  addMesh(group, "PedestalBrassCollarTop", new THREE.TorusGeometry(0.72, 0.035, 10, 56), brass, [0, -0.52, 0], [Math.PI / 2, 0, 0]);
  addMesh(group, "PedestalBrassCollarBottom", new THREE.TorusGeometry(0.9, 0.04, 10, 56), brass, [0, -1.58, 0], [Math.PI / 2, 0, 0]);
  addMesh(group, "WeightedFoot", new THREE.CylinderGeometry(1.36, 1.62, 0.2, 64), wood, [0, -1.74, 0], [0, 0, 0], [1.22, 1, 0.82]);
  addMesh(group, "FootBrassRim", new THREE.TorusGeometry(1.5, 0.035, 10, 64), brass, [0, -1.62, 0], [Math.PI / 2, 0, 0], [1.22, 0.82, 1]);

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const radiusX = 4.05;
    const radiusZ = 2.72;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    addMesh(
      group,
      `CarvedApronPanel_${index}`,
      new THREE.BoxGeometry(0.56, 0.18, 0.045),
      index % 2 ? wood : darkWood,
      [x, -0.34, z],
      [0, -angle, 0],
      [1, 1, 1]
    );
  }

  return group;
}

function createPlayingCard() {
  const group = new THREE.Group();
  group.name = "PlayingCard";
  const edge = mat("dark laminated card edge", 0x23392e, 0.5);
  const face = mat("warm ivory printed card face", palette.cardFace, 0.66);
  const back = mat("deep green noir card back", palette.cardBack, 0.7);

  addMesh(group, "CardBody", createRoundedCardBodyGeometry(0.64, 0.92, 0.026, 0.055), edge, [0, 0, 0]);
  addMesh(group, "CardFace", createRoundedCardPlaneGeometry(0.596, 0.876, 0.044, "up"), face, [0, 0.018, 0]);
  addMesh(group, "CardBack", createRoundedCardPlaneGeometry(0.596, 0.876, 0.044, "down"), back, [0, -0.018, 0]);

  return group;
}

function createRoundedCardBodyGeometry(width, height, thickness, radius) {
  const geometry = new THREE.ExtrudeGeometry(roundedRectangleShape(width, height, radius), {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    bevelSegments: 3,
    curveSegments: 8,
    steps: 1
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness / 2, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoundedCardPlaneGeometry(width, height, radius, side) {
  const geometry = new THREE.ShapeGeometry(roundedRectangleShape(width, height, radius), 10);
  geometry.rotateX(side === "up" ? -Math.PI / 2 : Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedRectangleShape(width, height, radius) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  shape.closePath();
  return shape;
}

function createCharacters() {
  const root = new THREE.Group();
  root.name = "Characters";
  const configs = [
    { color: 0x6f42b7, accent: 0x1c0b35, shirt: 0xf0dcb0, tie: 0x14100d, mask: 0x101010, hat: 0x201018, skin: 0xd89b68 },
    { color: 0xb94c31, accent: 0x3b120b, shirt: 0xefe2c2, tie: 0x342013, mask: 0xf2ddb0, hat: 0x2b130c, skin: 0xc9885e },
    { color: 0x229b78, accent: 0x073529, shirt: 0xe5e3cf, tie: 0x0b1711, mask: 0x101010, hat: 0x0d261f, skin: 0xe0ad78 },
    { color: 0xc99534, accent: 0x3c280a, shirt: 0xefe0b7, tie: 0x291b07, mask: 0xf2ddb0, hat: 0x35260b, skin: 0xd39b68 }
  ];

  configs.forEach((config, index) => {
    const group = new THREE.Group();
    group.name = `Character_${index}`;
    const bodyMat = mat(`character ${index} velvet jacket`, config.color, 0.62, 0.04);
    bodyMat.emissive = new THREE.Color(config.color);
    bodyMat.emissiveIntensity = 0.05;
    const accentMat = mat(`character ${index} lapel`, config.accent, 0.7);
    const shirtMat = mat(`character ${index} shirt`, config.shirt, 0.66);
    const tieMat = mat(`character ${index} tie`, config.tie, 0.58);
    const hatMat = mat(`character ${index} hat felt`, config.hat, 0.68);
    const skinMat = mat(`character ${index} warm clay face`, config.skin, 0.72);
    const maskMat = mat(`character ${index} mask`, config.mask, 0.44, 0.04);
    const eyeMat = mat(`character ${index} eye shine`, 0x0c0907, 0.38, 0.05);
    const warmHighlight = mat(`character ${index} cheek light`, 0xf1c08a, 0.72);

    addMesh(group, `Seat_${index}`, new THREE.CylinderGeometry(0.74, 0.82, 0.22, 40), accentMat, [0, -0.09, -0.18], [0, 0, 0], [1.25, 1, 0.72]);
    addMesh(group, `ChairBack_${index}`, new THREE.BoxGeometry(0.96, 1.0, 0.16), accentMat, [0, 0.42, -0.42], [0.08, 0, 0], [1, 1, 0.72]);

    addMesh(group, `Torso_${index}`, new THREE.CapsuleGeometry(0.32, 0.72, 8, 20), bodyMat, [0, 0.42, 0.02], [0.08, 0, 0], [1.32, 1.08, 0.78]);
    addMesh(group, `Shoulders_${index}`, new THREE.BoxGeometry(0.96, 0.22, 0.32), bodyMat, [0, 0.78, 0.02], [0.05, 0, 0], [1, 0.82, 1]);
    addMesh(group, `ShirtFront_${index}`, new THREE.BoxGeometry(0.32, 0.56, 0.035), shirtMat, [0, 0.45, 0.3], [0.08, 0, 0], [1, 1, 1]);
    addMesh(group, `Tie_${index}`, new THREE.ConeGeometry(0.085, 0.34, 4), tieMat, [0, 0.46, 0.34], [Math.PI / 4, 0, Math.PI / 4], [0.7, 1, 0.7]);
    addMesh(group, `LeftLapel_${index}`, new THREE.BoxGeometry(0.12, 0.52, 0.035), accentMat, [-0.19, 0.5, 0.34], [0.08, 0, -0.24], [1, 1, 1]);
    addMesh(group, `RightLapel_${index}`, new THREE.BoxGeometry(0.12, 0.52, 0.035), accentMat, [0.19, 0.5, 0.34], [0.08, 0, 0.24], [1, 1, 1]);

    addMesh(group, `Neck_${index}`, new THREE.CylinderGeometry(0.12, 0.15, 0.18, 18), skinMat, [0, 0.9, 0.05]);
    addMesh(group, `Head_${index}`, new THREE.SphereGeometry(0.29, 32, 20), skinMat, [0, 1.08, 0.08], [0, 0, 0], [0.92, 1.08, 0.9]);
    addMesh(group, `Nose_${index}`, new THREE.ConeGeometry(0.045, 0.12, 16), skinMat, [0, 1.08, 0.33], [Math.PI / 2, 0, 0]);
    addMesh(group, `Mask_${index}`, new THREE.BoxGeometry(0.42, 0.065, 0.08), maskMat, [0, 1.105, 0.33]);
    addMesh(group, `LeftEye_${index}`, new THREE.SphereGeometry(0.028, 12, 8), eyeMat, [-0.105, 1.12, 0.375], [0, 0, 0], [1.25, 0.72, 0.35]);
    addMesh(group, `RightEye_${index}`, new THREE.SphereGeometry(0.028, 12, 8), eyeMat, [0.105, 1.12, 0.375], [0, 0, 0], [1.25, 0.72, 0.35]);
    addMesh(group, `Cheek_${index}`, new THREE.SphereGeometry(0.035, 12, 8), warmHighlight, [0.17, 1.02, 0.35], [0, 0, 0], [1, 0.55, 0.35]);

    addMesh(group, `HatBrim_${index}`, new THREE.CylinderGeometry(0.42, 0.5, 0.055, 36), hatMat, [0, 1.35, 0.06], [0.02, 0, 0], [1.22, 1, 0.76]);
    addMesh(group, `HatTop_${index}`, new THREE.CylinderGeometry(0.27, 0.31, 0.28, 36), hatMat, [0, 1.5, 0.04], [0.02, 0, 0], [1.05, 1, 0.86]);
    addMesh(group, `HatBand_${index}`, new THREE.CylinderGeometry(0.276, 0.318, 0.035, 36), tieMat, [0, 1.4, 0.04], [0.02, 0, 0], [1.055, 1, 0.865]);

    addMesh(group, `LeftArm_${index}`, new THREE.CapsuleGeometry(0.088, 0.62, 8, 14), bodyMat, [-0.48, 0.48, 0.12], [1.12, -0.22, 0.72]);
    addMesh(group, `RightArm_${index}`, new THREE.CapsuleGeometry(0.088, 0.62, 8, 14), bodyMat, [0.48, 0.48, 0.12], [1.12, 0.22, -0.72]);
    addMesh(group, `LeftForearm_${index}`, new THREE.CapsuleGeometry(0.074, 0.42, 8, 12), bodyMat, [-0.5, 0.25, 0.42], [Math.PI / 2, 0.18, -0.28]);
    addMesh(group, `RightForearm_${index}`, new THREE.CapsuleGeometry(0.074, 0.42, 8, 12), bodyMat, [0.5, 0.25, 0.42], [Math.PI / 2, -0.18, 0.28]);
    addMesh(group, `LeftHand_${index}`, new THREE.SphereGeometry(0.112, 18, 12), skinMat, [-0.53, 0.22, 0.66], [0, 0, 0], [1.25, 0.72, 0.94]);
    addMesh(group, `RightHand_${index}`, new THREE.SphereGeometry(0.112, 18, 12), skinMat, [0.53, 0.22, 0.66], [0, 0, 0], [1.25, 0.72, 0.94]);
    root.add(group);
  });

  return root;
}

function createToyRoulette() {
  const group = new THREE.Group();
  group.name = "CinematicRouletteProp";
  const gunmetal = mat("matte graphite modern frame", 0x1f2528, 0.34, 0.82);
  const edge = mat("brushed steel beveled accents", 0x8e9aa2, 0.24, 0.9);
  const shadowMetal = mat("black recessed barrel bore", 0x050607, 0.72, 0.22);
  const grip = mat("black stippled polymer grip", 0x111417, 0.54, 0.18);
  const gripInset = mat("dark rubber grip panels", 0x22272b, 0.58, 0.12);
  const chamberDark = mat("black chamber recesses", 0x060708, 0.68, 0.2);
  const light = mat("small blue safety lens", 0x8cecff, 0.2, 0.02, true, 0.16);
  light.emissive = new THREE.Color(0x1b8eb0);
  light.emissiveIntensity = 0.1;

  addMesh(group, "RevolverFrame", new THREE.CapsuleGeometry(0.2, 0.62, 12, 36), gunmetal, [-0.08, 0.035, 0], [0, 0, Math.PI / 2], [1.12, 0.82, 0.7]);
  addMesh(group, "FrameSidePlate", new THREE.BoxGeometry(0.55, 0.28, 0.028), edge, [-0.14, 0.02, 0.132], [0, 0, -0.045], [1, 0.82, 1]);
  addMesh(group, "ModernFrameRail", new THREE.BoxGeometry(0.94, 0.072, 0.19), edge, [0.16, 0.31, 0], [0, 0, -0.026]);
  addMesh(group, "TacticalTopRail", new THREE.BoxGeometry(0.74, 0.036, 0.22), shadowMetal, [0.22, 0.37, 0], [0, 0, -0.026]);
  for (let index = 0; index < 5; index += 1) {
    addMesh(group, `RailNotch_${index}`, new THREE.BoxGeometry(0.052, 0.045, 0.25), edge, [-0.08 + index * 0.14, 0.405, 0], [0, 0, -0.026]);
  }
  addMesh(group, "FrameBevelTop", new THREE.BoxGeometry(0.88, 0.052, 0.03), edge, [0.1, 0.245, 0.012], [0, 0, -0.035]);
  addMesh(group, "FrameBevelBottom", new THREE.BoxGeometry(0.58, 0.045, 0.028), edge, [-0.13, -0.15, 0.012], [0, 0, -0.075]);
  addMesh(group, "TopStrap", new THREE.BoxGeometry(0.92, 0.12, 0.25), gunmetal, [0.12, 0.25, 0], [0, 0, -0.025]);
  addMesh(group, "BarrelShroud", new THREE.BoxGeometry(0.98, 0.19, 0.25), gunmetal, [0.7, 0.105, 0], [0, 0, -0.02]);
  addMesh(group, "Underlug", new THREE.BoxGeometry(0.76, 0.105, 0.18), gunmetal, [0.64, -0.055, 0], [0, 0, -0.025]);
  addMesh(group, "RealisticBarrel", new THREE.CylinderGeometry(0.067, 0.079, 1.02, 48), shadowMetal, [0.72, 0.105, 0], [0, 0, Math.PI / 2]);
  addMesh(group, "BarrelRib", new THREE.BoxGeometry(0.82, 0.034, 0.1), edge, [0.68, 0.226, 0], [0, 0, -0.025]);
  addMesh(group, "MuzzleRing", new THREE.TorusGeometry(0.106, 0.017, 14, 44), edge, [1.22, 0.105, 0], [0, Math.PI / 2, 0]);
  addMesh(group, "BarrelBore", new THREE.CylinderGeometry(0.046, 0.046, 0.018, 28), shadowMetal, [1.235, 0.105, 0], [0, 0, Math.PI / 2]);
  addMesh(group, "FrontSight", new THREE.BoxGeometry(0.072, 0.088, 0.04), edge, [1.04, 0.285, 0], [0, 0, -0.075]);
  addMesh(group, "FiberSightDot", new THREE.SphereGeometry(0.018, 12, 8), light, [1.04, 0.332, 0.002]);
  addMesh(group, "RearSight", new THREE.BoxGeometry(0.12, 0.048, 0.086), edge, [-0.22, 0.34, 0], [0, 0, -0.04]);
  addAnchor(group, "NozzleAnchor", [1.28, 0.105, 0]);

  const chamberGroup = new THREE.Group();
  chamberGroup.name = "SixShotDial";
  chamberGroup.position.set(0.045, 0.06, 0.17);
  group.add(chamberGroup);
  addMesh(chamberGroup, "SixShotCylinder", new THREE.CylinderGeometry(0.235, 0.235, 0.32, 56), gunmetal, [0, 0, -0.17], [Math.PI / 2, 0, 0]);
  addMesh(chamberGroup, "CylinderFrontRim", new THREE.TorusGeometry(0.235, 0.014, 12, 56), edge, [0, 0, -0.004], [0, 0, 0]);
  addMesh(chamberGroup, "CylinderAxisPin", new THREE.CylinderGeometry(0.04, 0.04, 0.028, 24), edge, [0, 0, 0.004], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    addMesh(chamberGroup, `ChamberMark_${index}`, new THREE.CylinderGeometry(0.032, 0.032, 0.014, 16), chamberDark, [
      Math.cos(angle) * 0.124,
      Math.sin(angle) * 0.124,
      -0.01
    ], [Math.PI / 2, 0, 0]);
    addMesh(chamberGroup, `CylinderFlute_${index}`, new THREE.BoxGeometry(0.018, 0.088, 0.01), edge, [
      Math.cos(angle + Math.PI / 6) * 0.18,
      Math.sin(angle + Math.PI / 6) * 0.18,
      -0.026
    ], [0, 0, angle]);
  }

  addMesh(group, "CylinderRelease", new THREE.BoxGeometry(0.065, 0.13, 0.026), edge, [-0.28, 0.14, 0.145], [0, 0, -0.04]);
  addMesh(group, "CylinderYoke", new THREE.BoxGeometry(0.08, 0.25, 0.055), edge, [0.31, 0.045, 0.038], [0, 0, -0.055]);
  addMesh(group, "EjectorRod", new THREE.CylinderGeometry(0.026, 0.026, 0.72, 24), edge, [0.66, -0.098, 0], [0, 0, Math.PI / 2]);
  addMesh(group, "Hammer", new THREE.BoxGeometry(0.13, 0.17, 0.064), gunmetal, [-0.5, 0.295, 0.0], [0, 0, -0.26]);
  addMesh(group, "HammerSpur", new THREE.BoxGeometry(0.13, 0.034, 0.076), edge, [-0.57, 0.392, 0.0], [0, 0, -0.1]);
  addMesh(group, "TriggerGuard", new THREE.TorusGeometry(0.172, 0.016, 10, 42, Math.PI * 1.52), edge, [-0.23, -0.235, 0.0], [Math.PI / 2, 0, -0.32], [1.16, 0.82, 1]);
  addMesh(group, "Trigger", new THREE.CapsuleGeometry(0.028, 0.19, 8, 16), gunmetal, [-0.16, -0.214, 0.045], [0, 0, -0.42], [0.72, 1, 0.72]);
  addAnchor(group, "TriggerPivot", [-0.16, -0.17, 0.08]);
  addMesh(group, "AngledGrip", new THREE.BoxGeometry(0.26, 0.82, 0.27), grip, [-0.52, -0.5, 0], [0, 0, -0.32], [0.95, 1, 0.88]);
  addMesh(group, "GripBackstrap", new THREE.BoxGeometry(0.055, 0.76, 0.29), edge, [-0.64, -0.5, 0], [0, 0, -0.32]);
  addMesh(group, "GripPanelLeft", new THREE.BoxGeometry(0.18, 0.56, 0.02), gripInset, [-0.49, -0.49, 0.155], [0, 0, -0.32]);
  addMesh(group, "GripPanelRight", new THREE.BoxGeometry(0.18, 0.56, 0.02), gripInset, [-0.49, -0.49, -0.155], [0, 0, -0.32]);
  for (let index = 0; index < 5; index += 1) {
    addMesh(group, `GripStipple_${index}`, new THREE.BoxGeometry(0.12, 0.014, 0.022), edge, [-0.48, -0.28 - index * 0.075, 0.178], [0, 0, -0.32]);
  }
  addMesh(group, "GripScrew", new THREE.CylinderGeometry(0.024, 0.024, 0.022, 20), edge, [-0.47, -0.47, 0.168], [Math.PI / 2, 0, 0]);
  addMesh(group, "GripCap", new THREE.BoxGeometry(0.3, 0.065, 0.3), edge, [-0.63, -0.85, 0], [0, 0, -0.32]);
  addMesh(group, "ResultLight", new THREE.SphereGeometry(0.014, 12, 8), light, [0.36, 0.27, 0.02]);

  return group;
}

async function writeWaterEffectAssets() {
  await writePng(path.join(waterOutputDir, "water-stream.png"), createWaterStreamPixels(512, 96));
  await writePng(path.join(waterOutputDir, "water-splash.png"), createWaterSplashPixels(512, 512));
  await writePng(path.join(waterOutputDir, "water-mist.png"), createWaterMistPixels(256, 256));
}

async function repairCharacterAtlasEyes() {
  // The committed atlas is now clean source art. Keep this hook for older local
  // asset-generation workflows, but do not paint over character faces.
}

function createWaterStreamPixels(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = x / (width - 1);
      const center = height * (0.5 + Math.sin(t * Math.PI * 6) * 0.055);
      const widthAtX = 4 + t * 18 + Math.sin(t * Math.PI * 10) * 2;
      const dist = Math.abs(y - center);
      const core = Math.max(0, 1 - dist / widthAtX);
      const droplet = waterNoise(x * 0.07, y * 0.19) > 0.82 && dist < widthAtX * 1.8 ? 0.4 : 0;
      const alpha = Math.round(Math.min(230, (core ** 1.8) * 210 + droplet * 120) * (1 - t * 0.1));
      const offset = (y * width + x) * 4;
      data[offset] = 130 + Math.round(core * 95);
      data[offset + 1] = 225 + Math.round(core * 30);
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data };
}

function createWaterSplashPixels(width, height) {
  const data = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const ring = Math.max(0, 1 - Math.abs(radius - 0.36) / 0.045);
      const star = Math.max(0, 1 - radius / (0.78 + Math.sin(angle * 8) * 0.08));
      const droplets = waterNoise(Math.cos(angle) * 18 + radius * 16, Math.sin(angle) * 18 - radius * 13) > 0.7 && radius < 0.9 ? 0.55 : 0;
      const alpha = Math.round(Math.min(220, ring * 190 + star ** 5 * 150 + droplets * (1 - radius) * 190));
      const offset = (y * width + x) * 4;
      data[offset] = 124;
      data[offset + 1] = 226;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data };
}

function createWaterMistPixels(width, height) {
  const data = new Uint8Array(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const noise = waterNoise(x * 0.06, y * 0.06);
      const alpha = Math.round(Math.max(0, 1 - radius) ** 2 * (50 + noise * 70));
      const offset = (y * width + x) * 4;
      data[offset] = 176;
      data[offset + 1] = 238;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data };
}

function waterNoise(x, y) {
  return fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
}

function fract(value) {
  return value - Math.floor(value);
}

function readPng(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") {
    throw new Error("Unsupported PNG signature.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      colorType = chunk[9];
      if (chunk[8] !== 8 || colorType !== 6) {
        throw new Error("Only 8-bit RGBA PNGs are supported.");
      }
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(width * height * 4);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source];
    source += 1;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? data[y * stride + x - 4] : 0;
      const up = y > 0 ? data[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? data[(y - 1) * stride + x - 4] : 0;
      const raw = inflated[source + x];
      data[y * stride + x] = (raw + pngPredictor(filter, left, up, upLeft)) & 0xff;
    }
    source += stride;
  }

  return { width, height, data };
}

function pngPredictor(filter, left, up, upLeft) {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter !== 4) return 0;
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

async function writePng(filePath, image) {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const chunks = [
    pngChunk("IHDR", pngIhdr(image.width, image.height)),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ];
  await writeFile(filePath, Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), ...chunks]));
}

function pngIhdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function addMesh(group, name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.set(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addAnchor(group, name, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.fromArray(position);
  anchor.rotation.set(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
  group.add(anchor);
  return anchor;
}

function mat(name, color, roughness = 0.6, metalness = 0, transparent = false, opacity = 1) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent,
    opacity
  });
  material.name = name;
  return material;
}
