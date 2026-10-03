import type { RoomEngine } from "@/lib/room/engine";
import type { RoomHost } from "@/lib/room/engine-host";
import type { Book } from "@/lib/room/types";
import seedBooks from "@/lib/room/store/books.seed.json";

/**
 * Fresh room books. Poppy and Tester are trusted by the v16.1 migration
 * when the engine settles an empty save. This is the only books seed.
 */
export function applySeedBooks(engine: RoomEngine) {
  const books = seedBooks as Book[];
  if (!books.length) return;
  const room = engine as unknown as RoomHost;
  room.house.books = books.map((book) => ({
    id: book.id,
    title: book.title,
    pages: [...book.pages],
    updatedAt: book.updatedAt || Date.now(),
  }));
}
