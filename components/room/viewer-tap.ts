"use client";

import { useEffect, useState } from "react";

export function tapObject(id: string) {
  void fetch("/api/tap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/** Show the next state immediately, then trust the server once it answers. */
export function useOptimistic(server: boolean) {
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    setPending(null);
  }, [server]);
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), 2500);
    return () => clearTimeout(timer);
  }, [pending, server]);
  return [pending ?? server, (next: boolean) => setPending(next)] as const;
}
