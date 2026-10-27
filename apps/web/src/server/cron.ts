import { timingSafeEqual } from "node:crypto";

// Jobs programados hospedados (D68). Vercel Cron y pg_cron de Supabase llaman con «Authorization: Bearer CRON_SECRET».
// Sin CRON_SECRET configurado los endpoints no existen.
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
