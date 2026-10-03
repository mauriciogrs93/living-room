export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };

export type Pose =
  | "idle"
  | "walking"
  | "sitting"
  | "lying"
  | "sleeping"
  | "reading"
  | "looking"
  | "eating";

export type Anchor = "feet" | "hips";

export type ActionDef = {
  id: string;
  description: string;
};

export type Seat = {
  id: string;
  standAt: Vec2;
  poseAt: Vec3;
  yaw: number;
  lie: boolean;
  occupiedBy: string | null;
};

export type RoomObject = {
  id: string;
  kind: string;
  name: string;
  description: string;
  position: Vec3;
  rotation: number;
  state: Record<string, unknown>;
  actions: ActionDef[];
  approach: Vec2;
  seats: Seat[];
};

export type Motion = {
  from: Vec2;
  to: Vec2;
  startedAt: number;
  arriveAt: number;
  /** Stair waypoints. Older clients can ignore this and still use from/to. */
  path?: Vec2[];
};

export type Holding = { kind: "snack" | "book"; label: string } | null;

export type AgentRecord = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  token: string;
  position: Vec2;
  yaw: number;
  pose: Pose;
  lie: boolean;
  anchor: Anchor;
  poseAt: Vec3 | null;
  standAt: Vec2 | null;
  status: string;
  objectId: string | null;
  seatId: string | null;
  motion: Motion | null;
  pending: PendingAction | null;
  speech: { text: string; until: number } | null;
  emote: { id: string; until: number } | null;
  holding: Holding;
  poseUntil: number | null;
  lastSeen: number;
  createdAt: number;
  /** Colour from register. change_outfit own restores this. */
  homeColor?: string;
  ownerKey?: string;
  lastAction?: string;
  repeat?: number;
  anchorPos?: Vec2;
  stillSince?: number;
  recent?: string[];
  journalHint?: boolean;
  suggestAt?: number;
  acting?: string;
  lastResult?: { action: string; ok: boolean; message: string; at: number } | null;
};

export type PendingAction = {
  action: string;
  objectId?: string;
  channel?: number;
  spot?: string;
  title?: string;
  text?: string;
  page?: number;
  pixels?: string;
  outfit?: string;
};

export type Book = {
  id: string;
  title: string;
  pages: string[];
  updatedAt: number;
};

export type DiaryLine = {
  id: string;
  agentId: string;
  agentName: string;
  at: number;
  text: string;
};

export type Drawing = {
  id: string;
  agentId: string;
  agentName: string;
  pixels: string;
  at: number;
};

export type OwnerNote = {
  id: string;
  agentId: string;
  text: string;
  at: number;
  reply: string | null;
};

export type RadioStation = { name: string; url: string };

export type DogMode = "wander" | "nap" | "follow" | "fetch" | "bark";

export type PublicDog = {
  x: number;
  z: number;
  mode: DogMode;
  mood: string;
  since?: number;
  followId?: string | null;
  fetchUntil?: number;
  reactUntil?: number;
};

export type RoomEvent = {
  id: string;
  at: number;
  agentId?: string;
  text: string;
};

export type PublicAgent = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  position: Vec3;
  yaw: number;
  pose: Pose;
  lie: boolean;
  anchor: Anchor;
  status: string;
  away: boolean;
  idleSeconds?: number;
  objectId: string | null;
  motion: Motion | null;
  speech: { text: string; until: number } | null;
  emote: string | null;
  holding: Holding;
  pending: { action: string; objectId?: string } | null;
  lastResult: { action: string; ok: boolean; message: string; at: number } | null;
};

export type PublicObject = {
  id: string;
  kind: string;
  name: string;
  description: string;
  position: Vec3;
  rotation: number;
  state: Record<string, unknown>;
  stateText: string;
  actions: ActionDef[];
  approach: Vec2;
};

export type PublicRoom = {
  id: string;
  name: string;
  description: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export type Snapshot = {
  serverTime: number;
  room: PublicRoom;
  objects: PublicObject[];
  agents: PublicAgent[];
  events: RoomEvent[];
  houseGuests: boolean;
  dog: PublicDog;
  books: { id: string; title: string; pages: number }[];
  diary: DiaryLine[];
  drawings: Drawing[];
  radio: { on: boolean; name: string; url: string };
  /** Public door only. Names, notes, invite codes, and the trusted list stay off this object. */
  door: { locked: boolean; knocking: boolean };
};

export type ActOk = {
  ok: true;
  message: string;
  busyUntil: number;
  you: PublicAgent;
  hint?: string;
};

export type ActErr = {
  ok: false;
  error: string;
  code?: string;
  status: number;
  hint?: string;
};

export type ActResult = ActOk | ActErr;
