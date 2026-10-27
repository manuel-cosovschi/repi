import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { putObject, readObject } from '@/server/storage';
let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'repi-range-')); process.env.STORAGE_DIR = dir; });
afterEach(async () => { delete process.env.STORAGE_DIR; await rm(dir, { recursive: true, force: true }); });
it('video privado: soporta rangos iniciales, finales y sufijos sin leer el archivo completo', async () => {
  await putObject('video/test', new TextEncoder().encode('0123456789'));
  for (const [range, expected, contentRange] of [['bytes=0-1','01','bytes 0-1/10'],['bytes=7-','789','bytes 7-9/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=8-99','89','bytes 8-9/10']]) {
    const result = await readObject('video/test', range);
    expect(result.status).toBe(206); expect(result.contentRange).toBe(contentRange);
    expect(result.size).toBe(expected.length); expect(await new Response(result.stream).text()).toBe(expected);
  }
  const full = await readObject('video/test'); expect(full.status).toBe(200); expect(full.size).toBe(10);
  await full.stream.cancel();
});
it('rango inexistente o múltiple responde con información de 416', async () => {
  await putObject('video/test', new TextEncoder().encode('0123456789'));
  for (const range of ['bytes=10-', 'bytes=5-1', 'bytes=0-1,5-6', 'bytes=-0', 'other=0-1']) {
    await expect(readObject('video/test', range)).rejects.toMatchObject({ total: 10 });
  }
});
