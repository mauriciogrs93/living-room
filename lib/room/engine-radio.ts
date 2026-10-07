import { type RoomHost } from "./engine-host";
import { currentStation, FALLBACK_STATIONS } from "./house";
import {
  type AgentRecord,
  type RadioStation,
  type RoomObject,
} from "./types";

export function setStations(room: RoomHost, stations: RadioStation[]) {
    if (stations.length === 0) return;
    room.house.stations = stations.slice(0, 8);
    room.house.stationsAt = Date.now();
    room.house.radioIndex = 0;
    room.syncRadio();
    room.emit();
  }

export function stationsStale(room: RoomHost, maxMs = 30 * 60 * 1000) {
    return Date.now() - room.house.stationsAt > maxMs;
  }

export type RadioIntent = "on" | "off" | "next" | "prev" | "tune";

function stationList(room: RoomHost, incoming?: RadioStation[]) {
  if (incoming && incoming.length > 0 && room.stationsStale()) return incoming.slice(0, 8);
  return room.house.stations.length > 0 ? room.house.stations : FALLBACK_STATIONS;
}

export function controlRadio(
  room: RoomHost,
  intent: RadioIntent,
  stations?: RadioStation[],
  tuneAt?: unknown,
): { ok: true; message: string; name: string; on: boolean; url: string } | { ok: false; error: string; status: 400 } {
    const nextList = stationList(room, stations);
    if (intent === "tune") {
      const length = nextList.length;
      if (typeof tuneAt !== "number" || !Number.isInteger(tuneAt) || tuneAt < 0 || tuneAt >= length) {
        return { ok: false, error: "Pick a station from the list.", status: 400 };
      }
    }
    if (stations && stations.length > 0 && room.stationsStale()) {
      room.house.stations = stations.slice(0, 8);
      room.house.stationsAt = Date.now();
      if (intent !== "tune" && intent !== "prev") room.house.radioIndex = 0;
    }
    if (intent === "off") {
      room.house.radioOn = false;
      room.syncRadio();
      room.log("A viewer turned the radio off.", undefined, "viewer:radio");
      room.emit();
      const playing = currentStation(room.house);
      return { ok: true, on: false, name: playing.name, url: "", message: "The radio is off." };
    }
    if (intent === "on") room.house.radioOn = true;
    else if (intent === "prev") {
      room.house.radioOn = true;
      room.house.radioIndex -= 1;
    } else if (intent === "tune") {
      room.house.radioOn = true;
      room.house.radioIndex = tuneAt as number;
    } else {
      room.house.radioOn = true;
      room.house.radioIndex += 1;
    }
    room.syncRadio();
    const station = currentStation(room.house);
    room.log(
      room.house.radioOn ? `A viewer set the radio to ${station.name}.` : "A viewer turned the radio off.",
      undefined,
      "viewer:radio",
    );
    room.emit();
    return {
      ok: true,
      on: room.house.radioOn,
      name: station.name,
      url: room.house.radioOn ? station.url : "",
      message: room.house.radioOn ? `The radio is playing ${station.name}.` : "The radio is off.",
    };
  }

export function useRadio(room: RoomHost, agent: AgentRecord, object: RoomObject, action: string) {
    room.idleAt(agent, object);
    if (action === "radio_off") room.house.radioOn = false;
    else if (action === "radio_on") room.house.radioOn = true;
    else {
      room.house.radioOn = true;
      room.house.radioIndex += 1;
    }
    room.syncRadio();
    const station = currentStation(room.house);
    const phrase = room.house.radioOn ? `set the radio to ${station.name}.` : "turned the radio off.";
    return room.finish(agent, action, phrase, room.house.radioOn ? `The radio is playing ${station.name}.` : "You turned the radio off.", "standing by the radio");
  }

export function syncRadio(room: RoomHost) {
    const radio = room.objects.get("radio");
    if (!radio) return;
    const station = currentStation(room.house);
    radio.state.on = room.house.radioOn;
    radio.state.station = station.name;
    radio.state.url = room.house.radioOn ? station.url : "";
  }
