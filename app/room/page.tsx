import type { Metadata } from "next";
import { headers } from "next/headers";
import { WatchApp } from "@/components/watch-app";
import { baseUrlFrom } from "@/lib/http";

export const metadata: Metadata = {
  title: "Watch · Living Room",
  description: "Third-person view of the shared living room.",
};

export default async function RoomPage() {
  return <WatchApp origin={baseUrlFrom(await headers())} />;
}
