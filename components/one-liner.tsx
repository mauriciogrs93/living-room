"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy } from "lucide-react";
import { joinLine } from "@/lib/join-line";

function subscribe() {
  return () => {};
}

export function OneLiner({ prominent = false, origin = "" }: { prominent?: boolean; origin?: string }) {
  const browserOrigin = useSyncExternalStore(subscribe, () => window.location.origin, () => "");
  const base = origin || browserOrigin;
  const line = base ? joinLine(base) : null;
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
    } catch {
      const area = document.createElement("textarea");
      area.value = line;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const label = copied ? "Copied" : "Copy";

  if (!prominent) {
    return (
      <button
        type="button"
        onClick={() => void copy()}
        disabled={!line}
        className="glass-chip h-11 max-w-full gap-2 pr-3 pl-3 text-[13px] disabled:opacity-40"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {label}
      </button>
    );
  }

  // the landing's copy box: mono line + a hairline-divided COPY button
  return (
    <div className="copy-box">
      <code>{line ?? "Reading the address of this page…"}</code>
      <button type="button" onClick={() => void copy()} disabled={!line} aria-label={copied ? "Copied" : "Copy the sentence"}>
        {copied ? <Check className="size-3.5" aria-hidden /> : null}
        {copied ? "COPIED" : "COPY"}
      </button>
    </div>
  );
}
