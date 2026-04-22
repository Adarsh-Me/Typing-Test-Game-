export type Biome = "suburban_main" | "yard_lane" | "tree_run" | "fence_choke" | "estate_row";

export interface ChunkPieceDef {
  id: string;
  x: number;
  z: number;
  scale?: number;
  rotationY?: number;
  y?: number;
}

export interface ChunkTemplate {
  biome: Biome;
  road: ChunkPieceDef[];
  props: ChunkPieceDef[];
  pickupAnchor?: {
    x: number;
    z: number;
  };
}

export interface RunnerLevelTemplate {
  levelId: string;
  theme: string;
  playerSpawn: {
    character: string;
    x: number;
    z: number;
  };
  enemySpawn: {
    type: string;
    x: number;
    z: number;
  };
  runnerPath: Array<[number, number]>;
  chunkStreaming: {
    chunkLength: number;
    spawnAhead: number;
    despawnBehind: number;
  };
  typingTriggers: {
    correctWordAdvance: number;
    combo5Boost: number;
    mistypeStumble: boolean;
    mistypeSpeedPenalty: number;
  };
  chunkTemplates: ChunkTemplate[];
}

const roadLoop: ChunkPieceDef[] = [
  { id: "suburban_kenney:path_long", x: 0, z: -2, scale: 1.55 },
  { id: "suburban_kenney:path_long", x: 0, z: -12, scale: 1.55 },
  { id: "suburban_kenney:path_tilesLong", x: 0, z: -22, scale: 1.55 },
  { id: "suburban_kenney:path_long", x: 0, z: -32, scale: 1.55 }
];

export const suburbanEscapeWorld: RunnerLevelTemplate = {
  levelId: "suburban_escape_world_01",
  theme: "isometric_suburban_chase",
  playerSpawn: {
    character: "adventurers:Knight",
    x: 0,
    z: 2.6
  },
  enemySpawn: {
    type: "pursuer",
    x: 0,
    z: 12
  },
  runnerPath: [
    [0, 2.6],
    [0, -8],
    [0, -18],
    [0, -28],
    [0, -38]
  ],
  chunkStreaming: {
    chunkLength: 40,
    spawnAhead: 3,
    despawnBehind: 2
  },
  typingTriggers: {
    correctWordAdvance: 1,
    combo5Boost: 2,
    mistypeStumble: true,
    mistypeSpeedPenalty: 0.2
  },
  chunkTemplates: [
    {
      biome: "suburban_main",
      road: roadLoop,
      props: [
        { id: "suburban_kenney:driveway_long", x: -7.6, z: -8, scale: 1.2, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:driveway_long", x: 7.6, z: -19, scale: 1.2, rotationY: -Math.PI / 2 },
        { id: "suburban_kenney:house_type03", x: -15, z: -7, scale: 2.1, rotationY: 0.14 },
        { id: "suburban_kenney:house_type10", x: 14.2, z: -19, scale: 2, rotationY: -0.18 },
        { id: "suburban_kenney:fence_large", x: -10.8, z: -20, scale: 1.55, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_large", x: 10.8, z: -9, scale: 1.55, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:tree_large", x: -18.4, z: -22, scale: 2.2 },
        { id: "suburban_kenney:tree_small", x: 18.1, z: -7, scale: 1.8 }
      ],
      pickupAnchor: { x: 0, z: -24 }
    },
    {
      biome: "yard_lane",
      road: [
        ...roadLoop,
        { id: "suburban_kenney:driveway_short", x: -7.6, z: -26, scale: 1.12, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:driveway_short", x: 7.6, z: -6, scale: 1.12, rotationY: -Math.PI / 2 }
      ],
      props: [
        { id: "suburban_kenney:house_type06", x: -15.3, z: -24, scale: 2, rotationY: 0.16 },
        { id: "suburban_kenney:house_type08", x: 14.8, z: -9, scale: 2, rotationY: -0.12 },
        { id: "suburban_kenney:fence_wide", x: -11.2, z: -10, scale: 1.45, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_rectangle", x: 11.8, z: -22, scale: 1.3, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:tree_small", x: -18.8, z: -8, scale: 1.7 },
        { id: "suburban_kenney:tree_large", x: 18.7, z: -25, scale: 2.15 }
      ],
      pickupAnchor: { x: 0, z: -16 }
    },
    {
      biome: "tree_run",
      road: roadLoop,
      props: [
        { id: "suburban_kenney:tree_large", x: -13.5, z: -5, scale: 2.35 },
        { id: "suburban_kenney:tree_large", x: -18, z: -19, scale: 2.1 },
        { id: "suburban_kenney:tree_small", x: -12.3, z: -30, scale: 1.7 },
        { id: "suburban_kenney:tree_large", x: 13.8, z: -10, scale: 2.25 },
        { id: "suburban_kenney:tree_small", x: 18.1, z: -20, scale: 1.7 },
        { id: "suburban_kenney:tree_large", x: 12.5, z: -31, scale: 2.05 },
        { id: "suburban_kenney:fence_short", x: -8.8, z: -17, scale: 1.2, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_short", x: 8.8, z: -17, scale: 1.2, rotationY: Math.PI / 2 }
      ],
      pickupAnchor: { x: 0, z: -20 }
    },
    {
      biome: "fence_choke",
      road: [
        ...roadLoop,
        { id: "suburban_kenney:path_tilesShort", x: -4.2, z: -18, scale: 1.12 },
        { id: "suburban_kenney:path_tilesShort", x: 4.2, z: -18, scale: 1.12 }
      ],
      props: [
        { id: "suburban_kenney:fence_medium", x: -8.7, z: -9, scale: 1.42, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_medium", x: 8.7, z: -9, scale: 1.42, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_large", x: -8.7, z: -24, scale: 1.52, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_large", x: 8.7, z: -24, scale: 1.52, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:house_type14", x: -16.2, z: -9, scale: 2.05, rotationY: 0.18 },
        { id: "suburban_kenney:house_type19", x: 16.4, z: -24, scale: 2.1, rotationY: -0.15 }
      ],
      pickupAnchor: { x: 0, z: -10 }
    },
    {
      biome: "estate_row",
      road: roadLoop,
      props: [
        { id: "suburban_kenney:driveway_long", x: -7.6, z: -12, scale: 1.2, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:driveway_long", x: 7.6, z: -26, scale: 1.2, rotationY: -Math.PI / 2 },
        { id: "suburban_kenney:house_type21", x: -15.6, z: -12, scale: 2.2, rotationY: 0.08 },
        { id: "suburban_kenney:house_type17", x: 15.5, z: -27, scale: 2.2, rotationY: -0.1 },
        { id: "suburban_kenney:fence_open", x: -10.2, z: -28, scale: 1.35, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:fence_open", x: 10.2, z: -13, scale: 1.35, rotationY: Math.PI / 2 },
        { id: "suburban_kenney:tree_large", x: -19.5, z: -28, scale: 2.1 },
        { id: "suburban_kenney:tree_large", x: 19.5, z: -12, scale: 2.1 }
      ],
      pickupAnchor: { x: 0, z: -28 }
    }
  ]
};
