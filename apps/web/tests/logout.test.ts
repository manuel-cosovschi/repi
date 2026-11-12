import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), wipe: vi.fn(), pending: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock('@/lib/entry', () => ({ clearEntry: vi.fn() }));
vi.mock('@/lib/offline/store', () => ({ wipeLocal: mocks.wipe }));
vi.mock('@/lib/offline/queue', () => ({ pendingFor: mocks.pending }));
vi.mock('@/lib/push', () => ({ disablePush: mocks.push }));
import { signOutSafely } from '@/lib/session-cleanup';
// Almacenamiento del navegador de mentira (las claves son propiedades, como en el real: Object.keys las lista).
function fakeStorage(init: Record<string, string>) {
  const s = { ...init } as Record<string, unknown>;
  Object.defineProperties(s, {
    setItem: { value: vi.fn((k: string, v: string) => { s[k] = v; }), enumerable: false },
    removeItem: { value: vi.fn((k: string) => { delete s[k]; }), enumerable: false },
    getItem: { value: (k: string) => (k in s ? s[k] : null), enumerable: false },
  });
  return s as unknown as Storage;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null }); mocks.wipe.mockResolvedValue(undefined); mocks.pending.mockResolvedValue(0); mocks.push.mockResolvedValue(undefined);
  vi.stubGlobal('window', { confirm: vi.fn(() => true), dispatchEvent: vi.fn() });
  vi.stubGlobal('localStorage', fakeStorage({ 'repi:program-draft:p1': '{"doc":"plan de Ana"}', 'repi:gym-program-draft:o:m': '{"reason":"lesión de rodilla"}', 'repi:import:coach': '{}', 'repi:theme': 'dark', 'repi:hints': '{}' }));
  vi.stubGlobal('sessionStorage', fakeStorage({ 'repi:ti-draft': '{"client":"Ana"}', 'repi:first-admin-ticket': 't', 'repi:tour:member': '{}' }));
  vi.stubGlobal('caches', { keys: vi.fn(async () => ['repi-shell-v1', 'another-app']), delete: vi.fn(async () => true) });
});
it('todas las salidas eliminan los datos locales y sólo las cachés Repi', async () => {
  expect(await signOutSafely()).toBe(true);
  expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.wipe).toHaveBeenCalledOnce();
  expect(caches.delete).toHaveBeenCalledWith('repi-shell-v1'); expect(caches.delete).not.toHaveBeenCalledWith('another-app');
  expect(localStorage.setItem).toHaveBeenCalledWith('repi:logout', expect.any(String));
});
it('FSA1: no deja borradores privados ni avisos push para la cuenta siguiente; las preferencias quedan', async () => {
  expect(await signOutSafely()).toBe(true);
  expect(mocks.push).toHaveBeenCalledOnce();
  expect(mocks.push.mock.invocationCallOrder[0]).toBeLessThan(mocks.signOut.mock.invocationCallOrder[0]); // con la sesión abierta
  expect(Object.keys(localStorage).sort()).toEqual(['repi:hints', 'repi:logout', 'repi:theme']);
  expect(Object.keys(sessionStorage)).toEqual(['repi:tour:member']);
});
it('FSA1: si no se puede dar de baja el aviso push, la sesión se cierra igual', async () => {
  mocks.push.mockRejectedValue(new Error('sin conexión'));
  expect(await signOutSafely()).toBe(true);
  expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.wipe).toHaveBeenCalledOnce();
});
it('no cierra ni borra datos pendientes si la persona cancela', async () => {
  mocks.pending.mockResolvedValue(2); vi.mocked(window.confirm).mockReturnValue(false);
  expect(await signOutSafely()).toBe(false); expect(mocks.signOut).not.toHaveBeenCalled(); expect(mocks.wipe).not.toHaveBeenCalled();
});
it('un fallo de cierre remoto no se anuncia como cierre exitoso', async () => {
  mocks.signOut.mockResolvedValue({ error: { message: 'Sin conexión' } });
  await expect(signOutSafely()).rejects.toThrow('Sin conexión'); expect(mocks.wipe).not.toHaveBeenCalled();
});
