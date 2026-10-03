import { headers } from "next/headers";
import { Home } from "@/components/home";
import { baseUrlFrom } from "@/lib/http";

export default async function Page() {
  return <Home origin={baseUrlFrom(await headers())} />;
}
