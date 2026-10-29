import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { mySettings, updateSettings } from "@/server/settings/services";

// Configuración del alumno (F-HX-23, D95): unidad de peso. Se guarda en kg siempre.
export const GET = handle(async () => mySettings(await sessionUserId()));
export const POST = handle(async (req) => updateSettings(await sessionUserId(), await body(req, z.object({ weightUnit: z.enum(["kg", "lb"]).optional(), wishes: z.record(z.string(), z.unknown()).optional() }))));
