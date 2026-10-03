import type { RoomPersistence } from "@/lib/room/store/persist";

let current: RoomPersistence | null = null;

export function bindStore(store: RoomPersistence) {
  current = store;
}

export function boundStore() {
  return current;
}
