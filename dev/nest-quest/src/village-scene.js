import { villageSummary } from './village-model.js';

export function createVillage(T, mergeGeometries, element, host, total, options) {
  const { inspect, registerCleanup, onFallback } = options;
  let { reducedMotion = false } = options;
  let info = villageSummary(total), before = villageSummary({ balance: info.balance - (options.reactionActive ? options.reaction?.delta || 0 : 0) });
  let reactionStart = performance.now(), newlyBuilt = options.reactionActive && info.index > before.index, reversed = options.reactionActive && info.index < before.index;
  const mobile = matchMedia('(max-width: 680px)').matches;
  const resources = new Set(), geometries = new Map(), materials = new Map();
  const own = resource => { resources.add(resource); return resource; };
  const palette = { grass: '#8fac60', grassLight: '#a8be70', grassDark: '#79944f', soil: '#6c5941', rock: '#9a8764', stone: '#d5c69f', cream: '#f6e7bc', white: '#fff0d5', roof: '#b56842', roofDark: '#995238', wood: '#88613e', timber: '#554734', green: '#668447', leaf: '#6e964f', leafLight: '#9bb96b', water: '#67afb6', waterLight: '#a0d6d2', gold: '#e5b759', glow: '#fff0a8', pink: '#dba1ad', lavender: '#b6a0c7', blue: '#7f9ba8', orange: '#d69a54', red: '#ba7760' };
  const material = key => {
    if (!materials.has(key)) materials.set(key, own(new T.MeshStandardMaterial({ color: palette[key] || key, roughness: key === 'water' ? .28 : .84, metalness: key === 'water' ? .18 : 0, flatShading: true,
      ...(key === 'glow' ? { emissive: '#ffc766', emissiveIntensity: .45 } : {}), side: T.DoubleSide })));
    return materials.get(key);
  };
  const geometry = type => {
    if (!geometries.has(type)) {
      let value;
      if (type === 'box') value = new T.BoxGeometry(1, 1, 1);
      if (type === 'ball') value = new T.IcosahedronGeometry(.5, 1);
      if (type === 'cylinder') value = new T.CylinderGeometry(.5, .5, 1, 10);
      if (type === 'cone') value = new T.ConeGeometry(.5, 1, 10);
      if (type === 'capsule') value = new T.CapsuleGeometry(.5, .6, 3, 6);
      if (type === 'ring') value = new T.TorusGeometry(.5, .065, 5, 20);
      if (type === 'arch') value = new T.TorusGeometry(.5, .065, 5, 18, Math.PI);
      if (type === 'roof') {
        const shape = new T.Shape(); shape.moveTo(-.5, 0); shape.lineTo(.5, 0); shape.lineTo(0, .65); shape.closePath();
        value = new T.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); value.translate(0, 0, -.5);
      }
      geometries.set(type, own(value));
    }
    return geometries.get(type);
  };
  const scene = new T.Scene();
  const renderer = new T.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: mobile ? 'low-power' : 'high-performance' });
  registerCleanup(() => { for (const resource of resources) resource.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  renderer.domElement.className = 'village-canvas'; renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);
  const ambient = new T.HemisphereLight('#fff7dd', '#789063', 1.8); scene.add(ambient);
  const sun = new T.DirectionalLight('#ffefc9', 2.4); sun.position.set(-7, 15, 10); sun.castShadow = true;
  const moon = new T.DirectionalLight('#b8cafa', 0); moon.position.set(-10, 13, -12); scene.add(moon);
  sun.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024); sun.shadow.camera.left = -11; sun.shadow.camera.right = 11; sun.shadow.camera.top = 11; sun.shadow.camera.bottom = -11; sun.shadow.camera.near = 1; sun.shadow.camera.far = 36; sun.shadow.bias = -.001; sun.shadow.normalBias = .035; scene.add(sun);
  const camera = new T.OrthographicCamera(-10, 10, 8, -8, .1, 80);
  let yaw = .92, goalYaw = yaw, pitch = .64, goalZoom = 1, zoomValue = 1, selected = null, visible = true, destroyed = false, contextLost = false, frame = 0, lastFrame = 0;
  let dusk = options.time === 'dusk' ? 1 : 0, goalDusk = dusk;
  const colors = { sunDay: new T.Color('#ffefc9'), sunDusk: new T.Color('#d9a2cf'), skyDay: new T.Color('#fff7dd'), skyDusk: new T.Color('#a4b4ed'), groundDay: new T.Color('#789063'), groundDusk: new T.Color('#605079') };
  const focus = new T.Vector3(0, .35, 0), target = focus.clone();
  const island = new T.Group(); scene.add(island);
  const mesh = (geo, mat, parent = island) => { const item = new T.Mesh(geo, mat); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item; };
  const base = mesh(own(new T.CylinderGeometry(7.7, 4.7, 2.8, 12)), material('soil')); base.position.y = -1.4; base.scale.z = .78;
  const cap = mesh(own(new T.CylinderGeometry(7.76, 7.7, .28, 40)), material('grass')); cap.position.y = .08; cap.scale.z = .78;
  const shadow = mesh(own(new T.CircleGeometry(8, 48)), own(new T.MeshBasicMaterial({ color: '#728366', transparent: true, opacity: .13, depthWrite: false })), scene); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -3.5; shadow.scale.set(1.06, .8, 1); shadow.castShadow = false;
  const builders = [], chimneys = [], wheels = [], lanternPositions = [];
  function builder(index, x = 0, z = 0) { const group = new T.Group(); group.position.set(x, .22, z); island.add(group); const item = { group, index, parts: [], x, z }; builders.push(item); return item; }
  function piece(b, type, color, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const matrix = new T.Matrix4().compose(new T.Vector3(...position), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale));
    b.parts.push({ geometry: geometry(type), material: material(color), matrix });
  }
  function bake(b) {
    const batches = new Map();
    for (const part of b.parts) { const copy = part.geometry.clone(), baked = copy.index ? copy.toNonIndexed() : copy; if (copy !== baked) copy.dispose(); baked.applyMatrix4(part.matrix); const list = batches.get(part.material) || []; list.push(baked); batches.set(part.material, list); }
    for (const [mat, parts] of batches) { const result = mergeGeometries(parts, false); for (const part of parts) part.dispose(); if (!result) throw new Error('Incompatible village geometry'); const item = mesh(own(result), mat, b.group); item.userData.building = b.index; }
    b.parts.length = 0;
  }
  function house(b, x = 0, z = 0, height = 1.3, color = 'cream') {
    piece(b, 'box', color, [x, height / 2, z], [1.55, height, 1.35]);
    piece(b, 'roof', 'roof', [x, height - .01, z], [1.92, .85, 1.7]);
    piece(b, 'box', 'timber', [x, .13, z], [1.64, .14, 1.4]);
    for (const dx of [-.72, .72]) { piece(b, 'box', 'wood', [x + dx, height / 2, z + .686], [.065, height, .07]); piece(b, 'box', 'wood', [x + dx, height / 2, z - .686], [.065, height, .07]); }
    piece(b, 'box', 'wood', [x, height - .06, z + .685], [1.52, .07, .07]);
    for (const side of [-1, 1]) {
      piece(b, 'box', 'timber', [x + side * .798, .86, z -.15], [.045, .43, .39]);
      piece(b, 'box', 'glow', [x + side * .825, .86, z -.15], [.03, .31, .28]);
      piece(b, 'box', 'wood', [x + side * .843, .86, z -.15], [.02, .32, .024]);
      piece(b, 'box', 'wood', [x + side * .843, .86, z -.15], [.02, .024, .29]);
      for (const dz of [-.36, .06]) piece(b, 'box', 'green', [x + side * .825, .86, z + dz], [.045, .38, .13]);
      for (let row = 0; row < 3; row++) for (let tile = 0; tile < 5; tile++) piece(b, 'box', row % 2 ? 'roof' : 'roofDark', [x + side * (.24 + row * .25), height + .43 - row * .14, z + (tile - 2) * .3], [.27, .035, .28], [0, 0, side * -.5]);
    }
    piece(b, 'box', 'wood', [x, .47, z + .69], [.34, .83, .08]);
    piece(b, 'ball', 'gold', [x + .09, .43, z + .74], [.05, .05, .04]);
    for (const dx of [-.53, .53]) {
      piece(b, 'box', 'timber', [x + dx, .84, z + .69], [.38, .44, .07]);
      piece(b, 'box', 'glow', [x + dx, .84, z + .74], [.28, .34, .035]);
      piece(b, 'box', 'wood', [x + dx, .84, z + .765], [.026, .36, .02]);
      piece(b, 'box', 'wood', [x + dx, .84, z + .765], [.3, .026, .02]);
      piece(b, 'box', 'green', [x + dx, .57, z + .74], [.44, .11, .18]);
      for (let i = 0; i < 3; i++) piece(b, 'ball', i % 2 ? 'pink' : 'lavender', [x + dx - .12 + i * .12, .67, z + .77], [.13, .13, .13]);
    }
    piece(b, 'box', 'stone', [x, .055, z + .9], [.62, .11, .37]); piece(b, 'box', 'stone', [x, .022, z + 1.13], [.78, .045, .25]);
    piece(b, 'box', 'roofDark', [x - .42, height + .43, z - .3], [.22, .73, .22]);
    piece(b, 'box', 'stone', [x - .42, height + .8, z - .3], [.31, .08, .3]);
    chimneys.push({ x: b.x + x - .42, y: height + 1.1, z: b.z + z - .3, index: b.index });
    for (const dz of [-.5, 0, .5]) piece(b, 'box', 'roofDark', [x, height + .53, z + dz], [.06, .045, .035]);
  }
  function tree(b, x, z, size = 1, blossom = false) {
    piece(b, 'cylinder', 'wood', [x, .55 * size, z], [.16 * size, 1.1 * size, .16 * size]);
    if (!blossom && Math.sin(x * 9 + z) > .1) {
      for (let i = 0; i < 3; i++) piece(b, 'cone', i % 2 ? 'leafLight' : 'leaf', [x, (1.05 + i * .32) * size, z], [(1.13 - i * .22) * size, .96 * size, (1.13 - i * .22) * size]);
      return;
    }
    for (const side of [-1, 1]) piece(b, 'cylinder', 'wood', [x + side * .12 * size, .94 * size, z], [.08 * size, .55 * size, .08 * size], [0, 0, side * -.5]);
    for (let i = 0; i < 3; i++) piece(b, 'ball', blossom ? i % 2 ? 'pink' : 'lavender' : i % 2 ? 'leafLight' : 'leaf', [x + (i - 1) * .25 * size, (1.2 + i * .16) * size, z + (i % 2) * .15 * size], [.95 * size, .83 * size, .86 * size]);
  }
  function lantern(b, x, z) {
    piece(b, 'cylinder', 'wood', [x, .65, z], [.075, 1.3, .075]); piece(b, 'box', 'wood', [x + .15, 1.26, z], [.36, .06, .06]);
    piece(b, 'box', 'glow', [x + .27, 1.05, z], [.17, .25, .17]); piece(b, 'roof', 'timber', [x + .27, 1.17, z], [.23, .15, .22]);
    piece(b, 'box', 'timber', [x + .27, .9, z], [.22, .045, .22]);
    lanternPositions.push({ x: b.x + x + .27, y: 1.22, z: b.z + z, index: b.index });
  }
  function barrel(b, x, z) { piece(b, 'cylinder', 'wood', [x, .25, z], [.42, .5, .42]); for (const y of [.12, .38]) piece(b, 'ring', 'timber', [x, y, z], [.44, .44, .44], [Math.PI / 2, 0, 0]); }
  function fence(b, x, z, count = 4) {
    for (let i = 0; i < count; i++) piece(b, 'box', 'wood', [x + i * .33, .3, z], [.07, .6, .07]);
    for (const y of [.22, .45]) piece(b, 'box', 'cream', [x + (count - 1) * .165, y, z], [count * .33, .065, .065]);
  }
  const land = builder(-1);
  // Exposed cliff facets make the grass island read as a miniature in space.
  for (let i = 0; i < 24; i++) { const angle = i * Math.PI / 12; piece(land, 'ball', i % 3 ? 'soil' : 'rock', [Math.cos(angle) * 6.6, -1.14, Math.sin(angle) * 5.1], [1.48, 2.06 + i % 3 * .14, 1.28], [0, angle, 0]); }
  for (let i = 0; i < 12; i++) { const angle = i * .91; piece(land, 'ball', i % 2 ? 'grassLight' : 'grassDark', [Math.cos(angle) * 4.9, .007, Math.sin(angle) * 3.8], [1.4 + i % 3 * .3, .024, 1.5], [0, angle, 0]); }
  for (let i = 0; i < 9; i++) { const angle = i * .81; piece(land, 'cylinder', 'wood', [Math.cos(angle) * 6.3, -1.65, Math.sin(angle) * 4.9], [.055, .6 + i % 3 * .24, .055], [Math.sin(angle) * .12, 0, Math.cos(angle) * -.12]); }
  for (let i = 0; i < 15; i++) { const angle = i * 2.4, x = Math.cos(angle) * (5.6 + (i % 3) * .5), z = Math.sin(angle) * (4 + (i % 2) * .3); tree(land, x, z, .7 + (i % 3) * .14); }
  for (let i = 0; i < 55; i++) { const x = Math.sin(i * 13.1) * 6.4, z = Math.cos(i * 7.73) * 4.6; if (Math.abs(x) < 1.2 || x * x / 53.3 + z * z / 31.4 > .94) continue; piece(land, 'ball', i % 3 ? 'grassLight' : 'pink', [x, .09, z], [.12, .13, .12]); }
  for (let i = 0; i < 20; i++) { const angle = i * .79; piece(land, 'ball', i % 2 ? 'rock' : 'stone', [Math.cos(angle) * 6.9, -.3, Math.sin(angle) * 4.7], [.7 + (i % 3) * .2, .6, .55]); }
  for (let i = 0; i < 24; i++) piece(land, 'cylinder', 'stone', [-5.4 + i * .4, .016, 2 + Math.sin(i * .35) * .55], [.36, .035, .31]);
  for (let i = 0; i < 20; i++) {
    const z = i * .51 - 4.9, side = i % 2 ? -1 : 1, x = .15 + Math.sin(z * .55) * .22 + side * .78;
    piece(land, 'ball', i % 3 ? 'rock' : 'stone', [x, -.025, z], [.24, .19, .29]);
    if (i % 2) for (let j = 0; j < 3; j++) piece(land, 'cone', 'green', [x + (j - 1) * .055, .18, z], [.06, .42 - j * .06, .06], [0, 0, (j - 1) * .14]);
  }
  bake(land);
  const riverGeometry = own(new T.PlaneGeometry(1.22, 11.92, 5, 36)); riverGeometry.rotateX(-Math.PI / 2);
  const riverAttribute = riverGeometry.getAttribute('position'); for (let i = 0; i < riverAttribute.count; i++) riverAttribute.setX(i, riverAttribute.getX(i) + .15 + Math.sin(riverAttribute.getZ(i) * .55) * .22);
  const riverRest = new Float32Array(riverAttribute.array), river = mesh(riverGeometry, material('water')); river.position.y = .253; river.castShadow = false;
  const waterfallGeometry = own(new T.PlaneGeometry(1.12, 2.68, 4, 20)), waterfallAttribute = waterfallGeometry.getAttribute('position'), waterfallRest = new Float32Array(waterfallAttribute.array);
  const waterfall = mesh(waterfallGeometry, own(new T.MeshStandardMaterial({ color: '#8cd1d6', roughness: .24, metalness: .08, transparent: true, opacity: .82, side: T.DoubleSide, depthWrite: false }))); waterfall.position.set(.115, -1.08, 5.97); waterfall.castShadow = false;
  const foam = new T.InstancedMesh(geometry('ball'), own(new T.MeshBasicMaterial({ color: '#ecfff1', transparent: true, opacity: .6, depthWrite: false })), 16); island.add(foam);
  const waterStreaks = new T.InstancedMesh(geometry('box'), own(new T.MeshBasicMaterial({ color: '#e9fff5', transparent: true, opacity: .65, depthWrite: false })), 12); island.add(waterStreaks);
  const ripples = new T.InstancedMesh(geometry('ring'), own(new T.MeshBasicMaterial({ color: '#e5f4d8', transparent: true, opacity: .3 })), 10); island.add(ripples);
  const camp = builder(0, -4.7, 2.6);
  piece(camp, 'roof', 'cream', [0, 0, 0], [1.2, 1.05, 1.25]); piece(camp, 'roof', 'wood', [0, .015, .64], [.66, .67, .016]);
  for (let i = 0; i < 3; i++) piece(camp, 'cylinder', 'timber', [1, .08, .35], [.11, .65, .11], [Math.PI / 2, i * 1.05, 0]);
  piece(camp, 'cone', 'orange', [1, .28, .35], [.3, .42, .3]); piece(camp, 'cone', 'glow', [1, .26, .39], [.16, .27, .17]); bake(camp);
  const cottage = builder(1, -3.35, -.05); house(cottage); barrel(cottage, 1.07, -.35); fence(cottage, -1.1, .92); bake(cottage);
  const lane = builder(2, -1.7, 3.4); for (let i = 0; i < 3; i++) lantern(lane, i * .7 - .7, i % 2 ? -.3 : .2); fence(lane, -.8, .55, 5); bake(lane);
  const garden = builder(3, 3, 3.1);
  for (let row = 0; row < 3; row++) { piece(garden, 'box', 'soil', [(row - 1) * .65, .06, 0], [.53, .1, 1.2]); for (let j = 0; j < 5; j++) { piece(garden, 'ball', row === 1 ? 'orange' : 'leafLight', [(row - 1) * .65, .18, j * .23 - .46], [.17, .2, .17]); piece(garden, 'cone', 'green', [(row - 1) * .65, .31, j * .23 - .46], [.12, .25, .13]); } }
  fence(garden, -1.1, -.8, 7); barrel(garden, 1.18, .55); bake(garden);
  const bridge = builder(4, .15, -.35);
  for (let i = 0; i < 12; i++) { const x = i * .2 - 1.1; piece(bridge, 'box', 'wood', [x, .18 + Math.sqrt(Math.max(0, 1.3 - x * x)) * .24, 0], [.18, .11, 1.04]); }
  for (const z of [-.58, .58]) { piece(bridge, 'arch', 'stone', [0, .19, z], [2.7, .72, 1]); for (const x of [-1.17, 1.17]) piece(bridge, 'box', 'stone', [x, .28, z], [.23, .57, .24]); }
  bake(bridge);
  const mill = builder(5, -1.5, -2.85); house(mill, -.2, 0, 1.6); barrel(mill, -1.28, .62);
  const wheel = new T.Group(); wheel.position.set(.78, .58, .02); mill.group.add(wheel); wheels.push(wheel);
  for (const x of [-.1, .1]) { const ring = mesh(geometry('ring'), material('timber'), wheel); ring.scale.set(1.18, 1.18, 1.18); ring.rotation.y = Math.PI / 2; ring.position.x = x; }
  for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5; const paddle = mesh(geometry('box'), material('wood'), wheel); paddle.position.set(0, Math.cos(angle) * .55, Math.sin(angle) * .55); paddle.scale.set(.32, .15, .22); paddle.rotation.x = -angle; }
  bake(mill);
  const bakery = builder(6, 3, -.5); house(bakery, 0, 0, 1.65, 'white');
  for (let i = 0; i < 6; i++) piece(bakery, 'box', i % 2 ? 'cream' : 'green', [-.65 + i * .26, 1.02, 1.1], [.26, .08, .82], [-.14, 0, 0]);
  for (const x of [-.76, .76]) piece(bakery, 'cylinder', 'wood', [x, .51, 1.32], [.06, 1.02, .06]);
  barrel(bakery, 1.13, .12); bake(bakery);
  const grove = builder(7, -5.1, -2.6); tree(grove, -.3, -.2, 1.15, true); tree(grove, .65, .38, .7, true);
  piece(grove, 'box', 'wood', [0, .32, 1], [.9, .08, .32]); for (const x of [-.3, .3]) piece(grove, 'box', 'timber', [x, .15, 1], [.08, .3, .08]); bake(grove);
  const tower = builder(8, 3.65, -3.3);
  piece(tower, 'box', 'stone', [0, 1.4, 0], [.95, 2.8, .95]); piece(tower, 'roof', 'roofDark', [0, 2.8, 0], [1.4, 1.02, 1.35]);
  piece(tower, 'cylinder', 'cream', [0, 2.24, .5], [.53, .05, .53], [Math.PI / 2, 0, 0]);
  piece(tower, 'box', 'timber', [0, 2.32, .54], [.035, .2, .022]); piece(tower, 'box', 'timber', [.08, 2.23, .54], [.2, .035, .022]);
  for (let i = 0; i < 12; i++) { const angle = i * Math.PI / 6; piece(tower, 'box', 'timber', [Math.sin(angle) * .205, 2.24 + Math.cos(angle) * .205, .54], [.025, .046, .024], [0, 0, -angle]); }
  for (const y of [.12, 1.66, 2.75]) piece(tower, 'box', 'cream', [0, y, 0], [1.06, .11, 1.06]);
  for (const y of [.55, 1.28]) piece(tower, 'box', 'glow', [0, y, .49], [.19, .29, .05]); bake(tower);
  const square = builder(9, 2, 1.25);
  piece(square, 'cylinder', 'stone', [0, .12, 0], [1.7, .24, 1.7]); piece(square, 'cylinder', 'water', [0, .25, 0], [1.43, .06, 1.43]);
  piece(square, 'cylinder', 'stone', [0, .53, 0], [.18, .57, .18]); piece(square, 'ball', 'gold', [0, .86, 0], [.28, .28, .28]); lantern(square, -.98, .8); bake(square);
  const royal = builder(10, -3.8, -4.1);
  for (const x of [-.7, .7]) { piece(royal, 'cylinder', 'cream', [x, .7, 0], [.16, 1.4, .16]); piece(royal, 'ball', 'pink', [x, 1.47, 0], [.4, .4, .4]); }
  piece(royal, 'arch', 'green', [0, 1.17, 0], [1.4, 1.08, 1]);
  for (let i = 0; i < 9; i++) { const a = i * Math.PI / 8; piece(royal, 'ball', i % 2 ? 'pink' : 'lavender', [Math.cos(a) * .71, 1.17 + Math.sin(a) * .52, .03], [.18, .18, .18]); } bake(royal);
  const castle = builder(11, .85, -4.2);
  piece(castle, 'box', 'cream', [0, 1.13, 0], [1.5, 2.26, 1.2]); piece(castle, 'roof', 'blue', [0, 2.24, 0], [1.78, 1.1, 1.5]);
  for (const x of [-.95, .95]) { piece(castle, 'cylinder', 'stone', [x, 1.13, .1], [.64, 2.27, .64]); piece(castle, 'cone', 'blue', [x, 2.72, .1], [.98, 1.16, .98]);
    for (const y of [.72, 1.57]) piece(castle, 'box', 'glow', [x, y, .43], [.16, .29, .06]);
    for (let j = 0; j < 6; j++) { const angle = j * Math.PI / 3; piece(castle, 'box', 'cream', [x + Math.cos(angle) * .32, 2.2, .1 + Math.sin(angle) * .32], [.17, .25, .17]); } }
  piece(castle, 'arch', 'stone', [0, .68, .71], [.62, .78, 1]);
  for (let i = 0; i < 3; i++) piece(castle, 'box', 'stone', [0, .036 + i * .047, .83 + (2 - i) * .19], [.73 - i * .09, .08, .3]);
  piece(castle, 'box', 'wood', [0, .56, .64], [.48, 1.1, .09]); piece(castle, 'cylinder', 'gold', [0, 3.28, 0], [.045, .85, .045]); piece(castle, 'box', 'red', [.23, 3.52, 0], [.46, .24, .025]); bake(castle);
  for (const b of builders) if (b.index >= 0) b.group.visible = b.index <= Math.max(info.index, before.index);

  const people = { body: new T.InstancedMesh(geometry('capsule'), material('white'), 12), head: new T.InstancedMesh(geometry('ball'), material('cream'), 12), hat: new T.InstancedMesh(geometry('cone'), material('gold'), 12), arms: new T.InstancedMesh(geometry('capsule'), material('cream'), 24), legs: new T.InstancedMesh(geometry('capsule'), material('timber'), 24), eyes: new T.InstancedMesh(geometry('ball'), material('timber'), 24) };
  for (const part of Object.values(people)) { part.castShadow = false; part.frustumCulled = false; part.userData.villager = true; island.add(part); }
  for (let i = 0; i < 12; i++) people.body.setColorAt(i, new T.Color(['#7794a4', '#ba795f', '#77955c', '#b69ac2'][i % 4]));
  const smoke = new T.InstancedMesh(geometry('ball'), own(new T.MeshBasicMaterial({ color: '#fff8e3', transparent: true, opacity: .33, depthWrite: false })), 18); island.add(smoke);
  const gold = new T.InstancedMesh(geometry('ball'), own(new T.MeshBasicMaterial({ color: '#ffe29a' })), 26); island.add(gold);
  const fireflies = new T.InstancedMesh(geometry('ball'), own(new T.MeshBasicMaterial({ color: '#ffe7a0', transparent: true, opacity: .85 })), 35); island.add(fireflies);
  for (const item of [ripples, foam, waterStreaks, smoke, gold, fireflies]) item.frustumCulled = false;
  const lamps = [lanternPositions[0], lanternPositions[2], lanternPositions.at(-1)].filter(Boolean).map(position => {
    const light = new T.PointLight('#ffd486', 0, 3.5, 2); light.position.set(position.x, position.y, position.z); island.add(light); return { light, index: position.index };
  });
  const selectionRing = mesh(own(new T.TorusGeometry(1.12, .035, 5, 48)), own(new T.MeshBasicMaterial({ color: '#eab75f', transparent: true, opacity: .8 }))); selectionRing.rotation.x = -Math.PI / 2; selectionRing.castShadow = false;
  const selectionHalo = mesh(own(new T.CircleGeometry(1.17, 40)), own(new T.MeshBasicMaterial({ color: '#f6d789', transparent: true, opacity: .16, depthWrite: false }))); selectionHalo.rotation.x = -Math.PI / 2; selectionHalo.castShadow = false;
  const bird = new T.Group(); scene.add(bird);
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) { const wing = mesh(geometry('ball'), material('cream'), bird); wing.position.set(i * .46 + side * .1, (i % 2) * .18, side * .08); wing.scale.set(.22, .04, .08); wing.rotation.z = side * .3; wing.castShadow = false; }
  const transform = new T.Object3D(), elapsedStart = performance.now();
  const setInstance = (item, index, position, scale, rotation = [0, 0, 0]) => { transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix(); item.setMatrixAt(index, transform.matrix); };
  let highlight = builders.find(b => b.index === (newlyBuilt ? info.index : before.index));
  function resize() {
    if (destroyed || contextLost) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), aspect = width / height;
    const span = aspect < 1.3 ? 17.4 / aspect : 12;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    render(performance.now(), true);
  }
  function render(now, force = false) {
    if (destroyed || contextLost) return;
    if (!force && (!visible || document.hidden || now - lastFrame < (mobile ? 1000 / 30 : 1000 / 45))) return;
    lastFrame = now; const seconds = reducedMotion ? 0 : (now - elapsedStart) / 1000, reactionSeconds = reducedMotion ? 5 : (now - reactionStart) / 1000;
    const buildTime = reducedMotion ? 1 : Math.min(1, reactionSeconds / 1.35);
    for (const b of builders) {
      if (b.index < 0) continue;
      let scale = 1;
      if (newlyBuilt && b.index > before.index && b.index <= info.index) {
        const localTime = reducedMotion ? 1 : Math.max(0, Math.min(1, (reactionSeconds - Math.min(.3, (b.index - before.index - 1) * .06)) / 1.35));
        const spring = localTime - 1; scale = Math.max(.001, 1 + 2.70158 * spring ** 3 + 1.70158 * spring ** 2);
      }
      if (reversed && b.index > info.index && b.index <= before.index) scale = Math.max(.001, 1 - buildTime);
      b.group.scale.setScalar(scale); b.group.visible = b.index <= info.index || reversed && b.index <= before.index && buildTime < 1;
    }
    const chosen = selected !== null ? builders.find(b => b.index === selected) : null;
    if (chosen) target.set(chosen.x * .74, .55, chosen.z * .74);
    else if (highlight && (newlyBuilt || reversed) && !reducedMotion && reactionSeconds < 3.4) {
      const strength = Math.sin(Math.min(1, reactionSeconds / 3.4) * Math.PI) * .28; target.set(highlight.x * strength, .35 + strength * .6, highlight.z * strength);
    } else target.set(0, .35, 0);
    focus.lerp(target, reducedMotion ? 1 : .07); yaw = reducedMotion ? goalYaw : yaw + (goalYaw - yaw) * .12;
    zoomValue = reducedMotion ? goalZoom : zoomValue + (goalZoom - zoomValue) * .12; camera.zoom = zoomValue; camera.updateProjectionMatrix();
    camera.position.set(focus.x + Math.cos(yaw) * 19 * Math.cos(pitch), 19 * Math.sin(pitch), focus.z + Math.sin(yaw) * 19 * Math.cos(pitch)); camera.lookAt(focus);
    dusk = reducedMotion ? goalDusk : dusk + (goalDusk - dusk) * .08;
    sun.color.copy(colors.sunDay).lerp(colors.sunDusk, dusk); sun.intensity = 2.4 - dusk * 1.83; moon.intensity = dusk * 1.18;
    ambient.color.copy(colors.skyDay).lerp(colors.skyDusk, dusk); ambient.groundColor.copy(colors.groundDay).lerp(colors.groundDusk, dusk); ambient.intensity = 1.8 - dusk * 1.02;
    material('glow').emissiveIntensity = .28 + dusk * 2.9; for (const lamp of lamps) lamp.light.intensity = lamp.index <= info.index ? dusk * 9 : 0;
    selectionRing.visible = selectionHalo.visible = !!chosen;
    if (chosen) { selectionRing.position.set(chosen.x, .276, chosen.z); selectionHalo.position.set(chosen.x, .269, chosen.z); selectionRing.material.opacity = .65 + Math.sin(seconds * 2) * .14; }
    for (let i = 0; i < riverAttribute.count; i++) riverAttribute.array[i * 3 + 1] = riverRest[i * 3 + 1] + Math.sin(riverRest[i * 3] * 5 + riverRest[i * 3 + 2] * 2 - seconds * 1.7) * .017;
    riverAttribute.needsUpdate = true; riverGeometry.computeVertexNormals();
    for (let i = 0; i < waterfallAttribute.count; i++) waterfallAttribute.array[i * 3 + 2] = waterfallRest[i * 3 + 2] + Math.sin(waterfallRest[i * 3 + 1] * 6 - seconds * 4 + waterfallRest[i * 3] * 3) * .035;
    waterfallAttribute.needsUpdate = true;
    for (let i = 0; i < 16; i++) { const age = (seconds * .42 + i * .21) % 1; setInstance(foam, i, [.12 + Math.sin(i * 2.4) * (.25 + age * .2), -2.47 + age * .36, 6 + Math.cos(i * 2.4) * age * .42], [.13 + age * .18, .09 + age * .08, .14 + age * .14]); } foam.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) { const age = (seconds * .65 + i * .19) % 1; setInstance(waterStreaks, i, [.12 + Math.sin(i * 2.4) * .45, .1 - age * 2.5, 6.01], [.018, .16 + i % 3 * .05, .02]); } waterStreaks.instanceMatrix.needsUpdate = true;
    for (const wheel of wheels) wheel.rotation.x = seconds * .45;
    for (let i = 0; i < 10; i++) { const z = ((i * 1.13 + seconds * .26) % 11.5) - 5.75; setInstance(ripples, i, [.15 + Math.sin(z * .55) * .22, .282, z], [.36, .12, .15], [Math.PI / 2, 0, 0]); } ripples.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) {
      const active = i < info.population, b = builders.find(item => item.index === i);
      const phase = seconds * .38 + i, heading = -phase, stride = Math.sin(seconds * 6 + i) * .38;
      const x = active ? b.x + Math.cos(phase) * .46 + .75 : 0, z = active ? b.z + 1.04 + Math.sin(phase) * .4 : 0;
      const y = active ? .25 + Math.sin(seconds * 6 + i) * .014 + (newlyBuilt && reactionSeconds < 1.8 ? Math.abs(Math.sin(reactionSeconds * 8 + i)) * .16 : 0) : -20;
      setInstance(people.body, i, [x, y + .31, z], [.22, .22, .19], [0, heading, 0]); setInstance(people.head, i, [x, y + .56, z], [.25, .27, .24], [0, heading, 0]); setInstance(people.hat, i, [x, y + .72, z], [.32, .17, .31], [0, heading, 0]);
      for (const side of [-1, 1]) {
        const j = i * 2 + (side === 1 ? 1 : 0), acrossX = Math.cos(heading) * side, acrossZ = -Math.sin(heading) * side;
        setInstance(people.arms, j, [x + acrossX * .145, y + .29, z + acrossZ * .145], [.065, .14, .065], [stride * side, heading, side * -.15]);
        setInstance(people.legs, j, [x + acrossX * .065, y + .105, z + acrossZ * .065], [.073, .125, .073], [-stride * side, heading, 0]);
        setInstance(people.eyes, j, [x + acrossX * .049 + Math.sin(heading) * .108, y + .575, z + acrossZ * .049 + Math.cos(heading) * .108], [.033, .034, .026]);
      }
    } for (const part of Object.values(people)) part.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 18; i++) { const chimney = chimneys[i % chimneys.length], age = ((seconds * .42 + i * .23) % 1), active = chimney.index <= info.index; setInstance(smoke, i, [chimney.x + age * .25, active ? chimney.y + age * .8 : -20, chimney.z + age * .12], [.09 + age * .2, .11 + age * .18, .1 + age * .18]); } smoke.instanceMatrix.needsUpdate = true;
    smoke.visible = info.index >= 1; gold.visible = newlyBuilt && !reducedMotion && reactionSeconds < 1.8;
    for (let i = 0; i < 26; i++) { const age = Math.min(1, reactionSeconds / 1.8), angle = i * 2.4, show = gold.visible && highlight; const radius = age * (1.5 + (i % 3) * .4); setInstance(gold, i, [show ? highlight.x + Math.cos(angle) * radius : 0, show ? 1.2 + Math.sin(age * Math.PI) * 2.4 + (i % 4) * .12 : -20, show ? highlight.z + Math.sin(angle) * radius : 0], Array(3).fill(.075 * (1 - age))); } gold.instanceMatrix.needsUpdate = true;
    fireflies.visible = dusk > .01; for (let i = 0; i < 35; i++) { const angle = i * 2.4; setInstance(fireflies, i, [Math.cos(angle) * (1.5 + i % 4), .7 + Math.sin(seconds * .7 + i) * .3 + i % 3 * .35, Math.sin(angle) * (1.3 + i % 3)], Array(3).fill(.035 + Math.sin(seconds * 2 + i) * .015)); } fireflies.instanceMatrix.needsUpdate = true;
    bird.position.set(Math.cos(seconds * .16) * 4.4, 3.7 + Math.sin(seconds * .24) * .4, Math.sin(seconds * .16) * 3.3); bird.rotation.y = -seconds * .16;
    const changing = !reducedMotion && reactionSeconds < (newlyBuilt ? 1.65 : 1.35);
    renderer.shadowMap.autoUpdate = changing;
    // Static/reduced-motion renders still need the renderer-level shadow pass.
    // A light-only flag cannot initialize the depth comparison texture.
    if (changing || force) { renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; }
    renderer.render(scene, camera); host.dataset.drawCalls = String(renderer.info.render.calls); host.dataset.triangles = String(renderer.info.render.triangles);
  }
  function resume() {
    if (destroyed || contextLost || !visible || document.hidden || reducedMotion || frame) return;
    host.dataset.villageRunning = 'true';
    frame = requestAnimationFrame(tick);
  }
  function pause() { cancelAnimationFrame(frame); frame = 0; host.dataset.villageRunning = 'false'; }
  function tick(now) { frame = 0; render(now); resume(); }
  const raycaster = new T.Raycaster(), pointer = new T.Vector2();
  let drag = null;
  function down(event) { if (event.button > 0) return; drag = { x: event.clientX, y: event.clientY, yaw: goalYaw, moved: false, travelled: false, id: event.pointerId }; }
  function move(event) { if (!drag || drag.id !== event.pointerId) return; const dx = event.clientX - drag.x, dy = event.clientY - drag.y; drag.travelled ||= Math.hypot(dx, dy) > 10; if (!drag.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { drag.moved = true; renderer.domElement.setPointerCapture(event.pointerId); } if (drag.moved) { goalYaw = drag.yaw - dx * .008; if (reducedMotion) render(performance.now(), true); } }
  function up(event) {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && !drag.travelled && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 10) {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
      // Raycaster includes invisible descendants. Inspect only an unlocked,
      // visibly built place (or its resident), never hidden future geometry.
      const found = raycaster.intersectObjects(island.children, true).find(hit => {
        const index = hit.object.userData.villager ? Math.floor(hit.instanceId / (hit.object.count > 12 ? 2 : 1)) : hit.object.userData.building;
        const building = builders.find(item => item.index === index); return Number.isInteger(index) && index >= 0 && index <= info.index && building?.group.visible && building.group.scale.x > .5;
      });
      if (found) inspect(found.object.userData.villager ? Math.floor(found.instanceId / (found.object.count > 12 ? 2 : 1)) : found.object.userData.building);
    }
    drag = null;
  }
  const cancel = () => { drag = null; };
  const canvas = renderer.domElement; canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const visibilityObserver = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); if (visible) { render(performance.now(), true); resume(); } else pause(); }); visibilityObserver.observe(host);
  function pageVisibility() { if (!document.hidden && visible) { render(performance.now(), true); resume(); } else pause(); }
  document.addEventListener('visibilitychange', pageVisibility);
  function lost(event) { event.preventDefault(); contextLost = true; pause(); host.querySelectorAll('[data-village-reset],[data-village-zoom]').forEach(button => { button.disabled = true; }); onFallback(); }
  canvas.addEventListener('webglcontextlost', lost);
  const cleanup = () => {
    if (destroyed) return; destroyed = true; pause(); resizeObserver.disconnect(); visibilityObserver.disconnect(); document.removeEventListener('visibilitychange', pageVisibility);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('webglcontextlost', lost);
    for (const object of [ripples, smoke, gold, foam, waterStreaks, fireflies, ...Object.values(people)]) object.dispose(); for (const resource of resources) resource.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  };
  function redraw() { if (visible && !document.hidden) render(performance.now(), true); resume(); }
  function syncCameraButtons() {
    host.querySelector('[data-village-zoom=in]').disabled = goalZoom >= 1.85;
    host.querySelector('[data-village-zoom=out]').disabled = goalZoom <= .85;
  }
  function select(index) {
    selected = Number.isInteger(index) && index >= 0 && index <= info.index ? index : null;
    if (selected !== null) goalZoom = Math.max(goalZoom, 1.35); else goalZoom = 1;
    host.dataset.villageSelected = selected === null ? '' : String(selected); host.dataset.villageZoom = String(goalZoom); syncCameraButtons(); redraw();
  }
  function zoom(direction) {
    goalZoom = Math.max(.85, Math.min(1.85, goalZoom + direction * .17)); host.dataset.villageZoom = goalZoom.toFixed(2);
    syncCameraButtons(); redraw();
  }
  function reset() { goalYaw = .92; goalZoom = 1; selected = null; host.dataset.villageSelected = ''; host.dataset.villageZoom = '1'; syncCameraButtons(); redraw(); }
  function setTime(value) { goalDusk = value === 'dusk' ? 1 : 0; redraw(); }
  function update(nextTotal, nextOptions = {}) {
    const nextInfo = villageSummary(nextTotal), levelChanged = nextInfo.index !== info.index;
    if (levelChanged) {
      before = nextOptions.reactionActive ? villageSummary({ balance: nextInfo.balance - (nextOptions.reaction?.delta || 0) }) : nextInfo;
      newlyBuilt = !!nextOptions.reactionActive && nextInfo.index > before.index; reversed = !!nextOptions.reactionActive && nextInfo.index < before.index; reactionStart = performance.now();
    }
    info = nextInfo; reducedMotion = !!nextOptions.reducedMotion; if (reducedMotion) pause();
    highlight = builders.find(b => b.index === (newlyBuilt ? info.index : before.index));
    if (selected !== null && selected > info.index) { selected = null; goalZoom = 1; host.dataset.villageSelected = ''; host.dataset.villageZoom = '1'; }
    syncCameraButtons();
    redraw();
  }
  host.dataset.villageZoom = '1'; host.dataset.villageSelected = '';
  registerCleanup(cleanup); resize(); resume(); return { cleanup, select, zoom, reset, setTime, update };
}
