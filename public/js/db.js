// IndexedDB 存储对话（容量远大于 localStorage，可存图片）
const DB_NAME = 'nexus-chat';
const STORE = 'conversations';
let dbPromise;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const db = () => (dbPromise ??= open());

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const getAll = () => tx('readonly', (s) => s.getAll());
export const put = (conv) => tx('readwrite', (s) => { s.put(conv); });
export const del = (id) => tx('readwrite', (s) => { s.delete(id); });
export const clear = () => tx('readwrite', (s) => { s.clear(); });
