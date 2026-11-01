// IndexedDB 存储对话（容量远大于 localStorage，可存图片）；若受限环境（如跨域/沙盒 iframe）禁用 IndexedDB，自动回退至内存存储
const DB_NAME = 'nexus-chat';
const STORE = 'conversations';
let dbPromise;
let memFallback = null;

function open() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB unavailable');
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    } catch (e) {
      reject(e);
    }
  });
}

async function tx(mode, fn, memFn) {
  if (memFallback) return memFn(memFallback);
  try {
    const d = await (dbPromise ??= open());
    return await new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result?.result ?? result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch {
    memFallback ??= new Map();
    return memFn(memFallback);
  }
}

export const getAll = () => tx('readonly', (s) => s.getAll(), (m) => [...m.values()]);
export const put = (conv) => tx('readwrite', (s) => { s.put(conv); }, (m) => { m.set(conv.id, conv); });
export const del = (id) => tx('readwrite', (s) => { s.delete(id); }, (m) => { m.delete(id); });
export const clear = () => tx('readwrite', (s) => { s.clear(); }, (m) => { m.clear(); });
