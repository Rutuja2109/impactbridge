// Cause illustrations: line icons and a colourful poster cover used where no real photo exists.
// These are illustrations, never presented as photos of the project.
import { raw } from "./core.js";

// Each cause has its own festival colour so cards are recognisable at a glance (bg = cover field, ink = icon/text tint,
// accent = shapes, soft = chip background). The app chrome itself stays green and white.
export const CAUSE_STYLE = {
  education:                { bg: "#F4B63E", ink: "#5B3A00", accent: "#FFE08A", soft: "#FFF4D6", deep: "#B7791F" },
  health:                   { bg: "#E8505B", ink: "#5C0F16", accent: "#FFB3B8", soft: "#FDE7E9", deep: "#B4232F" },
  maternal_child_health:    { bg: "#E879A9", ink: "#5E1238", accent: "#FFD0E4", soft: "#FCE8F1", deep: "#B83A75" },
  water_sanitation:         { bg: "#1E9BBF", ink: "#04384A", accent: "#9BE7F7", soft: "#E1F5FA", deep: "#0E6F8C" },
  environment:              { bg: "#3FA34D", ink: "#0E3A16", accent: "#B8EBA6", soft: "#E6F6E2", deep: "#25752F" },
  livelihoods:              { bg: "#5B5BD6", ink: "#1C1C57", accent: "#C9C9FF", soft: "#ECECFD", deep: "#3B3BA8" },
  hunger_nutrition:         { bg: "#F07A2B", ink: "#4D2000", accent: "#FFD0A8", soft: "#FEEEE2", deep: "#B9541A" },
  disaster_relief:          { bg: "#2F6FDB", ink: "#0A2559", accent: "#B7D0FF", soft: "#E5EEFD", deep: "#1E4FA8" },
  elderly_care:             { bg: "#9C6ADE", ink: "#2E1157", accent: "#E2CEFF", soft: "#F2EAFD", deep: "#6E42AE" },
  disability_inclusion:     { bg: "#16A3A3", ink: "#04403F", accent: "#A9F0EC", soft: "#E0F6F5", deep: "#0E7574" },
  women_empowerment:        { bg: "#C2449F", ink: "#4D0B3B", accent: "#F8C2EA", soft: "#FAE6F5", deep: "#92287A" },
  peacebuilding:            { bg: "#4FA8E0", ink: "#0D3654", accent: "#CDEBFF", soft: "#E6F4FC", deep: "#2B7DB3" },
  community_infrastructure: { bg: "#5E7186", ink: "#18232F", accent: "#D3DEE9", soft: "#EBEFF4", deep: "#3E4E60" },
  animal_welfare:           { bg: "#B9803A", ink: "#3D2507", accent: "#F3D9B4", soft: "#F8EEDF", deep: "#8A5A1F" },
};
const DEFAULT = { bg: "#0B6B4F", ink: "#022A1E", accent: "#9FE3C6", soft: "#E3F4EC", deep: "#0B5D45" };
export const styleFor = (c) => CAUSE_STYLE[c] || DEFAULT;

// 48×48 line icons (stroke = currentColor)
const P = {
  education: '<path d="M6 18 24 10l18 8-18 8z"/><path d="M13 21v9c3 3 7 4 11 4s8-1 11-4v-9"/><path d="M42 18v10"/>',
  health: '<path d="M24 40S8 31 8 19a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 12-16 21-16 21z"/><path d="M17 23h5l2-4 3 8 2-4h3"/>',
  maternal_child_health: '<circle cx="19" cy="12" r="4"/><path d="M12 40V26c0-5 3-9 7-9s7 3 7 7"/><circle cx="31" cy="27" r="3"/><path d="M26 40c0-4 2-7 5-7s5 3 5 7"/>',
  water_sanitation: '<path d="M24 6s12 13 12 22a12 12 0 0 1-24 0C12 19 24 6 24 6z"/><path d="M18 29a6 6 0 0 0 6 6"/>',
  environment: '<path d="M24 42V22"/><path d="M24 26c-8 0-13-6-13-14 8 0 13 6 13 14z"/><path d="M24 22c0-7 5-12 13-12 0 7-5 12-13 12z"/><path d="M14 42h20"/>',
  livelihoods: '<rect x="7" y="16" width="34" height="22" rx="3"/><path d="M18 16v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><path d="M7 26h34"/><path d="M22 26v4h4v-4"/>',
  hunger_nutrition: '<path d="M8 24h32a16 16 0 0 1-32 0z"/><path d="M18 18c0-3 2-3 2-6M24 18c0-3 2-3 2-6M30 18c0-3 2-3 2-6"/><path d="M14 42h20"/>',
  disaster_relief: '<path d="M8 22 24 8l16 14"/><path d="M12 19v21h24V19"/><path d="M24 25v8M20 29h8"/>',
  elderly_care: '<circle cx="21" cy="10" r="4"/><path d="M21 14v12l-5 14M21 26l6 14"/><path d="M15 20l6 2 6-3"/><path d="M33 20v20"/><path d="M33 20c0-3 4-3 4 0"/>',
  disability_inclusion: '<circle cx="22" cy="9" r="3.5"/><path d="M22 14v12h11l4 10"/><path d="M22 20h9"/><path d="M17 22a10 10 0 1 0 12 13"/>',
  women_empowerment: '<circle cx="24" cy="17" r="9"/><path d="M24 26v16M18 36h12"/>',
  peacebuilding: '<path d="M7 26c6-2 10-7 15-7l6 5"/><path d="M41 26c-6-2-10-7-15-7"/><path d="M14 30l6 6c1 1 3 1 4 0l9-9"/><path d="M20 32l5 5M23 29l5 5"/>',
  community_infrastructure: '<path d="M5 34c8-14 30-14 38 0"/><path d="M5 34h38M13 34v-8M24 34V22M35 34v-8"/><path d="M5 40h38"/>',
  animal_welfare: '<circle cx="14" cy="18" r="3.5"/><circle cx="24" cy="13" r="3.5"/><circle cx="34" cy="18" r="3.5"/><path d="M15 34c0-6 4-11 9-11s9 5 9 11c0 4-4 5-9 4-5 1-9 0-9-4z"/>',
};

export function causeIcon(cause, size = 28) {
  const s = styleFor(cause);
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="${s.deep}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[cause] || P.community_infrastructure}</svg>`);
}

/** Decorative poster cover: a bold cause-coloured field, sun disc, layered hills and a big white cause icon.
 *  Same cause always gives the same layout; the project id varies the composition slightly so lists don't repeat. */
/** A small group of neighbours standing together: gives the cover illustrations a human face. */
function crowd(H, r) {
  const skins = ["#8D5A3B", "#C68B59", "#E0AC82", "#6E4429", "#D9A066"];
  const tops = ["#FFFFFF", "#FFE08A", "#FF9F8E", "#BFE9E7", "#E4D4FF"];
  const base = H * 0.9, n = 4 + r(2), x0 = 200 - n * 17;
  let out = "";
  for (let i = 0; i < n; i++) {
    const kid = i % 3 === 1, sc = kid ? 0.72 : 1, x = x0 + i * 34 + r(6), skin = skins[r(skins.length)], top = tops[r(tops.length)];
    out += `<g transform="translate(${x} ${base - 34 * sc}) scale(${sc})"><circle cx="0" cy="-2" r="7.5" fill="${skin}"/>
      <path d="M-9 30 V14 a9 9 0 0 1 18 0 V30 Z" fill="${top}"/><rect x="-6" y="30" width="4.5" height="9" rx="2" fill="#243b36" opacity=".8"/><rect x="1.5" y="30" width="4.5" height="9" rx="2" fill="#243b36" opacity=".8"/></g>`;
  }
  return `<g class="crowd" opacity=".96">${out}</g>`;
}

export function causeCover(cause, { height = 168, label = "", seed = "" } = {}) {
  const s = styleFor(cause);
  let h = 0; for (const ch of String(seed || cause)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = (n) => { h = (h * 1103515245 + 12345) >>> 0; return h % n; };
  const H = height, sx = 70 + r(260), sy = 26 + r(Math.max(10, H / 3));
  const hill = (y, amp, col, op) => `<path d="M0 ${y} C 90 ${y - amp} 160 ${y + amp / 2} 240 ${y - amp / 3} S 360 ${y - amp} 400 ${y - amp / 2} V ${H} H 0 Z" fill="${col}" opacity="${op}"/>`;
  const iconSize = Math.min(78, H * 0.46);
  return raw(`<svg class="cover-art" viewBox="0 0 400 ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label || "Illustration"}">
    <rect width="400" height="${H}" fill="${s.bg}"/>
    <circle cx="${sx}" cy="${sy}" r="${38 + r(22)}" fill="${s.accent}" opacity=".55"/>
    <circle cx="${sx}" cy="${sy}" r="${16 + r(10)}" fill="#fff" opacity=".35"/>
    ${hill(H * 0.72, 26 + r(16), s.deep, ".55")}
    ${hill(H * 0.86, 18 + r(12), s.ink, ".35")}
    ${H >= 140 ? crowd(H, r) : ""}
    <g transform="translate(${200 - iconSize / 2} ${H * 0.5 - iconSize / 2 - 4})">
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${P[cause] || P.community_infrastructure}</svg></g>
  </svg>`);
}

export const ICON = {
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.5 11.5 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.1-1.2l-.5-.3z"/></svg>',
  linkedin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.5-2.2 2.9V21h-4z"/></svg>',
  link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  camera: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  award: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="m9 13-1.5 8 4.5-2.5 4.5 2.5L15 13"/></svg>',
  heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z"/></svg>',
  pin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  people: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5.5 5"/></svg>',
  shield: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  phoneoff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/><path d="M3 3l18 18"/></svg>',
  wallet: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6V5a2 2 0 0 1 2-2h9"/></svg>',
  eye: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  hand: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  invite: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c1-4 4-6 7-6s6 2 7 6"/><path d="M19 8v6M16 11h6"/></svg>',
  match: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
  globe: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  help: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/></svg>',
  more: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  moon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg>',
};
export const icon = (name) => raw(ICON[name] || "");

/** The ImpactBridge mark (heart above a bridge) drawn on a canvas. */
export function drawLogo(g, x, y, size) {
  g.save(); g.translate(x, y); g.scale(size / 512, size / 512);
  const grad = g.createLinearGradient(0, 0, 512, 512); grad.addColorStop(0, "#14C8C5"); grad.addColorStop(1, "#00807E");
  g.fillStyle = grad; g.beginPath(); g.roundRect ? g.roundRect(0, 0, 512, 512, 120) : g.rect(0, 0, 512, 512); g.fill();
  g.fillStyle = "#FFB938"; g.fill(new Path2D("M256 268C256 268 174 220 174 164C174 134 197 112 225 112C241 112 252 121 256 133C260 121 271 112 287 112C315 112 338 134 338 164C338 220 256 268 256 268Z"));
  g.strokeStyle = "#fff"; g.lineCap = "round";
  g.lineWidth = 34; g.stroke(new Path2D("M108 372A168.5 168.5 0 0 1 404 372"));
  g.lineWidth = 32; g.stroke(new Path2D("M84 372H428"));
  g.restore();
}
