// In-memory mirror of the artifact's shared db: one live subscription per collection.
export const COLLECTIONS = ["members", "orgs", "projects", "commitments", "updates", "verifications", "reports",
  "notifications", "audit", "files", "interests", "messages"];

function clean(v) {
  return JSON.parse(JSON.stringify(v, (k, x) => (x === undefined ? null : x)));
}

export class Store {
  constructor(db) {
    this.db = db;
    this.c = Object.fromEntries(COLLECTIONS.map((n) => [n, new Map()]));
    this.listeners = new Set();
  }

  init() {
    return Promise.all(COLLECTIONS.map((n) => new Promise((resolve) => {
      let first = true;
      const done = () => { if (first) { first = false; resolve(); } };
      try {
        this.db.collection(n).onSnapshot((snap) => {
          const m = new Map();
          for (const d of snap.docs) if (d.exists) m.set(d.id, { ...d.data(), id: d.id });
          this.c[n] = m;
          done();
          if (!first) this.listeners.forEach((fn) => fn(n));
        }, (e) => { console.warn("db", n, e?.code); done(); });
      } catch (e) { console.warn(e); done(); }
      setTimeout(done, 8000);
    })));
  }

  onChange(fn) { this.listeners.add(fn); }
  all(n) { return [...this.c[n].values()]; }
  get(n, id) { return (id && this.c[n].get(id)) || null; }
  where(n, fn) { return this.all(n).filter(fn); }

  async put(n, obj) {
    const body = clean(obj);
    const id = body.id;
    delete body.id;
    this.c[n].set(id, { ...body, id });
    await this.db.doc(`${n}/${id}`).set(body);
    return this.c[n].get(id);
  }

  async patch(n, id, changes) {
    const cur = this.get(n, id);
    if (!cur) throw new Error(`missing ${n}/${id}`);
    return this.put(n, { ...cur, ...changes, id });
  }

  async del(n, id) {
    this.c[n].delete(id);
    await this.db.doc(`${n}/${id}`).delete();
  }
}
