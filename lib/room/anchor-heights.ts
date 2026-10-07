import { GEO } from "@/components/room/maquette/config";
import { FLOORS, SHELL } from "./layout";

/** Extra height above a staged object for the HUD ring. Window is the glass centre, already in stage space. */
export function anchorLift(id: string): number {
  if (id === "radio") return 0.78;
  if (id === "tv") return 0.77;
  return 0.7;
}

export function windowAnchor(): { x: number; y: number; z: number } {
  return {
    x: GEO.wallInX,
    y: FLOORS[2].y + SHELL.bedWindow.y,
    z: SHELL.bedWindow.z,
  };
}
