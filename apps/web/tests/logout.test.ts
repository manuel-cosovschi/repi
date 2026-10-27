import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), wipe: vi.fn(), pending: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock('@/lib/entry', () => ({ clearEntry: vi.fn() }));
vi.mock('@/lib/offline/store', () => ({ wipeLocal: mocks.wipe }));
vi.mock('@/lib/offline/queue', () => ({ pendingFor: mocks.pending }));
import { signOutSafely } from '@/lib/session-cleanup';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null }); mocks.wipe.mockResolvedValue(undefined); mocks.pending.mockResolvedValue(0);
  vi.stubGlobal('window', { confirm: vi.fn(() => true), dispatchEvent: vi.fn() });
  vi.stubGlobal('localStorage', { setItem: vi.fn() });
  vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
  vi.stubGlobal('caches', { keys: vi.fn(async () => ['repi-shell-v1', 'another-app']), delete: vi.fn(async () => true) });
});
it('todas las salidas eliminan los datos locales y sólo las cachés Repi', async () => {
  expect(await signOutSafely()).toBe(true);
  expect(mocks.signOut).toHaveBeenCalledOnce(); expect(mocks.wipe).toHaveBeenCalledOnce();
  expect(caches.delete).toHaveBeenCalledWith('repi-shell-v1'); expect(caches.delete).not.toHaveBeenCalledWith('another-app');
  expect(localStorage.setItem).toHaveBeenCalledWith('repi:logout', expect.any(String));
});
it('no cierra ni borra datos pendientes si la persona cancela', async () => {
  mocks.pending.mockResolvedValue(2); vi.mocked(window.confirm).mockReturnValue(false);
  expect(await signOutSafely()).toBe(false); expect(mocks.signOut).not.toHaveBeenCalled(); expect(mocks.wipe).not.toHaveBeenCalled();
});
it('un fallo de cierre remoto no se anuncia como cierre exitoso', async () => {
  mocks.signOut.mockResolvedValue({ error: { message: 'Sin conexión' } });
  await expect(signOutSafely()).rejects.toThrow('Sin conexión'); expect(mocks.wipe).not.toHaveBeenCalled();
});
