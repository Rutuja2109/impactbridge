// Local stand-in for Claude's artifact runtime (db, user, sample, assets) used only for testing.
// Data lives in localStorage so several pages in one browser context share it, like viewers of one artifact.
(() => {
  const params = new URLSearchParams(location.search);
  const UID = params.get("as") || "u_owner";
  const OWNER = (params.get("owner") || "u_owner") === UID;
  const WRITE = params.get("readonly") !== "1";
  const key = (path) => "ibdb:" + path;
  const subs = [];
  function listColl(coll) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith("ibdb:" + coll + "/")) continue;
      const id = k.slice(("ibdb:" + coll + "/").length);
      if (id.includes("/")) continue;
      const data = JSON.parse(localStorage.getItem(k));
      out.push({ id, exists: true, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return { docs: out, size: out.length, empty: !out.length, docChanges: () => [], metadata: {} };
  }
  const fire = () => subs.forEach((s) => s.next(listColl(s.coll)));
  window.addEventListener("storage", fire);
  const db = {
    collection(coll) {
      return {
        onSnapshot(next) { const s = { coll, next }; subs.push(s); setTimeout(() => next(listColl(coll)), 10); return () => subs.splice(subs.indexOf(s), 1); },
        doc(id) { return db.doc(coll + "/" + id); },
      };
    },
    doc(path) {
      return {
        async set(data) {
          if (!WRITE) throw { code: "invalid_argument", message: "read only" };
          localStorage.setItem(key(path), JSON.stringify(data)); setTimeout(fire, 5);
        },
        async delete() { if (!WRITE) throw { code: "invalid_argument" }; localStorage.removeItem(key(path)); setTimeout(fire, 5); },
        async get() { const v = localStorage.getItem(key(path)); return { exists: !!v, data: () => (v ? JSON.parse(v) : undefined) }; },
      };
    },
  };
  const user = {
    id: async () => UID, isOwner: async () => OWNER, canEdit: async () => OWNER, can: async (n) => (n === "data.write" ? WRITE : null),
    me: async () => ({ id: UID, name: "", isOwner: OWNER }), profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: "" }])),
  };
  const sample = async (input) => ({ text: "ok", truncated: false });
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  sample.json = async (input) => {
    window.__lastPrompt = input;
    if (/REFUSE_ME/.test(input)) throw { code: "refused", message: "no" };
    // Deliberately "invents" numbers to prove the guardrail removes them.
    return { title: "Water connection for market toilets", problem_statement: "The toilet block near the market has no water connection.",
      proposed_solution: "Connect the block to the municipal line with a new pipe.", beneficiaries: "Women vendors at the market",
      beneficiary_count: 300, city: "Pimpri", cause: "water_sanitation", budget_required: 40000, volunteers_required: 99,
      materials: [{ name: "PVC pipe", quantity: 60, unit: "metres" }], skills: ["Plumbing"], duration_weeks: 4,
      milestones: [{ title: "Ward office permission", description: "" }], outcomes: [{ metric: "Vendors with toilet access", target: 500, unit: "people" }],
      missing_information: [], follow_up_questions: [] };
  };
  const assets = WRITE ? {
    async upload(blob) {
      const id = Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32);
      const buf = await blob.arrayBuffer();
      let bin = ""; new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
      localStorage.setItem("ibblob:" + id, JSON.stringify({ type: blob.type, b64: btoa(bin) }));
      return { id, url: "/_blob/" + id, sizeBytes: buf.byteLength, contentType: blob.type };
    },
    async delete(id) { localStorage.removeItem("ibblob:" + id); return { deleted: true }; },
    async list() { return { assets: [], usage: {} }; },
  } : null;
  const caps = { db, user, sample, assets };
  window.claude = { use: async (n) => (n in caps ? caps[n] : null) };
})();
