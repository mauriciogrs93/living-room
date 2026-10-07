"use client";

import { watchEmbed } from "@/lib/room/watch-live";

/** Mounts the embed. Unmounting this node removes the iframe from the DOM. */
export function WatchFrame({ channelId }: { channelId: number }) {
  const src = watchEmbed(channelId);
  if (!src) return null;
  return (
    <iframe
      className="hudf-watch"
      title="Watch live"
      src={src}
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
