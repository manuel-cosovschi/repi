import { z } from "zod";
import { body, handle, sessionUserId } from "@/server/access/http";
import { mySettings, updateSettings } from "@/server/settings/services";

// Configuración de la cuenta (F-HX-23, D95, D188): unidad de peso (se guarda en kg siempre) y apariencia. Siempre la
// propia: el usuario sale de la sesión, nunca del cuerpo del pedido.
export const GET = handle(async () => mySettings(await sessionUserId()));
export const POST = handle(async (req) => updateSettings(await sessionUserId(), await body(req, z.object({ weightUnit: z.enum(["kg", "lb"]).optional(), wishes: z.record(z.string(), z.unknown()).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(), themeChangedAt: z.number().finite().optional() }).strict())));
