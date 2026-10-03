"use client";

import { useCallback, useEffect, useState } from "react";

export function useHudHash(known: (id: string) => boolean) {
  const [section, setSection] = useState<string | null>(null);

  const read = useCallback(() => {
    const id = window.location.hash.replace(/^#/, "");
    return id && known(id) ? id : null;
  }, [known]);

  useEffect(() => {
    const apply = () => setSection(read());
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [read]);

  const write = useCallback((id: string | null) => {
    const next = id && known(id) ? id : null;
    const url = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", next ? `${url}#${next}` : url);
    setSection(next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [known]);

  const open = useCallback((id: string) => write(id), [write]);
  const close = useCallback(() => write(null), [write]);
  return { section, open, close };
}
