// "Share as image": draws a 1080×1350 card for WhatsApp status / Instagram and hands it to the phone's share sheet.
import { money, shareUrl, toast } from "./core.js";
import { drawLogo, styleFor } from "./art.js";
import { t } from "./i18n.js";

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

async function loadImage(url) {
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = url; });
}

/** Draw the card. kind: "project" | "certificate". */
export async function drawCard({ kind = "project", title, cause, place, causeLabel, photo, line1, line2, progress, footer }) {
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); const s = styleFor(cause);
  const font = (w, size) => `${w} ${size}px "DM Sans", "Noto Sans Devanagari", "Segoe UI", system-ui, sans-serif`;
  // background
  x.fillStyle = kind === "certificate" ? "#0B5D45" : s.bg; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.35; x.fillStyle = kind === "certificate" ? "#9FE3C6" : s.accent;
  x.beginPath(); x.arc(860, 220, 260, 0, Math.PI * 2); x.fill();
  x.globalAlpha = 0.25; x.fillStyle = "#fff"; x.beginPath(); x.arc(860, 220, 120, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
  // photo
  let y = 120;
  const img = photo ? await loadImage(photo) : null;
  if (img) {
    x.save(); rounded(x, 80, y, W - 160, 560, 48); x.clip();
    const r = Math.max((W - 160) / img.width, 560 / img.height);
    x.drawImage(img, 80 + ((W - 160) - img.width * r) / 2, y + (560 - img.height * r) / 2, img.width * r, img.height * r);
    x.restore(); y += 620;
  } else y += 140;
  // card
  const cardY = img ? y : 420;
  x.fillStyle = "#fff"; rounded(x, 80, cardY, W - 160, H - cardY - 150, 48); x.fill();
  let ty = cardY + 90;
  x.fillStyle = s.deep; x.font = font(800, 34); x.fillText(causeLabel || "", 130, ty); ty += 70;
  x.fillStyle = "#10241B"; x.font = font(800, 62);
  for (const l of wrap(x, title, W - 260).slice(0, 4)) { x.fillText(l, 130, ty); ty += 74; }
  x.fillStyle = "#4B5F56"; x.font = font(600, 36); if (place) { x.fillText(place, 130, ty + 6); ty += 70; }
  if (progress !== null && progress !== undefined) {
    x.fillStyle = "#E3EEE8"; rounded(x, 130, ty, W - 260, 26, 13); x.fill();
    x.fillStyle = "#0B5D45"; rounded(x, 130, ty, Math.max(26, (W - 260) * Math.min(1, progress)), 26, 13); x.fill(); ty += 70;
  }
  x.fillStyle = "#10241B"; x.font = font(700, 40); if (line1) { for (const l of wrap(x, line1, W - 260).slice(0, 2)) { x.fillText(l, 130, ty); ty += 52; } }
  x.fillStyle = "#4B5F56"; x.font = font(500, 34); if (line2) { for (const l of wrap(x, line2, W - 260).slice(0, 3)) { x.fillText(l, 130, ty + 4); ty += 46; } }
  // footer
  drawLogo(x, 80, H - 122, 64);
  x.fillStyle = "#fff"; x.font = font(800, 44); x.fillText("ImpactBridge", 160, H - 76);
  x.font = font(600, 28); x.globalAlpha = .85; x.fillText(footer || "", 80, H - 26); x.globalAlpha = 1;
  return new Promise((res) => c.toBlob(res, "image/png"));
}

/** Share a generated image with the system share sheet, or download it when sharing files isn't supported. */
export async function shareImage(blob, name, text) {
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t("Image saved. Share it on WhatsApp or Instagram."));
}

export async function shareProjectImage(p, causeText) {
  const r = p.resources || {};
  const req = r.money?.requested || p.funding?.requested, pledged = r.money?.pledged ?? p.funding?.pledged ?? 0;
  const gaps = r.open_gaps?.length ?? 0;
  const blob = await drawCard({
    title: p.title, cause: p.cause, causeLabel: causeText, place: [p.city, p.region].filter(Boolean).join(", "),
    photo: p.photos?.[0]?.url || p.cover_photo || null,
    progress: req ? pledged / req : null,
    line1: req ? (pledged > 0 ? `${money(pledged)} ${t("pledged of")} ${money(req)}` : `${money(req)} ${t("needed")}`) : `${gaps} ${t(gaps === 1 ? "open need" : "open needs")}`,
    line2: t("Help this community project. Every result is checked by a person."),
    footer: shareUrl(`/projects/${p.id}`).replace(/^https?:\/\//, "").slice(0, 60),
  });
  await shareImage(blob, "impactbridge-project.png", `${p.title} — ${shareUrl(`/projects/${p.id}`)}`);
}
