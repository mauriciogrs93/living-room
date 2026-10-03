import { createObjects } from "./catalog";
import { syncObstacles } from "./paths";
import { freshHouse, type HouseMemory } from "./house";
import type {
  ActResult,
  AgentRecord,
  Book,
  PendingAction,
  Pose,
  PublicAgent,
  PublicObject,
  RadioStation,
  RoomEvent,
  RoomObject,
  Snapshot,
  Vec2,
} from "./types";
import { type Listener, type PersistedRoom, type RoomHost } from "./engine-host";

import {
  hydrate as hydrateFn,
  purgeGuests as purgeGuestsFn,
  serialize as serializeFn,
  allow as allowFn,
  settle as settleFn,
  removeAgent as removeAgentFn,
} from "./engine-persist";
import {
  snapshot as snapshotFn,
  publicDog as publicDogFn,
  present as presentFn,
  presentObject as presentObjectFn,
  stateText as stateTextFn,
  summary as summaryFn,
} from "./engine-present";
import {
  register as registerFn,
  look as lookFn,
  leave as leaveFn,
  ownerLeave as ownerLeaveFn,
  act as actFn,
  postNote as postNoteFn,
  log as logFn,
  emit as emitFn,
  byToken as byTokenFn,
  unauthorized as unauthorizedFn,
  ok as okFn,
  nameTaken as nameTakenFn,
  track as trackFn,
} from "./engine-life";
import {
  perform as performFn,
  moveTarget as moveTargetFn,
  approachFor as approachForFn,
  seatAvailable as seatAvailableFn,
  applyArrived as applyArrivedFn,
  resolveObject as resolveObjectFn,
  findObject as findObjectFn,
  knownAction as knownActionFn,
} from "./engine-perform";
import {
  sit as sitFn,
  lieDown as lieDownFn,
  sleep as sleepFn,
  bedPose as bedPoseFn,
  occupy as occupyFn,
  idleAt as idleAtFn,
  standUp as standUpFn,
  release as releaseFn,
  startWalk as startWalkFn,
  cancelMotion as cancelMotionFn,
  closeEnough as closeEnoughFn,
  currentPos as currentPosFn,
} from "./engine-motion";
import {
  finish as finishFn,
  setLight as setLightFn,
  setFlag as setFlagFn,
  fridgeDoor as fridgeDoorFn,
  takeFood as takeFoodFn,
  eatHeld as eatHeldFn,
  useTv as showTv,
  toggleLamp as toggleLampFn,
  takeSnack as takeSnackFn,
  readBook as readBookFn,
  lookOutside as lookOutsideFn,
} from "./engine-appliances";
import { useComputer as useComputerFn } from "./engine-computer";
import {
  setStations as setStationsFn,
  stationsStale as stationsStaleFn,
  controlRadio as controlRadioFn,
  useRadio as tuneRadio,
  syncRadio as syncRadioFn,
} from "./engine-radio";
import {
  books as booksFn,
  readPage as readPageFn,
  writePage as writePageFn,
  createBook as createBookFn,
  waterPlant as waterPlantFn,
  placeFurniture as placeFurnitureFn,
  moveToSpot as moveToSpotFn,
  hangDrawing as hangDrawingFn,
} from "./engine-books";
import {
  dogAct as dogActFn,
  pokeDog as pokeDogFn,
} from "./engine-dog";
import { viewerTap as viewerTapFn } from "./engine-viewer";
import {
  doorAct as doorActFn,
  doorBrief as doorBriefFn,
  doorStatus as doorStatusFn,
  doorView as doorViewFn,
  freshDoor,
  holdResponse,
  type DoorState,
} from "./door";

export type { PersistedRoom } from "./engine-host";

export class RoomEngine {
  private objects = new Map<string, RoomObject>();
  private agents = new Map<string, AgentRecord>();
  private tokens = new Map<string, string>();
  private events: RoomEvent[] = [];
  private listeners = new Set<Listener>();
  private eventSeq = 0;
  private spawnCursor = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hits = new Map<string, number[]>();
  private house: HouseMemory = freshHouse();
  door: DoorState = freshDoor();

  constructor() {
    for (const object of createObjects()) this.objects.set(object.id, object);
    syncObstacles(this.objects.values());
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.settle(), 200);
    this.timer.unref?.();
  }

/** Restore a room saved by another instance. Catalog positions stay authoritative. */
  hydrate(raw: unknown) {
    return hydrateFn(this as unknown as RoomHost, raw);
  }

  private purgeGuests(data: PersistedRoom) {
    return purgeGuestsFn(this as unknown as RoomHost, data);
  }

  serialize(): PersistedRoom {
    return serializeFn(this as unknown as RoomHost);
  }

  allow(key: string, limit: number, windowMs: number) {
    return allowFn(this as unknown as RoomHost, key, limit, windowMs);
  }

  snapshot(): Snapshot {
    return snapshotFn(this as unknown as RoomHost);
  }

  private publicDog(now: number) {
    return publicDogFn(this as unknown as RoomHost, now);
  }

  register(input: {
    name?: unknown;
    color?: unknown;
    emoji?: unknown;
    ownerKey?: unknown;
    token?: unknown;
    invite?: unknown;
    note?: unknown;
    ip?: unknown;
    seedId?: unknown;
    seedSecret?: unknown;
  }): import("./types").ActErr | {
    ok: true;
    message: string;
    agentId: string;
    name: string;
    color: string;
    emoji: string;
    token: string;
    ownerKey: string;
    notes: { id: string; text: string; at: number }[];
    waiting?: boolean;
    status?: string;
  } {
    return registerFn(this as unknown as RoomHost, input);
  }

  doorHold(token: string) {
    return holdResponse(this as unknown as RoomHost, token);
  }

  doorStatus(token: string) {
    return doorStatusFn(this as unknown as RoomHost, token);
  }

  doorView(ownerKey: string) {
    return doorViewFn(this as unknown as RoomHost, ownerKey);
  }

  doorBrief(ownerKey: string) {
    return doorBriefFn(this as unknown as RoomHost, ownerKey);
  }

  doorAct(ownerKey: string, action: string, id = "") {
    return doorActFn(this as unknown as RoomHost, ownerKey, action, id);
  }

  look(token: string): ActResult | {
    ok: true;
    summary: string;
    you: PublicAgent;
    snapshot: Snapshot;
    ownerKey: string;
    notes: { id: string; text: string; at: number }[];
    suggestion: string | null;
  } {
    return lookFn(this as unknown as RoomHost, token);
  }

  leave(token: string): ActResult | { ok: true; message: string } {
    return leaveFn(this as unknown as RoomHost, token);
  }

  ownerLeave(ownerKey: string, block = false): ActResult | { ok: true; message: string } {
    return ownerLeaveFn(this as unknown as RoomHost, ownerKey, block);
  }

  act(token: string, body: unknown): ActResult {
    return actFn(this as unknown as RoomHost, token, body);
  }

  ownerKeyFor(token: string) {
    return byTokenFn(this as unknown as RoomHost, token)?.ownerKey ?? "";
  }

  postNote(ownerKey: string, message: unknown): ActResult | { ok: true; message: string; away?: boolean; name?: string } {
    return postNoteFn(this as unknown as RoomHost, ownerKey, message);
  }

  pokeDog(): { ok: true; message: string } {
    return pokeDogFn(this as unknown as RoomHost);
  }

  viewerTap(raw: unknown) {
    return viewerTapFn(this as unknown as RoomHost, raw);
  }

  setStations(stations: RadioStation[]) {
    return setStationsFn(this as unknown as RoomHost, stations);
  }

  stationsStale(maxMs = 30 * 60 * 1000) {
    return stationsStaleFn(this as unknown as RoomHost, maxMs);
  }

  controlRadio(intent: "on" | "off" | "next", stations?: RadioStation[]): { ok: true; message: string; name: string; on: boolean; url: string } {
    return controlRadioFn(this as unknown as RoomHost, intent, stations);
  }

  books(): Book[] {
    return booksFn(this as unknown as RoomHost);
  }

  private perform(agent: AgentRecord, body: unknown): ActResult {
    return performFn(this as unknown as RoomHost, agent, body);
  }

  private moveTarget(input: Record<string, unknown>):
    | { ok: true; to: Vec2; pending: PendingAction | null; label: string }
    | ActResult & { ok: false } {
    return moveTargetFn(this as unknown as RoomHost, input);
  }

  private approachFor(object: RoomObject, action: string, agent: AgentRecord): Vec2 {
    return approachForFn(this as unknown as RoomHost, object, action, agent);
  }

  private seatAvailable(agent: AgentRecord, object: RoomObject, action: string): ActResult | { ok: true } {
    return seatAvailableFn(this as unknown as RoomHost, agent, object, action);
  }

  private applyArrived(agent: AgentRecord, pending: PendingAction): {
    ok: boolean;
    message: string;
    status: number;
    code?: string;
  } {
    return applyArrivedFn(this as unknown as RoomHost, agent, pending);
  }

  private finish(agent: AgentRecord, action: string, phrase: string, message: string, statusText: string) {
    return finishFn(this as unknown as RoomHost, agent, action, phrase, message, statusText);
  }

  private setLight(agent: AgentRecord, object: RoomObject, on: boolean) {
    return setLightFn(this as unknown as RoomHost, agent, object, on);
  }

  private setFlag(agent: AgentRecord, object: RoomObject, key: string, on: boolean, ms: number, label: string) {
    return setFlagFn(this as unknown as RoomHost, agent, object, key, on, ms, label);
  }

  private fridgeDoor(agent: AgentRecord, object: RoomObject, open: boolean) {
    return fridgeDoorFn(this as unknown as RoomHost, agent, object, open);
  }

  private takeFood(agent: AgentRecord, object: RoomObject) {
    return takeFoodFn(this as unknown as RoomHost, agent, object);
  }

  private eatHeld(agent: AgentRecord, object: RoomObject) {
    return eatHeldFn(this as unknown as RoomHost, agent, object);
  }

  private useRadio(agent: AgentRecord, object: RoomObject, action: string) {
    return tuneRadio(this as unknown as RoomHost, agent, object, action);
  }

  private syncRadio() {
    return syncRadioFn(this as unknown as RoomHost);
  }

  private readPage(agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    return readPageFn(this as unknown as RoomHost, agent, object, pending);
  }

  private writePage(agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    return writePageFn(this as unknown as RoomHost, agent, object, pending);
  }

  private createBook(agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    return createBookFn(this as unknown as RoomHost, agent, object, pending);
  }

  private waterPlant(agent: AgentRecord, object: RoomObject) {
    return waterPlantFn(this as unknown as RoomHost, agent, object);
  }

  private placeFurniture(agent: AgentRecord, object: RoomObject, spot: string) {
    return placeFurnitureFn(this as unknown as RoomHost, agent, object, spot);
  }

  private moveToSpot(object: RoomObject, spot: string) {
    return moveToSpotFn(this as unknown as RoomHost, object, spot);
  }

  private hangDrawing(agent: AgentRecord, object: RoomObject, raw: string) {
    return hangDrawingFn(this as unknown as RoomHost, agent, object, raw);
  }

  private dogAct(agent: AgentRecord, action: string) {
    return dogActFn(this as unknown as RoomHost, agent, action);
  }

  private track(agent: AgentRecord, action: string) {
    return trackFn(this as unknown as RoomHost, agent, action);
  }

  private sit(agent: AgentRecord, object: RoomObject) {
    return sitFn(this as unknown as RoomHost, agent, object);
  }

  private lieDown(agent: AgentRecord, object: RoomObject) {
    return lieDownFn(this as unknown as RoomHost, agent, object);
  }

  private sleep(agent: AgentRecord, object: RoomObject) {
    return sleepFn(this as unknown as RoomHost, agent, object);
  }

  private bedPose(agent: AgentRecord, object: RoomObject, pose: Pose, status: string, event: string, message: string) {
    return bedPoseFn(this as unknown as RoomHost, agent, object, pose, status, event, message);
  }

  private useTv(agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    return showTv(this as unknown as RoomHost, agent, object, pending);
  }

  private toggleLamp(agent: AgentRecord, object: RoomObject) {
    return toggleLampFn(this as unknown as RoomHost, agent, object);
  }

  private takeSnack(agent: AgentRecord, object: RoomObject) {
    return takeSnackFn(this as unknown as RoomHost, agent, object);
  }

  private readBook(agent: AgentRecord, object: RoomObject) {
    return readBookFn(this as unknown as RoomHost, agent, object);
  }

  private lookOutside(agent: AgentRecord, object: RoomObject) {
    return lookOutsideFn(this as unknown as RoomHost, agent, object);
  }

  private useComputer(agent: AgentRecord, object: RoomObject, pending: PendingAction) {
    return useComputerFn(this as unknown as RoomHost, agent, object, pending);
  }

  private occupy(
    agent: AgentRecord,
    object: RoomObject,
    seatId: string,
    poseAt: { x: number; y: number; z: number },
    yaw: number,
    lie: boolean,
    standAt: Vec2,
  ) {
    return occupyFn(this as unknown as RoomHost, agent, object, seatId, poseAt, yaw, lie, standAt);
  }

  private idleAt(agent: AgentRecord, object: RoomObject) {
    return idleAtFn(this as unknown as RoomHost, agent, object);
  }

  private standUp(agent: AgentRecord, announce: boolean) {
    return standUpFn(this as unknown as RoomHost, agent, announce);
  }

  private release(agent: AgentRecord) {
    return releaseFn(this as unknown as RoomHost, agent);
  }

  private startWalk(agent: AgentRecord, to: Vec2, pending: PendingAction | null, now: number): {
    ms: number;
    arrived: boolean;
    applied?: { ok: boolean; message: string; status: number; code?: string };
  } {
    return startWalkFn(this as unknown as RoomHost, agent, to, pending, now);
  }

  private cancelMotion(agent: AgentRecord) {
    return cancelMotionFn(this as unknown as RoomHost, agent);
  }

  private closeEnough(agent: AgentRecord, object: RoomObject, target: Vec2, now: number) {
    return closeEnoughFn(this as unknown as RoomHost, agent, object, target, now);
  }

  private currentPos(agent: AgentRecord, now: number): Vec2 {
    return currentPosFn(this as unknown as RoomHost, agent, now);
  }

/** Apply walks and idle removal that came due. Safe to call on every read. */
  settle() {
    return settleFn(this as unknown as RoomHost);
  }

  /** Keep a lock-free look from looking idle. Stamps never take the room lock. */
  absorbSeen(stamps: Iterable<[string, number]>) {
    const room = this as unknown as RoomHost;
    for (const [id, at] of stamps) {
      const agent = room.agents.get(id);
      if (agent && at > agent.lastSeen) agent.lastSeen = at;
    }
  }

  private removeAgent(agent: AgentRecord, text: string) {
    return removeAgentFn(this as unknown as RoomHost, agent, text);
  }

  private present(agent: AgentRecord, now: number): PublicAgent {
    return presentFn(this as unknown as RoomHost, agent, now);
  }

  private presentObject(object: RoomObject): PublicObject {
    return presentObjectFn(this as unknown as RoomHost, object);
  }

  private stateText(object: RoomObject): string {
    return stateTextFn(this as unknown as RoomHost, object);
  }

  private summary(
    agent: AgentRecord,
    snapshot: Snapshot,
    notes: { id: string; text: string; at: number }[] = [],
    suggestion: string | null = null,
  ) {
    return summaryFn(this as unknown as RoomHost, agent, snapshot, notes, suggestion);
  }

  private resolveObject(action: string, objectId: unknown): { ok: true; object: RoomObject } | (ActResult & { ok: false }) {
    return resolveObjectFn(this as unknown as RoomHost, action, objectId);
  }

  private findObject(id: string) {
    return findObjectFn(this as unknown as RoomHost, id);
  }

  private knownAction(action: string) {
    return knownActionFn(this as unknown as RoomHost, action);
  }

  private nameTaken(name: string) {
    return nameTakenFn(this as unknown as RoomHost, name);
  }

  private byToken(token: string) {
    return byTokenFn(this as unknown as RoomHost, token);
  }

  private unauthorized(): ActResult {
    return unauthorizedFn();
  }

  private ok(agent: AgentRecord, message: string, busyUntil: number, hint?: string): ActResult {
    return okFn(this as unknown as RoomHost, agent, message, busyUntil, hint);
  }

  private log(text: string, agentId?: string, action?: string, at?: number) {
    return logFn(this as unknown as RoomHost, text, agentId, action, at);
  }

  private emit() {
    return emitFn(this as unknown as RoomHost);
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
