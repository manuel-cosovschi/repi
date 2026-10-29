import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;
// QA 29/10 (SEC-4): las cuentas se crean sólo por /api/access/sign-up, que registra términos y edad antes. El alta propia
// de Better Auth queda cerrada desde afuera (el servidor la sigue usando internamente con auth.api.signUpEmail).
export const POST = (req: Request) =>
  new URL(req.url).pathname.endsWith("/sign-up/email") ? Response.json({ code: "NOT_FOUND", message: "No encontrado." }, { status: 404 }) : handler.POST(req);
