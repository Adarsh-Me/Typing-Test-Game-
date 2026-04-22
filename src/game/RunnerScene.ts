import Phaser from "phaser";
import knightPng from "../../../../assets/KayKit_Adventurers_2.0_FREE/Samples/knight.png";
import roguePng from "../../../../assets/KayKit_Adventurers_2.0_FREE/Samples/rogue.png";
import biomeForest from "../../../../assets/KayKit_Medieval_Hexagon_Pack_1.0_FREE/contents_nature.jpg";
import biomeVillage from "../../../../assets/KayKit_Medieval_Hexagon_Pack_1.0_FREE/contents_buildings.jpg";

const SCENE_KEY = "RunnerScene";
const BIOMES = ["forest", "river_bridge", "village", "ruins", "castle_road"] as const;
type Biome = (typeof BIOMES)[number];
type PickupKind = "potion" | "shield" | "sword" | "bow";

interface Chunk {
  container: Phaser.GameObjects.Container;
  y: number;
  biome: Biome;
  pickup?: {
    kind: PickupKind;
    sprite: Phaser.GameObjects.Arc;
    active: boolean;
  };
}

interface WorldAssetIndex {
  worldDesignRoles?: {
    blocks?: Array<unknown>;
    environment?: Array<unknown>;
    tools?: Array<unknown>;
  };
  biomeHints?: Array<{
    biome: string;
    preferredBlockNameParts?: string[];
    preferredEnvironmentNameParts?: string[];
  }>;
}

export class RunnerScene extends Phaser.Scene {
  private worldChunks: Chunk[] = [];
  private chunkCounter = 0;
  private biomeIndex = 0;
  private player?: Phaser.GameObjects.Image;
  private enemy?: Phaser.GameObjects.Image;
  private enemyShadow?: Phaser.GameObjects.Ellipse;
  private playerStateLabel?: Phaser.GameObjects.Text;
  private biomeLabel?: Phaser.GameObjects.Text;
  private speedLabel?: Phaser.GameObjects.Text;

  private speed = 145;
  private momentum = 0;
  private stumbleUntil = 0;
  private speedBonus = 0;
  private swordBonusUntil = 0;
  private shieldCharges = 0;
  private enemyGap = 180;
  private catchTriggered = false;
  private worldAssetIndex: WorldAssetIndex | null = null;

  constructor() {
    super(SCENE_KEY);
  }

  preload(): void {
    this.load.image("knight-sample", knightPng);
    this.load.image("rogue-sample", roguePng);
    this.load.image("biome-forest", biomeForest);
    this.load.image("biome-village", biomeVillage);
  }

  create(): void {
    const { width, height } = this.scale;
    this.worldAssetIndex = this.game.registry.get("assetIndex") as WorldAssetIndex | null;
    this.cameras.main.setBackgroundColor("#87d5f6");

    this.add
      .image(width * 0.5, 120, "biome-forest")
      .setDisplaySize(width * 1.05, 250)
      .setAlpha(0.18)
      .setTint(0x83ffe3);
    this.add
      .image(width * 0.5, 205, "biome-village")
      .setDisplaySize(width * 1.05, 220)
      .setAlpha(0.16)
      .setTint(0xfff4c3);

    this.biomeLabel = this.add
      .text(24, 74, "Biome: FOREST", {
        fontFamily: "Trebuchet MS",
        fontSize: "22px",
        fontStyle: "bold",
        color: "#13488b"
      })
      .setDepth(12);
    const blocksCount = this.worldAssetIndex?.worldDesignRoles?.blocks?.length ?? 0;
    const envCount = this.worldAssetIndex?.worldDesignRoles?.environment?.length ?? 0;
    const toolsCount = this.worldAssetIndex?.worldDesignRoles?.tools?.length ?? 0;
    this.add
      .text(24, 48, `Asset World B:${blocksCount} E:${envCount} T:${toolsCount}`, {
        fontFamily: "Trebuchet MS",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#0d4b8f"
      })
      .setDepth(12);

    this.speedLabel = this.add
      .text(24, 104, "Velocity 145", {
        fontFamily: "Trebuchet MS",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#0e3d7a"
      })
      .setDepth(12);

    const playerY = height * 0.58;
    this.player = this.add.image(width * 0.5, playerY, "knight-sample").setDepth(30).setScale(0.72);
    this.enemy = this.add
      .image(width * 0.5, playerY + this.enemyGap, "rogue-sample")
      .setDepth(25)
      .setScale(0.64)
      .setTint(0xff9090);
    this.enemyShadow = this.add
      .ellipse(width * 0.5, playerY + this.enemyGap + 54, 130, 28, 0x000000, 0.2)
      .setDepth(24);

    this.playerStateLabel = this.add
      .text(width * 0.5, playerY - 92, "RUN", {
        fontFamily: "Trebuchet MS",
        fontSize: "24px",
        fontStyle: "bold",
        color: "#1753a6",
        stroke: "#ffffff",
        strokeThickness: 6
      })
      .setDepth(35)
      .setOrigin(0.5);

    this.fillInitialChunks();

    this.game.events.on("typing_tick", this.onTypingTick, this);
    this.game.events.on("word_correct", this.onWordCorrect, this);
    this.game.events.on("mistake", this.onMistake, this);
    this.game.events.on("combo_boost", this.onComboBoost, this);
    this.game.events.on("run_reset", this.onRunReset, this);
    this.game.events.on("shield_charges", this.onShieldCharges, this);
    this.game.events.on("speed_bonus", this.onSpeedBonus, this);
    this.game.events.on("sword_bonus", this.onSwordBonus, this);
    this.game.events.on("recover", this.onRecover, this);
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const now = this.time.now;
    const playerY = this.scale.height * 0.58;

    const sprintBonus = this.momentum > 0.78 ? 1 : 0;
    const stumblePenalty = now < this.stumbleUntil ? 62 : 0;
    const swordVelocityGlow = now < this.swordBonusUntil ? 14 : 0;
    const targetSpeed = 145 + this.momentum * 220 + this.speedBonus * 180 + sprintBonus * 70 + swordVelocityGlow;
    this.speed = Phaser.Math.Linear(this.speed, targetSpeed, 0.08);
    const forwardSpeed = Math.max(90, this.speed - stumblePenalty);

    for (const chunk of this.worldChunks) {
      chunk.y += forwardSpeed * dt;
      chunk.container.y = chunk.y;
      if (chunk.pickup && chunk.pickup.active) {
        const px = this.scale.width * 0.5;
        const py = playerY + 10;
        if (Math.abs(chunk.pickup.sprite.x - px) < 46 && Math.abs(chunk.pickup.sprite.y - py) < 58) {
          chunk.pickup.active = false;
          chunk.pickup.sprite.setVisible(false);
          this.game.events.emit("pickup_collected", { kind: chunk.pickup.kind });
        }
      }
    }

    this.recycleChunks();

    const enemySpeed = 178 + (1 - this.momentum) * 96;
    this.enemyGap += (forwardSpeed - enemySpeed) * dt;
    this.enemyGap = Phaser.Math.Clamp(this.enemyGap, 0, 280);

    if (this.enemy && this.enemyShadow) {
      this.enemy.y = playerY + this.enemyGap;
      this.enemyShadow.y = this.enemy.y + 54;
      this.enemy.setScale(this.enemyGap < 74 ? 0.73 : 0.64);
    }

    if (this.player) {
      const sprinting = this.momentum > 0.78 && now > this.stumbleUntil;
      const state = now < this.stumbleUntil ? "STUMBLE" : sprinting ? "SPRINT" : "RUN";
      this.playerStateLabel?.setText(state);
      this.player.setTint(state === "STUMBLE" ? 0xff9f9f : state === "SPRINT" ? 0xffffff : 0xfff8da);
      this.player.y = playerY + (state === "STUMBLE" ? 9 : 0);
    }

    if (!this.catchTriggered && this.enemyGap <= 14) {
      this.catchTriggered = true;
      if (this.shieldCharges > 0) {
        this.shieldCharges -= 1;
        this.enemyGap = 95;
        this.game.events.emit("shield_consumed");
      } else {
        this.playerStateLabel?.setText("HIT");
        this.game.events.emit("player_caught");
      }
    }

    const biome = this.currentBiomeLabel();
    this.biomeLabel?.setText(`Biome: ${biome.toUpperCase().replace("_", " ")}`);
    this.speedLabel?.setText(`Velocity ${Math.round(forwardSpeed)}`);
    this.game.events.emit("world_status", {
      velocity: Math.round(forwardSpeed),
      enemyGap: Math.round(this.enemyGap),
      biome
    });
  }

  private onTypingTick(correct: boolean): void {
    if (correct) this.momentum = Phaser.Math.Clamp(this.momentum + 0.06, 0, 1);
    else this.momentum = Phaser.Math.Clamp(this.momentum - 0.19, 0, 1);
  }

  private onWordCorrect(): void {
    this.momentum = Phaser.Math.Clamp(this.momentum + 0.08, 0, 1);
  }

  private onMistake(): void {
    this.stumbleUntil = this.time.now + 220;
    this.momentum = Phaser.Math.Clamp(this.momentum - 0.22, 0, 1);
    this.cameras.main.shake(140, 0.0036);
  }

  private onComboBoost(level: number): void {
    if (level >= 2) this.momentum = Phaser.Math.Clamp(this.momentum + 0.15, 0, 1);
    if (level >= 3) this.speedBonus = Math.max(this.speedBonus, 0.35);
    this.time.delayedCall(1000, () => {
      this.speedBonus = Math.max(0, this.speedBonus - 0.2);
    });
  }

  private onShieldCharges(count: number): void {
    this.shieldCharges = Math.max(0, count);
  }

  private onSpeedBonus(active: boolean): void {
    this.speedBonus = active ? 0.38 : Math.min(this.speedBonus, 0.12);
  }

  private onSwordBonus(active: boolean): void {
    if (active) {
      this.swordBonusUntil = this.time.now + 1200;
    } else {
      this.swordBonusUntil = 0;
    }
  }

  private onRecover(): void {
    this.stumbleUntil = 0;
    this.momentum = Phaser.Math.Clamp(this.momentum + 0.12, 0, 1);
  }

  private onRunReset(): void {
    this.catchTriggered = false;
    this.enemyGap = 180;
    this.momentum = 0;
    this.speedBonus = 0;
    this.swordBonusUntil = 0;
    this.stumbleUntil = 0;
    this.worldChunks.forEach((chunk) => chunk.container.destroy());
    this.worldChunks = [];
    this.chunkCounter = 0;
    this.biomeIndex = 0;
    this.fillInitialChunks();
  }

  private fillInitialChunks(): void {
    const startY = this.scale.height * 0.07;
    for (let i = 0; i < 8; i += 1) {
      this.spawnChunkAt(startY - i * 160);
    }
  }

  private recycleChunks(): void {
    const despawnY = this.scale.height + 170;
    let topY = Infinity;
    for (const chunk of this.worldChunks) {
      topY = Math.min(topY, chunk.y);
    }
    for (let i = this.worldChunks.length - 1; i >= 0; i -= 1) {
      if (this.worldChunks[i].y > despawnY) {
        this.worldChunks[i].container.destroy();
        this.worldChunks.splice(i, 1);
        this.spawnChunkAt(topY - 160);
      }
    }
  }

  private spawnChunkAt(y: number): void {
    const biome = BIOMES[this.biomeIndex % BIOMES.length];
    this.biomeIndex += 1;
    const xCenter = this.scale.width * 0.5;
    const container = this.add.container(0, y);
    const chunkIndex = this.chunkCounter++;

    const biomeColors: Record<Biome, number> = {
      forest: 0x86c85d,
      river_bridge: 0x6dc6ff,
      village: 0xf4d56e,
      ruins: 0xb4af9d,
      castle_road: 0xa6a8c7
    };

    for (let row = 0; row < 5; row += 1) {
      const rowYOffset = row * 30;
      const rowWidth = 5 - Math.abs(2 - row);
      for (let i = 0; i < rowWidth; i += 1) {
        const x = xCenter + (i - (rowWidth - 1) / 2) * 94;
        const tile = this.add
          .polygon(
            x,
            rowYOffset,
            [0, -24, 48, 0, 0, 24, -48, 0],
            biomeColors[biome],
            row === 2 ? 0.92 : 0.72
          )
          .setStrokeStyle(2, 0xffffff, 0.16)
          .setDepth(5 + row);
        container.add(tile);
      }
    }

    const biomeHints = this.worldAssetIndex?.biomeHints ?? [];
    const biomeHint = biomeHints.find((hint) => hint.biome === biome);
    const hintWeight =
      (biomeHint?.preferredEnvironmentNameParts?.length ?? 0) +
      (biomeHint?.preferredBlockNameParts?.length ?? 0);
    const dressingCount = (biome === "village" || biome === "castle_road" ? 4 : 3) + Math.min(2, hintWeight > 4 ? 1 : 0);
    for (let i = 0; i < dressingCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const deco = this.add
        .rectangle(
          xCenter + side * Phaser.Math.Between(180, 330),
          Phaser.Math.Between(26, 138),
          Phaser.Math.Between(14, 32),
          Phaser.Math.Between(18, 64),
          biome === "forest" ? 0x2f8d34 : biome === "village" ? 0xc27c3a : 0x7f6f58,
          0.92
        )
        .setDepth(14);
      container.add(deco);
    }

    let pickup: Chunk["pickup"] | undefined;
    if (chunkIndex > 1 && chunkIndex % 3 === 0) {
      const kinds: PickupKind[] = ["potion", "shield", "sword", "bow"];
      const kind = kinds[chunkIndex % kinds.length];
      const color: Record<PickupKind, number> = {
        potion: 0xff4fb5,
        shield: 0x66a8ff,
        sword: 0xffd84f,
        bow: 0x80e868
      };
      const orb = this.add.circle(xCenter, 88, 12, color[kind], 0.94).setDepth(22);
      container.add(orb);
      pickup = { kind, sprite: orb, active: true };
    }

    const chunk: Chunk = { container, y, biome, pickup };
    this.worldChunks.push(chunk);
  }

  private currentBiomeLabel(): Biome {
    if (this.worldChunks.length === 0) return "forest";
    const centerY = this.scale.height * 0.32;
    let nearest = this.worldChunks[0];
    let nearestDistance = Math.abs(nearest.y - centerY);
    for (const chunk of this.worldChunks) {
      const d = Math.abs(chunk.y - centerY);
      if (d < nearestDistance) {
        nearest = chunk;
        nearestDistance = d;
      }
    }
    return nearest.biome;
  }
}
