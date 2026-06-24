import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Card, PublicPlayer, RoomState } from "@rrld/shared";
import type {
  BarSceneHandle,
  CameraPresetId,
  CardMotionState,
  CharacterAssetId,
  CharacterMotionState,
  CharacterPose,
  CharacterSceneState,
  CinematicAssetId,
  CinematicBeat,
  CinematicQualityProfile,
  CinematicSceneSnapshot,
  RouletteVisualResult,
  RouletteDisplayPhase,
  SoloScenePhase,
  TimelineStep,
  RouletteSceneState,
  VoiceSceneState
} from "./animationTypes";
import {
  getCinematicDuration,
  getPileVisualTransform,
  getSeatChamberIndicator,
  rouletteDisplayPhaseFromSceneState,
  rouletteVisualResult as getRouletteVisualResult
} from "./animationTypes";

interface BarSceneProps {
  players: PublicPlayer[];
  currentTurnPlayerId?: string;
  winnerId?: string;
  phase?: RoomState["phase"];
  pileCount?: number;
  hasChallenge?: boolean;
  resultConcealed?: boolean;
  concealedEliminatedPlayerId?: string;
  voiceStates?: Record<string, VoiceSceneState>;
  localPlayerId?: string;
  localHand?: Card[];
  selectedCardIds?: string[];
  actionsLocked?: boolean;
  soloPhase?: SoloScenePhase;
  botThinkingPlayerId?: string;
  tableQuote?: SceneTableQuote | null;
  onRouletteStageChange?: (stage: { rouletteState: RouletteSceneState; displayPhase: RouletteDisplayPhase; resultUiUnlocked: boolean }) => void;
}

interface SceneTableQuote {
  playerId: string;
  speaker: string;
  text: string;
  tone: "thinking" | "play" | "challenge" | "roulette" | "winner";
}

interface ScenePropsSnapshot extends BarSceneProps {
  pileCount: number;
  localHand: Card[];
  selectedCardIds: string[];
}

interface SceneCallbacks {
  onReady: (ready: boolean, failed: boolean) => void;
  onActiveBeat: (beat: string) => void;
  onQuality: (quality: CinematicQualityProfile) => void;
  onRouletteStageChange: (stage: { rouletteState: RouletteSceneState; displayPhase: RouletteDisplayPhase; resultUiUnlocked: boolean }) => void;
}

interface Tween {
  startedAt: number;
  duration: number;
  update: (progress: number) => void;
  complete?: () => void;
  resolve?: () => void;
}

type SceneTimelineStep =
  | { type: "sequence"; label: string; steps: SceneTimelineStep[] }
  | { type: "parallel"; label: string; steps: SceneTimelineStep[] }
  | { type: "wait"; label?: string; durationMs: number }
  | { type: "tween"; label: string; durationMs: number; update: (progress: number) => void; complete?: () => void }
  | { type: "action"; label: string; run: () => void };

interface SeatRig {
  group: THREE.Group;
  bodyMaterial?: THREE.MeshStandardMaterial;
  headMaterial?: THREE.MeshStandardMaterial;
  character?: CharacterBillboardRig;
  pose: CharacterPose;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  chamberIndicator: THREE.Group;
  chamberDots: Array<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>;
  nameplate: SeatNameplateRig;
  baseRotation: number;
  baseY: number;
  baseX: number;
  baseZ: number;
  baseScale: THREE.Vector3;
}

interface SeatNameplateRig {
  group: THREE.Group;
  panel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  quotePanel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  lastKey: string;
  lastQuoteKey: string;
}

interface ToyRig {
  group: THREE.Group;
  chamber: THREE.Object3D;
  trigger: THREE.Object3D;
  resultLight: THREE.Mesh;
  muzzle: THREE.Object3D;
  barrel: THREE.Object3D;
  body: THREE.Object3D;
  pump: THREE.Object3D;
  burst: THREE.Group;
  waterStream: THREE.Group;
  waterStreamPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  waterMist: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  waterSplash: THREE.Group;
  dryPuff: THREE.Group;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseScale: THREE.Vector3;
  pumpBasePosition: THREE.Vector3;
}

interface CharacterBillboardRig {
  assetId: CharacterAssetId;
  imageRoot: THREE.Group;
  bodyPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  rimPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  eyeGlintPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  shadowPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.PointLight;
  baseImageY: number;
  baseImageZ: number;
}

interface Runtime extends BarSceneHandle {
  dispose(): void;
}

declare global {
  interface Window {
    __RRLD_CINEMATIC_SCENE__?: () => CinematicSceneSnapshot;
    __RRLD_CINEMATIC_SCENE_TEST__?: {
      playRouletteVisual(result: "BLANK" | "LETHAL"): Promise<boolean>;
    };
  }
}

const DEFAULT_PROPS: ScenePropsSnapshot = {
  players: [],
  currentTurnPlayerId: undefined,
  winnerId: undefined,
  phase: undefined,
  pileCount: 0,
  hasChallenge: false,
  resultConcealed: false,
  concealedEliminatedPlayerId: undefined,
  voiceStates: {},
  localHand: [],
  selectedCardIds: [],
  soloPhase: "idle",
  botThinkingPlayerId: undefined,
  tableQuote: null
};

const publicAssetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//u, "")}`;

const ASSET_PATHS: Record<CinematicAssetId, string> = {
  "bar-room": publicAssetPath("assets/cinematic/bar-room.glb"),
  "card-table": publicAssetPath("assets/cinematic/card-table.glb"),
  "playing-card": publicAssetPath("assets/cinematic/playing-card.glb"),
  characters: publicAssetPath("assets/cinematic/characters.glb"),
  "toy-roulette": publicAssetPath("assets/cinematic/toy-roulette.glb")
};

const ASSET_IDS = Object.keys(ASSET_PATHS) as CinematicAssetId[];
const CHARACTER_ATLAS_PATH = publicAssetPath("assets/cinematic/characters/noir-gambler-atlas-alpha.png");
const WATER_STREAM_PATH = publicAssetPath("assets/cinematic/effects/water-stream.png");
const WATER_SPLASH_PATH = publicAssetPath("assets/cinematic/effects/water-splash.png");
const WATER_MIST_PATH = publicAssetPath("assets/cinematic/effects/water-mist.png");
const CHARACTER_ASSET_IDS: CharacterAssetId[] = ["host", "challenger", "watcher", "wildcard"];
const CARD_FACE_SIZE = { width: 256, height: 384 };
const rankTextureCache = new Map<string, THREE.CanvasTexture>();
let cardBackTextureCache: THREE.CanvasTexture | undefined;

export const BarScene = forwardRef<BarSceneHandle, BarSceneProps>(function BarScene(props, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const rouletteStageCallbackRef = useRef(props.onRouletteStageChange);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [activeBeat, setActiveBeat] = useState("loading");
  const [quality, setQuality] = useState<CinematicQualityProfile>("desktop");

  useImperativeHandle(
    ref,
    () => ({
      preloadAssets: () => runtimeRef.current?.preloadAssets() ?? Promise.resolve(),
      syncSceneState: (...args) => runtimeRef.current?.syncSceneState(...args),
      playBeat: (...args) => runtimeRef.current?.playBeat(...args) ?? Promise.resolve(),
      cancelAnimations: () => runtimeRef.current?.cancelAnimations(),
      setQualityProfile: (...args) => runtimeRef.current?.setQualityProfile(...args),
      getSceneSnapshot: () =>
        runtimeRef.current?.getSceneSnapshot() ?? {
          ready: false,
          failed: false,
          quality,
          activeBeat,
          assetIds: [],
          playerCount: 0,
          pileCount: 0,
          selectedCount: 0,
          visibleMotionCards: 0,
          visibleRevealCards: 0,
          rouletteState: "idle",
          rouletteVisualResult: "dry",
          rouletteDisplayPhase: "hidden",
          resultUiUnlocked: false,
          aimedPlayerId: undefined,
          waterStreamVisible: false,
          waterSplashVisible: false,
          dryPuffVisible: false,
          toyGunMeshNames: [],
          tableMeshNames: [],
          characterAssetIds: [],
          visibleCharacterCount: 0,
          activeCharacterPose: "idle",
          characterSceneState: "loading",
          activeTimeline: "idle",
          completedTimelines: [],
          queuedTimelineCount: 0,
          cameraPreset: "lobby",
          cameraMode: "lobby",
          cameraDistance: 0,
          cameraSettled: true,
          userCameraYaw: 0,
          userCameraPitch: 0,
          cameraUserControlled: false,
          actionsLocked: false,
          localSeatIndex: -1,
          visibleNameplateCount: 0,
          characterMotionStates: [],
          seatChamberIndicators: [],
          seatNameplates: [],
          motionCardCount: 0,
          settledPileVisualCount: 0,
          localHandVisualCount: 0,
          selectedHandVisualCount: 0,
          localHandFacingPlayer: true,
          pileVisualPositions: [],
          cardMotionState: "idle",
          soloPhase: "idle",
          visibleSpeechBubblePlayerId: undefined,
          speechBubbleVisible: false,
          visibleQuoteCount: 0,
          botThinkingPlayerId: undefined,
          gunParked: true,
          localHandVisible: false
        },
      dealCards: (...args) => runtimeRef.current?.dealCards(...args),
      throwCards: (...args) => runtimeRef.current?.throwCards(...args),
      revealCards: (...args) => runtimeRef.current?.revealCards(...args),
      focusPlayer: (...args) => runtimeRef.current?.focusPlayer(...args),
      playLiarImpact: (...args) => runtimeRef.current?.playLiarImpact(...args),
      playRoulette: (...args) => runtimeRef.current?.playRoulette(...args),
      playWin: (...args) => runtimeRef.current?.playWin(...args),
      playLoss: (...args) => runtimeRef.current?.playLoss(...args),
      resetRoundVisuals: () => runtimeRef.current?.resetRoundVisuals(),
      setSelectedCards: (...args) => runtimeRef.current?.setSelectedCards(...args),
      setQueuedTimelineCount: (...args) => runtimeRef.current?.setQueuedTimelineCount(...args)
    }),
    [activeBeat, quality]
  );

  useEffect(() => {
    rouletteStageCallbackRef.current = props.onRouletteStageChange;
  }, [props.onRouletteStageChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const runtime = createRuntime(
      host,
      {
        ...DEFAULT_PROPS,
        ...props,
        pileCount: props.pileCount ?? 0,
        localPlayerId: props.localPlayerId,
        localHand: props.localHand ?? [],
        selectedCardIds: props.selectedCardIds ?? [],
        soloPhase: props.soloPhase,
        botThinkingPlayerId: props.botThinkingPlayerId,
        tableQuote: props.tableQuote ?? null
      },
      {
        onReady: (ready, failed) => {
          setSceneReady(ready);
          setSceneFailed(failed);
        },
        onActiveBeat: setActiveBeat,
        onQuality: setQuality,
        onRouletteStageChange: (stage) => rouletteStageCallbackRef.current?.(stage)
      }
    );

    runtimeRef.current = runtime;
    void runtime.preloadAssets();

    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.syncSceneState({
      ...props,
      pileCount: props.pileCount ?? 0,
      localPlayerId: props.localPlayerId,
      localHand: props.localHand ?? [],
      selectedCardIds: props.selectedCardIds ?? [],
      actionsLocked: props.actionsLocked,
      soloPhase: props.soloPhase,
      botThinkingPlayerId: props.botThinkingPlayerId,
      tableQuote: props.tableQuote ?? null
    });
  }, [
    props.players,
    props.currentTurnPlayerId,
    props.winnerId,
    props.phase,
    props.pileCount,
    props.hasChallenge,
    props.resultConcealed,
    props.concealedEliminatedPlayerId,
    props.voiceStates,
    props.localPlayerId,
    props.localHand,
    props.selectedCardIds,
    props.actionsLocked,
    props.soloPhase,
    props.botThinkingPlayerId,
    props.tableQuote
  ]);

  return (
    <div
      className="bar-scene"
      ref={hostRef}
      aria-hidden="true"
      data-testid="bar-scene"
      data-scene-ready={sceneReady}
      data-scene-failed={sceneFailed}
      data-active-beat={activeBeat}
      data-quality={quality}
    >
      {!sceneReady ? (
        <div className="scene-loading">
          <span />
          Loading cinematic table
        </div>
      ) : null}
    </div>
  );
});

function createRuntime(host: HTMLDivElement, initialProps: ScenePropsSnapshot, callbacks: SceneCallbacks): Runtime {
  let props = initialProps;
  let ready = false;
  let failed = false;
  let quality = detectQuality(host);
  let rouletteState: RouletteSceneState = "idle";
  let rouletteVisualResult: RouletteVisualResult = "dry";
  let rouletteDisplayPhase: RouletteDisplayPhase = "hidden";
  let resultUiUnlocked = false;
  let aimedPlayerId: string | undefined;
  let waterStreamVisible = false;
  let waterSplashVisible = false;
  let dryPuffVisible = false;
  let lastRouletteStageNotification = "";
  let toyGunMeshNames: string[] = [];
  let tableMeshNames: string[] = [];
  let activeBeat = "loading";
  let activeCharacterPose: CharacterPose = "idle";
  let characterSceneState: CharacterSceneState = "loading";
  let activeTimeline = "idle";
  let completedTimelines: string[] = [];
  let queuedTimelineCount = 0;
  let cameraPreset: CameraPresetId = "lobby";
  let cameraMode: CinematicSceneSnapshot["cameraMode"] = "lobby";
  let cardMotionState: CardMotionState = "idle";
  let selectedCount = 0;
  let localHandVisualCount = 0;
  let visualPileCount = 0;
  let pileAnimationInFlight = false;
  let selectedCardIdSet = new Set<string>();
  let selectedCardOrder = new Map<string, number>();
  let recentSelectedHandStarts: Array<{ mesh: THREE.Group; position: THREE.Vector3; rotation: THREE.Euler }> = [];
  let userCameraYaw = 0;
  let userCameraPitch = 0;
  let targetUserCameraYaw = 0;
  let targetUserCameraPitch = 0;
  let cameraUserControlled = false;
  let isCameraDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let animationGeneration = 0;
  let shakeUntil = 0;
  let assetsPromise: Promise<void> | undefined;

  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const tweens: Tween[] = [];
  const loadedAssets = new Map<CinematicAssetId, THREE.Group>();
  const waterTextures = new Map<"stream" | "splash" | "mist", THREE.Texture>();
  let characterAtlas: THREE.Texture | undefined;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080403, 0.048);

  const camera = new THREE.PerspectiveCamera(40, Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight), 0.1, 90);
  const cameraTarget = new THREE.Vector3(0, 0.2, -0.2);
  const cameraLookTarget = cameraTarget.clone();
  const cameraPositionTarget = new THREE.Vector3(0, 3.45, 6.7);
  camera.position.copy(cameraPositionTarget);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x030101, 0);
  host.appendChild(renderer.domElement);

  const pointerAbort = new AbortController();
  installOrbitControls();

  const world = new THREE.Group();
  scene.add(world);

  const tableRoot = new THREE.Group();
  tableRoot.position.set(0, -0.34, 0.1);
  world.add(tableRoot);

  const pileGroup = new THREE.Group();
  pileGroup.position.copy(tablePoint("pile"));
  tableRoot.add(pileGroup);

  const motionCards = new THREE.Group();
  tableRoot.add(motionCards);

  const revealGroup = new THREE.Group();
  revealGroup.position.copy(tablePoint("reveal"));
  tableRoot.add(revealGroup);

  const handCards: THREE.Group[] = [];
  let tableRankCard: THREE.Group | undefined;
  let toy: ToyRig | undefined;
  const seats: SeatRig[] = [];

  const amberLight = new THREE.PointLight(0xffb35d, 4.4, 13, 1.8);
  amberLight.position.set(-2.8, 5.2, 2.1);
  amberLight.castShadow = true;
  scene.add(amberLight);

  const tableSpot = new THREE.SpotLight(0xffcf86, 5.2, 13, Math.PI / 4.1, 0.7, 1.05);
  tableSpot.position.set(0.35, 5.25, 3.0);
  tableSpot.target.position.set(0, 0, 0);
  tableSpot.castShadow = true;
  scene.add(tableSpot, tableSpot.target);

  const redLight = new THREE.PointLight(0xff3b24, 1.1, 9, 2);
  redLight.position.set(3.8, 2.7, -1.8);
  scene.add(redLight);

  const cyanLight = new THREE.PointLight(0x36d7ff, 1.15, 8, 2);
  cyanLight.position.set(-4.2, 2.7, -2.8);
  scene.add(cyanLight);
  scene.add(new THREE.HemisphereLight(0x593923, 0x080503, 1.35));

  const resizeObserver = new ResizeObserver(() => {
    resize();
    setQualityProfile(detectQuality(host));
  });
  resizeObserver.observe(host);
  setQualityProfile(quality);
  callbacks.onActiveBeat(activeBeat);

  window.__RRLD_CINEMATIC_SCENE__ = () => getSceneSnapshot();
  if (import.meta.env.MODE !== "production") {
    window.__RRLD_CINEMATIC_SCENE_TEST__ = {
      async playRouletteVisual(result: "BLANK" | "LETHAL") {
        await preloadAssets();
        const playerId = props.currentTurnPlayerId ?? props.players[0]?.id;
        if (!playerId) {
          return false;
        }
        await playBeat({ id: `debug-roulette-${Date.now()}`, type: "roulette", playerId, result });
        return true;
      }
    };
  }

  function preloadAssets() {
    if (assetsPromise) {
      return assetsPromise;
    }

    assetsPromise = (async () => {
      setActiveBeat("loading");
      try {
        const atlasLoad = textureLoader
          .loadAsync(CHARACTER_ATLAS_PATH)
          .then((texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
            characterAtlas = texture;
            characterSceneState = "textured" as CharacterSceneState;
          })
          .catch(() => {
            characterAtlas = undefined;
            characterSceneState = "fallback" as CharacterSceneState;
          });

        const waterTextureLoad = Promise.all([
          loadWaterTexture("stream", WATER_STREAM_PATH),
          loadWaterTexture("splash", WATER_SPLASH_PATH),
          loadWaterTexture("mist", WATER_MIST_PATH)
        ]);

        await Promise.all(ASSET_IDS.map((id) => loadCinematicAsset(id)));
        await Promise.all([atlasLoad, waterTextureLoad]);
        installLoadedScene();
        failed = false;
      } catch {
        characterSceneState = "fallback";
        failed = true;
        installFallbackScene();
      }

      ready = true;
      setActiveBeat("idle");
      callbacks.onReady(ready, failed);
      syncSceneState(props);
    })();

    return assetsPromise;
  }

  async function loadWaterTexture(id: "stream" | "splash" | "mist", url: string) {
    try {
      const texture = await textureLoader.loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      waterTextures.set(id, texture);
    } catch {
      waterTextures.set(id, createFallbackWaterTexture(id));
    }
  }

  async function loadCinematicAsset(id: CinematicAssetId) {
    const candidatePaths = [ASSET_PATHS[id]];
    let lastError: unknown;

    for (const path of candidatePaths) {
      try {
        const gltf = await loader.loadAsync(path);
        const root = gltf.scene;
        root.name = id;
        root.userData.assetSource = "generated";
        prepareObject(root);
        loadedAssets.set(id, root);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Could not load cinematic asset ${id}`);
  }

  function installLoadedScene() {
    const room = cloneAsset("bar-room");
    room.name = "LoadedBarRoom";
    removeBackgroundShelfClutter(room);
    world.add(room);

    const table = cloneAsset("card-table");
    table.name = "LoadedCardTable";
    tableMeshNames = collectObjectNames(table);
    tableRoot.add(table);

    tableRankCard = createCard("KING", true);
    tableRankCard.name = "TableRankCard";
    tableRankCard.position.copy(tablePoint("rank"));
    tableRankCard.rotation.set(-0.25, -0.38, 0.08);
    tableRankCard.scale.setScalar(1.28);
    tableRoot.add(tableRankCard);

    for (let index = 0; index < 5; index += 1) {
      const card = createCard(undefined, false);
      card.name = `LocalHandCard_${index}`;
      const transform = localHandCardTransform(index);
      card.position.copy(transform.position);
      card.rotation.copy(transform.rotation);
      card.userData.basePosition = card.position.clone();
      card.userData.baseRotation = card.rotation.clone();
      tableRoot.add(card);
      handCards.push(card);
    }
    syncLocalHandVisuals();

    installSeats();
    installToyRoulette();
    refreshPile();
  }

  function installFallbackScene() {
    world.add(createFallbackRoom());
    const fallbackTable = createFallbackTable();
    tableMeshNames = collectObjectNames(fallbackTable);
    tableRoot.add(fallbackTable);
    tableRankCard = createCard("KING", true);
    tableRankCard.position.copy(tablePoint("rank"));
    tableRankCard.scale.setScalar(1.25);
    tableRoot.add(tableRankCard);

    for (let index = 0; index < 5; index += 1) {
      const card = createCard(undefined, false);
      const transform = localHandCardTransform(index);
      card.position.copy(transform.position);
      card.rotation.copy(transform.rotation);
      card.userData.basePosition = card.position.clone();
      card.userData.baseRotation = card.rotation.clone();
      tableRoot.add(card);
      handCards.push(card);
    }
    syncLocalHandVisuals();

    installFallbackSeats();
    installFallbackToyRoulette();
    refreshPile();
  }

  function installSeats() {
    const characters = loadedAssets.get("characters");
    seatDefinitions().forEach((definition, index) => {
      if (characterAtlas) {
        const rig = createCharacterBillboardRig(index, definition, characterAtlas);
        scene.add(rig.group);
        seats[index] = rig;
      } else {
        const source = characters?.getObjectByName(`Character_${index}`) as THREE.Group | undefined;
        const group = source ? cloneGroup(source) : createFallbackCharacter(index);
        group.name = `SeatRig_${index}`;
        group.position.set(definition.x, 0.45, definition.z);
        group.rotation.y = definition.rotation;
        group.scale.setScalar(0.94);
        scene.add(group);
        seats[index] = makeSeatRig(group, definition.rotation);
      }
    });
  }

  function installFallbackSeats() {
    seatDefinitions().forEach((definition, index) => {
      const group = createFallbackCharacter(index);
      group.position.set(definition.x, 0.45, definition.z);
      group.rotation.y = definition.rotation;
      scene.add(group);
      seats[index] = makeSeatRig(group, definition.rotation);
    });
  }

  function createCharacterBillboardRig(index: number, definition: ReturnType<typeof seatDefinitions>[number], atlas: THREE.Texture): SeatRig {
    const group = new THREE.Group();
    group.name = `CharacterBillboard_${index}`;
    group.position.set(definition.x, 0.14, definition.z);
    group.rotation.y = definition.rotation;

    const assetId = CHARACTER_ASSET_IDS[index] ?? "wildcard";
    const imageRoot = new THREE.Group();
    imageRoot.name = `CharacterImage_${assetId}`;
    imageRoot.position.set(0, 1.05, 0);
    group.add(imageRoot);

    const geometry = new THREE.PlaneGeometry(2.35, 2.35);
    const bodyMaterial = createCharacterMaterial(atlas, index, {
      opacity: 1,
      brightness: 1.18,
      tint: new THREE.Color(0xffffff)
    });
    const rimMaterial = createCharacterMaterial(atlas, index, {
      opacity: 0.1,
      brightness: 1.24,
      tint: new THREE.Color(characterAccentColor(index))
    });

    const rimPlane = new THREE.Mesh(geometry, rimMaterial);
    rimPlane.name = `CharacterRim_${assetId}`;
    rimPlane.position.set(0, 0, -0.075);
    rimPlane.scale.set(1.025, 1.025, 1);
    rimPlane.renderOrder = 5;
    imageRoot.add(rimPlane);

    const bodyPlane = new THREE.Mesh(geometry, bodyMaterial);
    bodyPlane.name = `CharacterBody_${assetId}`;
    bodyPlane.renderOrder = 6;
    imageRoot.add(bodyPlane);

    const eyeGlintPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.04),
      new THREE.MeshBasicMaterial({
        map: createEyeGlintTexture(),
        color: 0xffe4a6,
        transparent: true,
        opacity: index === 1 ? 0.24 : 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    eyeGlintPlane.name = `CharacterEyeGlints_${assetId}`;
    eyeGlintPlane.position.copy(characterEyeGlintPosition(index));
    eyeGlintPlane.renderOrder = 8;
    imageRoot.add(eyeGlintPlane);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x090201,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.46), shadowMaterial);
    shadowPlane.name = `CharacterShadow_${assetId}`;
    shadowPlane.position.set(0, 0.12, 0.1);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.renderOrder = 2;
    group.add(shadowPlane);

    const glow = new THREE.PointLight(characterAccentColor(index), 0.62, 3.2, 2);
    glow.name = `CharacterGlow_${assetId}`;
    glow.position.set(0, 1.32, 0.24);
    group.add(glow);
    const chamberIndicator = createSeatChamberIndicatorGroup(index);
    group.add(chamberIndicator.group);
    const nameplate = createSeatNameplateRig(index);
    group.add(nameplate.group);

    return {
      group,
      character: {
        assetId,
        imageRoot,
        bodyPlane,
        rimPlane,
        eyeGlintPlane,
        shadowPlane,
        glow,
        baseImageY: imageRoot.position.y,
        baseImageZ: imageRoot.position.z
      },
      chamberIndicator: chamberIndicator.group,
      chamberDots: chamberIndicator.dots,
      nameplate,
      pose: "idle",
      baseRotation: definition.rotation,
      baseY: group.position.y,
      baseX: group.position.x,
      baseZ: group.position.z,
      baseScale: group.scale.clone()
    };
  }

  function installToyRoulette() {
    const group = cloneAsset("toy-roulette");
    group.name = "LoadedToyRoulette";
    group.position.copy(tablePoint("roulette"));
    group.rotation.set(-0.12, -0.56, -0.05);
    group.scale.setScalar(1.12);
    group.visible = false;
    tableRoot.add(group);
    toy = makeToyRig(group);
  }

  function installFallbackToyRoulette() {
    const group = createFallbackToy();
    group.position.copy(tablePoint("roulette"));
    group.rotation.set(-0.12, -0.56, -0.05);
    group.visible = false;
    tableRoot.add(group);
    toy = makeToyRig(group);
  }

  function syncSceneState(next: ScenePropsSnapshot) {
    props = {
      ...props,
      ...next,
      pileCount: next.pileCount ?? 0,
      voiceStates: next.voiceStates ?? props.voiceStates ?? {},
      localPlayerId: next.localPlayerId ?? props.localPlayerId,
      localHand: next.localHand ?? props.localHand ?? [],
      selectedCardIds: next.selectedCardIds ?? props.selectedCardIds ?? [],
      soloPhase: next.soloPhase ?? props.soloPhase,
      botThinkingPlayerId: next.botThinkingPlayerId ?? props.botThinkingPlayerId
    };
    if (!ready) {
      return;
    }
    syncLocalHandVisuals();
    if (!pileAnimationInFlight) {
      refreshPile();
    }
    focusPlayer(props.currentTurnPlayerId);
  }

  async function playBeat(beat: CinematicBeat) {
    const generation = animationGeneration;
    setActiveBeat(beat.type);

    if (beat.type === "round") {
      await playSceneTimeline("round-start", roundTimeline(beat), generation);
    } else if (beat.type === "play") {
      await playSceneTimeline("card-play", playCardsTimeline(beat), generation);
    } else if (beat.type === "challenge") {
      await playSceneTimeline("liar-impact", challengeTimeline(beat), generation);
    } else if (beat.type === "roulette") {
      await playSceneTimeline("roulette", rouletteTimeline(beat), generation);
    } else if (beat.type === "elimination") {
      await playSceneTimeline("elimination", eliminationTimeline(beat.playerId), generation);
    } else if (beat.type === "winner") {
      await playSceneTimeline("winner", winnerTimeline(beat.playerId), generation);
    }

    if (generation === animationGeneration) {
      setActiveBeat("idle");
      activeTimeline = "idle";
    }
  }

  function roundTimeline(beat: Extract<CinematicBeat, { type: "round" }>): SceneTimelineStep {
    return {
      type: "sequence",
      label: "round-start",
      steps: [
        {
          type: "parallel",
          label: "round-focus",
          steps: [
            { type: "action", label: "focus-table", run: () => setCameraPreset("table") },
            {
              type: "tween",
              label: "table-rank-flip",
              durationMs: 640,
              update: (progress) => {
                if (!tableRankCard) return;
                const eased = easeInOutCubic(progress);
                tableRankCard.position.y = tablePoint("rank").y + Math.sin(progress * Math.PI) * 0.42;
                tableRankCard.rotation.y = -0.38 + eased * Math.PI;
                tableRankCard.rotation.z = 0.08 + Math.sin(progress * Math.PI) * 0.12;
                tableRankCard.scale.setScalar(1.28 + Math.sin(progress * Math.PI) * 0.12);
                if (progress > 0.46) {
                  setRankCard(beat.tableRank);
                }
              },
              complete: () => {
                if (!tableRankCard) return;
                tableRankCard.position.copy(tablePoint("rank"));
                tableRankCard.rotation.set(-0.25, -0.38, 0.08);
                tableRankCard.scale.setScalar(1.28);
              }
            }
          ]
        },
        { type: "wait", label: "rank-anticipation", durationMs: 180 },
        { type: "action", label: "deal-cards", run: () => dealCards(beat.playerIds, beat.roundNumber, beat.tableRank) },
        { type: "wait", label: "deal-settle", durationMs: 1280 },
        { type: "action", label: "round-idle", run: () => (cardMotionState = "idle") }
      ]
    };
  }

  function playCardsTimeline(beat: Extract<CinematicBeat, { type: "play" }>): SceneTimelineStep {
    return {
      type: "sequence",
      label: "card-play",
      steps: [
        { type: "action", label: "card-play-focus", run: () => setCameraPreset("cardPlay", beat.playerId) },
        { type: "wait", label: "play-anticipation", durationMs: 190 },
        {
          type: "parallel",
          label: "throw-and-react",
          steps: [
            { type: "action", label: "throw-cards", run: () => throwCards(beat.playerId, beat.cardCount) },
            { type: "tween", label: "table-impact", durationMs: 1080, update: tableImpactTween(0.042) }
          ]
        },
        { type: "wait", label: "cards-settle", durationMs: 760 },
        { type: "action", label: "card-play-idle", run: () => (cardMotionState = "settled") }
      ]
    };
  }

  function challengeTimeline(beat: Extract<CinematicBeat, { type: "challenge" }>): SceneTimelineStep {
    return {
      type: "sequence",
      label: "liar-impact",
      steps: [
        {
          type: "parallel",
          label: "liar-punch",
          steps: [
            { type: "action", label: "liar-camera", run: () => setCameraPreset("liarImpact", beat.callerId, beat.accusedId) },
            { type: "action", label: "liar-impact", run: () => playLiarImpact(beat.callerId, beat.accusedId) },
            { type: "tween", label: "red-sweep", durationMs: 620, update: redSweepTween }
          ]
        },
        { type: "wait", label: "accusation-hold", durationMs: 520 },
        { type: "action", label: "reveal-camera", run: () => setCameraPreset("reveal", beat.accusedId) },
        { type: "action", label: "reveal-cards", run: () => revealCards(beat.callerId, beat.accusedId, beat.revealedCards, beat.liarCardIds) },
        { type: "wait", label: "reveal-settle", durationMs: 1800 }
      ]
    };
  }

  function rouletteTimeline(beat: Extract<CinematicBeat, { type: "roulette" }>): SceneTimelineStep {
    const resultHoldMs = beat.result === "LETHAL" ? 2400 : 1650;
    return {
      type: "sequence",
      label: "roulette",
      steps: [
        { type: "action", label: "roulette-prepare", run: () => prepareRouletteCutscene(beat.playerId, beat.result) },
        {
          type: "parallel",
          label: "roulette-ready",
          steps: [
            { type: "tween", label: "gun-ready", durationMs: 760, update: rouletteEnterTween(beat.playerId, beat.result) },
            { type: "tween", label: "target-dread", durationMs: 760, update: rouletteSeatTween(beat.playerId, 0.24) }
          ]
        },
        {
          type: "parallel",
          label: "roulette-aim-hold",
          steps: [
            { type: "tween", label: "roulette-gun-aim", durationMs: 1120, update: rouletteAimTween(beat.playerId, beat.result) },
            { type: "tween", label: "target-brace", durationMs: 1120, update: rouletteSeatTween(beat.playerId, 0.36) }
          ]
        },
        { type: "wait", label: "roulette-suspense-hold", durationMs: 1180 },
        {
          type: "parallel",
          label: "roulette-fire",
          steps: [
            { type: "tween", label: "trigger-squeeze", durationMs: 780, update: rouletteTriggerTween(beat.playerId, beat.result) },
            { type: "tween", label: "target-brace-fire", durationMs: 780, update: rouletteSeatTween(beat.playerId, beat.result === "LETHAL" ? 0.48 : 0.32) }
          ]
        },
        {
          type: "action",
          label: "roulette-result",
          run: () => {
            resolveRouletteCutscene(beat.playerId, beat.result);
          }
        },
        {
          type: "parallel",
          label: "roulette-result-burst",
          steps: [
            { type: "tween", label: "water-result-effect", durationMs: resultHoldMs, update: rouletteBurstTween(beat.playerId, beat.result) },
            { type: "tween", label: "roulette-result-character", durationMs: resultHoldMs, update: rouletteResultSeatTween(beat.playerId, beat.result) }
          ]
        },
        { type: "action", label: "roulette-settle", run: () => settleRouletteCutscene(beat.playerId, beat.result) },
        { type: "wait", label: "roulette-result-hold", durationMs: beat.result === "LETHAL" ? 1300 : 1000 }
      ]
    };
  }

  function eliminationTimeline(playerId: string): SceneTimelineStep {
    return {
      type: "sequence",
      label: "elimination",
      steps: [
        { type: "action", label: "loss-camera", run: () => setCameraPreset("roulette", playerId) },
        { type: "action", label: "loss", run: () => playLoss(playerId) },
        { type: "wait", label: "loss-hold", durationMs: 1040 }
      ]
    };
  }

  function winnerTimeline(playerId: string): SceneTimelineStep {
    return {
      type: "sequence",
      label: "winner",
      steps: [
        { type: "action", label: "winner-camera", run: () => setCameraPreset("winner", playerId) },
        { type: "action", label: "winner", run: () => playWin(playerId) },
        { type: "wait", label: "winner-hold", durationMs: 1380 }
      ]
    };
  }

  async function playSceneTimeline(name: string, timeline: SceneTimelineStep, generation: number) {
    activeTimeline = name;
    await runSceneTimeline(timeline, generation);
    if (generation === animationGeneration) {
      completedTimelines = [...completedTimelines.slice(-7), name];
    }
  }

  async function runSceneTimeline(step: SceneTimelineStep, generation: number): Promise<void> {
    if (generation !== animationGeneration) {
      throw new Error("Animation cancelled");
    }

    if (step.type === "action") {
      step.run();
    } else if (step.type === "wait") {
      await delay(step.durationMs, generation);
    } else if (step.type === "tween") {
      await animate(step.durationMs, step.update, step.complete);
    } else if (step.type === "parallel") {
      await Promise.all(step.steps.map((child) => runSceneTimeline(child, generation)));
    } else {
      for (const child of step.steps) {
        await runSceneTimeline(child, generation);
      }
    }

    if (generation !== animationGeneration) {
      throw new Error("Animation cancelled");
    }
  }

  function cancelAnimations() {
    animationGeneration += 1;
    tweens.forEach((tween) => tween.resolve?.());
    tweens.length = 0;
    shakeUntil = 0;
    activeTimeline = "idle";
    completedTimelines = [];
    queuedTimelineCount = 0;
    cardMotionState = "idle";
    pileAnimationInFlight = false;
    clearGroup(motionCards);
    setActiveBeat("idle");
  }

  function dealCards(playerIds: string[], _roundNumber: number, tableRank: Card["rank"]) {
    if (!ready) {
      return;
    }
    cardMotionState = "dealing";
    resetRoundVisuals();
    cardMotionState = "dealing";
    refreshPile(0);
    setRankCard(tableRank);
    syncLocalHandVisuals();
    focusPlayer(props.currentTurnPlayerId);

    const dealMotionCards: THREE.Object3D[] = [];
    let completedDealCards = 0;
    const totalDealCards = playerIds.length * 5;
    const clearDealMotionCards = () => {
      completedDealCards += 1;
      if (completedDealCards < totalDealCards) {
        return;
      }
      dealMotionCards.forEach((card) => {
        if (card.parent === motionCards) {
          motionCards.remove(card);
        }
      });
      if (cardMotionState === "dealing") {
        cardMotionState = "idle";
      }
    };

    playerIds.forEach((playerId, playerSeatIndex) => {
      const anchor = seatAnchor(playerId, 0.46);
      const rig = seats[findPlayerIndex(playerId)];
      setSeatPose(rig, "thinking");
      pulseSeat(rig, 0.18);
      for (let index = 0; index < 5; index += 1) {
        const card = createCard(undefined, false);
        const start = tablePoint("deck").clone().add(new THREE.Vector3(0, 0.3 + index * 0.018, 0));
        const end = anchor.clone().add(new THREE.Vector3((index - 2) * 0.12, 0.12 + index * 0.018, 0.12));
        card.position.copy(start);
        card.rotation.set(-0.12, 0.25, index * 0.04);
        dealMotionCards.push(card);
        motionCards.add(card);
        animate(
          720 + index * 48 + playerSeatIndex * 110,
          (progress) => {
            const eased = easeOutCubic(progress);
            card.position.lerpVectors(start, end, eased);
            card.position.y += Math.sin(progress * Math.PI) * 1.02;
            card.rotation.y = 0.2 + eased * Math.PI * 1.68;
            card.rotation.z = index * 0.04 + eased * 0.56 + Math.sin(progress * Math.PI) * 0.12;
            card.scale.setScalar(0.72 + Math.sin(progress * Math.PI) * 0.16);
          },
          clearDealMotionCards
        );
      }
    });

    handCards.forEach((card, index) => {
      if (!card.visible) {
        return;
      }
      const base = card.userData.basePosition as THREE.Vector3;
      const baseRotation = card.userData.baseRotation as THREE.Euler;
      const start = tablePoint("deck").clone().add(new THREE.Vector3(0, 0.2, 0));
      card.position.copy(start);
      animate(700 + index * 78, (progress) => {
        const eased = easeOutBack(progress);
        card.position.lerpVectors(start, base, eased);
        card.position.y += Math.sin(progress * Math.PI) * 0.54;
        card.rotation.x = baseRotation.x + Math.sin(progress * Math.PI) * 0.12;
        card.rotation.y = lerp(0.25, baseRotation.y, eased);
        card.rotation.z = baseRotation.z + Math.sin(progress * Math.PI) * 0.28;
      });
    });
  }

  function throwCards(playerId: string, cardCount: number) {
    if (!ready) {
      return;
    }
    cardMotionState = "throwing";
    pileAnimationInFlight = true;
    focusPlayer(playerId);
    clearGroup(motionCards);
    const startAnchor = seatAnchor(playerId, 0.64);
    const localHandStarts = playerId === props.localPlayerId ? recentSelectedHandStarts.slice(0, cardCount) : [];
    recentSelectedHandStarts = [];
    const targetPileCount = Math.max(cardCount, props.pileCount || 0, visualPileCount);
    const previousPileCount = Math.max(0, targetPileCount - cardCount);
    const firstLandingIndex = previousPileCount;
    const rig = seats[findPlayerIndex(playerId)];
    let completedCards = 0;
    refreshPile(previousPileCount);
    setSeatPose(rig, "play");
    animateThrowArm(rig);

    for (let index = 0; index < cardCount; index += 1) {
      const card = createCard(undefined, false);
      const localStart = localHandStarts[index];
      const landingTransform = pileCardTransform(firstLandingIndex + index, targetPileCount);
      const end = tablePoint("pile").clone().add(landingTransform.position).add(new THREE.Vector3(0, 0.12, 0));
      const start = localStart?.position.clone().add(new THREE.Vector3(0, 0.16, 0)) ?? startAnchor.clone();
      card.position.copy(start);
      if (localStart) {
        card.rotation.copy(localStart.rotation);
      } else {
        card.rotation.set(-0.28, 0.22, index * 0.1);
      }
      motionCards.add(card);
      animate(
        1020 + index * 150,
        (progress) => {
          const eased = easeInOutCubic(progress);
          const landingProgress = Math.max(0, (progress - 0.78) / 0.22);
          const anticipation = Math.sin(Math.min(progress / 0.24, 1) * Math.PI) * (1 - Math.min(progress / 0.24, 1));
          card.position.lerpVectors(start, end, eased);
          card.position.z -= anticipation * 0.3;
          card.position.y += Math.sin(progress * Math.PI) * 1.68 + Math.sin(landingProgress * Math.PI) * 0.26;
          card.rotation.y = lerp(0.22, landingTransform.rotation.y + eased * Math.PI * 3.4, eased);
          card.rotation.z = lerp(index * 0.1, landingTransform.rotation.z, eased) + Math.sin(landingProgress * Math.PI) * 0.22;
          card.scale.setScalar(0.72 + Math.sin(progress * Math.PI) * 0.22 - landingProgress * 0.03);
        },
        () => {
          completedCards += 1;
          if (completedCards >= cardCount) {
            pileAnimationInFlight = false;
            refreshPile(targetPileCount);
            clearGroup(motionCards);
            cardMotionState = "settled";
          }
        }
      );
    }
  }

  function revealCards(callerId: string, accusedId: string, revealedCards: Card[], liarCardIds: string[]) {
    if (!ready) {
      return;
    }
    cardMotionState = "revealing";
    focusPlayer(accusedId);
    clearGroup(revealGroup);
    const accusedRig = seats[findPlayerIndex(accusedId)];
    const callerRig = seats[findPlayerIndex(callerId)];
    setSeatPose(accusedRig, "accused");
    setSeatPose(callerRig, "accuse");
    pulseSeat(accusedRig, 0.35);
    pulseSeat(callerRig, 0.2);

    revealedCards.forEach((card, index) => {
      const isLiar = liarCardIds.includes(card.id);
      const meshCard = createCard(card.rank, true, isLiar);
      const start = new THREE.Vector3(index * 0.18, 0.42, -0.56);
      const target = new THREE.Vector3(index * 0.52, 0.04, 0);
      meshCard.position.copy(start);
      meshCard.rotation.set(-0.2, Math.PI / 2, -0.15);
      revealGroup.add(meshCard);
      animate(
        980 + index * 220,
        (progress) => {
          const eased = easeOutCubic(progress);
          meshCard.position.lerpVectors(start, target, eased);
          meshCard.rotation.y = Math.PI / 2 - eased * Math.PI / 2;
          meshCard.position.y += Math.sin(progress * Math.PI) * 0.7;
          meshCard.rotation.z = -0.18 + Math.sin(progress * Math.PI) * 0.28;
          meshCard.scale.setScalar(1 + Math.sin(progress * Math.PI) * (isLiar ? 0.24 : 0.14));
        },
        () => {
          if (index === revealedCards.length - 1) {
            cardMotionState = "settled";
          }
        }
      );
    });
  }

  function focusPlayer(playerId?: string) {
    if (!playerId) {
      setCameraPreset(props.phase === "lobby" ? "lobby" : "table");
      if (!props.hasChallenge) {
        seats.forEach((seat) => {
          setSeatPose(seat, "idle");
          setSeatHighlight(seat, 0.08);
        });
      }
      return;
    }

    const index = findPlayerIndex(playerId);
    if (index < 0) {
      focusPlayer(undefined);
      return;
    }

    setCameraPreset("activeSeat", playerId);
    if (!props.hasChallenge) {
      seats.forEach((seat, seatIndex) => {
        const player = props.players[seatIndex];
        if (!player || player.eliminated) {
          return;
        }
        if (seatIndex === index) {
          setSeatPose(seat, "active");
          setSeatHighlight(seat, 0.32);
        } else {
          setSeatPose(seat, "idle");
          setSeatHighlight(seat, 0.08);
        }
      });
    }
  }

  function setCameraPreset(preset: CameraPresetId, primaryPlayerId?: string, secondaryPlayerId?: string) {
    cameraPreset = preset;
    if (preset === "lobby") {
      setDesiredCamera(new THREE.Vector3(0, 3.05, 6.45), new THREE.Vector3(0, 0.74, -0.12), "lobby");
      return;
    }
    if (preset === "table") {
      const frame = localPlayerCameraFrame("table");
      setDesiredCamera(frame.position, frame.target, "player");
      return;
    }

    const index = primaryPlayerId ? findPlayerIndex(primaryPlayerId) : -1;
    if (index < 0) {
      const frame = localPlayerCameraFrame("table");
      setDesiredCamera(frame.position, frame.target, "player");
      return;
    }
    const seat = seatWorld(index);

    if (preset === "activeSeat") {
      const frame = localPlayerCameraFrame("table");
      const activeTarget = new THREE.Vector3(seat.x * 0.24, 0.96, seat.z * 0.16);
      setDesiredCamera(frame.position, frame.target.clone().lerp(activeTarget, primaryPlayerId === props.localPlayerId ? 0.08 : 0.18), "player");
      return;
    }
    if (preset === "cardPlay") {
      const frame = localPlayerCameraFrame("cardPlay");
      const playTarget = new THREE.Vector3(seat.x * 0.1, 0.72, seat.z * 0.05);
      setDesiredCamera(frame.position, frame.target.clone().lerp(playTarget, primaryPlayerId === props.localPlayerId ? 0.06 : 0.12), "player");
      return;
    }
    if (preset === "liarImpact") {
      const secondaryIndex = secondaryPlayerId ? findPlayerIndex(secondaryPlayerId) : -1;
      const secondarySeat = secondaryIndex >= 0 ? seatWorld(secondaryIndex) : seat;
      const frame = localPlayerCameraFrame("table");
      const accusationTarget = new THREE.Vector3((seat.x + secondarySeat.x) * 0.16, 1.0, (seat.z + secondarySeat.z) * 0.08);
      setDesiredCamera(frame.position, frame.target.clone().lerp(accusationTarget, 0.14), "player");
      return;
    }
    if (preset === "reveal") {
      const frame = localPlayerCameraFrame("cardPlay");
      setDesiredCamera(frame.position, frame.target.clone().lerp(new THREE.Vector3(-0.16, 0.86, 0.28), 0.22), "player");
      return;
    }
    if (preset === "roulette") {
      const frame = localPlayerCameraFrame("table");
      const targetSeat = seatAnchor(primaryPlayerId ?? "", 0.86);
      const rouletteTarget = tableRoot.localToWorld(tablePoint("rouletteCenter").add(new THREE.Vector3(0, 0.1, 0))).lerp(targetSeat, 0.2);
      setDesiredCamera(frame.position, frame.target.clone().lerp(rouletteTarget, 0.16), "player");
      return;
    }
    const frame = localPlayerCameraFrame("table");
    setDesiredCamera(frame.position, frame.target.clone().lerp(new THREE.Vector3(seat.x * 0.2, 0.98, seat.z * 0.12), 0.18), "player");
  }

  function setDesiredCamera(position: THREE.Vector3, target: THREE.Vector3, mode: CinematicSceneSnapshot["cameraMode"]) {
    cameraMode = mode;
    cameraPositionTarget.copy(position);
    cameraTarget.copy(target);
  }

  function localPlayerCameraFrame(kind: "table" | "cardPlay") {
    const localIndex = props.localPlayerId ? findPlayerIndex(props.localPlayerId) : -1;
    const fallbackIndex = props.players.length > 0 ? Math.min(props.players.length - 1, 3) : 3;
    const seat = seatWorld(localIndex >= 0 ? localIndex : fallbackIndex);
    const direction = new THREE.Vector3(seat.x, 0, seat.z);
    if (direction.lengthSq() < 0.001) {
      direction.set(0, 0, 1);
    }
    direction.normalize();
    const tangent = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const position = direction
      .clone()
      .multiplyScalar(kind === "cardPlay" ? 5.15 : 7.25)
      .add(tangent.clone().multiplyScalar(0.08))
      .add(new THREE.Vector3(0, kind === "cardPlay" ? 2.42 : 3.18, 0));
    const target = new THREE.Vector3(0, kind === "cardPlay" ? 1.04 : 1.24, 0.02);
    return { position, target };
  }

  function playLiarImpact(callerId: string, accusedId: string) {
    if (!ready) {
      return;
    }
    setCameraPreset("liarImpact", callerId, accusedId);
    redLight.intensity = 5.0;
    const callerSeat = seats[findPlayerIndex(callerId)];
    const accusedSeat = seats[findPlayerIndex(accusedId)];
    setSeatPose(callerSeat, "accuse");
    setSeatPose(accusedSeat, "accused");
    pulseSeat(callerSeat, 0.24);
    pulseSeat(accusedSeat, 0.2);
    animate(900, (progress) => {
      redLight.intensity = 5.0 - progress * 3.1;
      tableRoot.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.006);
      cyanLight.intensity = 1.2 + Math.sin(progress * Math.PI) * 1.0;
    });
  }

  function prepareRouletteCutscene(playerId: string, result: "BLANK" | "LETHAL") {
    if (!ready || !toy) {
      return;
    }
    setRouletteStage("entering", false);
    rouletteVisualResult = getRouletteVisualResult(result);
    aimedPlayerId = playerId;
    waterStreamVisible = false;
    waterSplashVisible = false;
    setCameraPreset("roulette", playerId);

    toy.group.visible = true;
    toy.group.position.copy(toy.basePosition);
    toy.group.rotation.copy(toy.baseRotation);
    toy.group.scale.copy(toy.baseScale);
    toy.chamber.rotation.z = 0;
    toy.trigger.rotation.x = 0;
    toy.pump.position.copy(toy.pumpBasePosition);
    setRouletteBurst(toy, result, 0);
    toy.burst.visible = false;
    hideWaterEffects(toy);
    setRouletteLight(toy, 0xffe071, 0.18);

    const rouletteSeat = seats[findPlayerIndex(playerId)];
    setSeatPose(rouletteSeat, "roulette");
    setSeatHighlight(rouletteSeat, 0.36);
    redLight.intensity = 1.0;
    cyanLight.intensity = 1.25;
    tableSpot.intensity = 6.8;
  }

  function rouletteEnterTween(playerId: string, result: "BLANK" | "LETHAL") {
    let startPosition: THREE.Vector3 | undefined;
    let startRotation: THREE.Euler | undefined;
    let startScale: THREE.Vector3 | undefined;
    const target = tablePoint("rouletteCenter").clone().add(new THREE.Vector3(0, 0.24, 0));
    const closeScale = new THREE.Vector3(1.68, 1.68, 1.68);
    return (progress: number) => {
      if (!toy) return;
      startPosition ??= toy.group.position.clone();
      startRotation ??= toy.group.rotation.clone();
      startScale ??= toy.group.scale.clone();
      const eased = easeInOutCubic(progress);
      const lift = Math.sin(progress * Math.PI);
      setRouletteStage("entering", false);
      toy.group.position.lerpVectors(startPosition, target, eased);
      toy.group.position.y += lift * 0.16 + Math.sin(progress * Math.PI * 5) * 0.018;
      toy.group.scale.lerpVectors(startScale, closeScale, easeOutCubic(progress));
      toy.group.rotation.x = startRotation.x + lift * 0.2 - eased * 0.06;
      toy.group.rotation.y = startRotation.y - eased * 0.7;
      toy.group.rotation.z = startRotation.z + Math.sin(progress * Math.PI * 2) * 0.035;
      setRouletteLight(toy, 0xffe071, 0.22 + lift * 0.34);
      setSeatHighlight(seats[findPlayerIndex(playerId)], 0.28 + lift * 0.42);
    };
  }

  function rouletteSeatTween(playerId: string, amount: number) {
    let baseY = 0;
    let baseScale: THREE.Vector3 | undefined;
    let imageBaseY = 0;
    let imageBaseZ = 0;
    let initialized = false;
    return (progress: number) => {
      const seat = seats[findPlayerIndex(playerId)];
      if (!seat) return;
      if (!initialized) {
        baseScale = seat.group.scale.clone();
        baseY = seat.group.position.y;
        if (seat.character) {
          imageBaseY = seat.character.imageRoot.position.y;
          imageBaseZ = seat.character.imageRoot.position.z;
        }
        initialized = true;
      }
      const brace = Math.sin(progress * Math.PI);
      seat.group.position.y = baseY + brace * amount * 0.26;
      seat.group.scale.setScalar((baseScale?.x ?? 1) + brace * amount * 0.08);
      if (seat.character) {
        seat.character.imageRoot.position.y = imageBaseY + brace * amount * 0.16;
        seat.character.imageRoot.position.z = imageBaseZ + brace * amount * 0.22;
        seat.character.imageRoot.rotation.z = -brace * amount * 0.18;
      }
      setSeatHighlight(seat, 0.24 + brace * amount * 1.35);
    };
  }

  function rouletteSpinTween(result: "BLANK" | "LETHAL") {
    let startRotation = 0;
    let startGroupRotation: THREE.Euler | undefined;
    const spinTurns = result === "LETHAL" ? 8.9 : 6.8;
    return (progress: number) => {
      if (!toy) return;
      if (!startGroupRotation) {
        startRotation = toy.chamber.rotation.z;
        startGroupRotation = toy.group.rotation.clone();
      }
      const eased = easeInOutCubic(progress);
      const vibration = Math.sin(progress * Math.PI * 26) * (1 - progress * 0.25) * 0.55;
      setRouletteStage("spinning", false);
      toy.chamber.rotation.z = startRotation + eased * Math.PI * 2 * spinTurns + vibration * 0.035;
      toy.group.rotation.x = startGroupRotation.x + Math.sin(progress * Math.PI * 3) * 0.018;
      toy.group.rotation.y = startGroupRotation.y - Math.sin(progress * Math.PI) * 0.055;
      toy.group.position.y = tablePoint("rouletteCenter").y + 0.24 + Math.sin(progress * Math.PI * 4) * 0.012;
      setRouletteLight(toy, 0xffe071, 0.34 + Math.abs(vibration) * 0.9);
      redLight.intensity = 0.9 + Math.sin(progress * Math.PI) * 0.8;
      tableSpot.intensity = 6.0 + Math.sin(progress * Math.PI * 2) * 0.5;
    };
  }

  function rouletteLightTween(result: "BLANK" | "LETHAL") {
    return (progress: number) => {
      if (!toy) return;
      const pulse = Math.sin(progress * Math.PI);
      const warning = progress > 0.72 ? easeOutCubic((progress - 0.72) / 0.28) : 0;
      const color = warning > 0.45 ? 0x8edfff : 0xffe071;
      setRouletteLight(toy, color, 0.36 + pulse * 0.8 + warning * 1.0);
      cyanLight.intensity = 1.0 + warning * 1.3;
      redLight.intensity = 0.78 + warning * 0.9;
    };
  }

  function roulettePumpTween() {
    let startPumpPosition: THREE.Vector3 | undefined;
    let startGroupPosition: THREE.Vector3 | undefined;
    let startGroupRotation: THREE.Euler | undefined;
    return (progress: number) => {
      if (!toy) return;
      startPumpPosition ??= toy.pump.position.clone();
      startGroupPosition ??= toy.group.position.clone();
      startGroupRotation ??= toy.group.rotation.clone();
      setRouletteStage("spinning", false);
      const pull = Math.sin(progress * Math.PI);
      toy.pump.position.copy(startPumpPosition);
      toy.pump.position.x -= pull * 0.2;
      toy.group.position.copy(startGroupPosition);
      toy.group.position.y += Math.sin(progress * Math.PI * 2) * 0.025;
      toy.group.rotation.z = startGroupRotation.z + Math.sin(progress * Math.PI * 3) * 0.024;
      setRouletteLight(toy, 0x8edfff, 0.7 + pull * 1.1);
      cyanLight.intensity = 1.25 + pull * 1.1;
      redLight.intensity = 0.7 + pull * 0.4;
    };
  }

  function rouletteAimTween(playerId: string, result: "BLANK" | "LETHAL") {
    let startRotation: THREE.Euler | undefined;
    let startPosition: THREE.Vector3 | undefined;
    const target = tablePoint("rouletteCenter").clone().add(new THREE.Vector3(0, 0.24, 0));
    return (progress: number) => {
      if (!toy) return;
      startRotation ??= toy.group.rotation.clone();
      startPosition ??= toy.group.position.clone();
      const eased = easeInOutCubic(progress);
      const targetSeat = seatAnchor(playerId, result === "LETHAL" ? 1.08 : 0.96);
      const aimDirection = targetSeat.clone().sub(target).normalize();
      const yaw = Math.atan2(-aimDirection.z, aimDirection.x);
      const pitch = Math.atan2(aimDirection.y, Math.max(0.001, Math.hypot(aimDirection.x, aimDirection.z)));
      setRouletteStage("aiming", false);
      aimedPlayerId = playerId;
      toy.group.position.lerpVectors(startPosition, target, eased);
      toy.group.position.y += Math.sin(progress * Math.PI) * 0.05;
      toy.group.rotation.x = lerp(startRotation.x, startRotation.x - pitch * 0.42, eased);
      toy.group.rotation.y = lerp(startRotation.y, yaw, eased);
      toy.group.rotation.z = lerp(startRotation.z, startRotation.z - pitch * 0.62, eased);
      setRouletteLight(toy, 0xffe071, 0.72 + Math.sin(progress * Math.PI) * 1.0);
      setSeatHighlight(seats[findPlayerIndex(playerId)], 0.34 + Math.sin(progress * Math.PI) * 0.62);
    };
  }

  function rouletteTriggerTween(playerId: string, result: "BLANK" | "LETHAL") {
    let startRotation = 0;
    let startGroupRotation: THREE.Euler | undefined;
    let startPosition: THREE.Vector3 | undefined;
    return (progress: number) => {
      if (!toy) return;
      if (!startGroupRotation) {
        startRotation = toy.chamber.rotation.z;
        startGroupRotation = toy.group.rotation.clone();
        startPosition = toy.group.position.clone();
      }
      setRouletteStage("trigger", false);
      aimedPlayerId = playerId;
      const squeeze = easeInOutCubic(progress);
      const brace = Math.sin(progress * Math.PI);
      toy.trigger.rotation.x = -0.08 - squeeze * 0.86;
      toy.chamber.rotation.z = startRotation + easeOutCubic(progress) * Math.PI * 2 * (result === "LETHAL" ? 1.16 : 0.74);
      toy.group.position.copy(startPosition ?? tablePoint("rouletteCenter"));
      toy.group.position.y += -brace * 0.09;
      toy.group.position.z += brace * 0.1;
      toy.group.rotation.x = startGroupRotation.x - brace * 0.24;
      toy.group.rotation.z = startGroupRotation.z + Math.sin(progress * Math.PI * 2) * 0.068;
      setRouletteLight(toy, progress > 0.78 ? 0x8edfff : 0xffe071, 0.8 + squeeze * 1.9);
      redLight.intensity = 0.72 + brace * 0.46;
      cyanLight.intensity = 1.15 + squeeze * 1.1;
    };
  }

  function resolveRouletteCutscene(playerId: string, result: "BLANK" | "LETHAL") {
    if (!toy) {
      return;
    }
    setRouletteStage(result === "LETHAL" ? "waterShot" : "dryFire", false);
    rouletteVisualResult = getRouletteVisualResult(result);
    aimedPlayerId = playerId;
    toy.burst.visible = false;
    setRouletteBurst(toy, result, 0);
    setRouletteLight(toy, result === "LETHAL" ? 0x57e9ff : 0xffe071, result === "LETHAL" ? 3.2 : 2.35);
    const seat = seats[findPlayerIndex(playerId)];
    setSeatPose(seat, result === "LETHAL" ? "eliminated" : "relief");
    if (result === "LETHAL") {
      positionWaterShot(playerId, 0.18);
      cyanLight.intensity = 4.2;
      redLight.intensity = 1.3;
      tableSpot.intensity = 5.7;
      return;
    }
    hideWaterEffects(toy);
    redLight.intensity = 0.42;
    cyanLight.intensity = 2.0;
    tableSpot.intensity = 7.0;
  }

  function rouletteBurstTween(playerId: string, result: "BLANK" | "LETHAL") {
    let startScale: THREE.Vector3 | undefined;
    let startRotation: THREE.Euler | undefined;
    const target = tablePoint("rouletteCenter").clone().add(new THREE.Vector3(0, 0.24, 0));
    return (progress: number) => {
      if (!toy) return;
      startScale ??= toy.group.scale.clone();
      startRotation ??= toy.group.rotation.clone();
      const pulse = Math.sin(progress * Math.PI);
      const eased = easeOutCubic(progress);
      if (result === "LETHAL") {
        setRouletteStage(progress > 0.48 ? "splash" : "waterShot", progress > 0.48);
        positionWaterShot(playerId, progress);
      } else {
        setRouletteStage("dryFire", progress > 0.32);
        hideWaterEffects(toy);
        positionDryPuff(progress);
      }
      toy.trigger.rotation.x = -0.94 + eased * 0.94;
      toy.group.position.copy(target);
      toy.group.position.y += pulse * (result === "LETHAL" ? 0.06 : 0.045);
      toy.group.scale.setScalar(startScale.x + pulse * (result === "LETHAL" ? 0.2 : 0.09));
      toy.group.rotation.x = startRotation.x + Math.sin(progress * Math.PI * 3) * (result === "LETHAL" ? 0.045 : 0.035);
      toy.group.rotation.z = startRotation.z + Math.sin(progress * Math.PI * 4) * (result === "LETHAL" ? 0.055 : 0.032);
      redLight.intensity = result === "LETHAL" ? 1.0 + pulse * 0.5 : 0.52;
      cyanLight.intensity = result === "LETHAL" ? 2.8 + pulse * 2.2 : 2.4 + pulse * 1.3;
      tableSpot.intensity = result === "LETHAL" ? 5.0 + pulse * 1.8 : 6.2 + pulse * 1.0;
    };
  }

  function rouletteResultSeatTween(playerId: string, result: "BLANK" | "LETHAL") {
    let imageStartY = 0;
    let imageStartZ = 0;
    let groupStartY = 0;
    let startOpacity = 1;
    let initialized = false;
    return (progress: number) => {
      const seat = seats[findPlayerIndex(playerId)];
      if (!seat) return;
      if (!initialized) {
        imageStartY = seat.character?.imageRoot.position.y ?? 0;
        imageStartZ = seat.character?.imageRoot.position.z ?? 0;
        groupStartY = seat.group.position.y;
        startOpacity = seat.character ? seat.character.bodyPlane.material.uniforms.opacity.value : seat.bodyMaterial?.opacity ?? 1;
        initialized = true;
      }
      const eased = easeInOutCubic(progress);
      const recoil = Math.sin(progress * Math.PI);
      if (result === "BLANK") {
        setSeatPose(seat, "relief");
        seat.group.position.y = groupStartY + recoil * 0.08;
        if (seat.character) {
          seat.character.imageRoot.position.y = imageStartY + recoil * 0.12;
          seat.character.imageRoot.position.z = imageStartZ - recoil * 0.12;
          seat.character.imageRoot.rotation.z = recoil * 0.055;
        }
        setSeatHighlight(seat, 0.2 + recoil * 0.72);
        return;
      }
      setSeatPose(seat, "eliminated");
      seat.group.position.y = groupStartY - eased * 0.42;
      seat.group.rotation.z = -eased * 0.32;
      if (seat.character) {
        seat.character.imageRoot.position.y = imageStartY - eased * 0.22;
        seat.character.imageRoot.position.z = imageStartZ - eased * 0.18;
        seat.character.imageRoot.rotation.z = -eased * 0.18;
        seat.character.imageRoot.scale.setScalar(1 - eased * 0.08);
      }
      setSeatOpacity(seat, lerp(startOpacity, 0.34, eased));
    };
  }

  function settleRouletteCutscene(playerId: string, result: "BLANK" | "LETHAL") {
    const seat = seats[findPlayerIndex(playerId)];
    setRouletteStage(result === "LETHAL" ? "lethal" : "blank", true);
    rouletteVisualResult = getRouletteVisualResult(result);
    aimedPlayerId = playerId;
    if (toy) {
      toy.trigger.rotation.x = 0;
      setRouletteBurst(toy, result, 1);
      toy.burst.visible = false;
      if (result === "LETHAL") {
        hideWaterEffects(toy);
      } else {
        hideWaterEffects(toy);
        positionDryPuff(0.78);
      }
      setRouletteLight(toy, result === "LETHAL" ? 0x57e9ff : 0xffe071, result === "LETHAL" ? 1.35 : 0.7);
      toy.group.visible = false;
    }
    setSeatPose(seat, result === "LETHAL" ? "eliminated" : "relief");
    if (result === "BLANK") {
      redLight.intensity = 0.68;
      cyanLight.intensity = 2.0;
      tableSpot.intensity = 6.3;
    }
  }

  function playRoulette(playerId: string, result: "BLANK" | "LETHAL") {
    if (!ready || !toy) {
      return;
    }
    const generation = animationGeneration;
    void runSceneTimeline(
      {
        type: "sequence",
        label: "roulette-direct",
        steps: [
          { type: "action", label: "roulette-prepare", run: () => prepareRouletteCutscene(playerId, result) },
          { type: "tween", label: "gun-ready", durationMs: 680, update: rouletteEnterTween(playerId, result) },
          { type: "tween", label: "roulette-gun-aim", durationMs: 960, update: rouletteAimTween(playerId, result) },
          { type: "wait", label: "roulette-suspense-hold", durationMs: 1020 },
          { type: "tween", label: "trigger-squeeze", durationMs: 680, update: rouletteTriggerTween(playerId, result) },
          { type: "action", label: "roulette-result", run: () => resolveRouletteCutscene(playerId, result) },
          { type: "tween", label: "water-result-effect", durationMs: result === "LETHAL" ? 2200 : 1480, update: rouletteBurstTween(playerId, result) },
          { type: "action", label: "roulette-settle", run: () => settleRouletteCutscene(playerId, result) }
        ]
      },
      generation
    ).catch(() => undefined);
  }

  function playWin(playerId: string) {
    if (!ready) {
      return;
    }
    setCameraPreset("winner", playerId);
    const winnerIndex = findPlayerIndex(playerId);
    seats.forEach((seat, index) => {
      if (index === winnerIndex) {
        setSeatPose(seat, "winner");
        animate(1580, (progress) => {
          const lift = Math.sin(progress * Math.PI);
          seat.group.position.y = seat.baseY + lift * 0.56;
          seat.group.scale.setScalar(seat.baseScale.x + lift * 0.08);
          setSeatHighlight(seat, 0.35 + lift * 1.35);
          amberLight.intensity = 4.4 + lift * 2.2;
          tableSpot.intensity = 5.2 + lift * 5.1;
        });
      } else {
        fadeSeat(seat, 0.24);
      }
    });
  }

  function playLoss(playerId: string) {
    if (!ready) {
      return;
    }
    const seat = seats[findPlayerIndex(playerId)];
    if (!seat) {
      return;
    }
    setSeatPose(seat, "eliminated");
    animate(1180, (progress) => {
      const eased = easeInOutCubic(progress);
      seat.group.rotation.z = -eased * 0.5;
      seat.group.position.y = seat.baseY - eased * 0.46;
      seat.group.scale.setScalar(seat.baseScale.x - eased * 0.08);
      setSeatOpacity(seat, 1 - eased * 0.78);
      redLight.intensity = 1.1 + Math.sin(progress * Math.PI) * 3.8;
    });
  }

  function resetRoundVisuals() {
    const preserveResolvedRoulette =
      props.hasChallenge && resultUiUnlocked && (rouletteState === "blank" || rouletteState === "lethal");
    const previousRouletteState = rouletteState;
    const previousRouletteVisualResult = rouletteVisualResult;
    const previousAimedPlayerId = aimedPlayerId;

    clearGroup(motionCards);
    clearGroup(revealGroup);
    pileAnimationInFlight = false;
    if (!preserveResolvedRoulette) {
      setRouletteStage("idle", false);
    }
    rouletteVisualResult = preserveResolvedRoulette ? previousRouletteVisualResult : "dry";
    aimedPlayerId = preserveResolvedRoulette ? previousAimedPlayerId : undefined;
    waterStreamVisible = false;
    waterSplashVisible = false;
    cardMotionState = "idle";
    redLight.intensity = 1.05;
    tableRoot.scale.setScalar(1);
    toy?.group.position.copy(toy.basePosition);
    toy?.group.rotation.copy(toy.baseRotation);
    toy?.group.scale.copy(toy.baseScale);
    if (toy) {
      toy.group.visible = false;
      toy.trigger.rotation.x = 0;
      toy.chamber.rotation.z = 0;
      toy.pump.position.copy(toy.pumpBasePosition);
      toy.burst.visible = false;
      hideWaterEffects(toy);
      setRouletteBurst(toy, "BLANK", 0);
      const material = ensureMaterial(toy.resultLight);
      material.emissiveIntensity = 0.2;
      material.color.setHex(0x72ff9a);
      material.emissive.setHex(0x72ff9a);
    }
    if (preserveResolvedRoulette) {
      setRouletteStage(previousRouletteState, true);
    }
    seats.forEach((seat) => {
      setSeatPose(seat, "idle");
      seat.group.rotation.z = 0;
      seat.group.position.set(seat.baseX, seat.baseY, seat.baseZ);
      seat.group.scale.copy(seat.baseScale);
      if (seat.character) {
        seat.character.imageRoot.position.set(0, seat.character.baseImageY, seat.character.baseImageZ);
        seat.character.imageRoot.rotation.set(0, 0, 0);
        seat.character.imageRoot.scale.setScalar(1);
        seat.character.bodyPlane.position.set(0, 0, 0);
        seat.character.rimPlane.position.set(0, 0, -0.075);
      }
      setSeatOpacity(seat, 1);
      setSeatHighlight(seat, 0.08);
    });
  }

  function setSelectedCards(count: number) {
    selectedCount = count;
    cardMotionState = count > 0 ? "selected" : cardMotionState === "selected" ? "idle" : cardMotionState;
  }

  function setQueuedTimelineCount(count: number) {
    queuedTimelineCount = Math.max(0, count);
  }

  function setQualityProfile(next: CinematicQualityProfile) {
    quality = next;
    renderer.setPixelRatio(quality === "desktop" ? Math.min(window.devicePixelRatio, 1.85) : Math.min(window.devicePixelRatio, 1.2));
    renderer.shadowMap.enabled = quality !== "mobile";
    resize();
    callbacks.onQuality(quality);
  }

  function installOrbitControls() {
    const canvas = renderer.domElement;
    const startDrag = (event: PointerEvent) => {
      if ((event.button !== 0 && event.pointerType === "mouse") || shouldIgnoreOrbitDrag(event.target)) {
        return;
      }
      isCameraDragging = true;
      cameraUserControlled = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (event.target === canvas) {
        canvas.setPointerCapture?.(event.pointerId);
      }
    };
    window.addEventListener("pointerdown", startDrag, { signal: pointerAbort.signal });
    window.addEventListener(
      "pointermove",
      (event) => {
        if (!isCameraDragging) {
          return;
        }
        const dx = event.clientX - lastPointerX;
        const dy = event.clientY - lastPointerY;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        targetUserCameraYaw = clamp(targetUserCameraYaw - dx * 0.0044, -1.22, 1.22);
        targetUserCameraPitch = clamp(targetUserCameraPitch + dy * 0.003, -0.36, 0.42);
        userCameraYaw += (targetUserCameraYaw - userCameraYaw) * 0.35;
        userCameraPitch += (targetUserCameraPitch - userCameraPitch) * 0.35;
      },
      { signal: pointerAbort.signal }
    );
    const stopDrag = (event: PointerEvent) => {
      isCameraDragging = false;
      if (event.target === canvas) {
        canvas.releasePointerCapture?.(event.pointerId);
      }
    };
    window.addEventListener("pointerup", stopDrag, { signal: pointerAbort.signal });
    window.addEventListener("pointercancel", stopDrag, { signal: pointerAbort.signal });
    canvas.addEventListener(
      "dblclick",
      () => {
        targetUserCameraYaw = 0;
        targetUserCameraPitch = 0;
        cameraUserControlled = false;
      },
      { signal: pointerAbort.signal }
    );
  }

  function getSceneSnapshot(): CinematicSceneSnapshot {
    const desiredCameraPosition = getDesiredCameraPosition();
    return {
      ready,
      failed,
      quality,
      activeBeat,
      assetIds: Array.from(loadedAssets.keys()),
      playerCount: props.players.length,
      pileCount: props.pileCount,
      selectedCount,
      visibleMotionCards: motionCards.children.length,
      visibleRevealCards: revealGroup.children.length,
      rouletteState,
      rouletteVisualResult,
      rouletteDisplayPhase,
      resultUiUnlocked,
      aimedPlayerId,
      waterStreamVisible,
      waterSplashVisible,
      dryPuffVisible,
      toyGunMeshNames,
      tableMeshNames,
      characterAssetIds: characterAtlas ? CHARACTER_ASSET_IDS : [],
      visibleCharacterCount: seats.filter((seat) => seat.group.visible).length,
      activeCharacterPose,
      characterSceneState,
      activeTimeline,
      completedTimelines,
      queuedTimelineCount,
      cameraPreset,
      cameraMode: getCameraMode(),
      cameraDistance: Number(camera.position.distanceTo(cameraLookTarget).toFixed(3)),
      cameraSettled: camera.position.distanceTo(desiredCameraPosition) < 0.05 && cameraLookTarget.distanceTo(cameraTarget) < 0.04,
      userCameraYaw: Number(userCameraYaw.toFixed(3)),
      userCameraPitch: Number(userCameraPitch.toFixed(3)),
      cameraUserControlled,
      actionsLocked: Boolean(props.actionsLocked),
      localSeatIndex: props.localPlayerId ? props.players.findIndex((player) => player.id === props.localPlayerId) : -1,
      visibleNameplateCount: seats.filter((seat) => seat.nameplate.group.visible).length,
      characterMotionStates: seats
        .filter((seat) => seat.group.visible)
        .map((seat) => {
          const player = props.players[seats.indexOf(seat)];
          return characterRenderPose(
            seat,
            Boolean(props.currentTurnPlayerId && player?.id === props.currentTurnPlayerId),
            isPlayerVisuallyEliminated(player)
          );
        }) as CharacterMotionState[],
      seatChamberIndicators: props.players.map((player) => getSeatChamberIndicator(visualPlayerState(player))),
      seatNameplates: props.players.map((player) => {
        const indicator = getSeatChamberIndicator(visualPlayerState(player));
        const voice = props.voiceStates?.[player.id];
        return {
          playerId: player.id,
          name: player.name,
          cardsLeft: player.handCount,
          shotsLeft: indicator.remaining,
          voice: getSceneVoiceState(voice),
          status: getPlayerResultStatus(player)
        };
      }),
      motionCardCount: motionCards.children.length,
      settledPileVisualCount: pileGroup.children.filter((child) => child.visible).length,
      localHandVisualCount,
      selectedHandVisualCount: selectedCount,
      localHandFacingPlayer: localHandFacesPlayer(),
      pileVisualPositions: pileGroup.children
        .filter((child) => child.visible)
        .map((child) => ({
          x: Number(child.position.x.toFixed(3)),
          y: Number(child.position.y.toFixed(3)),
          z: Number(child.position.z.toFixed(3)),
          rotationZ: Number(child.rotation.z.toFixed(3))
        })),
      cardMotionState,
      soloPhase: props.soloPhase,
      visibleSpeechBubblePlayerId: props.tableQuote?.playerId,
      speechBubbleVisible: Boolean(props.tableQuote),
      visibleQuoteCount: props.tableQuote ? 1 : 0,
      botThinkingPlayerId: props.botThinkingPlayerId,
      gunParked: Boolean(toy && !toy.group.visible && rouletteState === "idle"),
      localHandVisible: handCards.some((card) => card.visible),
      phase: props.phase
    };
  }

  function dispose() {
    window.cancelAnimationFrame(frame);
    pointerAbort.abort();
    resizeObserver.disconnect();
    renderer.dispose();
    if (renderer.domElement.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
    if (window.__RRLD_CINEMATIC_SCENE__) {
      delete window.__RRLD_CINEMATIC_SCENE__;
    }
    if (window.__RRLD_CINEMATIC_SCENE_TEST__) {
      delete window.__RRLD_CINEMATIC_SCENE_TEST__;
    }
  }

  function syncLocalHandVisuals() {
    const localHand = props.localHand ?? [];
    const selectedIds = props.selectedCardIds ?? [];
    selectedCardIdSet = new Set(selectedIds);
    selectedCardOrder = new Map(selectedIds.map((id, index) => [id, index]));
    localHandVisualCount = 0;
    let selectedVisibleCount = 0;
    const selectedStarts: Array<{ mesh: THREE.Group; position: THREE.Vector3; rotation: THREE.Euler }> = [];

    handCards.forEach((meshCard, index) => {
      const transform = localHandCardTransform(index);
      meshCard.userData.basePosition = transform.position.clone();
      meshCard.userData.baseRotation = transform.rotation.clone();

      const localCard = localHand[index];
      if (!localCard) {
        meshCard.visible = false;
        delete meshCard.userData.cardId;
        delete meshCard.userData.visualRank;
        meshCard.userData.visualFaceUp = false;
        return;
      }

      localHandVisualCount += 1;
      meshCard.visible = true;
      meshCard.name = `LocalHandCard_${index}`;
      meshCard.userData.cardId = localCard.id;

      if (selectedCardIdSet.has(localCard.id)) {
        selectedVisibleCount += 1;
        selectedStarts.push({ mesh: meshCard, position: meshCard.position.clone(), rotation: meshCard.rotation.clone() });
      }

      if (meshCard.userData.visualRank !== localCard.rank || meshCard.userData.visualFaceUp !== true) {
        applyCardFace(meshCard, localCard.rank, false, true);
        meshCard.userData.visualRank = localCard.rank;
        meshCard.userData.visualFaceUp = true;
      }
    });

    selectedCount = selectedVisibleCount;
    if (selectedStarts.length > 0) {
      recentSelectedHandStarts = selectedStarts;
    }
    if (selectedCount > 0) {
      cardMotionState = "selected";
    } else if (cardMotionState === "selected") {
      cardMotionState = "idle";
    }
  }

  function refreshPile(explicitCount = props.pileCount) {
    if (!ready) {
      return;
    }
    clearGroup(pileGroup);
    const count = Math.max(0, Math.min(16, explicitCount || 0));
    visualPileCount = count;
    for (let index = 0; index < Math.max(1, count); index += 1) {
      const card = createCard(undefined, false);
      const transform = pileCardTransform(index, count);
      card.position.copy(transform.position);
      card.rotation.copy(transform.rotation);
      card.scale.setScalar(transform.scale);
      card.visible = count > 0;
      pileGroup.add(card);
    }
  }

  function pileCardTransform(index: number, total: number) {
    const visual = getPileVisualTransform(index, total);
    const position = new THREE.Vector3(visual.x, visual.y, visual.z);
    const rotation = new THREE.Euler(visual.rotationX, visual.rotationY, visual.rotationZ);
    const scale = visual.scale;
    return { position, rotation, scale };
  }

  function setRankCard(rank: Card["rank"]) {
    if (!tableRankCard) {
      return;
    }
    applyCardFace(tableRankCard, rank, false);
  }

  function clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  function seatAnchor(playerId: string, y = 0.48) {
    const index = findPlayerIndex(playerId);
    const seat = seatWorld(index);
    return new THREE.Vector3(seat.x * 0.72, y, seat.z * 0.58);
  }

  function findPlayerIndex(playerId: string) {
    return playerIndexFromPlayers(props.players, playerId);
  }

  function localHandSeatFrame() {
    const playerIndex = props.localPlayerId ? findPlayerIndex(props.localPlayerId) : -1;
    const seat = playerIndex >= 0 ? seatWorld(playerIndex) : seatWorld(3);
    const direction = new THREE.Vector3(seat.x, 0, seat.z);
    if (direction.lengthSq() < 0.001) {
      direction.set(0, 0, 1);
    }
    direction.normalize();
    const tangent = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
    const yaw = Math.atan2(direction.x, direction.z);
    return { direction, tangent, yaw };
  }

  function localHandCardTransform(index: number) {
    const { direction, tangent, yaw } = localHandSeatFrame();
    const fanIndex = index - 2;
    const position = direction
      .clone()
      .multiplyScalar(0.86 + Math.abs(fanIndex) * 0.035)
      .add(tangent.clone().multiplyScalar(fanIndex * 0.31));
    position.y = 0.58;

    return {
      position,
      rotation: new THREE.Euler(-0.46, yaw + fanIndex * 0.06, -fanIndex * 0.095)
    };
  }

  function localHandFacesPlayer() {
    const { yaw } = localHandSeatFrame();
    const visibleCards = handCards.filter((card) => card.visible);
    if (visibleCards.length === 0) {
      return true;
    }
    return visibleCards.every((card) => {
      const rotation = card.userData.baseRotation as THREE.Euler | undefined;
      return !rotation || Math.abs(normalizeAngle(rotation.y - yaw)) < 0.42;
    });
  }

  function createCard(rank?: Card["rank"], faceUp = false, danger = false) {
    const template = loadedAssets.get("playing-card");
    const card = template ? cloneGroup(template.getObjectByName("PlayingCard") as THREE.Group) : createFallbackCard();
    card.name = faceUp ? `FaceCard_${rank ?? "BACK"}` : "FaceDownCard";
    card.scale.setScalar(0.74);
    ensureRuntimeCardOverlays(card);
    applyCardFace(card, rank, danger, faceUp);
    return card;
  }

  function applyCardFace(card: THREE.Group, rank?: Card["rank"], danger = false, faceUp = true) {
    const overlays = ensureRuntimeCardOverlays(card);
    const face = card.getObjectByName("CardFace") as THREE.Mesh | undefined;
    const back = card.getObjectByName("CardBack") as THREE.Mesh | undefined;
    const body = card.getObjectByName("CardBody") as THREE.Mesh | undefined;
    const backDecorations = ["BackMedallion", "BackStripeA", "BackStripeB"]
      .map((name) => card.getObjectByName(name))
      .filter((object): object is THREE.Object3D => Boolean(object));
    if (body) {
      body.visible = true;
      body.castShadow = true;
      body.receiveShadow = true;
      body.material = new THREE.MeshStandardMaterial({
        color: danger ? 0x5b2b24 : 0x2e4c38,
        roughness: faceUp ? 0.62 : 0.52,
        metalness: 0.02
      });
      body.scale.y = 1;
    }
    if (face) {
      face.visible = false;
      face.castShadow = faceUp;
      face.receiveShadow = true;
      face.position.y = 0.024;
      face.material = new THREE.MeshStandardMaterial({
        color: danger ? 0xffd2be : rankColor(rank),
        roughness: 0.55,
        map: rank ? createRankTexture(rank, danger) : undefined,
        side: THREE.DoubleSide
      });
    }
    if (back) {
      back.visible = false;
      back.castShadow = !faceUp;
      back.receiveShadow = !faceUp;
      back.position.y = -0.024;
      back.material = new THREE.MeshStandardMaterial({
        color: 0x27563e,
        roughness: 0.64,
        emissive: 0x0b2416,
        emissiveIntensity: 0.08,
        side: THREE.DoubleSide
      });
    }
    backDecorations.forEach((decoration) => {
      decoration.visible = false;
    });
    overlays.face.visible = faceUp;
    overlays.face.material = createCardFaceMaterial(rank, danger);
    overlays.back.visible = !faceUp;
    overlays.back.material = createCardBackMaterial();
  }

  function ensureRuntimeCardOverlays(card: THREE.Group) {
    let face = card.getObjectByName("RuntimeCardFace") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;
    let back = card.getObjectByName("RuntimeCardBack") as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined;

    if (!face) {
      face = new THREE.Mesh(new THREE.PlaneGeometry(0.596, 0.876), createCardFaceMaterial(undefined, false));
      face.name = "RuntimeCardFace";
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.036;
      face.renderOrder = 22;
      face.receiveShadow = false;
      card.add(face);
    }

    if (!back) {
      back = new THREE.Mesh(new THREE.PlaneGeometry(0.596, 0.876), createCardBackMaterial());
      back.name = "RuntimeCardBack";
      back.rotation.x = Math.PI / 2;
      back.position.y = -0.036;
      back.renderOrder = 21;
      back.receiveShadow = false;
      card.add(back);
    }

    return { face, back };
  }

  function createCardFaceMaterial(rank: Card["rank"] | undefined, danger: boolean) {
    const material = new THREE.MeshBasicMaterial({
      color: danger ? 0xffd2be : rankColor(rank),
      map: rank ? createRankTexture(rank, danger) : undefined,
      side: THREE.DoubleSide
    });
    material.toneMapped = false;
    return material;
  }

  function createCardBackMaterial() {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: createCardBackTexture(),
      side: THREE.DoubleSide
    });
    material.toneMapped = false;
    return material;
  }

  function cloneAsset(id: CinematicAssetId) {
    const asset = loadedAssets.get(id);
    if (!asset) {
      throw new Error(`Missing cinematic asset: ${id}`);
    }
    return cloneGroup(asset);
  }

  function collectObjectNames(object: THREE.Object3D) {
    const names: string[] = [];
    object.traverse((child) => {
      if (child.name) {
        names.push(child.name);
      }
    });
    return names;
  }

  function cloneGroup(group: THREE.Object3D) {
    const clone = group.clone(true) as THREE.Group;
    prepareObject(clone, true);
    return clone;
  }

  function prepareObject(object: THREE.Object3D, cloneMaterials = false) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      child.castShadow = true;
      child.receiveShadow = true;
      if (cloneMaterials) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((item) => item.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });
  }

  function createSeatChamberIndicatorGroup(index: number) {
    const group = new THREE.Group();
    group.name = `SeatChambers_${index}`;
    group.position.set(0, 2.55, 0.1);
    group.scale.setScalar(1.0);

    const dots: Array<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>> = [];
    const geometry = new THREE.SphereGeometry(0.035, 16, 10);
    for (let dotIndex = 0; dotIndex < 6; dotIndex += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffcf68,
        transparent: true,
        opacity: 0.92,
        depthWrite: false
      });
      const dot = new THREE.Mesh(geometry, material);
      dot.name = `SeatChamber_${index}_${dotIndex}`;
      dot.position.set((dotIndex - 2.5) * 0.105, 0, 0);
      dot.renderOrder = 12;
      group.add(dot);
      dots.push(dot);
    }

    const backplate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.14),
      new THREE.MeshBasicMaterial({
        color: 0x090504,
        transparent: true,
        opacity: 0.54,
        depthWrite: false
      })
    );
    backplate.name = `SeatChambersBackplate_${index}`;
    backplate.position.set(0, 0, -0.025);
    backplate.renderOrder = 11;
    group.add(backplate);

    return { group, dots };
  }

  function createSeatNameplateRig(index: number): SeatNameplateRig {
    const group = new THREE.Group();
    group.name = `SeatNameplate_${index}`;
    group.position.set(0, 2.82, 0.12);
    const material = new THREE.MeshBasicMaterial({
      map: createSeatNameplateTexture("Open seat", "0 cards left", "Waiting", "Voice off", "off") ?? null,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.46), material);
    panel.name = `SeatNameplatePanel_${index}`;
    panel.renderOrder = 30;
    group.add(panel);

    const quoteMaterial = new THREE.MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const quotePanel = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.28), quoteMaterial);
    quotePanel.name = `SeatQuotePanel_${index}`;
    quotePanel.position.set(0, 0.42, 0.012);
    quotePanel.visible = false;
    quotePanel.renderOrder = 32;
    group.add(quotePanel);

    return { group, panel, quotePanel, lastKey: "", lastQuoteKey: "" };
  }

  function makeSeatRig(group: THREE.Group, baseRotation: number): SeatRig {
    const index = Number(group.name.split("_").pop() ?? 0);
    const body = findMesh(group, `Torso_${index}`) ?? findFirstMesh(group);
    const head = findMesh(group, `Head_${index}`);
    const chamberIndicator = createSeatChamberIndicatorGroup(index);
    group.add(chamberIndicator.group);
    const nameplate = createSeatNameplateRig(index);
    group.add(nameplate.group);
    return {
      group,
      bodyMaterial: body ? ensureMaterial(body) : undefined,
      headMaterial: head ? ensureMaterial(head) : undefined,
      pose: "idle",
      leftArm: group.getObjectByName(`LeftArm_${index}`),
      rightArm: group.getObjectByName(`RightArm_${index}`),
      leftHand: group.getObjectByName(`LeftHand_${index}`),
      rightHand: group.getObjectByName(`RightHand_${index}`),
      chamberIndicator: chamberIndicator.group,
      chamberDots: chamberIndicator.dots,
      nameplate,
      baseRotation,
      baseY: group.position.y,
      baseX: group.position.x,
      baseZ: group.position.z,
      baseScale: group.scale.clone()
    };
  }

  function ensureGunRuntimeAnchors(group: THREE.Group, addVisibleDial: boolean) {
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3(1.45, 0.56, 0.28);
    const center = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
      box.getCenter(center);
    }
    const depthOffset = Math.max(0.08, size.z * 0.34);
    const nozzle = new THREE.Vector3(box.isEmpty() ? 0.82 : box.max.x + size.x * 0.035, center.y + size.y * 0.04, center.z);
    const body = new THREE.Vector3(center.x, center.y, center.z);
    const trigger = new THREE.Vector3(center.x - size.x * 0.12, box.isEmpty() ? -0.22 : box.min.y + size.y * 0.28, center.z + depthOffset);
    const dial = new THREE.Vector3(center.x - size.x * 0.06, center.y + size.y * 0.08, center.z + depthOffset * 1.28);
    const pump = new THREE.Vector3(center.x + size.x * 0.12, box.isEmpty() ? 0.28 : box.max.y + size.y * 0.06, center.z);

    addAnchorIfMissing(group, "NozzleAnchor", nozzle);
    addAnchorIfMissing(group, "GunBodyAnchor", body);
    addAnchorIfMissing(group, "GunBarrelAnchor", new THREE.Vector3((nozzle.x + center.x) / 2, nozzle.y, nozzle.z));
    addAnchorIfMissing(group, "TriggerPivot", trigger);
    addAnchorIfMissing(group, "PumpHandle", pump);
    if (!group.getObjectByName("SixShotDial")) {
      if (addVisibleDial) {
        const dialMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.025, 24),
          new THREE.MeshStandardMaterial({ color: 0x242a30, metalness: 0.35, roughness: 0.42, emissive: 0x06080a, emissiveIntensity: 0.12 })
        );
        dialMesh.name = "SixShotDial";
        dialMesh.position.copy(dial);
        dialMesh.rotation.x = Math.PI / 2;
        dialMesh.castShadow = true;
        dialMesh.receiveShadow = true;
        group.add(dialMesh);
      } else {
        addAnchorIfMissing(group, "SixShotDial", dial);
      }
    }
    if (!group.getObjectByName("ResultLight")) {
      const light = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x96dfff, emissive: 0x14364a, emissiveIntensity: 0.12, roughness: 0.28, transparent: true, opacity: 0.18 })
      );
      light.name = "ResultLight";
      light.position.copy(nozzle).add(new THREE.Vector3(-size.x * 0.06, size.y * 0.12, 0));
      light.castShadow = true;
      group.add(light);
    }
  }

  function addAnchorIfMissing(group: THREE.Group, name: string, position: THREE.Vector3) {
    if (group.getObjectByName(name)) {
      return;
    }
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.position.copy(position);
    group.add(anchor);
  }

  function makeToyRig(group: THREE.Group): ToyRig {
    ensureGunRuntimeAnchors(group, false);
    const resultLight = (group.getObjectByName("ResultLight") as THREE.Mesh | undefined) ?? new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshStandardMaterial());
    const muzzle = group.getObjectByName("NozzleAnchor") ?? group.getObjectByName("WaterNozzle") ?? group.getObjectByName("FoamPlug") ?? group.getObjectByName("ToyMuzzleCap") ?? resultLight;
    const barrel = group.getObjectByName("ToyNozzle") ?? group.getObjectByName("ToySoftBarrel") ?? group.getObjectByName("WaterNozzle") ?? findObjectByNameIncludes(group, ["barrel", "slide"]) ?? group.getObjectByName("GunBarrelAnchor") ?? group;
    const body = group.getObjectByName("ToyBody") ?? group.getObjectByName("GunBodyAnchor") ?? findFirstMesh(group) ?? group;
    const pump = group.getObjectByName("PumpHandle") ?? group.getObjectByName("ToyTopRail") ?? findObjectByNameIncludes(group, ["slide"]) ?? body;
    const burst = createRouletteBurst();
    const waterEffects = createWaterEffects();
    const burstPosition = new THREE.Vector3();
    muzzle.getWorldPosition(burstPosition);
    group.worldToLocal(burstPosition);
    burst.position.copy(burstPosition).add(new THREE.Vector3(0.18, 0.02, 0));
    burst.visible = false;
    group.add(burst);
    tableRoot.add(waterEffects.group);
    toyGunMeshNames = [];
    group.traverse((child) => {
      if (child.name) {
        toyGunMeshNames.push(child.name);
      }
    });
    return {
      group,
      chamber: group.getObjectByName("SixShotDial") ?? group.getObjectByName("Chamber") ?? findObjectByNameIncludes(group, ["chamber", "cylinder", "slide"]) ?? group,
      trigger: findObjectByNameIncludes(group, ["trigger"]) ?? group.getObjectByName("TriggerPivot") ?? group.getObjectByName("Trigger") ?? group,
      resultLight,
      muzzle,
      barrel,
      body,
      pump,
      burst,
      waterStream: waterEffects.group,
      waterStreamPlane: waterEffects.stream,
      waterMist: waterEffects.mist,
      waterSplash: waterEffects.splash,
      dryPuff: waterEffects.dryPuff,
      basePosition: group.position.clone(),
      baseRotation: group.rotation.clone(),
      baseScale: group.scale.clone(),
      pumpBasePosition: pump.position.clone()
    };
  }

  function createWaterEffects() {
    const group = new THREE.Group();
    group.name = "WaterGunEffects";
    group.visible = false;

    const stream = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 0.24),
      new THREE.MeshBasicMaterial({
        map: waterTextures.get("stream") ?? createFallbackWaterTexture("stream"),
        color: 0xd6f8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    stream.name = "WaterStream";
    stream.renderOrder = 18;
    group.add(stream);

    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.78),
      new THREE.MeshBasicMaterial({
        map: waterTextures.get("mist") ?? createFallbackWaterTexture("mist"),
        color: 0xcaf7ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    mist.name = "WaterMist";
    mist.renderOrder = 19;
    group.add(mist);

    const splash = new THREE.Group();
    splash.name = "WaterSplashGroup";
    const splashMaterial = new THREE.MeshBasicMaterial({
      map: waterTextures.get("splash") ?? createFallbackWaterTexture("splash"),
      color: 0xd8fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 3; index += 1) {
      const splashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), splashMaterial.clone());
      splashPlane.name = `WaterSplash_${index}`;
      splashPlane.rotation.z = index * 0.9;
      splashPlane.scale.setScalar(0.72 + index * 0.16);
      splashPlane.renderOrder = 20 + index;
      splash.add(splashPlane);
    }
    group.add(splash);

    const dryPuff = new THREE.Group();
    dryPuff.name = "DryAirPuffGroup";
    const dryPuffMaterial = new THREE.MeshBasicMaterial({
      map: waterTextures.get("mist") ?? createFallbackWaterTexture("mist"),
      color: 0xf4fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    for (let index = 0; index < 2; index += 1) {
      const puff = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), dryPuffMaterial.clone());
      puff.name = `DryPuff_${index}`;
      puff.rotation.z = index * 0.7;
      puff.scale.setScalar(0.7 + index * 0.22);
      puff.renderOrder = 22 + index;
      dryPuff.add(puff);
    }
    group.add(dryPuff);

    return { group, stream, mist, splash, dryPuff };
  }

  function setRouletteLight(rig: ToyRig, color: number, intensity: number) {
    const material = ensureMaterial(rig.resultLight);
    material.color.setHex(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = intensity;
  }

  function setRouletteBurst(rig: ToyRig, result: "BLANK" | "LETHAL", progress: number) {
    const color = result === "LETHAL" ? 0xff4a2b : 0x72ff9a;
    const warmColor = result === "LETHAL" ? 0xffb04a : 0xd8ff84;
    const eased = easeOutCubic(Math.min(1, Math.max(0, progress)));
    const fade = result === "LETHAL" ? 1 - eased * 0.42 : 1 - eased * 0.72;
    rig.burst.visible = progress > 0 && fade > 0.04;
    rig.burst.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      const material = child.material instanceof THREE.MeshBasicMaterial ? child.material : undefined;
      if (material) {
        material.color.setHex(index % 2 === 0 ? color : warmColor);
        material.opacity = Math.max(0, fade) * (index === 0 ? 0.9 : 0.62);
      }
      const radius = 0.45 + eased * (result === "LETHAL" ? 1.08 : 0.58);
      child.scale.setScalar(index === 0 ? radius : 0.5 + eased * (result === "LETHAL" ? 1.55 : 0.82));
      child.rotation.z += (result === "LETHAL" ? 0.045 : 0.028) * (index + 1);
    });
  }

  function positionWaterShot(playerId: string, progress: number) {
    if (!toy) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, progress));
    const startWorld = new THREE.Vector3();
    toy.muzzle.getWorldPosition(startWorld);
    const start = tableRoot.worldToLocal(startWorld.clone());
    const end = seatAnchor(playerId, 1.03).add(new THREE.Vector3(0, 0.05, 0.03));
    const direction = end.clone().sub(start);
    const distance = Math.max(0.001, direction.length());
    const visibleDistance = distance * easeOutCubic(Math.min(1, clamped * 1.45));
    const visibleEnd = start.clone().add(direction.clone().normalize().multiplyScalar(visibleDistance));
    const midpoint = start.clone().lerp(visibleEnd, 0.5);
    const streamDirection = visibleEnd.clone().sub(start).normalize();

    toy.waterStream.visible = true;
    toy.waterStream.position.copy(midpoint);
    toy.waterStream.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), streamDirection);
    toy.waterStreamPlane.scale.set(Math.max(0.01, visibleDistance), 1.35 + Math.sin(clamped * Math.PI) * 0.75, 1);
    toy.waterStreamPlane.material.opacity = clamped < 0.92 ? Math.min(1, clamped * 2.6) : Math.max(0, 1 - (clamped - 0.92) / 0.08);
    toy.waterMist.visible = true;
    toy.waterMist.position.copy(start);
    toy.waterMist.lookAt(camera.position);
    toy.waterMist.scale.setScalar(0.68 + Math.sin(clamped * Math.PI) * 0.5);
    toy.waterMist.material.opacity = Math.max(0, Math.sin(clamped * Math.PI) * 0.64);

    toy.waterSplash.visible = true;
    toy.waterSplash.position.copy(end);
    toy.waterSplash.lookAt(camera.position);
    toy.waterSplash.scale.setScalar(0.7 + easeOutCubic(clamped) * 0.62);
    const splashFade = clamped < 0.72 ? 1 : Math.max(0, 1 - (clamped - 0.72) / 0.28);
    toy.waterSplash.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) {
        return;
      }
      child.rotation.z += 0.025 + index * 0.012;
      child.material.opacity = clamped > 0.34 ? Math.max(0, splashFade * (0.82 - index * 0.1)) : 0;
    });

    waterStreamVisible = toy.waterStreamPlane.material.opacity > 0.08;
    waterSplashVisible = clamped > 0.34 && splashFade > 0.08;
    dryPuffVisible = false;
  }

  function positionDryPuff(progress: number) {
    if (!toy) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, progress));
    const startWorld = new THREE.Vector3();
    toy.muzzle.getWorldPosition(startWorld);
    const start = tableRoot.worldToLocal(startWorld.clone());
    const forward = new THREE.Vector3(0.42 + easeOutCubic(clamped) * 0.38, 0.04 + Math.sin(clamped * Math.PI) * 0.05, 0);
    toy.dryPuff.visible = true;
    toy.dryPuff.position.copy(start).add(forward);
    toy.dryPuff.lookAt(camera.position);
    toy.dryPuff.scale.setScalar(0.8 + easeOutCubic(clamped) * 0.65);
    toy.dryPuff.children.forEach((child, index) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshBasicMaterial)) {
        return;
      }
      child.rotation.z += 0.018 + index * 0.016;
      child.material.opacity = Math.max(0, (1 - clamped * 0.82) * (0.54 - index * 0.1));
    });
    dryPuffVisible = clamped < 0.82;
  }

  function hideWaterEffects(rig: ToyRig) {
    rig.waterStream.visible = false;
    rig.waterStreamPlane.material.opacity = 0;
    rig.waterMist.visible = false;
    rig.waterMist.material.opacity = 0;
    rig.waterSplash.visible = false;
    rig.waterSplash.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.opacity = 0;
      }
    });
    rig.dryPuff.visible = false;
    rig.dryPuff.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
        child.material.opacity = 0;
      }
    });
    waterStreamVisible = false;
    waterSplashVisible = false;
    dryPuffVisible = false;
  }

  function animate(duration: number, update: Tween["update"], complete?: Tween["complete"]) {
    return new Promise<void>((resolve) => {
      tweens.push({
        startedAt: performance.now(),
        duration: getDuration(duration),
        update,
        complete,
        resolve
      });
    });
  }

  function getDuration(durationMs: number) {
    return getCinematicDuration(durationMs, quality);
  }

  async function delay(durationMs: number, generation: number) {
    const duration = getDuration(durationMs);
    await new Promise((resolve) => window.setTimeout(resolve, duration));
    if (generation !== animationGeneration) {
      throw new Error("Animation cancelled");
    }
  }

  function setSeatPose(seat: SeatRig | undefined, pose: CharacterPose) {
    if (!seat) {
      return;
    }
    seat.pose = pose;
    activeCharacterPose = pose;
  }

  function setSeatOpacity(seat: SeatRig | undefined, opacity: number) {
    if (!seat) {
      return;
    }
    if (seat.character) {
      seat.character.bodyPlane.material.uniforms.opacity.value = opacity;
      seat.character.rimPlane.material.uniforms.opacity.value = Math.max(0, opacity * 0.08);
      seat.character.eyeGlintPlane.material.opacity = Math.max(0, opacity * 0.18);
      seat.character.shadowPlane.material.opacity = Math.max(0, opacity * 0.38);
      seat.character.glow.intensity = Math.max(0, seat.character.glow.intensity * opacity);
    }
    setOpacity(seat.bodyMaterial, opacity);
    setOpacity(seat.headMaterial, opacity);
  }

  function setSeatHighlight(seat: SeatRig | undefined, amount: number) {
    if (!seat?.character) {
      setEmissive(seat?.bodyMaterial, amount);
      return;
    }
    seat.character.bodyPlane.material.uniforms.brightness.value = 1.03 + amount * 0.32;
    seat.character.rimPlane.material.uniforms.opacity.value = 0.04 + amount * 0.09;
    seat.character.eyeGlintPlane.material.opacity = 0.08 + amount * 0.05;
    seat.character.glow.intensity = 0.22 + amount * 0.72;
  }

  function updateSeatChamberIndicator(seat: SeatRig, player: PublicPlayer | undefined, elapsed: number) {
    if (!player || shouldHideLocalSeatOverlay(player)) {
      seat.chamberIndicator.visible = false;
      return;
    }
    const indicator = getSeatChamberIndicator(visualPlayerState(player));
    seat.chamberIndicator.visible = true;
    seat.chamberDots.forEach((dot, index) => {
      const state = indicator.dots[index] ?? "remaining";
      const pulse = state === "last" ? 0.5 + Math.sin(elapsed * 8.5) * 0.5 : 0;
      if (state === "spent") {
        dot.material.color.setHex(0x3a3024);
        dot.material.opacity = 0.42;
        dot.scale.setScalar(0.72);
      } else if (state === "last") {
        dot.material.color.setHex(0xff5842);
        dot.material.opacity = 0.82 + pulse * 0.18;
        dot.scale.setScalar(1.08 + pulse * 0.28);
      } else if (state === "eliminated") {
        dot.material.color.setHex(0x45201c);
        dot.material.opacity = 0.26;
        dot.scale.setScalar(0.58);
      } else {
        dot.material.color.setHex(0xffcf68);
        dot.material.opacity = 0.88;
        dot.scale.setScalar(0.9);
      }
    });
    const lift = indicator.isLastChamber ? Math.sin(elapsed * 6.5) * 0.018 : 0;
    seat.chamberIndicator.position.y = 2.55 + lift;
  }

  function getPlayerResultStatus(player: PublicPlayer): "WINNER" | "LOSER" | undefined {
    if (props.winnerId === player.id) {
      return "WINNER";
    }
    if (visualPlayerState(player).eliminated) {
      return "LOSER";
    }
    return undefined;
  }

  function isConcealedEliminatedPlayer(player: PublicPlayer | undefined) {
    return Boolean(
      player?.id &&
        props.resultConcealed &&
        props.concealedEliminatedPlayerId &&
        player.id === props.concealedEliminatedPlayerId
    );
  }

  function isPlayerVisuallyEliminated(player: PublicPlayer | undefined) {
    return Boolean(player?.eliminated && !isConcealedEliminatedPlayer(player));
  }

  function visualPlayerState(player: PublicPlayer): PublicPlayer {
    if (!isConcealedEliminatedPlayer(player)) {
      return player;
    }
    return {
      ...player,
      eliminated: false
    };
  }

  function updateSeatNameplate(seat: SeatRig, player: PublicPlayer | undefined, elapsed: number) {
    const nameplate = seat.nameplate;
    if (!player || shouldHideLocalSeatOverlay(player)) {
      nameplate.group.visible = false;
      return;
    }

    const visualPlayer = visualPlayerState(player);
    const indicator = getSeatChamberIndicator(visualPlayer);
    const voice = props.voiceStates?.[player.id];
    const voiceLabel = getSceneVoiceLabel(voice);
    const voiceState = getSceneVoiceState(voice);
    const resultStatus = getPlayerResultStatus(player);
    const cardsLabel = `${player.handCount} card${player.handCount === 1 ? "" : "s"} left`;
    const shotsLabel =
      resultStatus === "WINNER"
        ? "Last player standing"
        : resultStatus === "LOSER"
          ? "Eliminated"
          : `${indicator.remaining} shot${indicator.remaining === 1 ? "" : "s"} left`;
    const key = `${player.name}|${cardsLabel}|${shotsLabel}|${voiceLabel}|${voiceState}|${player.connected}|${visualPlayer.eliminated}|${resultStatus ?? "playing"}`;
    if (key !== nameplate.lastKey) {
      const oldMap = nameplate.panel.material.map;
      nameplate.panel.material.map = createSeatNameplateTexture(player.name, cardsLabel, shotsLabel, voiceLabel, voiceState, resultStatus, player.id) ?? null;
      nameplate.panel.material.needsUpdate = true;
      oldMap?.dispose();
      nameplate.lastKey = key;
    }

    const activeLift = player.id === props.currentTurnPlayerId ? 0.06 + Math.sin(elapsed * 4.2) * 0.012 : 0;
    nameplate.group.visible = true;
    nameplate.group.position.y = 2.84 + activeLift;
    nameplate.group.scale.setScalar(resultStatus === "WINNER" ? 1.08 : resultStatus === "LOSER" ? 0.92 : 1);
    nameplate.panel.material.opacity = resultStatus === "LOSER" ? 0.56 : 0.96;
    updateSeatQuote(nameplate, props.tableQuote?.playerId === player.id ? props.tableQuote : undefined, resultStatus);
  }

  function updateSeatQuote(nameplate: SeatNameplateRig, quote: SceneTableQuote | undefined | null, resultStatus?: "WINNER" | "LOSER") {
    const quoteKey = quote ? `${quote.playerId}|${quote.tone}|${quote.text}|${resultStatus ?? "playing"}` : "";
    if (quoteKey !== nameplate.lastQuoteKey) {
      const oldMap = nameplate.quotePanel.material.map;
      nameplate.quotePanel.material.map = quote ? createSeatQuoteTexture(quote.text, quote.tone, quote.playerId) ?? null : null;
      nameplate.quotePanel.material.needsUpdate = true;
      oldMap?.dispose();
      nameplate.lastQuoteKey = quoteKey;
    }

    nameplate.quotePanel.visible = Boolean(quote);
    nameplate.quotePanel.material.opacity = quote ? (resultStatus === "LOSER" ? 0.66 : 0.95) : 0;
  }

  function faceReadableSeatLayersTowardCamera(seat: SeatRig) {
    if (seat.nameplate.group.visible) {
      faceObjectYawTowardCamera(seat.nameplate.group);
    }
    if (seat.chamberIndicator.visible) {
      faceObjectYawTowardCamera(seat.chamberIndicator);
    }
    if (seat.character?.imageRoot.visible) {
      faceCharacterImageYawTowardCamera(seat.character.imageRoot);
    }
  }

  function faceObjectYawTowardCamera(object: THREE.Object3D) {
    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    object.lookAt(camera.position.x, worldPosition.y, camera.position.z);
  }

  function faceCharacterImageYawTowardCamera(object: THREE.Object3D) {
    if (!object.parent) {
      return;
    }
    const worldPosition = new THREE.Vector3();
    const localCameraTarget = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    object.getWorldPosition(worldPosition);
    localCameraTarget.y = worldPosition.y;
    object.parent.worldToLocal(localCameraTarget);
    const directionX = localCameraTarget.x - object.position.x;
    const directionZ = localCameraTarget.z - object.position.z;
    if (Math.abs(directionX) < 0.001 && Math.abs(directionZ) < 0.001) {
      return;
    }
    const targetYaw = THREE.MathUtils.clamp(Math.atan2(directionX, directionZ), -0.5, 0.5);
    object.rotation.y += (targetYaw - object.rotation.y) * 0.1;
  }

  function animateThrowArm(seat?: SeatRig) {
    if (seat?.character) {
      setSeatPose(seat, "accuse");
      const imageBase = seat.character.imageRoot.position.clone();
      const scaleBase = seat.character.imageRoot.scale.clone();
      animate(620, (progress) => {
        const lift = Math.sin(progress * Math.PI);
        seat.character!.imageRoot.position.y = imageBase.y + lift * 0.2;
        seat.character!.imageRoot.position.z = imageBase.z + lift * 0.22;
        seat.character!.imageRoot.rotation.z = -lift * 0.08;
        seat.character!.imageRoot.scale.setScalar(scaleBase.x + lift * 0.06);
        setSeatHighlight(seat, 0.28 + lift * 0.62);
      });
      return;
    }
    if (!seat?.rightArm || !seat.rightHand) {
      return;
    }
    const armBase = seat.rightArm.rotation.clone();
    const handBase = seat.rightHand.position.clone();
    animate(620, (progress) => {
      seat.rightArm!.rotation.x = armBase.x + Math.sin(progress * Math.PI) * 0.75;
      seat.rightArm!.rotation.z = armBase.z - Math.sin(progress * Math.PI) * 0.38;
      seat.rightHand!.position.z = handBase.z + Math.sin(progress * Math.PI) * 0.26;
    });
  }

  function pulseSeat(seat?: SeatRig, amount = 0.24) {
    if (!seat) {
      return;
    }
    if (seat.character && seat.pose === "idle") {
      setSeatPose(seat, "active");
    }
    animate(860, (progress) => {
      seat.group.position.y = seat.baseY + Math.sin(progress * Math.PI) * amount;
      seat.group.rotation.z = Math.sin(progress * Math.PI) * amount * 0.2;
      setSeatHighlight(seat, 0.14 + Math.sin(progress * Math.PI) * 0.78);
    });
  }

  function fadeSeat(seat?: SeatRig, targetOpacity = 0.44) {
    if (!seat) {
      return;
    }
    animate(700, (progress) => {
      const opacity = 1 + (targetOpacity - 1) * progress;
      setSeatOpacity(seat, opacity);
    });
  }

  function tableImpactTween(amount: number) {
    return (progress: number) => {
      const kick = Math.sin(progress * Math.PI);
      const subtleAmount = Math.min(amount, 0.006);
      tableRoot.scale.setScalar(1 + kick * subtleAmount);
      tableRoot.rotation.z = 0;
      tableSpot.intensity = 5.2 + kick * 1.2;
      amberLight.intensity = 4.2 + kick * 0.45;
    };
  }

  function redSweepTween(progress: number) {
    const kick = Math.sin(progress * Math.PI);
    redLight.intensity = 1.05 + kick * 5.1;
    cyanLight.intensity = 1.1 + kick * 1.6;
    tableRoot.rotation.y = 0;
    tableSpot.intensity = 5.2 + kick * 1.8;
  }

  function characterRenderPose(seat: SeatRig, isActive: boolean, isEliminated: boolean): CharacterPose {
    if (isEliminated || seat.pose === "eliminated") {
      return "eliminated";
    }
    if (
      seat.pose === "winner" ||
      seat.pose === "roulette" ||
      seat.pose === "relief" ||
      seat.pose === "accused" ||
      seat.pose === "accuse" ||
      seat.pose === "play" ||
      seat.pose === "thinking"
    ) {
      return seat.pose;
    }
    return isActive ? "active" : "idle";
  }

  function updateCharacterBillboard(seat: SeatRig, pose: CharacterPose, elapsed: number, index: number) {
    const character = seat.character;
    if (!character) {
      return;
    }

    const poseConfig = characterPoseConfig(pose);
    const idleLift = pose === "idle" ? Math.sin(elapsed * 1.4 + index) * 0.032 : 0;
    const fidget = Math.sin(elapsed * 2.15 + index * 1.7);
    const eyeLine = Math.sin(elapsed * 0.74 + index);
    const targetY = character.baseImageY + poseConfig.y + idleLift;
    const targetZ = character.baseImageZ + poseConfig.z;
    const targetScale = poseConfig.scale + (pose === "idle" ? Math.sin(elapsed * 1.15 + index) * 0.01 : 0);

    character.imageRoot.position.y += (targetY - character.imageRoot.position.y) * 0.08;
    character.imageRoot.position.z += (targetZ - character.imageRoot.position.z) * 0.08;
    character.imageRoot.rotation.z += (poseConfig.tilt - character.imageRoot.rotation.z) * 0.08;
    character.imageRoot.rotation.x += ((pose === "accused" ? -0.025 : 0.012 * eyeLine) - character.imageRoot.rotation.x) * 0.06;
    character.imageRoot.scale.x += (targetScale - character.imageRoot.scale.x) * 0.08;
    character.imageRoot.scale.y += (targetScale - character.imageRoot.scale.y) * 0.08;
    character.bodyPlane.position.x = fidget * (pose === "idle" ? 0.016 : 0.022);
    character.bodyPlane.position.y = Math.abs(fidget) * (pose === "idle" ? 0.011 : 0.018);
    character.rimPlane.position.x = -fidget * 0.016;

    character.bodyPlane.material.uniforms.brightness.value +=
      (poseConfig.brightness - character.bodyPlane.material.uniforms.brightness.value) * 0.08;
    character.bodyPlane.material.uniforms.opacity.value +=
      (poseConfig.opacity - character.bodyPlane.material.uniforms.opacity.value) * 0.08;
    character.rimPlane.material.uniforms.opacity.value +=
      (poseConfig.rimOpacity - character.rimPlane.material.uniforms.opacity.value) * 0.08;
    character.glow.intensity += (poseConfig.glow - character.glow.intensity) * 0.08;
    character.shadowPlane.material.opacity += (poseConfig.shadowOpacity - character.shadowPlane.material.opacity) * 0.08;
  }

  function updateLocalAvatarVisibility(seat: SeatRig, player: PublicPlayer | undefined) {
    const character = seat.character;
    if (!character) {
      return;
    }
    const hideLocalAvatar = shouldHideLocalSeatOverlay(player);
    character.imageRoot.visible = !hideLocalAvatar;
    character.shadowPlane.visible = !hideLocalAvatar;
    character.glow.visible = !hideLocalAvatar;
  }

  function shouldHideLocalSeatOverlay(player: PublicPlayer | undefined) {
    return Boolean(player?.id && player.id === props.localPlayerId && props.phase === "playing");
  }

  function removeBackgroundShelfClutter(root: THREE.Object3D) {
    const removable: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (/^(Shelf|Bottle|BottleCap|Neon)/.test(child.name)) {
        removable.push(child);
      }
    });
    removable.forEach((child) => child.parent?.remove(child));
  }

  function setRouletteStage(nextState: RouletteSceneState, unlockResult = resultUiUnlocked) {
    rouletteState = nextState;
    resultUiUnlocked = unlockResult;
    rouletteDisplayPhase = rouletteDisplayPhaseFromSceneState(rouletteState, resultUiUnlocked);
    const notificationKey = `${rouletteState}:${rouletteDisplayPhase}:${resultUiUnlocked}`;
    if (notificationKey === lastRouletteStageNotification) {
      return;
    }
    lastRouletteStageNotification = notificationKey;
    callbacks.onRouletteStageChange({
      rouletteState,
      displayPhase: rouletteDisplayPhase,
      resultUiUnlocked
    });
  }

  function setActiveBeat(next: string) {
    activeBeat = next;
    callbacks.onActiveBeat(next);
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function getDesiredCameraPosition() {
    const desired = cameraPositionTarget.clone();
    const cinematicCameraLocked =
      activeTimeline === "winner" ||
      activeTimeline === "elimination";
    if (!cameraUserControlled || cinematicCameraLocked) {
      return desired;
    }
    const offset = desired.sub(cameraTarget);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += userCameraYaw;
    spherical.phi = clamp(spherical.phi + userCameraPitch, 0.42, 1.34);
    return cameraTarget.clone().add(new THREE.Vector3().setFromSpherical(spherical));
  }

  function getCameraMode() {
    if (activeTimeline === "winner" || activeTimeline === "elimination") {
      return "cinematic";
    }
    if (cameraUserControlled && (Math.abs(userCameraYaw) > 0.01 || Math.abs(userCameraPitch) > 0.01 || isCameraDragging)) {
      return "orbit";
    }
    return cameraMode;
  }

  const clock = new THREE.Clock();
  let frame = 0;
  let lastRenderTime = performance.now();
  function render() {
    const elapsed = clock.getElapsedTime();
    const now = performance.now();
    const delta = Math.min(0.05, Math.max(0.001, (now - lastRenderTime) / 1000));
    lastRenderTime = now;
    frame = window.requestAnimationFrame(render);

    for (let index = tweens.length - 1; index >= 0; index -= 1) {
      const tween = tweens[index];
      const progress = Math.min(1, (now - tween.startedAt) / tween.duration);
      tween.update(progress);
      if (progress >= 1) {
        tween.complete?.();
        tween.resolve?.();
        tweens.splice(index, 1);
      }
    }

    tableRoot.rotation.y += (0 - tableRoot.rotation.y) * dampFactor(delta, 5.4);
    tableRoot.rotation.z += (0 - tableRoot.rotation.z) * dampFactor(delta, 5.4);
    pileGroup.rotation.y += (0 - pileGroup.rotation.y) * dampFactor(delta, 6.2);
    if (toy) {
      const chamberDrift = rouletteState === "spinning" ? 0.024 : rouletteState === "trigger" || rouletteState === "aiming" ? 0.006 : 0.0025;
      toy.chamber.rotation.z += chamberDrift;
      toy.burst.lookAt(camera.position);
      toy.waterMist.lookAt(camera.position);
      toy.waterSplash.lookAt(camera.position);
      toy.dryPuff.lookAt(camera.position);
    }

    if (selectedCount > 0 && cardMotionState === "idle") {
      cardMotionState = "selected";
    }

    const handFrame = localHandSeatFrame();
    handCards.forEach((card, index) => {
      const base = card.userData.basePosition as THREE.Vector3;
      const baseRotation = card.userData.baseRotation as THREE.Euler;
      const cardId = typeof card.userData.cardId === "string" ? card.userData.cardId : undefined;
      const selected = card.visible && (cardId ? selectedCardIdSet.has(cardId) : index < selectedCount);
      const selectedIndex = cardId ? selectedCardOrder.get(cardId) ?? index : index;
      const selectedFan = selected ? (selectedIndex - (Math.max(1, selectedCount) - 1) / 2) * 0.08 : 0;
      const targetPosition = base
        .clone()
        .add(handFrame.tangent.clone().multiplyScalar(selectedFan))
        .add(handFrame.direction.clone().multiplyScalar(selected ? 0.08 : 0));
      card.position.x += (targetPosition.x - card.position.x) * 0.12;
      card.position.z += (targetPosition.z - card.position.z) * 0.12;
      card.position.y += (targetPosition.y + (selected ? 0.7 : 0) + Math.sin(elapsed * 1.7 + index) * 0.024 - card.position.y) * 0.2;
      card.rotation.x += (baseRotation.x + (selected ? -0.46 : 0) - card.rotation.x) * 0.15;
      card.rotation.y += (baseRotation.y - card.rotation.y) * 0.12;
      card.rotation.z += (baseRotation.z + (selected ? 0.22 + selectedFan * 0.8 : 0) - card.rotation.z) * 0.13;
    });

    seats.forEach((seat, index) => {
      const player = props.players[index];
      const isActive = player?.id === props.currentTurnPlayerId;
      const isEliminated = isPlayerVisuallyEliminated(player);
      seat.group.visible = index < props.players.length;
      updateSeatChamberIndicator(seat, player, elapsed);
      updateSeatNameplate(seat, player, elapsed);
      if (seat.character) {
        seat.group.rotation.y += (seat.baseRotation - seat.group.rotation.y) * dampFactor(delta, 10);
      } else {
        seat.group.rotation.y = seat.baseRotation + Math.sin(elapsed * 0.82 + index) * 0.055;
      }
      seat.group.position.y += (seat.baseY + Math.sin(elapsed * 1.2 + index) * 0.035 - seat.group.position.y) * 0.08;
      const pose = characterRenderPose(seat, isActive, isEliminated);
      updateCharacterBillboard(seat, pose, elapsed, index);
      faceReadableSeatLayersTowardCamera(seat);
      updateLocalAvatarVisibility(seat, player);
      if (!seat.character) {
        setEmissive(seat.bodyMaterial, seat.bodyMaterial ? seat.bodyMaterial.emissiveIntensity + ((isActive ? 0.62 : 0.08) - seat.bodyMaterial.emissiveIntensity) * 0.08 : 0);
      }
      if (isEliminated) {
        setSeatOpacity(seat, lerp(seat.character ? seat.character.bodyPlane.material.uniforms.opacity.value : seat.bodyMaterial?.opacity ?? 1, 0.32, 0.05));
      }
    });

    amberLight.intensity = 4.2 + Math.sin(elapsed * 2.1) * 0.24;
    redLight.intensity += ((props.hasChallenge ? 2.15 : 1.05) - redLight.intensity) * 0.05;
    tableSpot.intensity += (5.2 - tableSpot.intensity) * 0.04;
    cyanLight.intensity = 1.1 + Math.sin(elapsed * 1.9) * 0.12;

    if (!props.currentTurnPlayerId && tweens.length === 0) {
      focusPlayer(undefined);
    }

    const orbitEase = dampFactor(delta, isCameraDragging ? 18 : 9.5);
    userCameraYaw += (targetUserCameraYaw - userCameraYaw) * orbitEase;
    userCameraPitch += (targetUserCameraPitch - userCameraPitch) * orbitEase;

    const shake = quality === "reduced-motion" ? 0 : now < shakeUntil ? (shakeUntil - now) / 1400 : 0;
    const cameraEase = dampFactor(delta, 7.2);
    const targetEase = dampFactor(delta, 8.4);
    const desiredCameraPosition = getDesiredCameraPosition();
    camera.position.lerp(desiredCameraPosition, cameraEase);
    cameraLookTarget.lerp(cameraTarget, targetEase);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * 0.032 * shake;
      camera.position.y += (Math.random() - 0.5) * 0.02 * shake;
    }
    camera.lookAt(cameraLookTarget);
    renderer.render(scene, camera);
  }

  render();

  return {
    preloadAssets,
    syncSceneState,
    playBeat,
    cancelAnimations,
    setQualityProfile,
    getSceneSnapshot,
    dealCards,
    throwCards,
    revealCards,
    focusPlayer,
    playLiarImpact,
    playRoulette,
    playWin,
    playLoss,
    resetRoundVisuals,
    setSelectedCards,
    setQueuedTimelineCount,
    dispose
  };
}

function createCharacterMaterial(
  atlas: THREE.Texture,
  index: number,
  options: { opacity: number; brightness: number; tint: THREE.Color }
) {
  const column = index % 2;
  const rowFromTop = Math.floor(index / 2);
  const uvOffset = new THREE.Vector2(column * 0.5, rowFromTop === 0 ? 0.5 : 0);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlas },
      uvOffset: { value: uvOffset },
      uvRepeat: { value: new THREE.Vector2(0.5, 0.5) },
      keyColor: { value: new THREE.Color(0x00ff00) },
      threshold: { value: 0.44 },
      softness: { value: 0.12 },
      opacity: { value: options.opacity },
      brightness: { value: options.brightness },
      tint: { value: options.tint }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 uvOffset;
      uniform vec2 uvRepeat;
      uniform vec3 keyColor;
      uniform float threshold;
      uniform float softness;
      uniform float opacity;
      uniform float brightness;
      uniform vec3 tint;
      varying vec2 vUv;

      void main() {
        vec2 atlasUv = uvOffset + vUv * uvRepeat;
        vec4 texel = texture2D(map, atlasUv);
        float keyDistance = distance(texel.rgb, keyColor);
        float chromaAlpha = smoothstep(threshold - softness, threshold + softness, keyDistance);
        float alpha = min(texel.a, chromaAlpha) * opacity;

        if (alpha < 0.035) {
          discard;
        }

        vec3 color = texel.rgb * tint * brightness;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });
  return material;
}

function createEyeGlintTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawEyeGlint(context, 38, 16);
    drawEyeGlint(context, 90, 16);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSeatNameplateTexture(
  name: string,
  cards: string,
  shots: string,
  voice: string,
  voiceState: "off" | "on" | "muted" | "speaking",
  status?: "WINNER" | "LOSER",
  playerId?: string
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 176;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  const accent = playerVisualAccent(playerId);
  const bg = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, accent.bgStart);
  bg.addColorStop(1, "rgba(39, 16, 9, 0.84)");
  roundRect(context, 10, 10, canvas.width - 20, canvas.height - 20, 24);
  context.fillStyle = bg;
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = voiceState === "speaking" ? "rgba(132, 255, 189, 0.92)" : voiceState === "muted" ? "rgba(255, 197, 108, 0.74)" : accent.stroke;
  context.stroke();

  context.fillStyle = status === "WINNER" ? "#fff3ad" : status === "LOSER" ? "#ffd4c6" : "#fff1c7";
  context.font = "900 44px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(trimNameplateText(name, 15), canvas.width / 2, status ? 43 : 58);

  if (status) {
    const isWinner = status === "WINNER";
    const badgeGradient = context.createLinearGradient(118, 63, 394, 112);
    badgeGradient.addColorStop(0, isWinner ? "rgba(255, 224, 115, 0.3)" : "rgba(255, 89, 64, 0.27)");
    badgeGradient.addColorStop(1, isWinner ? "rgba(255, 166, 60, 0.2)" : "rgba(122, 25, 19, 0.24)");
    roundRect(context, 118, 65, 276, 47, 16);
    context.fillStyle = badgeGradient;
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = isWinner ? "rgba(255, 234, 133, 0.92)" : "rgba(255, 132, 95, 0.88)";
    context.stroke();
    context.shadowColor = isWinner ? "rgba(255, 214, 102, 0.72)" : "rgba(255, 89, 64, 0.7)";
    context.shadowBlur = 14;
    context.fillStyle = isWinner ? "#fff2a8" : "#ffd1c1";
    context.font = "950 34px Inter, Arial, sans-serif";
    context.fillText(status, canvas.width / 2, 90);
    context.shadowBlur = 0;
  } else {
    context.fillStyle = "#ffd27a";
    context.font = "850 24px Inter, Arial, sans-serif";
    context.fillText(cards, canvas.width / 2, 93);
    context.fillStyle = "#ffe3a4";
    context.font = "850 22px Inter, Arial, sans-serif";
    context.fillText(shots, canvas.width / 2, 116);
  }

  const dotColor = voiceState === "speaking" ? "#84ffbd" : voiceState === "on" ? "#77d8ff" : voiceState === "muted" ? "#ffc56c" : "#9a8d82";
  context.beginPath();
  context.arc(160, 137, 9, 0, Math.PI * 2);
  context.fillStyle = dotColor;
  context.fill();
  context.fillStyle = "#d8e4df";
  context.font = "800 22px Inter, Arial, sans-serif";
  context.textAlign = "left";
  context.fillText(voice, 180, 138);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSeatQuoteTexture(text: string, tone: SceneTableQuote["tone"], playerId?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const accent = playerVisualAccent(playerId);
  const toneAccent =
    tone === "challenge"
      ? "rgba(255, 99, 78, 0.72)"
      : tone === "winner"
        ? "rgba(255, 222, 113, 0.82)"
        : tone === "roulette"
          ? "rgba(122, 202, 255, 0.74)"
          : tone === "thinking"
            ? accent.thinking
            : accent.stroke;

  context.clearRect(0, 0, canvas.width, canvas.height);
  const bg = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, accent.quoteBgStart);
  bg.addColorStop(1, "rgba(48, 22, 12, 0.86)");
  roundRect(context, 18, 16, canvas.width - 36, 82, 22);
  context.fillStyle = bg;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = toneAccent;
  context.stroke();

  context.beginPath();
  context.moveTo(canvas.width / 2 - 22, 96);
  context.lineTo(canvas.width / 2, 116);
  context.lineTo(canvas.width / 2 + 22, 96);
  context.closePath();
  context.fillStyle = "rgba(18, 9, 6, 0.88)";
  context.fill();
  context.strokeStyle = toneAccent;
  context.stroke();

  context.fillStyle = tone === "challenge" ? "#ffe5d9" : tone === "thinking" ? "#eaf4ff" : "#fff4d5";
  context.font = "900 28px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  drawWrappedCenteredText(context, `“${text}”`, canvas.width / 2, 56, 430, 32, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function playerVisualAccent(playerId?: string) {
  if (playerId === "bot-1") {
    return {
      stroke: "rgba(132, 196, 255, 0.68)",
      thinking: "rgba(132, 196, 255, 0.74)",
      bgStart: "rgba(9, 20, 31, 0.9)",
      quoteBgStart: "rgba(9, 20, 31, 0.94)"
    };
  }
  if (playerId === "bot-2") {
    return {
      stroke: "rgba(255, 118, 88, 0.7)",
      thinking: "rgba(255, 144, 104, 0.76)",
      bgStart: "rgba(34, 10, 8, 0.9)",
      quoteBgStart: "rgba(36, 11, 8, 0.94)"
    };
  }
  if (playerId === "bot-3") {
    return {
      stroke: "rgba(192, 230, 128, 0.66)",
      thinking: "rgba(192, 230, 128, 0.72)",
      bgStart: "rgba(15, 26, 13, 0.9)",
      quoteBgStart: "rgba(14, 28, 14, 0.94)"
    };
  }
  return {
    stroke: "rgba(255, 226, 159, 0.55)",
    thinking: "rgba(255, 217, 142, 0.72)",
    bgStart: "rgba(12, 8, 6, 0.9)",
    quoteBgStart: "rgba(18, 9, 6, 0.92)"
  };
}

function getSceneVoiceState(voice?: VoiceSceneState): "off" | "on" | "muted" | "speaking" {
  if (!voice?.connected) {
    return "off";
  }
  if (voice.speaking) {
    return "speaking";
  }
  if (voice.muted) {
    return "muted";
  }
  return "on";
}

function getSceneVoiceLabel(voice?: VoiceSceneState) {
  const state = getSceneVoiceState(voice);
  if (state === "speaking") return "Speaking";
  if (state === "muted") return "Voice muted";
  if (state === "on") return "Voice on";
  return "Voice off";
}

function trimNameplateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function drawWrappedCenteredText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) {
    lines.push(current);
  }

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const last = visibleLines[visibleLines.length - 1] ?? "";
    visibleLines[visibleLines.length - 1] = `${last.replace(/[.”"]?$/u, "")}...`;
  }

  const firstY = y - ((visibleLines.length - 1) * lineHeight) / 2;
  visibleLines.forEach((line, index) => {
    context.fillText(line, x, firstY + index * lineHeight);
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawEyeGlint(context: CanvasRenderingContext2D, x: number, y: number) {
  const gradient = context.createRadialGradient(x - 2, y - 1, 1, x, y, 8);
  gradient.addColorStop(0, "rgba(255,246,205,0.72)");
  gradient.addColorStop(0.5, "rgba(239,183,99,0.24)");
  gradient.addColorStop(1, "rgba(239,183,99,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2);
  context.fill();
}

function characterEyeGlintPosition(index: number) {
  const positions = [
    new THREE.Vector3(0.08, 0.43, 0.018),
    new THREE.Vector3(0.07, 0.37, 0.018),
    new THREE.Vector3(-0.02, 0.6, 0.018),
    new THREE.Vector3(0.06, 0.5, 0.018)
  ];
  return positions[index] ?? positions[0];
}

function createFallbackWaterTexture(kind: "stream" | "splash" | "mist") {
  const canvas = document.createElement("canvas");
  canvas.width = kind === "stream" ? 256 : 128;
  canvas.height = kind === "stream" ? 48 : 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (kind === "stream") {
      const gradient = context.createLinearGradient(0, canvas.height / 2, canvas.width, canvas.height / 2);
      gradient.addColorStop(0, "rgba(178,242,255,0.05)");
      gradient.addColorStop(0.3, "rgba(195,248,255,0.72)");
      gradient.addColorStop(1, "rgba(90,210,255,0.2)");
      context.strokeStyle = gradient;
      context.lineWidth = 16;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(4, canvas.height / 2);
      context.bezierCurveTo(canvas.width * 0.35, 8, canvas.width * 0.65, canvas.height - 8, canvas.width - 4, canvas.height / 2);
      context.stroke();
    } else {
      const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, 4, canvas.width / 2, canvas.height / 2, canvas.width / 2);
      gradient.addColorStop(0, "rgba(215,250,255,0.8)");
      gradient.addColorStop(0.45, "rgba(119,226,255,0.35)");
      gradient.addColorStop(1, "rgba(119,226,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function characterAccentColor(index: number) {
  return [0xb979ff, 0xff7d4d, 0x57ffc0, 0xffce5d][index] ?? 0xffce5d;
}

function characterPoseConfig(pose: CharacterPose) {
  const configs: Record<
    CharacterPose,
    {
      y: number;
      z: number;
      scale: number;
      tilt: number;
      brightness: number;
      opacity: number;
      rimOpacity: number;
      glow: number;
      shadowOpacity: number;
    }
  > = {
    idle: { y: 0, z: 0, scale: 1, tilt: 0, brightness: 1.18, opacity: 1, rimOpacity: 0.08, glow: 0.28, shadowOpacity: 0.34 },
    active: { y: 0.08, z: 0.1, scale: 1.06, tilt: -0.02, brightness: 1.34, opacity: 1, rimOpacity: 0.13, glow: 0.56, shadowOpacity: 0.42 },
    thinking: { y: 0.035, z: 0.06, scale: 1.035, tilt: 0.018, brightness: 1.25, opacity: 1, rimOpacity: 0.1, glow: 0.38, shadowOpacity: 0.38 },
    play: { y: 0.11, z: 0.18, scale: 1.09, tilt: -0.052, brightness: 1.4, opacity: 1, rimOpacity: 0.15, glow: 0.62, shadowOpacity: 0.45 },
    accuse: { y: 0.12, z: 0.2, scale: 1.1, tilt: -0.07, brightness: 1.44, opacity: 1, rimOpacity: 0.17, glow: 0.7, shadowOpacity: 0.46 },
    accused: { y: 0.04, z: 0.04, scale: 1.04, tilt: 0.04, brightness: 1.24, opacity: 1, rimOpacity: 0.14, glow: 0.58, shadowOpacity: 0.42 },
    roulette: { y: 0.06, z: 0.12, scale: 1.08, tilt: 0.03, brightness: 1.38, opacity: 1, rimOpacity: 0.16, glow: 0.64, shadowOpacity: 0.45 },
    relief: { y: 0.02, z: -0.02, scale: 1.02, tilt: 0.035, brightness: 1.3, opacity: 1, rimOpacity: 0.11, glow: 0.48, shadowOpacity: 0.4 },
    eliminated: { y: -0.16, z: -0.08, scale: 0.94, tilt: -0.15, brightness: 0.64, opacity: 0.34, rimOpacity: 0.03, glow: 0.04, shadowOpacity: 0.16 },
    winner: { y: 0.18, z: 0.18, scale: 1.14, tilt: 0.02, brightness: 1.52, opacity: 1, rimOpacity: 0.2, glow: 0.92, shadowOpacity: 0.5 }
  };
  return configs[pose];
}

function createRankTexture(rank: Card["rank"], danger: boolean) {
  const cacheKey = `${rank}:${danger ? "danger" : "normal"}`;
  const cached = rankTextureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = CARD_FACE_SIZE.width;
  canvas.height = CARD_FACE_SIZE.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }
  const gradient = context.createLinearGradient(0, 0, CARD_FACE_SIZE.width, CARD_FACE_SIZE.height);
  gradient.addColorStop(0, danger ? "#ffe0d2" : "#fff7de");
  gradient.addColorStop(1, danger ? "#eaa083" : "#d7b769");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CARD_FACE_SIZE.width, CARD_FACE_SIZE.height);
  context.strokeStyle = danger ? "#a42a18" : "#583015";
  context.lineWidth = 12;
  context.strokeRect(12, 12, CARD_FACE_SIZE.width - 24, CARD_FACE_SIZE.height - 24);
  context.fillStyle = danger ? "#842414" : "#2f1908";
  context.font = "900 126px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(rankGlyph(rank), CARD_FACE_SIZE.width / 2, CARD_FACE_SIZE.height * 0.42);
  context.font = "800 32px Inter, Arial, sans-serif";
  context.fillText(displayRank(rank), CARD_FACE_SIZE.width / 2, CARD_FACE_SIZE.height * 0.72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  rankTextureCache.set(cacheKey, texture);
  return texture;
}

function createCardBackTexture() {
  if (cardBackTextureCache) {
    return cardBackTextureCache;
  }

  const canvas = document.createElement("canvas");
  canvas.width = CARD_FACE_SIZE.width;
  canvas.height = CARD_FACE_SIZE.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const gradient = context.createLinearGradient(0, 0, CARD_FACE_SIZE.width, CARD_FACE_SIZE.height);
  gradient.addColorStop(0, "#163724");
  gradient.addColorStop(0.5, "#28563f");
  gradient.addColorStop(1, "#0d2014");
  context.fillStyle = gradient;
  context.fillRect(0, 0, CARD_FACE_SIZE.width, CARD_FACE_SIZE.height);

  context.save();
  context.translate(-CARD_FACE_SIZE.width * 0.5, 0);
  context.rotate(-Math.PI / 6);
  for (let index = -4; index < 18; index += 1) {
    context.fillStyle = index % 2 ? "rgba(238, 196, 102, 0.09)" : "rgba(2, 12, 7, 0.18)";
    context.fillRect(index * 34, -CARD_FACE_SIZE.height, 12, CARD_FACE_SIZE.height * 2.4);
  }
  context.restore();

  context.strokeStyle = "rgba(242, 199, 97, 0.82)";
  context.lineWidth = 10;
  roundRect(context, 13, 13, CARD_FACE_SIZE.width - 26, CARD_FACE_SIZE.height - 26, 18);
  context.stroke();
  context.strokeStyle = "rgba(8, 28, 17, 0.84)";
  context.lineWidth = 4;
  roundRect(context, 29, 29, CARD_FACE_SIZE.width - 58, CARD_FACE_SIZE.height - 58, 12);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cardBackTextureCache = texture;
  return texture;
}

function createFallbackRoom() {
  const group = new THREE.Group();
  group.name = "FallbackRoom";
  group.add(new THREE.HemisphereLight(0x4d2a18, 0x080503, 0.4));
  addFallbackMesh(group, "FallbackFloor", new THREE.PlaneGeometry(18, 18), 0x241209, [0, -0.82, 0], [-Math.PI / 2, 0, 0]);
  addFallbackMesh(group, "FallbackWall", new THREE.PlaneGeometry(16, 8), 0x21100a, [0, 2.2, -6.2]);
  return group;
}

function createFallbackTable() {
  const group = new THREE.Group();
  group.name = "FallbackTable";
  addFallbackMesh(group, "FallbackTableTop", new THREE.CylinderGeometry(4.35, 4.48, 0.34, 96), 0x6b2d17, [0, 0, 0], [0, 0, 0], [1.18, 1, 0.78]);
  addFallbackMesh(group, "FallbackFelt", new THREE.CylinderGeometry(3.84, 3.88, 0.06, 96), 0xa43125, [0, 0.21, 0], [0, 0, 0], [1.14, 1, 0.74]);
  return group;
}

function createFallbackCharacter(index: number) {
  const colors = [0x7c4bce, 0xd15b34, 0x2dbd8f, 0xd5a643];
  const group = new THREE.Group();
  group.name = `Character_${index}`;
  addFallbackMesh(group, `Torso_${index}`, new THREE.CapsuleGeometry(0.34, 0.72, 6, 16), colors[index] ?? colors[0], [0, 0.34, 0], [0.08, 0, 0], [1.08, 1, 0.72]);
  addFallbackMesh(group, `Head_${index}`, new THREE.SphereGeometry(0.28, 24, 16), 0xe4b37f, [0, 0.98, 0.04]);
  addFallbackMesh(group, `RightArm_${index}`, new THREE.CapsuleGeometry(0.085, 0.56, 6, 12), colors[index] ?? colors[0], [0.42, 0.42, 0.1], [0.48, 0, -0.6]);
  addFallbackMesh(group, `RightHand_${index}`, new THREE.SphereGeometry(0.1, 16, 12), 0xe4b37f, [0.58, 0.24, 0.32]);
  return group;
}

function createFallbackToy() {
  const group = new THREE.Group();
  group.name = "CinematicRouletteProp";
  addFallbackMesh(group, "RevolverFrame", new THREE.CapsuleGeometry(0.18, 0.58, 10, 32), 0x2d3539, [-0.1, 0.03, 0], [0, 0, Math.PI / 2], [1.02, 0.78, 0.68]);
  addFallbackMesh(group, "FrameSidePlate", new THREE.BoxGeometry(0.46, 0.24, 0.022), 0xa4adb2, [-0.16, 0.02, 0.126], [0, 0, -0.06], [1, 0.8, 1]);
  addFallbackMesh(group, "FrameBevelTop", new THREE.BoxGeometry(0.78, 0.055, 0.026), 0xa4adb2, [0.06, 0.245, 0.012], [0, 0, -0.035]);
  addFallbackMesh(group, "TopStrap", new THREE.BoxGeometry(0.82, 0.095, 0.23), 0x2d3539, [0.08, 0.24, 0], [0, 0, -0.03]);
  addFallbackMesh(group, "Underlug", new THREE.BoxGeometry(0.62, 0.07, 0.16), 0x2d3539, [0.56, -0.018, 0], [0, 0, -0.03]);
  addFallbackMesh(group, "RealisticBarrel", new THREE.CylinderGeometry(0.085, 0.105, 0.92, 40), 0x2d3539, [0.62, 0.095, 0], [0, 0, Math.PI / 2]);
  addFallbackMesh(group, "BarrelRib", new THREE.BoxGeometry(0.78, 0.035, 0.09), 0xa4adb2, [0.63, 0.205, 0], [0, 0, -0.03]);
  addFallbackMesh(group, "MuzzleRing", new THREE.TorusGeometry(0.105, 0.013, 12, 36), 0xa4adb2, [1.1, 0.095, 0], [0, Math.PI / 2, 0]);
  addFallbackMesh(group, "BarrelBore", new THREE.CylinderGeometry(0.043, 0.043, 0.012, 24), 0x070809, [1.108, 0.095, 0], [0, 0, Math.PI / 2]);
  addFallbackMesh(group, "FrontSight", new THREE.BoxGeometry(0.06, 0.075, 0.035), 0xa4adb2, [0.98, 0.265, 0], [0, 0, -0.08]);
  addFallbackMesh(group, "RearSight", new THREE.BoxGeometry(0.09, 0.044, 0.075), 0xa4adb2, [-0.18, 0.31, 0], [0, 0, -0.05]);
  addFallbackAnchor(group, "NozzleAnchor", [1.18, 0.095, 0]);
  const chamberGroup = new THREE.Group();
  chamberGroup.name = "SixShotDial";
  chamberGroup.position.set(0.04, 0.06, 0.16);
  group.add(chamberGroup);
  addFallbackMesh(chamberGroup, "SixShotCylinder", new THREE.CylinderGeometry(0.22, 0.22, 0.3, 48), 0x2d3539, [0, 0, -0.16], [Math.PI / 2, 0, 0]);
  addFallbackMesh(chamberGroup, "CylinderFrontRim", new THREE.TorusGeometry(0.22, 0.011, 10, 48), 0xa4adb2, [0, 0, -0.004], [0, 0, 0]);
  addFallbackMesh(chamberGroup, "CylinderAxisPin", new THREE.CylinderGeometry(0.035, 0.035, 0.024, 20), 0xa4adb2, [0, 0, 0.004], [Math.PI / 2, 0, 0]);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    addFallbackMesh(chamberGroup, `ChamberMark_${index}`, new THREE.CylinderGeometry(0.028, 0.028, 0.013, 14), 0x0d0f10, [Math.cos(angle) * 0.115, Math.sin(angle) * 0.115, -0.01], [Math.PI / 2, 0, 0]);
  }
  addFallbackMesh(group, "CylinderYoke", new THREE.BoxGeometry(0.07, 0.22, 0.05), 0xa4adb2, [0.29, 0.05, 0.03], [0, 0, -0.07]);
  addFallbackMesh(group, "EjectorRod", new THREE.CylinderGeometry(0.025, 0.025, 0.66, 20), 0xa4adb2, [0.58, -0.075, 0], [0, 0, Math.PI / 2]);
  addFallbackMesh(group, "Hammer", new THREE.BoxGeometry(0.13, 0.19, 0.06), 0x2d3539, [-0.47, 0.28, 0], [0, 0, -0.36]);
  addFallbackMesh(group, "HammerSpur", new THREE.BoxGeometry(0.12, 0.035, 0.07), 0xa4adb2, [-0.53, 0.39, 0], [0, 0, -0.16]);
  addFallbackMesh(group, "TriggerGuard", new THREE.TorusGeometry(0.155, 0.014, 8, 36, Math.PI * 1.5), 0xa4adb2, [-0.22, -0.225, 0], [Math.PI / 2, 0, -0.34], [1.08, 0.76, 1]);
  addFallbackMesh(group, "Trigger", new THREE.CapsuleGeometry(0.026, 0.18, 7, 14), 0x2d3539, [-0.16, -0.214, 0.04], [0, 0, -0.42], [0.72, 1, 0.72]);
  addFallbackAnchor(group, "TriggerPivot", [-0.16, -0.17, 0.08]);
  addFallbackMesh(group, "AngledGrip", new THREE.BoxGeometry(0.23, 0.78, 0.25), 0x4a2313, [-0.5, -0.48, 0], [0, 0, -0.32], [0.92, 1, 0.86]);
  addFallbackMesh(group, "GripPanelLeft", new THREE.BoxGeometry(0.17, 0.54, 0.018), 0x6d351b, [-0.48, -0.48, 0.14], [0, 0, -0.32]);
  addFallbackMesh(group, "GripPanelRight", new THREE.BoxGeometry(0.17, 0.54, 0.018), 0x6d351b, [-0.48, -0.48, -0.14], [0, 0, -0.32]);
  addFallbackMesh(group, "GripScrew", new THREE.CylinderGeometry(0.022, 0.022, 0.02, 18), 0xa4adb2, [-0.47, -0.47, 0.153], [Math.PI / 2, 0, 0]);
  addFallbackMesh(group, "GripCap", new THREE.BoxGeometry(0.27, 0.06, 0.27), 0xa4adb2, [-0.61, -0.83, 0], [0, 0, -0.32]);
  addFallbackMesh(group, "ResultLight", new THREE.SphereGeometry(0.014, 12, 8), 0x8cecff, [0.34, 0.26, 0.02]);
  return group;
}

function addFallbackAnchor(group: THREE.Group, name: string, position: [number, number, number]) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.fromArray(position);
  group.add(anchor);
  return anchor;
}

function createRouletteBurst() {
  const group = new THREE.Group();
  group.name = "RouletteResultBurst";

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x72ff9a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 12, 64), haloMaterial);
  halo.name = "RouletteBurstHalo";
  halo.rotation.y = Math.PI / 2;
  group.add(halo);

  const coreMaterial = haloMaterial.clone();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 12), coreMaterial);
  core.name = "RouletteBurstCore";
  group.add(core);

  for (let index = 0; index < 8; index += 1) {
    const rayMaterial = haloMaterial.clone();
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.018), rayMaterial);
    const angle = (index / 8) * Math.PI * 2;
    ray.name = `RouletteBurstRay_${index}`;
    ray.position.set(0, Math.sin(angle) * 0.17, Math.cos(angle) * 0.17);
    ray.rotation.x = angle;
    group.add(ray);
  }

  return group;
}

function createFallbackCard() {
  const group = new THREE.Group();
  group.name = "PlayingCard";
  addFallbackMesh(group, "CardBody", new THREE.BoxGeometry(0.62, 0.035, 0.9), 0x2e4c38);
  addFallbackMesh(group, "CardFace", new THREE.BoxGeometry(0.58, 0.006, 0.86), 0xf7e4b2, [0, 0.023, 0]);
  addFallbackMesh(group, "CardBack", new THREE.BoxGeometry(0.58, 0.006, 0.86), 0x27563e, [0, -0.023, 0]);
  return group;
}

function addFallbackMesh(
  group: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number] = [0, 0, 0],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1]
) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.name = name;
  mesh.position.fromArray(position);
  mesh.rotation.set(...rotation);
  mesh.scale.fromArray(scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function findMesh(group: THREE.Object3D, name: string) {
  const item = group.getObjectByName(name);
  return item instanceof THREE.Mesh ? item : undefined;
}

function findFirstMesh(group: THREE.Object3D) {
  let mesh: THREE.Mesh | undefined;
  group.traverse((child) => {
    if (!mesh && child instanceof THREE.Mesh) {
      mesh = child;
    }
  });
  return mesh;
}

function findObjectByNameIncludes(group: THREE.Object3D, tokens: string[]) {
  let match: THREE.Object3D | undefined;
  group.traverse((child) => {
    if (match || !child.name) {
      return;
    }
    const normalized = child.name.toLowerCase();
    if (tokens.some((token) => normalized.includes(token))) {
      match = child;
    }
  });
  return match;
}

function ensureMaterial(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material[0]?.clone() ?? new THREE.MeshStandardMaterial();
  } else {
    mesh.material = mesh.material.clone();
  }
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.transparent = material.transparent || material.opacity < 1;
  return material;
}

function setOpacity(material: THREE.MeshStandardMaterial | undefined, opacity: number) {
  if (!material) {
    return;
  }
  material.opacity = opacity;
  material.transparent = opacity < 1;
}

function setEmissive(material: THREE.MeshStandardMaterial | undefined, intensity: number) {
  if (!material) {
    return;
  }
  material.emissiveIntensity = intensity;
}

function seatDefinitions() {
  return [
    { x: 0, z: -4.05, rotation: 0 },
    { x: -3.9, z: -0.75, rotation: Math.PI / 2.6 },
    { x: 0, z: 3.65, rotation: Math.PI },
    { x: 3.9, z: -0.75, rotation: -Math.PI / 2.6 }
  ];
}

function seatWorld(index: number) {
  const positions = seatDefinitions();
  return positions[Math.max(0, index)] ?? positions[0];
}

function tablePoint(name: "deck" | "pile" | "rank" | "roulette" | "rouletteCenter" | "reveal") {
  const points = {
    deck: new THREE.Vector3(0.98, 0.5, 0.9),
    pile: new THREE.Vector3(-0.18, 0.52, -0.28),
    rank: new THREE.Vector3(-1.82, 0.52, 0.08),
    roulette: new THREE.Vector3(1.68, 0.55, 0.65),
    rouletteCenter: new THREE.Vector3(0.18, 1.08, 0.46),
    reveal: new THREE.Vector3(-0.95, 0.6, 0.92)
  };
  return points[name].clone();
}

function rankColor(rank?: Card["rank"]) {
  if (rank === "KING") return 0xf5d891;
  if (rank === "QUEEN") return 0xf2c6de;
  if (rank === "ACE") return 0xd7e6ff;
  if (rank === "JOKER") return 0xf8f1bd;
  return 0xf7e4b2;
}

function displayRank(rank: Card["rank"]): string {
  if (rank === "JOKER") return "Joker";
  return rank.charAt(0) + rank.slice(1).toLowerCase();
}

function rankGlyph(rank: Card["rank"]): string {
  if (rank === "KING") return "K";
  if (rank === "QUEEN") return "Q";
  if (rank === "ACE") return "A";
  return "J";
}

function detectQuality(host: HTMLDivElement): CinematicQualityProfile {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "reduced-motion";
  }
  return host.clientWidth < 820 || window.devicePixelRatio > 2 ? "mobile" : "desktop";
}

function playerIndexFromPlayers(players: PublicPlayer[], playerId: string) {
  return players.findIndex((player) => player.id === playerId);
}

function easeOutCubic(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function easeOutBack(progress: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function dampFactor(deltaSeconds: number, speed: number) {
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * speed);
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shouldIgnoreOrbitDrag(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      'button, input, textarea, select, a, [role="button"], .topbar, .voice-dock, .bottom-action-tray, .rules-overlay, .challenge-panel, .toast, .entry-grid'
    )
  );
}
