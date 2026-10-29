/**
 * Armazenamento das regiões fora da tela em IndexedDB (com reserva em localStorage).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

/* ---------- armazenamento das instâncias fora da tela ---------- */
const IDBW = {
  db: null,
  ok: false,
  mem: new Map(),
  ready: null,
  open() {
    this.ready = new Promise((res) => {
      try {
        const r = indexedDB.open('valeDoCampo_inst53m', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('c');
        };
        r.onsuccess = () => {
          IDBW.db = r.result;
          IDBW.ok = true;
          res();
        };
        r.onerror = () => res();
        r.onblocked = () => res();
      } catch (e) {
        res();
      }
    });
    return this.ready;
  },
  put(k, v) {
    this.mem.set(k, v);
    if (this.ok) {
      try {
        this.db.transaction('c', 'readwrite').objectStore('c').put(v, k);
      } catch (e) {}
      while (this.mem.size > 6) this.mem.delete(this.mem.keys().next().value);
    } else {
      try {
        localStorage.setItem('vdc53_c_' + k, JSON.stringify(v));
      } catch (e) {}
    }
  },
  get(k) {
    if (this.mem.has(k)) return Promise.resolve(this.mem.get(k));
    return this.ready.then(
      () =>
        new Promise((res) => {
          if (this.ok) {
            try {
              const q = this.db.transaction('c').objectStore('c').get(k);
              q.onsuccess = () => res(q.result);
              q.onerror = () => res(undefined);
            } catch (e) {
              res(undefined);
            }
          } else {
            try {
              const s = localStorage.getItem('vdc53_c_' + k);
              res(s ? JSON.parse(s) : undefined);
            } catch (e) {
              res(undefined);
            }
          }
        }),
    );
  },
  clear() {
    this.mem.clear();
    this.ready.then(() => {
      if (this.ok)
        try {
          this.db.transaction('c', 'readwrite').objectStore('c').clear();
        } catch (e) {}
    });
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('vdc53_c_')) localStorage.removeItem(k);
    } catch (e) {}
  },
};

export function openInstanceStore() {
  IDBW.open();
}

export { IDBW };
