import { handle, sessionUserId } from "@/server/access/http";
import { completeUpload } from "@/server/uploads";

// Paso 3 de la subida directa (D71): confirma tamaño y tipo real; recién entonces existe el archivo para la app.
export const POST = handle<{ params: Promise<{ id: string }> }>(async (_req, { params }) => completeUpload(await sessionUserId(), (await params).id));
