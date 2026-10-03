import { type RoomHost } from "./engine-host";
import { currentStation } from "./house";
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

export function controlRadio(room: RoomHost, intent: "on" | "off" | "next", stations?: RadioStation[]): { ok: true; message: string; name: string; on: boolean; url: string } {
    if (stations && stations.length > 0 && room.stationsStale()) {
      room.house.stations = stations.slice(0, 8);
      room.house.stationsAt = Date.now();
      room.house.radioIndex = 0;
    }
    if (intent === "off") {
      room.house.radioOn = false;
      room.syncRadio();
      room.log("A viewer turned the radio off.", undefined, "viewer:radio");
      room.emit();
      const station = currentStation(room.house);
      return { ok: true, on: false, name: station.name, url: "", message: "The radio is off." };
    }
    if (intent === "on") room.house.radioOn = true;
    else {
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
