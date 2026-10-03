"use client";

import { useEffect } from "react";
import { markRepliesSeen, OwnerThread } from "@/components/room/owner-notes";

export function YouSection() {
  useEffect(() => {
    markRepliesSeen();
  });
  return <OwnerThread />;
}
