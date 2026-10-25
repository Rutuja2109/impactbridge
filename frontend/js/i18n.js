// Interface translation (English, Hindi, Marathi).
// Views are written in English; this layer translates the rendered interface text in place and keeps doing so as
// screens change. What people type (project titles, descriptions, names, places) is never translated: it is shown
// exactly as written, marked in the markup with translate="no".
import { getLang, saveLang } from "./prefs.js";

let lang = "en";
let dict = null;      // Map english -> translated
let patterns = [];    // [RegExp, (match) => string]
const originals = new WeakMap();   // Text/Attr node -> { src, out }
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);
const NUM = /\d+(?:[.,:]\d+)*/g;

export const currentLang = () => lang;
export const locale = () => ({ en: "en-IN", hi: "hi-IN", mr: "mr-IN" }[lang] || "en-IN");

async function loadDict(l) {
  if (l === "en") return { map: null, pats: [] };
  const mod = l === "hi" ? await import("./i18n/hi.js") : await import("./i18n/mr.js");
  return { map: new Map(Object.entries(mod.default)), pats: mod.patterns || [] };
}

/** Translate one English string (used for text built in code, e.g. confirm dialogs). */
export function t(s) {
  if (!dict || s == null) return s;
  return translateString(String(s)) ?? s;
}

function translateString(s) {
  const key = s.replace(/\s+/g, " ").trim();
  if (!key) return null;
  let out = dict.get(key);
  if (out === undefined) {
    const nums = [];
    const tpl = key.replace(NUM, (m) => { nums.push(m); return `{${nums.length - 1}}`; });
    if (nums.length) {
      const hit = dict.get(tpl);
      if (hit !== undefined) out = hit.replace(/\{(\d+)\}/g, (_, i) => nums[+i] ?? "");
    }
  }
  if (out === undefined) {
    for (const [re, fn] of patterns) {
      const m = key.match(re);
      if (m) { out = fn(m, (x) => translateString(x) ?? x); break; }
    }
  }
  if (out === undefined) return null;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  return lead + out + trail;
}

function skipped(el, forAttrs = false) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (n.getAttribute("translate") === "no" || n.isContentEditable) return true;
    if (SKIP.has(n.tagName) && !(forAttrs && n === el && n.tagName === "TEXTAREA")) return true;
  }
  return false;
}

const getV = (n) => (n.nodeType === 2 ? n.value : n.data);
const setV = (n, v) => { if (n.nodeType === 2) n.value = v; else n.data = v; };

function applyText(node) {
  const rec = originals.get(node);
  const cur = getV(node);
  const src = rec && cur === rec.out ? rec.src : cur;  // our own earlier translation -> its English source
  const out = dict ? translateString(src) : null;
  if (out == null) { if (rec && cur === rec.out) setV(node, rec.src); originals.delete(node); return; }
  originals.set(node, { src, out });
  if (cur !== out) setV(node, out);
}

function applyAttrs(el) {
  for (const a of ATTRS) {
    const at = el.getAttributeNode(a);
    if (at) applyText(at);
  }
  if (el.tagName === "INPUT" && /^(submit|button)$/i.test(el.type)) {
    const at = el.getAttributeNode("value");
    if (at) applyText(at);
  }
}

function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!skipped(root.parentElement)) applyText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const start = root.nodeType === 9 ? root.documentElement : root;
  if (start.nodeType === 1 && start.tagName === "TEXTAREA") { if (!skipped(start, true)) applyAttrs(start); return; }
  if (start.nodeType === 1 && skipped(start)) return;
  if (start.nodeType === 1) applyAttrs(start);
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1 && n.tagName === "TEXTAREA" && n.getAttribute("translate") !== "no") { applyAttrs(n); return NodeFilter.FILTER_REJECT; }
      if (n.nodeType === 1) return SKIP.has(n.tagName) || n.getAttribute("translate") === "no" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) applyText(n); else applyAttrs(n);
  }
}

let observer = null;
function observe() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    if (!dict) return;
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((n) => translateTree(n));
      else if (m.type === "characterData") { if (!skipped(m.target.parentElement)) applyText(m.target); }
      else if (m.type === "attributes" && ATTRS.includes(m.attributeName)) {
        const at = m.target.getAttributeNode(m.attributeName);
        if (at && !skipped(m.target, true)) applyText(at);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

function restoreAll() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const fix = (n) => { const r = originals.get(n); if (r && getV(n) === r.out) setV(n, r.src); originals.delete(n); };
  for (let n = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === 3) fix(n);
    else for (const a of ATTRS) { const at = n.getAttributeNode?.(a); if (at) fix(at); }
  }
}

export async function setLanguage(l, { persist = true } = {}) {
  if (!["en", "hi", "mr"].includes(l)) l = "en";
  const { map, pats } = await loadDict(l);
  if (dict) restoreAll();
  lang = l; dict = map; patterns = pats;
  if (persist) saveLang(l);
  document.documentElement.lang = l;
  document.documentElement.classList.toggle("deva", l !== "en");
  if (dict) translateTree(document);
  window.dispatchEvent(new CustomEvent("ib:lang", { detail: l }));
}

export async function initI18n() {
  observe();
  await setLanguage(getLang(), { persist: false });
}
