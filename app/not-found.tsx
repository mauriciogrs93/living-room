import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "This page isn't here.",
  robots: { index: false, follow: false },
};

/** Same page for every unknown path. The address is never echoed. */
export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <h1>This page isn&apos;t here.</h1>
        <Link href="/room">Go to the Living Room</Link>
      </div>
    </main>
  );
}
