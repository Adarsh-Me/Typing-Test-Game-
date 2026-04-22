import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { suburbanEscapeWorld, type Biome, type ChunkPieceDef, type ChunkTemplate } from "./levelTemplate";
import {
  buildChunkTuning,
  computeGapDelta,
  decayMomentum,
  getCameraMode,
  getLaneHalfWidthAtDepth,
  getRoadOffsetAtDepth,
  type ActorState,
  type ChunkTuning
} from "./worldTuning";

type PickupKind = "potion" | "shield" | "sword" | "bow";

interface CatalogModel {
  id?: string;
  name: string;
  pack: string;
  category: string;
  preferredThreeJsPath: string | null;
  formats: Record<string, string | undefined>;
}

export interface CanonicalAssetsManifest {
  catalog: {
    models: CatalogModel[];
  };
}

interface WorldCallbacks {
  onPickup: (kind: PickupKind) => void;
  onShieldConsumed: () => void;
  onCaught: () => void;
}

interface Chunk {
  group: THREE.Group;
  biome: Biome;
  tuning: ChunkTuning;
  pickup?: {
    kind: PickupKind;
    object: THREE.Object3D;
    active: boolean;
  };
}

interface WorldSnapshot {
  biome: Biome;
  actorState: ActorState;
  enemyGap: number;
}

interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

const PLAYER_POSITION = new THREE.Vector3(
  suburbanEscapeWorld.playerSpawn.x,
  0,
  suburbanEscapeWorld.playerSpawn.z
);
const PATH_AHEAD_Z = -18;
const CHUNK_LENGTH = suburbanEscapeWorld.chunkStreaming.chunkLength;
const MAX_CHUNKS =
  suburbanEscapeWorld.chunkStreaming.spawnAhead + suburbanEscapeWorld.chunkStreaming.despawnBehind + 2;

function toPublicUrl(sourcePath: string): string {
  return encodeURI(`/${sourcePath.replace(/^assets\//, "")}`);
}

class ModelLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<LoadedModel>>();

  async instantiate(sourcePath: string): Promise<LoadedModel> {
    const loaded = await this.load(sourcePath);
    return {
      scene: cloneSkinned(loaded.scene),
      animations: loaded.animations
    };
  }

  private load(sourcePath: string): Promise<LoadedModel> {
    if (!this.cache.has(sourcePath)) {
      this.cache.set(
        sourcePath,
        new Promise<LoadedModel>((resolve, reject) => {
          this.loader.load(
            toPublicUrl(sourcePath),
            (gltf: GLTF) => {
              gltf.scene.traverse((object: THREE.Object3D) => {
                if (object instanceof THREE.Mesh) {
                  object.castShadow = true;
                  object.receiveShadow = true;
                }
              });
              resolve({
                scene: gltf.scene,
                animations: gltf.animations
              });
            },
            undefined,
            reject
          );
        })
      );
    }
    return this.cache.get(sourcePath)!;
  }
}

export class ThreeChaseWorld {
  private container: HTMLElement;
  private assets: CanonicalAssetsManifest;
  private callbacks: WorldCallbacks;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private library = new ModelLibrary();

  private chunks: Chunk[] = [];
  private chunkCounter = 0;
  private worldGeneration = 0;

  private playerRoot = new THREE.Group();
  private enemyRoot = new THREE.Group();
  private playerMixer: THREE.AnimationMixer | null = null;
  private enemyMixer: THREE.AnimationMixer | null = null;
  private playerShadow: THREE.Mesh | null = null;
  private enemyShadow: THREE.Mesh | null = null;

  private worldSpeed = 7.6;
  private momentum = 0;
  private stumbleUntil = 0;
  private swordUntil = 0;
  private bowUntil = 0;
  private shieldCharges = 0;
  private enemyGap = 9.5;
  private actorState: ActorState = "RUN";
  private running = false;
  private lastTime = 0;
  private runStartMs = 0;
  private snapshot: WorldSnapshot = {
    biome: "suburban_main",
    actorState: "RUN",
    enemyGap: 9.5
  };

  private paths!: {
    shield: string;
    sword: string;
    bow: string;
    potion: string;
    knight: string;
    pursuer: string;
  };

  constructor(container: HTMLElement, assets: CanonicalAssetsManifest, callbacks: WorldCallbacks) {
    this.container = container;
    this.assets = assets;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#98ddff");
    this.scene.fog = new THREE.Fog("#98ddff", 36, 118);

    this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 220);
    this.camera.position.set(12, 8.8, 18);
    this.camera.lookAt(0, 1.1, PATH_AHEAD_Z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.handleResize = this.handleResize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  async init(): Promise<void> {
    this.paths = {
      shield: this.requireAsset("adventurers:shield_square"),
      sword: this.requireAsset("adventurers:sword_1handed"),
      bow: this.requireAsset("adventurers:bow_withString"),
      potion: this.requireAsset("adventurers:mug_full"),
      knight: this.requireAsset("adventurers:Knight"),
      pursuer: this.requireAsset("adventurers:Rogue_Hooded")
    };

    this.setupLights();
    this.setupBackdrop();
    await this.setupActors();
    this.resetChunks();
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  startRun(): void {
    this.momentum = 0;
    this.worldSpeed = 7.6;
    this.enemyGap = 10.5;
    this.shieldCharges = 0;
    this.stumbleUntil = 0;
    this.swordUntil = 0;
    this.bowUntil = 0;
    this.actorState = "RUN";
    this.runStartMs = performance.now();
    this.snapshot = {
      biome: "suburban_main",
      actorState: "RUN",
      enemyGap: 10.5
    };
    this.enemyRoot.position.set(suburbanEscapeWorld.enemySpawn.x, 0, PLAYER_POSITION.z + this.enemyGap);
    this.resetChunks();
  }

  dispose(): void {
    this.running = false;
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  onCorrectChar(): void {
    this.momentum = THREE.MathUtils.clamp(this.momentum + 0.075, 0, 1);
  }

  onMistake(): void {
    this.momentum = THREE.MathUtils.clamp(
      this.momentum - suburbanEscapeWorld.typingTriggers.mistypeSpeedPenalty,
      0,
      1
    );
    this.stumbleUntil = performance.now() + 260;
    this.actorState = "STUMBLE";
  }

  onWordCorrect(comboMultiplier: number): void {
    this.momentum = THREE.MathUtils.clamp(
      this.momentum + 0.05 * suburbanEscapeWorld.typingTriggers.correctWordAdvance + 0.04,
      0,
      1
    );
    if (comboMultiplier >= 2) {
      this.bowUntil = Math.max(
        this.bowUntil,
        performance.now() + 900 * suburbanEscapeWorld.typingTriggers.combo5Boost
      );
    }
    if (comboMultiplier >= 3) {
      this.swordUntil = Math.max(this.swordUntil, performance.now() + 1400);
    }
  }

  recover(): void {
    this.stumbleUntil = 0;
    this.momentum = THREE.MathUtils.clamp(this.momentum + 0.18, 0, 1);
    this.actorState = "RUN";
  }

  setShieldCharges(count: number): void {
    this.shieldCharges = count;
  }

  setBowBoost(active: boolean): void {
    this.bowUntil = active ? Math.max(this.bowUntil, performance.now() + 150) : performance.now();
  }

  setSwordBoost(active: boolean): void {
    this.swordUntil = active ? Math.max(this.swordUntil, performance.now() + 150) : performance.now();
  }

  getSnapshot(): WorldSnapshot {
    return { ...this.snapshot };
  }

  private async setupActors(): Promise<void> {
    const playerLoaded = await this.library.instantiate(this.paths.knight);
    this.playerRoot = new THREE.Group();
    this.playerRoot.add(playerLoaded.scene);
    this.playerRoot.position.copy(PLAYER_POSITION);
    this.playerRoot.rotation.y = Math.PI;
    this.playerRoot.scale.setScalar(1.34);
    this.scene.add(this.playerRoot);
    if (playerLoaded.animations.length > 0) {
      this.playerMixer = new THREE.AnimationMixer(playerLoaded.scene);
      this.playerMixer.clipAction(playerLoaded.animations[0]).play();
    }

    const enemyLoaded = await this.library.instantiate(this.paths.pursuer);
    this.enemyRoot = new THREE.Group();
    this.enemyRoot.add(enemyLoaded.scene);
    this.enemyRoot.position.set(PLAYER_POSITION.x, PLAYER_POSITION.y, PLAYER_POSITION.z + this.enemyGap);
    this.enemyRoot.rotation.y = Math.PI;
    this.enemyRoot.scale.setScalar(1.24);
    this.scene.add(this.enemyRoot);
    if (enemyLoaded.animations.length > 0) {
      this.enemyMixer = new THREE.AnimationMixer(enemyLoaded.scene);
      this.enemyMixer.clipAction(enemyLoaded.animations[0]).play();
    }

    this.playerShadow = this.makeShadow(2.25, PLAYER_POSITION.z + 1);
    this.enemyShadow = this.makeShadow(1.9, PLAYER_POSITION.z + this.enemyGap + 1);
  }

  private makeShadow(radius: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ color: "#17314c", transparent: true, opacity: 0.16 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(PLAYER_POSITION.x, 0.03, z);
    this.scene.add(mesh);
    return mesh;
  }

  private setupBackdrop(): void {
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 150),
      new THREE.MeshBasicMaterial({ color: "#d7f3ff" })
    );
    sky.position.set(0, 48, -92);
    this.scene.add(sky);

    for (const x of [-58, -32, -8, 18, 44, 66]) {
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(20, 10 + Math.abs(x) * 0.02, 14),
        new THREE.MeshLambertMaterial({ color: "#86c0d8" })
      );
      roof.position.set(x, 5.5, -74 - Math.abs(x) * 0.18);
      roof.rotation.y = 0.12;
      this.scene.add(roof);
    }

    for (const x of [-62, -46, -28, 32, 50, 68]) {
      const tree = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 8, 6),
        new THREE.MeshLambertMaterial({ color: "#77b85f" })
      );
      tree.position.set(x, 4.8, -61 - Math.abs(x) * 0.22);
      this.scene.add(tree);
    }
  }

  private setupLights(): void {
    const ambient = new THREE.HemisphereLight("#fff9df", "#6ea6c3", 1.55);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff0b3", 1.8);
    sun.position.set(24, 28, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight("#a5e5ff", 0.8);
    fill.position.set(-16, 20, -18);
    this.scene.add(fill);
  }

  private loop(now: number): void {
    if (!this.running) return;
    const dt = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(dt, now);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.loop);
  }

  private update(dt: number, now: number): void {
    this.momentum = decayMomentum(this.momentum, dt);
    const stumble = now < this.stumbleUntil;
    const bowBoost = now < this.bowUntil;
    const swordBoost = now < this.swordUntil;
    const currentChunk = this.currentChunk();
    const lanePressure = currentChunk?.tuning.enemyPressure ?? 1;
    const lanePenalty = currentChunk ? Math.max(0, 4.7 - currentChunk.tuning.laneHalfWidth) : 0;

    const targetSpeed =
      7.6 +
      this.momentum * 7.8 +
      (bowBoost ? 2.1 : 0) +
      (swordBoost ? 0.9 : 0) -
      lanePenalty * (1 - this.momentum) * 1.35;
    this.worldSpeed = THREE.MathUtils.lerp(this.worldSpeed, targetSpeed, 0.08);
    const enemySpeed = 6.7 + (1 - this.momentum) * 4.1;

    this.actorState = stumble ? "STUMBLE" : this.momentum > 0.76 ? "SPRINT" : "RUN";
    this.snapshot.actorState = this.actorState;
    this.snapshot.biome = currentChunk?.biome ?? "suburban_main";

    for (const chunk of this.chunks) {
      chunk.group.position.z += this.worldSpeed * dt;
      if (chunk.pickup && chunk.pickup.active) {
        chunk.pickup.object.rotation.y += dt * 2.2;
        chunk.pickup.object.position.y = 1.55 + Math.sin(now * 0.006) * 0.18;
        if (chunk.group.position.z + chunk.pickup.object.position.z > PLAYER_POSITION.z + 1) {
          chunk.pickup.active = false;
          chunk.pickup.object.visible = false;
          this.callbacks.onPickup(chunk.pickup.kind);
        }
      }
    }

    this.recycleChunks();

    const catchRate = (stumble ? 2.8 : 1.0) * lanePressure;
    this.enemyGap += computeGapDelta({ worldSpeed: this.worldSpeed, enemySpeed, catchRate }) * dt;
    if (currentChunk && currentChunk.tuning.laneHalfWidth < 3.6 && this.momentum < 0.38) {
      this.enemyGap -= dt * 1.15;
    }
    this.enemyGap = THREE.MathUtils.clamp(this.enemyGap, 2.6, 16.8);
    this.snapshot.enemyGap = this.enemyGap;
    this.enemyRoot.position.z = PLAYER_POSITION.z + this.enemyGap;

    if (this.enemyGap <= 3.2) {
      if (this.shieldCharges > 0) {
        this.shieldCharges -= 1;
        this.callbacks.onShieldConsumed();
        this.enemyGap = 7.2;
      } else {
        this.actorState = "HIT";
        this.snapshot.actorState = "HIT";
        this.callbacks.onCaught();
      }
    }

    this.animateActors(dt, now);
    this.updateCamera(dt, now, currentChunk);
  }

  private animateActors(dt: number, now: number): void {
    const playerBob = Math.sin(now * 0.014) * 0.08;
    const enemyBob = Math.sin(now * 0.012 + 0.6) * 0.07;
    this.playerRoot.position.y = PLAYER_POSITION.y + playerBob + (this.actorState === "STUMBLE" ? -0.12 : 0);
    this.enemyRoot.position.y = PLAYER_POSITION.y + enemyBob;
    this.playerRoot.rotation.z =
      this.actorState === "STUMBLE" ? -0.28 : this.actorState === "SPRINT" ? -0.06 : 0;
    this.enemyRoot.rotation.z = 0.04;

    if (this.playerShadow) {
      this.playerShadow.position.z = PLAYER_POSITION.z + 1;
      this.playerShadow.scale.setScalar(this.actorState === "STUMBLE" ? 0.86 : 1);
    }
    if (this.enemyShadow) {
      this.enemyShadow.position.z = PLAYER_POSITION.z + this.enemyGap + 1;
    }

    if (this.playerMixer) this.playerMixer.update(dt * (this.actorState === "SPRINT" ? 1.45 : 1.05));
    if (this.enemyMixer) this.enemyMixer.update(dt * 1.2);
  }

  private updateCamera(dt: number, now: number, currentChunk: Chunk | null): void {
    const runElapsedSec = this.runStartMs > 0 ? (now - this.runStartMs) / 1000 : 99;
    const mode = getCameraMode({
      runElapsedSec,
      enemyGap: this.enemyGap,
      momentum: this.momentum,
      actorState: this.actorState
    });
    const roadFocusX = currentChunk ? this.currentRoadCenterX(currentChunk) : 0;

    let targetX = roadFocusX + 4.9;
    let targetY = 5.2;
    let targetZ = 9.4;
    let lookX = roadFocusX;
    let lookY = 1.15;
    let lookZ = PATH_AHEAD_Z;

    if (mode === "intro") {
      const introBlend = THREE.MathUtils.clamp(runElapsedSec / 2.2, 0, 1);
      targetX = THREE.MathUtils.lerp(13.2, 5.6, introBlend) + roadFocusX * 0.2;
      targetY = THREE.MathUtils.lerp(9.2, 5.6, introBlend);
      targetZ = THREE.MathUtils.lerp(24.4, 10.4, introBlend);
      lookX = THREE.MathUtils.lerp(roadFocusX + 0.8, roadFocusX, introBlend);
      lookY = THREE.MathUtils.lerp(1.6, 1.15, introBlend);
      lookZ = THREE.MathUtils.lerp(-6.5, PATH_AHEAD_Z, introBlend);
    } else if (mode === "threat") {
      targetX = roadFocusX + 9.4;
      targetY = 7.6;
      targetZ = 17.2 + this.enemyGap * 0.14;
      lookX = roadFocusX;
      lookY = 1.15;
      lookZ = -12.4;
    }

    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, dt * 3.2);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, dt * 3.2);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetZ, dt * 3.2);

    const currentLook = new THREE.Vector3();
    this.camera.getWorldDirection(currentLook);
    const lookTarget = new THREE.Vector3(lookX, lookY, lookZ);
    this.camera.lookAt(lookTarget);
  }

  private currentRoadCenterX(chunk: Chunk): number {
    const localZ = PLAYER_POSITION.z - chunk.group.position.z;
    return this.roadOffsetForZ(chunk.tuning, localZ);
  }

  private currentChunk(): Chunk | null {
    if (this.chunks.length === 0) return null;
    const sorted = [...this.chunks].sort(
      (a, b) =>
        Math.abs(a.group.position.z - PLAYER_POSITION.z) - Math.abs(b.group.position.z - PLAYER_POSITION.z)
    );
    return sorted[0] ?? null;
  }

  private resetChunks(): void {
    this.chunks.forEach((chunk) => this.scene.remove(chunk.group));
    this.chunks = [];
    this.chunkCounter = 0;
    const generation = ++this.worldGeneration;

    for (let i = 0; i < MAX_CHUNKS; i += 1) {
      void this.spawnChunkAt(-(i * CHUNK_LENGTH), generation);
    }
  }

  private recycleChunks(): void {
    const generation = this.worldGeneration;
    const farthestAheadZ = Math.min(...this.chunks.map((chunk) => chunk.group.position.z));
    for (const chunk of this.chunks) {
      if (chunk.group.position.z > 28) {
        this.scene.remove(chunk.group);
        chunk.group.position.z = -9999;
        void this.rebuildChunk(chunk, farthestAheadZ - CHUNK_LENGTH, generation);
        break;
      }
    }
  }

  private async rebuildChunk(chunk: Chunk, nextZ: number, generation: number): Promise<void> {
    chunk.group.clear();
    const template = this.templateFromIndex(this.chunkCounter);
    chunk.biome = template.biome;
    chunk.tuning = buildChunkTuning(this.chunkCounter, template.biome);
    chunk.group.position.set(0, 0, nextZ);
    chunk.pickup = undefined;
    await this.populateChunk(chunk, template, this.chunkCounter);
    if (generation !== this.worldGeneration) return;
    this.scene.add(chunk.group);
  }

  private async spawnChunkAt(z: number, generation: number): Promise<void> {
    const template = this.templateFromIndex(this.chunkCounter);
    const chunk: Chunk = {
      group: new THREE.Group(),
      biome: template.biome,
      tuning: buildChunkTuning(this.chunkCounter, template.biome)
    };
    chunk.group.position.set(0, 0, z);
    await this.populateChunk(chunk, template, this.chunkCounter);
    if (generation !== this.worldGeneration) return;
    this.chunks.push(chunk);
    this.scene.add(chunk.group);
  }

  private async populateChunk(chunk: Chunk, template: ChunkTemplate, chunkIndex: number): Promise<void> {
    this.chunkCounter += 1;
    this.addChunkGround(chunk, template.biome, chunkIndex);

    for (const piece of template.road) {
      const object = await this.instantiatePiece(piece, chunk.tuning);
      chunk.group.add(object);
    }

    for (const piece of template.props) {
      const object = await this.instantiatePiece(piece, chunk.tuning);
      chunk.group.add(object);
    }

    this.addLaneMarkers(chunk, template.biome);
    await this.addAmbientVariation(chunk, template, chunkIndex);

    if (template.pickupAnchor && chunkIndex > 1 && chunkIndex % 2 === 0) {
      const kinds: PickupKind[] = ["potion", "shield", "sword", "bow"];
      const kind = kinds[chunkIndex % kinds.length];
      const source =
        kind === "potion"
          ? this.paths.potion
          : kind === "shield"
            ? this.paths.shield
            : kind === "sword"
              ? this.paths.sword
              : this.paths.bow;
      const pickup = await this.instantiateScaled(source, kind === "bow" ? 1.2 : 0.95);
      const pickupOffset = this.roadOffsetForZ(chunk.tuning, template.pickupAnchor.z);
      pickup.position.set(template.pickupAnchor.x + pickupOffset, 1.55, template.pickupAnchor.z);
      chunk.group.add(pickup);
      chunk.pickup = { kind, object: pickup, active: true };
    }
  }

  private addChunkGround(chunk: Chunk, biome: Biome, chunkIndex: number): void {
    const lotColor =
      biome === "tree_run"
        ? "#7fca66"
        : biome === "fence_choke"
          ? "#8bc96c"
          : biome === "estate_row"
            ? "#89c85d"
            : "#93d56c";
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(64, 0.6, CHUNK_LENGTH + 8),
      new THREE.MeshLambertMaterial({ color: lotColor })
    );
    base.receiveShadow = true;
    base.position.set(0, -0.35, -CHUNK_LENGTH / 2 + 2);
    chunk.group.add(base);

    for (let segment = 0; segment < 7; segment += 1) {
      const t = segment / 6;
      const z = -4 - segment * 5.6;
      const laneHalfWidth = getLaneHalfWidthAtDepth(chunk.tuning, biome, t);
      const centerX = getRoadOffsetAtDepth(chunk.tuning, t);
      const yaw = this.roadYawForDepth(chunk.tuning, t);

      const asphalt = new THREE.Mesh(
        new THREE.BoxGeometry(laneHalfWidth * 2 + 2.1, 0.08, 6.2),
        new THREE.MeshLambertMaterial({ color: "#65727f" })
      );
      asphalt.position.set(centerX, 0.02, z);
      asphalt.rotation.y = yaw;
      asphalt.receiveShadow = true;
      chunk.group.add(asphalt);

      const curbMaterial = new THREE.MeshLambertMaterial({ color: "#c4cbc7" });
      const curbLeft = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.22, 6.4), curbMaterial);
      curbLeft.position.set(centerX - laneHalfWidth - 1.05, 0.12, z);
      curbLeft.rotation.y = yaw;
      chunk.group.add(curbLeft);

      const curbRight = curbLeft.clone();
      curbRight.position.x = centerX + laneHalfWidth + 1.05;
      chunk.group.add(curbRight);

      const sidewalkLeft = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 0.04, 5.8),
        new THREE.MeshLambertMaterial({ color: "#dde6df" })
      );
      sidewalkLeft.position.set(centerX - laneHalfWidth - 3.1, 0.08, z);
      sidewalkLeft.rotation.y = yaw;
      chunk.group.add(sidewalkLeft);

      const sidewalkRight = sidewalkLeft.clone();
      sidewalkRight.position.x = centerX + laneHalfWidth + 3.1;
      chunk.group.add(sidewalkRight);
    }

    if (chunkIndex % 2 === 1) {
      const flowerStrip = new THREE.Mesh(
        new THREE.BoxGeometry(38, 0.08, 1.6),
        new THREE.MeshLambertMaterial({ color: "#ffd35b" })
      );
      flowerStrip.position.set(0, 0.02, -CHUNK_LENGTH + 1.5);
      chunk.group.add(flowerStrip);
    }
  }

  private addLaneMarkers(chunk: Chunk, biome: Biome): void {
    for (const [i, z] of [-7, -14, -21, -28, -35].entries()) {
      const t = i / 4;
      const laneHalfWidth = getLaneHalfWidthAtDepth(chunk.tuning, biome, t);
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(0.42, laneHalfWidth * 0.12), 0.06, 2.4),
        new THREE.MeshLambertMaterial({ color: "#fff3bb" })
      );
      marker.position.set(this.roadOffsetForZ(chunk.tuning, z), 0.08, z);
      marker.rotation.y = this.roadYawForLocalZ(chunk.tuning, z);
      chunk.group.add(marker);
    }
  }

  private async addAmbientVariation(
    chunk: Chunk,
    template: ChunkTemplate,
    chunkIndex: number
  ): Promise<void> {
    const signHouse = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.6, 0.3),
      new THREE.MeshLambertMaterial({ color: "#f8f4ef" })
    );
    const signZ = -32;
    signHouse.position.set(this.roadOffsetForZ(chunk.tuning, signZ) + (chunkIndex % 2 === 0 ? -8.2 : 8.2), 1.2, signZ);
    signHouse.rotation.y = chunkIndex % 2 === 0 ? 0.24 : -0.24;
    chunk.group.add(signHouse);

    if (template.biome === "suburban_main" || template.biome === "estate_row") {
      const houseId = `suburban_kenney:house_type${String(((chunkIndex * 3) % 19) + 3).padStart(2, "0")}`;
      const fallbackId =
        template.biome === "estate_row" ? "suburban_kenney:house_type21" : "suburban_kenney:house_type10";
      const houseSource = this.tryAsset(houseId) ?? this.requireAsset(fallbackId);
      const house = await this.instantiateScaled(houseSource, chunk.tuning.houseScale);
      const z = -18;
      house.position.set(this.roadOffsetForZ(chunk.tuning, z) + (chunkIndex % 2 === 0 ? 15.5 : -15.5), 0, z);
      house.rotation.y = chunkIndex % 2 === 0 ? -0.3 : 0.3;
      chunk.group.add(house);
    }
  }

  private async instantiatePiece(piece: ChunkPieceDef, tuning: ChunkTuning): Promise<THREE.Object3D> {
    const source = this.requireAsset(piece.id);
    const object = await this.instantiateScaled(source, this.resolvePieceScale(piece, tuning));
    const curveOffset = this.roadOffsetForZ(tuning, piece.z);
    const curveYaw = this.roadYawForLocalZ(tuning, piece.z);
    const edgePull =
      piece.id.includes("house_type") && Math.abs(piece.x) > 10 ? Math.sign(piece.x) * -2.4 : 0;
    object.position.set(piece.x + edgePull + curveOffset, piece.y ?? 0, piece.z);
    object.rotation.y =
      (typeof piece.rotationY === "number" ? piece.rotationY : 0) +
      curveYaw * (Math.abs(piece.x) <= tuning.shoulderWidth ? 1 : 0.35);
    return object;
  }

  private resolvePieceScale(piece: ChunkPieceDef, tuning: ChunkTuning): number {
    const baseScale = piece.scale ?? 1;
    if (piece.id.includes("house_type")) return Math.max(baseScale, tuning.houseScale);
    return baseScale;
  }

  private templateFromIndex(index: number): ChunkTemplate {
    return suburbanEscapeWorld.chunkTemplates[index % suburbanEscapeWorld.chunkTemplates.length];
  }

  private async instantiateScaled(source: string, scale: number): Promise<THREE.Object3D> {
    const loaded = await this.library.instantiate(source);
    const object = loaded.scene;
    object.scale.setScalar(scale);
    return object;
  }

  private normalizedDepthForLocalZ(localZ: number): number {
    return THREE.MathUtils.clamp((-localZ + 2) / (CHUNK_LENGTH - 4), 0, 1);
  }

  private roadOffsetForZ(tuning: ChunkTuning, localZ: number): number {
    return getRoadOffsetAtDepth(tuning, this.normalizedDepthForLocalZ(localZ));
  }

  private roadYawForDepth(tuning: ChunkTuning, depth: number): number {
    const before = getRoadOffsetAtDepth(tuning, Math.max(0, depth - 0.06));
    const after = getRoadOffsetAtDepth(tuning, Math.min(1, depth + 0.06));
    return Math.atan2(after - before, 5.2) * 0.85;
  }

  private roadYawForLocalZ(tuning: ChunkTuning, localZ: number): number {
    return this.roadYawForDepth(tuning, this.normalizedDepthForLocalZ(localZ));
  }

  private requireAsset(id: string): string {
    const [pack, name] = id.split(":");
    const match = this.assets.catalog.models.find((model) => {
      if (typeof model.id === "string" && model.id === id) return true;
      return model.pack === pack && model.name === name && typeof model.preferredThreeJsPath === "string";
    });
    if (!match?.preferredThreeJsPath) throw new Error(`Missing model path for ${id}`);
    return match.preferredThreeJsPath;
  }

  private tryAsset(id: string): string | null {
    try {
      return this.requireAsset(id);
    } catch {
      return null;
    }
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
