import { AsyncLocalStorage } from "node:async_hooks";

/** The route deadline aborts this signal so a stalled Redis call cannot hold the response. */
export const requestSignal = new AsyncLocalStorage<AbortSignal>();

export function currentSignal() {
  return requestSignal.getStore();
}
