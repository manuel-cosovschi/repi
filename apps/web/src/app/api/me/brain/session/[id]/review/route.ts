// Cierre de una sesión con REPI (D210): previsto contra hecho, comparación con la anterior, marcas y próxima. Sólo la dueña.
import { handle, sessionUserId } from "@/server/access/http";
import { sessionReviewFor } from "@/server/brain/review";

type Ctx = { params: Promise<{ id: string }> };
export const GET = handle<Ctx>(async (_req, { params }) => sessionReviewFor(await sessionUserId(), (await params).id));
