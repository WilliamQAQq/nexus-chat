// IndexedDB 存储对话、角色卡与世界书（容量远大于 localStorage，可存高分辨率立绘/图片）；
// 若受限环境（如跨域/沙盒 iframe）禁用 IndexedDB，自动回退至内存存储
const DB_NAME = 'nexus-chat';
const DB_VERSION = 2;
const STORES = ['conversations', 'characters', 'lorebooks'];
let dbPromise;
const memFallbacks = new Map();

function open() {
  return new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB unavailable');
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of STORES) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    } catch (e) {
      reject(e);
    }
  });
}

function getMemStore(storeName) {
  if (!memFallbacks.has(storeName)) memFallbacks.set(storeName, new Map());
  return memFallbacks.get(storeName);
}

async function tx(storeName, mode, fn, memFn) {
  try {
    const d = await (dbPromise ??= open());
    return await new Promise((resolve, reject) => {
      const t = d.transaction(storeName, mode);
      const result = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(result?.result ?? result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } catch {
    const m = getMemStore(storeName);
    return memFn(m);
  }
}

// 兼容旧接口：支持 getAll(storeName) 或默认 conversations
export const getAll = (store = 'conversations') =>
  tx(store, 'readonly', (s) => s.getAll(), (m) => [...m.values()]);

export const get = (storeOrId, id) => {
  const store = id !== undefined ? storeOrId : 'conversations';
  const targetId = id !== undefined ? id : storeOrId;
  return tx(store, 'readonly', (s) => s.get(targetId), (m) => m.get(targetId));
};

export const put = (storeOrItem, item) => {
  const store = item !== undefined ? storeOrItem : 'conversations';
  const data = item !== undefined ? item : storeOrItem;
  return tx(store, 'readwrite', (s) => { s.put(data); }, (m) => { m.set(data.id, data); });
};

export const del = (storeOrId, id) => {
  const store = id !== undefined ? storeOrId : 'conversations';
  const targetId = id !== undefined ? id : storeOrId;
  return tx(store, 'readwrite', (s) => { s.delete(targetId); }, (m) => { m.delete(targetId); });
};

export const clear = (store = 'conversations') =>
  tx(store, 'readwrite', (s) => { s.clear(); }, (m) => { m.clear(); });
