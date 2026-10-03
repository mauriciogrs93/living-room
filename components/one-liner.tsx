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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <p className="min-w-0 flex-1 font-mono text-[12.5px] leading-relaxed text-[#4a3b32]/80">
        {line ?? "Reading the address of this page…"}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        disabled={!line}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-full bg-[#2c241e] px-4 text-[13px] text-[#f6f1ea] disabled:opacity-40"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {label}
      </button>
    </div>
  );
}
