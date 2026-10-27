import { appVersion } from "@/server/version";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ v: appVersion() }, { headers: { "cache-control": "no-store" } });
}
