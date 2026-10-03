import { type RoomHost } from "./engine-host";
import { type AgentRecord, type PendingAction, type RoomObject } from "./types";

function takeSeat(room: RoomHost, agent: AgentRecord, object: RoomObject) {
  const seat =
    object.seats.find((item) => item.occupiedBy === agent.id) ?? object.seats.find((item) => !item.occupiedBy);
  if (!seat) {
    room.idleAt(agent, object);
    return { ok: false as const, message: "Both seats at the computer are taken.", status: 409, code: "occupied" };
  }
  if (agent.objectId !== object.id || agent.seatId !== seat.id) {
    room.release(agent);
    seat.occupiedBy = agent.id;
    room.occupy(agent, object, seat.id, seat.poseAt, seat.yaw, false, seat.standAt);
    agent.pose = "sitting";
  }
  return { ok: true as const, seat };
}

export function useComputer(room: RoomHost, agent: AgentRecord, object: RoomObject, pending: PendingAction) {
  if (pending.action === "computer_off") {
    object.state.power = false;
    object.state.mode = "off";
    agent.status = agent.objectId === object.id ? "sitting at the computer" : "standing by the computer";
    room.log(`${agent.name} turned the computer off.`, agent.id, "computer_off");
    return { ok: true as const, message: "The monitor is dark.", status: 200 };
  }

  const seated = takeSeat(room, agent, object);
  if (!seated.ok) return seated;

  if (pending.action === "computer_sit") {
    agent.status = "sitting at the computer";
    room.log(`${agent.name} sat at the computer.`, agent.id, "computer_sit");
    return { ok: true as const, message: "You sat down at the computer.", status: 200 };
  }

  if (pending.action === "computer_type") {
    const line = pending.text ?? "";
    if (!line) {
      return { ok: false as const, message: "computer_type needs text of 1–72 characters.", status: 400 };
    }
    object.state.power = true;
    object.state.mode = "type";
    object.state.line = line;
    object.state.source = "";
    object.state.user = agent.name;
    agent.status = "typing at the computer";
    room.log(`${agent.name} typed on the computer, “${line}”`, agent.id, "computer_type");
    return { ok: true as const, message: "It's on the monitor.", status: 200 };
  }

  const line = soften(pending.text || "Living Room Home");
  object.state.power = true;
  object.state.mode = "browse";
  object.state.line = line;
  object.state.source = "";
  object.state.user = agent.name;
  agent.status = "browsing at the computer";
  room.log(`${agent.name} opened “${line}” on the computer.`, agent.id, "computer_browse");
  return { ok: true as const, message: `On the monitor: ${line}`, status: 200 };
}

const HARSH = /\b(assault|rape|raped|rapist|murder|murdered|killing|killed|suicide|terrorist|terrorism|bombing|shooting)\b/gi;

function soften(text: string) {
  return text.replace(HARSH, "—").replace(/\s+/g, " ").trim() || "Living Room Home";
}
