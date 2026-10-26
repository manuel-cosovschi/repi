"use client";
// Envoltorio mínimo de IndexedDB (sin dependencias). Base por dispositivo; el dueño se controla en store.ts.
const NAME = "repi_offline_v1";
export type StoreName = "kv" | "sessions" | "queue";

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("kv");
      d.createObjectStore("sessions", { keyPath: "id" });
      d.createObjectStore("queue", { keyPath: "seq", autoIncrement: true }).createIndex("key", "key", { unique: false });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then((d) => new Promise<T>((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : (undefined as T));
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}
export const idbGet = <T>(store: StoreName, key: IDBValidKey) => tx<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: StoreName, value: unknown, key?: IDBValidKey) => tx<IDBValidKey>(store, "readwrite", (s) => s.put(value, key));
export const idbDel = (store: StoreName, key: IDBValidKey) => tx<undefined>(store, "readwrite", (s) => s.delete(key));
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll());
export const idbClear = (store: StoreName) => tx<undefined>(store, "readwrite", (s) => s.clear());
export const idbAvailable = () => typeof indexedDB !== "undefined";
