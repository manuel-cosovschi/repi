import { describe, expect, it } from "vitest";
import { hasImageMetadata, imageInfo, stripImageMetadata } from "./image";
import { cat, dec, enc, jpegWithGps, pngWithText, webpWithExif } from "./image-fixtures";

describe("imágenes privadas", () => {
  it("detecta tipo real y dimensiones por contenido", () => {
    expect(imageInfo(jpegWithGps())).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
    expect(imageInfo(pngWithText())).toEqual({ mime: "image/png", width: 768, height: 512 });
    expect(imageInfo(webpWithExif())).toEqual({ mime: "image/webp", width: 1024, height: 768 });
  });
  it("rechaza lo que no es imagen aunque diga serlo (MIME falsificado)", () => {
    expect(imageInfo(enc("<svg onload=alert(1)>"))).toBeNull();
    expect(imageInfo(cat([0, 0, 0, 0x18], enc("ftypisom"), new Uint8Array(40)))).toBeNull(); // MP4
    expect(imageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]))).toBeNull(); // JPEG truncado sin cuadro
  });
  it("JPEG: quita EXIF con GPS, XMP y comentarios; conserva JFIF, ICC y los datos de imagen", () => {
    const src = jpegWithGps();
    expect(hasImageMetadata(src)).toBe(true);
    const out = stripImageMetadata(src);
    expect(hasImageMetadata(out)).toBe(false);
    const s = dec(out);
    expect(s).not.toContain("GPS");
    expect(s).not.toContain("casa");
    expect(s).not.toContain("comentario");
    expect(s).toContain("JFIF");
    expect(s).toContain("ICC_PROFILE");
    expect(Array.from(out.slice(-5))).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
    expect(imageInfo(out)).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
  });
  it("PNG: quita texto y eXIf sin romper los demás bloques", () => {
    const out = stripImageMetadata(pngWithText());
    expect(dec(out)).not.toMatch(/GPS|eXIf|tEXt/);
    expect(dec(out)).toMatch(/IHDR[\s\S]*IDAT[\s\S]*IEND/);
    expect(imageInfo(out)).toEqual({ mime: "image/png", width: 768, height: 512 });
  });
  it("WebP: quita EXIF y XMP, apaga sus marcas y corrige el tamaño", () => {
    const out = stripImageMetadata(webpWithExif());
    const s = dec(out);
    expect(s).not.toMatch(/EXIF|XMP |GPS/);
    expect(out[20] & 0x0c).toBe(0);
    const size = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    expect(size).toBe(out.length - 8);
    expect(imageInfo(out)).toEqual({ mime: "image/webp", width: 1024, height: 768 });
  });
  it("estructura inválida: se rechaza", () => {
    expect(() => stripImageMetadata(enc("hola"))).toThrow();
    const bad = jpegWithGps(); bad[5] = 0xff; // largo de segmento imposible
    expect(() => stripImageMetadata(bad)).toThrow();
  });
});
