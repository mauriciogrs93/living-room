import { notFound } from "next/navigation";

/** Every /watch/* path is unknown. The segment is not read and not rendered. */
export default function WatchMiss() {
  notFound();
}
