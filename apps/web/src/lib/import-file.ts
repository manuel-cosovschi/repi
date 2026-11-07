// Archivo elegido para importar (historial D132 o rutina SI2) → lo que viaja al servidor. Excel y OpenDocument se convierten a
// CSV en el teléfono (D140) y se marcan como planilla; las fotos se achican a JPEG de hasta 2000 px; el PDF va tal cual.
import { IMPORT_MAX_TEXT_LENGTH } from "@repi/domain";
import { spreadsheetToCsv } from "./spreadsheet";

const textLimitMessage = `El texto supera los ${IMPORT_MAX_TEXT_LENGTH.toLocaleString("es-AR")} caracteres. Dividilo en partes; el texto se conserva completo.`;

/** Foto a JPEG de hasta 2000 px: menos datos para subir y suficiente para leer un cuaderno. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}
const asDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export type ImportBody = { fileName: string; kind: "text" | "image" | "pdf"; text?: string; dataUrl?: string; sheet?: boolean };
/** Archivo elegido → lo que viaja al servidor (D140: Excel y OpenDocument como CSV), o el mensaje de por qué no se puede. */
export async function readImportFile(f: File): Promise<ImportBody | string> {
  const name = f.name.toLowerCase();
  try {
    if (/\.(xlsx|ods)$/.test(name)) {
      if (typeof DecompressionStream === "undefined") return "Este navegador no puede abrir planillas. Actualizá el teléfono o guardala como CSV.";
      if (f.size > 5_000_000) return "La planilla pesa más de 5 MB. Dejá sólo las hojas que hacen falta.";
      const csv = await spreadsheetToCsv(f);
      if (csv.length > IMPORT_MAX_TEXT_LENGTH) return textLimitMessage;
      return { fileName: f.name, kind: "text", text: csv, sheet: true };
    }
    if (/\.(xls|numbers)$/.test(name)) return name.endsWith(".numbers") ? "Las planillas de Numbers exportalas a Excel o CSV (Archivo › Exportar a) o subí una captura." : "Ese Excel es de un formato viejo: guardalo como .xlsx o CSV, o subí una captura.";
    if (f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/.test(name)) return { fileName: f.name, kind: "image", dataUrl: await shrinkImage(f) };
    if (f.type === "application/pdf" || name.endsWith(".pdf")) {
      if (f.size > 3_000_000) return "El PDF pesa más de 3 MB. Subí sólo las páginas que hacen falta o una captura.";
      return { fileName: f.name, kind: "pdf", dataUrl: await asDataUrl(f) };
    }
    if (f.size > IMPORT_MAX_TEXT_LENGTH * 4) return "El archivo es muy grande. Dividilo en partes.";
    const text = await f.text();
    if (text.length > IMPORT_MAX_TEXT_LENGTH) return textLimitMessage;
    return { fileName: f.name, kind: "text", text, ...(/\.(csv|tsv)$/.test(name) ? { sheet: true } : {}) };
  } catch { return "No pudimos abrir ese archivo. Probá con otro formato o una foto."; }
}

