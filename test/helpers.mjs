// Node 测试用的浏览器全局桩：window / localStorage / 最小 IndexedDB。
// 只实现 src/storage.js 实际用到的 API 面（open/get/put/delete/getAllKeys）。

export function installBrowserStubs() {
  const local = new Map();
  globalThis.localStorage = {
    getItem: (k) => (local.has(k) ? local.get(k) : null),
    setItem: (k, v) => local.set(k, String(v)),
    removeItem: (k) => local.delete(k)
  };
  globalThis.window = {
    addEventListener() {},
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (t) => clearTimeout(t)
  };

  const stores = new Map(); // storeName -> Map(key -> value)
  globalThis.indexedDB = {
    open(_name, _version) {
      const request = {};
      const db = {
        objectStoreNames: { contains: (n) => stores.has(n) },
        createObjectStore: (n) => { stores.set(n, new Map()); },
        transaction(storeName) {
          const tx = {};
          tx.objectStore = () => ({
            get(key) {
              const req = {};
              queueMicrotask(() => { req.result = stores.get(storeName)?.get(key); req.onsuccess?.(); });
              return req;
            },
            put(value, key) { stores.get(storeName)?.set(key, value); },
            delete(key) { stores.get(storeName)?.delete(key); },
            getAllKeys() {
              const req = {};
              queueMicrotask(() => { req.result = [...(stores.get(storeName)?.keys() || [])]; req.onsuccess?.(); });
              return req;
            }
          });
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        }
      };
      queueMicrotask(() => { request.result = db; request.onupgradeneeded?.(); request.onsuccess?.(); });
      return request;
    }
  };

  return { local, stores };
}

// 造一个 parseBackupFile / importPages 能吃的"文件"（只用到 .name / .text()）。
export function fakeFile(obj, name = "test.json") {
  return { name, text: async () => JSON.stringify(obj) };
}

export function makePage(id, text) {
  return {
    id, title: text, mainText: text, mainTextScale: 1,
    styles: { mainTextColor: "ink" }, tokens: [], images: [], imageIndex: 0, textOnly: false
  };
}

export function makeText(id, title, pageText) {
  return {
    id, title, updatedAt: 1,
    settings: { showPinyin: true, showZdictExamples: false, mainFont: "kai" },
    pages: [makePage("p_" + id, pageText)]
  };
}
