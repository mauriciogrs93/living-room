import type { Metadata } from "next";
import { headers } from "next/headers";
import { RoomGate } from "@/components/room-gate";
import { baseUrlFrom } from "@/lib/http";

export const metadata: Metadata = {
  title: "Your apartment · Living Room",
  description: "Your private apartment in the Living Room. Sign in to watch it.",
};

export default async function RoomPage() {
  return <RoomGate origin={baseUrlFrom(await headers())} />;
}
