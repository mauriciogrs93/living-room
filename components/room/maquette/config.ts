/**
 * Architectural Maquette look: the knobs the Founder may want to flip without touching scene code.
 * Values are the designer's v2 pass (see /workspace/maquette-revamp/designer-critique.md).
 */
export const MAQUETTE = {
  /**
   * Desktop width handling is undecided. `false` (v2 default): the room card stays closed on desktop and the
   * house is framed in the full width with the drawing-sheet caption in the corner. `true`: on desktop the
   * room card (Now tab) opens on first load and the house is framed in the space left of it.
   * Override at build time with NEXT_PUBLIC_MAQUETTE_DESKTOP_CARD=1 (or 0).
   */
  desktopCardOpenByDefault:
    process.env.NEXT_PUBLIC_MAQUETTE_DESKTOP_CARD != null
      ? process.env.NEXT_PUBLIC_MAQUETTE_DESKTOP_CARD === "1"
      : false,
  /** Camera: model-photographer's near-isometric view. Degrees. */
  fov: 28,
  yawDesktop: 34,
  yawPhone: 32,
  pitch: 30,
  /** Key light sits this many degrees to the left of the camera axis, at this elevation. */
  sunLeadDeg: 39,
  sunElevationDeg: 40,
  /** Figures are 1.16x the prototype units, so a standing hip lands on the engine's 0.72 m hip height. */
  figureScale: 1.16,
} as const;

/** Palette A "Zurich" + the spec PBR matrix (founder-spec.md). Hex only, no bitmaps anywhere. */
export const PAL = {
  plaster: "#F5F2EB",
  screed: "#EAE4D8",
  birch: "#DDCDB2",
  oak: "#CAB496",
  walnut: "#66574B",
  steel: "#2D3136",
  brass: "#B89758",
  terracotta: "#B8674E",
  linen: "#E2DDD5",
  linenDeep: "#CEC5B7",
  foliage: "#A7AD9C",
  figure: "#EEE9E0",
  figureShade: "#DCD5C8",
  stair: "#EEE5D6",
  rail: "#C4BCAF",
  sky: "#DDE6F5",
  ground: "#CFC5B8",
  lamp: "#FFC793",
} as const;

/** House geometry shared by the shell, furniture and camera (stage space, metres). */
export const GEO = {
  wallInX: -2.1,
  wallOutX: -2.34,
  wallInZ: -0.345,
  wallOutZ: -0.585,
  edgeR: 2.2,
  slab: 0.27,
  cut: 1.22,
} as const;
