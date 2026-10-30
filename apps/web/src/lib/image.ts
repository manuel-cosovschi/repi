// Achica una foto en el navegador antes de subirla (JPEG): menos datos móviles y nada de metadatos de la cámara (ubicación).
export async function shrinkImage(file: File, max = 900, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen."))), "image/jpeg", quality));
  } finally { URL.revokeObjectURL(url); }
}

/** Achica y sube una foto a `url` (multipart, campo `file`). Devuelve el id y una vista previa local. */
export async function uploadImage(url: string, file: File, max = 900) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("La imagen tiene que ser JPG, PNG o WebP.");
  const blob = await shrinkImage(file, max);
  const fd = new FormData(); fd.append("file", new File([blob], "imagen.jpg", { type: "image/jpeg" }));
  const res = await fetch(url, { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
  return { id: data.id as string, preview: URL.createObjectURL(blob) };
}
