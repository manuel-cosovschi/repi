import { handle, limit } from "@/server/access/http";
import * as svc from "@/server/access/services";

export const GET = handle(async (req) => {
  await limit("locations", 60);
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 60) ?? "";
  return { locations: await svc.searchJoinableLocations(q) };
});
