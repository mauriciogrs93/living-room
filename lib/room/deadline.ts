import { RoomBusy } from "./errors";

/** Stop a look or act from hanging. The handler answers 503 and the client can retry. */
export function deadline<T>(work: Promise<T>, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new RoomBusy()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
