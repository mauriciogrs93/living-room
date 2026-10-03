import {
  dist,
  yawToward,
  type RoomHost,
} from "./engine-host";
import { IN_PLACE } from "./layout";
import { motionPoint, pathLength, route, walkMs } from "./paths";
import {
  type AgentRecord,
  type PendingAction,
  type Pose,
  type RoomObject,
  type Vec2,
} from "./types";

const SEAT_IDS = new Set(["sofa", "armchair", "reading-chair", "table"]);

export function sit(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    if (!SEAT_IDS.has(object.id)) {
      room.idleAt(agent, object);
      return { ok: false, message: "You can't sit there.", status: 400 };
    }
    if (agent.objectId === object.id && agent.pose === "sitting") {
      return { ok: true, message: "You are already sitting.", status: 200 };
    }
    const seat =
      object.seats.find((item) => item.occupiedBy === agent.id) ??
      object.seats.find((item) => !item.occupiedBy);
    if (!seat) {
      room.idleAt(agent, object);
      return { ok: false, message: `The ${object.name.toLowerCase()} is full.`, status: 409, code: "occupied" };
    }
    room.release(agent);
    seat.occupiedBy = agent.id;
    room.occupy(agent, object, seat.id, seat.poseAt, seat.yaw, false, seat.standAt);
    agent.pose = "sitting";
    const table = object.id === "table";
    const where = object.id === "sofa" ? `the ${seat.id} cushion` : `the ${object.name.toLowerCase()}`;
    const prep = table ? "at" : "on";
    agent.status = `sitting ${prep} ${where}`;
    room.log(`${agent.name} sat ${prep} ${where}.`, agent.id, "sit");
    return { ok: true, message: `You sat ${prep} ${where}.`, status: 200 };
  }

export function lieDown(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    if (object.id === "sofa") {
      if (object.seats.some((seat) => seat.occupiedBy && seat.occupiedBy !== agent.id)) {
        room.idleAt(agent, object);
        return { ok: false, message: "Someone is on the sofa, so there isn't room to lie down.", status: 409, code: "occupied" };
      }
      room.release(agent);
      for (const seat of object.seats) seat.occupiedBy = agent.id;
      const at = { x: object.position.x, y: 0.46, z: object.position.z };
      room.occupy(agent, object, "lie", at, Math.PI / 2, true, object.approach);
      agent.pose = "lying";
      agent.status = "lying on the sofa";
      room.log(`${agent.name} lay down on the sofa.`, agent.id, "lie");
      return { ok: true, message: "You lay down on the sofa.", status: 200 };
    }
    if (object.id === "bed") {
      return room.bedPose(agent, object, "lying", "lying on the bed", `${agent.name} lay down on the bed.`, "You lay down on the bed.");
    }
    room.idleAt(agent, object);
    return { ok: false, message: "You can't lie down there.", status: 400 };
  }

export function sleep(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    if (object.id !== "bed") {
      room.idleAt(agent, object);
      return { ok: false, message: "You can only sleep on the bed.", status: 400 };
    }
    return room.bedPose(agent, object, "sleeping", "asleep on the bed", `${agent.name} fell asleep.`, "You fell asleep.");
  }

export function bedPose(room: RoomHost, agent: AgentRecord, object: RoomObject, pose: Pose, status: string, event: string, message: string) {
    const seat = object.seats[0];
    if (!seat) return { ok: false, message: "The bed is missing.", status: 500 };
    if (seat.occupiedBy && seat.occupiedBy !== agent.id) {
      room.idleAt(agent, object);
      return { ok: false, message: "The bed is taken.", status: 409, code: "occupied" };
    }
    const already = agent.objectId === object.id && agent.pose === pose;
    if (already) {
      return { ok: true, message: pose === "sleeping" ? "You are already asleep." : "You are already lying down.", status: 200 };
    }
    room.release(agent);
    seat.occupiedBy = agent.id;
    room.occupy(agent, object, seat.id, seat.poseAt, seat.yaw, true, seat.standAt);
    agent.pose = pose;
    agent.status = status;
    room.log(event, agent.id, pose === "sleeping" ? "sleep" : "lie");
    return { ok: true, message, status: 200 };
  }

export function occupy(room: RoomHost, 
    agent: AgentRecord,
    object: RoomObject,
    seatId: string,
    poseAt: { x: number; y: number; z: number },
    yaw: number,
    lie: boolean,
    standAt: Vec2,
  ) {
    agent.objectId = object.id;
    agent.seatId = seatId;
    agent.poseAt = { ...poseAt };
    agent.position = { x: poseAt.x, z: poseAt.z };
    agent.yaw = yaw;
    agent.lie = lie;
    agent.anchor = "hips";
    agent.standAt = { ...standAt };
    agent.holding = null;
    agent.poseUntil = null;
    agent.motion = null;
    agent.pending = null;
  }

export function idleAt(room: RoomHost, agent: AgentRecord, object: RoomObject) {
    if (agent.objectId && agent.objectId !== object.id) room.release(agent);
    agent.objectId = null;
    agent.seatId = null;
    agent.pose = "idle";
    agent.lie = false;
    agent.anchor = "feet";
    agent.poseAt = null;
    agent.holding = null;
    agent.poseUntil = null;
    agent.yaw = yawToward(agent.position, { x: object.position.x, z: object.position.z }, agent.yaw);
  }

export function standUp(room: RoomHost, agent: AgentRecord, announce: boolean) {
    if (agent.standAt) {
      agent.position = { ...agent.standAt };
      agent.yaw = yawToward(agent.position, { x: 0, z: 0 }, agent.yaw);
    }
    const was = agent.pose;
    room.release(agent);
    agent.pose = "idle";
    agent.anchor = "feet";
    agent.status = "standing";
    if (announce) room.log(was === "sleeping" ? `${agent.name} woke up.` : `${agent.name} stood up.`, agent.id);
  }

export function release(room: RoomHost, agent: AgentRecord) {
    for (const object of room.objects.values()) {
      for (const seat of object.seats) {
        if (seat.occupiedBy === agent.id) seat.occupiedBy = null;
      }
    }
    agent.objectId = null;
    agent.seatId = null;
    agent.poseAt = null;
    agent.lie = false;
    agent.standAt = null;
    agent.holding = null;
    agent.poseUntil = null;
  }

export function startWalk(room: RoomHost, agent: AgentRecord, to: Vec2, pending: PendingAction | null, now: number): {
    ms: number;
    arrived: boolean;
    applied?: { ok: boolean; message: string; status: number; code?: string };
  } {
    const from = room.currentPos(agent, now);
    agent.position = from;
    agent.motion = null;
    agent.pending = null;
    agent.poseAt = null;
    agent.lie = false;
    agent.anchor = "feet";
    agent.poseUntil = null;
    const path = route(from, to);
    const travel = pathLength(path);
    if (travel < 0.18) {
      agent.position = { ...to };
      if (!pending) {
        agent.pose = "idle";
        agent.status = "standing";
        return { ms: 0, arrived: true, applied: { ok: true, message: "You arrived.", status: 200 } };
      }
      const applied = room.applyArrived(agent, pending);
      return { ms: 0, arrived: true, applied };
    }
    const ms = walkMs(path);
    agent.motion = { from, to: { ...to }, startedAt: now, arriveAt: now + ms, path };
    agent.pending = pending;
    agent.pose = "walking";
    agent.yaw = motionPoint(path, from, to, now, now + ms, now + 80).yaw;
    return { ms, arrived: false };
  }

export function cancelMotion(room: RoomHost, agent: AgentRecord) {
    if (!agent.motion) return;
    agent.position = room.currentPos(agent, Date.now());
    agent.motion = null;
    agent.pending = null;
  }

export function closeEnough(room: RoomHost, agent: AgentRecord, object: RoomObject, target: Vec2, now: number) {
    if (agent.objectId === object.id && !agent.motion) return true;
    return dist(room.currentPos(agent, now), target) < IN_PLACE;
  }

export function currentPos(room: RoomHost, agent: AgentRecord, now: number): Vec2 {
    if (!agent.motion) return { ...agent.position };
    const at = motionPoint(agent.motion.path, agent.motion.from, agent.motion.to, agent.motion.startedAt, agent.motion.arriveAt, now);
    return { x: at.x, z: at.z };
  }
