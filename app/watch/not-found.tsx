import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "This watch link isn't valid.",
  robots: { index: false, follow: false },
};

/** Made-up watch links. The path is never echoed. */
export default function WatchNotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <h1>This watch link isn&apos;t valid. Ask the owner for a new one.</h1>
        <Link href="/room">Go to the Living Room</Link>
      </div>
    </main>
  );
}
