"use client";

import { useEffect, useState } from "react";
import type { Book, DiaryLine } from "@/lib/room/types";

export function BookReader({ onClose }: { onClose: () => void }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/books", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; books?: Book[]; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.books) setError(data.error ?? "The shelf didn't open.");
        else setBooks(data.books);
      })
      .catch(() => {
        if (!cancelled) setError("The shelf didn't open.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const book = books?.[index] ?? null;
  const pages = book?.pages ?? [];
  const text = pages[page] ?? (pages.length === 0 ? "This journal has no pages yet." : "");

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-[#1a1410]/45 p-3 sm:items-center" role="dialog" aria-label="Books">
      <div className="flex max-h-[min(78dvh,640px)] w-full max-w-[420px] flex-col rounded-[28px] bg-[#f6efe4] text-[#2c241e] shadow-[0_24px_60px_rgba(20,12,8,0.35)]">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="font-heading text-lg">The shelf</p>
          <button type="button" className="h-11 px-2 text-sm text-[#6d5b4e]" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-[#8a3d32]">{error}</p>}
        {!books && !error && <p className="px-5 pb-6 text-sm text-[#6d5b4e]">Opening the books…</p>}
        {books && books.length === 0 && <p className="px-5 pb-6 text-sm text-[#6d5b4e]">The shelf is empty.</p>}
        {book && (
          <>
            <div className="flex gap-2 overflow-x-auto px-5 pb-2">
              {books!.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  className={`h-9 shrink-0 rounded-full px-3 text-[12px] ${itemIndex === index ? "bg-[#2c241e] text-[#f6efe4]" : "bg-[#2c241e]/8"}`}
                  onClick={() => {
                    setIndex(itemIndex);
                    setPage(0);
                  }}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <article className="mx-4 mb-3 min-h-0 flex-1 overflow-y-auto rounded-[22px] bg-[#fffaf3] px-5 py-5 shadow-[inset_0_0_0_1px_rgba(44,36,30,0.06)]">
              <p className="font-heading text-[1.35rem] leading-tight">{book.title}</p>
              <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap">{text}</p>
            </article>
            <div className="flex items-center justify-between px-5 pb-4 text-[13px] text-[#6d5b4e]">
              <button type="button" className="h-11 px-1 disabled:opacity-30" disabled={page <= 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>
                Previous
              </button>
              <span>
                {pages.length === 0 ? "Empty" : `${page + 1} / ${pages.length}`}
              </span>
              <button
                type="button"
                className="h-11 px-1 disabled:opacity-30"
                disabled={page >= pages.length - 1}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DiaryList({ lines, now }: { lines: DiaryLine[]; now: number }) {
  if (lines.length === 0) return <p className="text-sm leading-relaxed text-[#6d5b4e]">No one has written the day yet.</p>;
  const ordered = [...lines].reverse();
  return (
    <ul className="space-y-2.5 pb-2">
      {ordered.map((line) => (
        <li key={line.id} className="text-sm leading-snug">
          <span className="text-[#8a7364]">{line.agentName}</span>
          <span> {line.text}</span>
          <span className="mt-0.5 block text-[11px] text-[#8a7364]">{when(line.at, now)}</span>
        </li>
      ))}
    </ul>
  );
}

function when(at: number, now: number) {
  const clock = new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = new Date(at).toDateString() === new Date(now).toDateString() ? "Today" : new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} · ${clock}`;
}

