import { type RoomHost } from "./engine-host";
import { type AgentRecord, type RoomObject } from "./types";
import { article } from "./words";

const OUTFITS = [
  { name: "rust", color: "#c46b3a" },
  { name: "sage", color: "#6e9a86" },
  { name: "ink", color: "#3d5f8a" },
  { name: "gold", color: "#c4963c" },
];

export function useCloset(room: RoomHost, agent: AgentRecord, object: RoomObject, action: string, outfitChoice?: string) {
  room.idleAt(agent, object);
  if (action === "wardrobe_open") {
    object.state.open = true;
    return room.finish(agent, action, "opened the wardrobe.", "You opened the wardrobe.", "standing by the wardrobe");
  }
  if (action === "wardrobe_close") {
    object.state.open = false;
    return room.finish(agent, action, "closed the wardrobe.", "You closed the wardrobe.", "standing by the wardrobe");
  }
  object.state.open = true;
  if (outfitChoice === "own") {
    const color = agent.homeColor || agent.color;
    agent.color = color;
    object.state.outfit = "own";
    return room.finish(agent, "change_outfit", "changed back into their own colour.", "You changed back into your own colour.", "wearing your own colour");
  }
  const prev = typeof object.state.outfit === "string" ? object.state.outfit : "";
  const index = (OUTFITS.findIndex((item) => item.name === prev) + 1) % OUTFITS.length;
  const outfit = OUTFITS[index] ?? OUTFITS[0]!;
  object.state.outfit = outfit.name;
  agent.color = outfit.color;
  const phrase = `${article(outfit.name)} ${outfit.name} outfit`;
  return room.finish(agent, "change_outfit", `changed into ${phrase}.`, `You changed into ${phrase}.`, `wearing ${outfit.name}`);
}
