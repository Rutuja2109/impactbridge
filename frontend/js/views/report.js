import { icon } from "../art.js";
// Final impact report for a completed project, and shareable sponsor certificates.
import { HOSTED, KIND_LABEL, api, causeLabel, date, describeCommitment, html, money, mount, num, raw, shareUrl, state, statusBadge, toast } from "../core.js";
import { causeCover, drawLogo } from "../art.js";
import { currentLang, t } from "../i18n.js";

export default async function report({ el, params, opts }) {
  if (opts.page === "certificate") return certificate(el, params.id);
  return finalReport(el, params.id);
}

// ------------------------------------------------------------------ final impact report
async function finalReport(el, id) {
  mount(el, html`<div class="wrap"><div class="skeleton" style="height:280px"></div></div>`);
  const { project: p } = await api(`/api/projects/${id}`);
  document.title = `Impact report: ${p.title} — ImpactBridge`;
  const r = p.impact_report;
  if (!["completed", "verified"].includes(p.status) || !r) {
    mount(el, html`<div class="wrap state"><h1>Impact report not ready yet</h1>
      <p>The final report appears once the project is completed and has reported its results.</p>
      <a class="btn" href="/projects/${p.id}">Back to project</a></div>`);
    return;
  }
  const res = p.resources;
  const measures = [
    ["People reached", r.people_reached, r.verified_people_reached, num],
    ["Volunteers involved", r.volunteers_involved, r.verified_volunteers_involved, num],
    ["Volunteer hours", r.volunteer_hours, r.verified_volunteer_hours, num],
    ["Funds spent", r.funds_spent, r.verified_funds_spent, money],
  ].filter(([, rep]) => rep !== null && rep !== undefined);
  const bar = (label, rep, ver, f) => {
    const max = Math.max(rep || 0, ver || 0, 1);
    return html`<div class="cmp">
      <div class="cmp-head"><strong>${label}</strong>${r.verified && ver !== null && ver !== undefined && rep ? html`<span class="small muted">${Math.round((ver / rep) * 100)}% ${t("of reported figure confirmed")}</span>` : ""}</div>
      <div class="cmp-row"><span class="k">Reported</span><span class="track"><span class="fill rep" style="width:${((rep || 0) / max) * 100}%"></span></span><span class="v">${f(rep)}</span></div>
      <div class="cmp-row"><span class="k">Verified</span><span class="track"><span class="fill ver" style="width:${r.verified && ver != null ? (ver / max) * 100 : 0}%"></span></span>
        <span class="v">${r.verified ? (ver === null || ver === undefined ? html`<span class="muted">Not checked</span>` : f(ver)) : html`<span class="muted">Pending</span>`}</span></div></div>`;
  };
  const supporters = p.commitments.filter((c) => ["accepted", "fulfilled"].includes(c.status));
  const photos = [...p.evidence, ...p.photos].filter((f) => f.mime?.startsWith("image/"));
  mount(el, html`<div class="wrap report-page">
    <div class="report-hero">
      <div class="report-cover">${photos[0] ? html`<img src="${photos[0].url}" alt="Photo from the project">` : causeCover(p.cause, { height: 200, label: "Illustration" })}</div>
      <div>
        <p class="eyebrow">Final impact report</p>
        <h1 translate="no">${p.title}</h1>
        <p class="muted">${causeLabel(p.cause)} · <span translate="no">${[p.city, p.region].filter(Boolean).join(", ")}</span></p>
        <div class="row">${statusBadge(p.status)}${p.completion_verified ? html`<span class="badge verified">✓ Completion verified</span>` : html`<span class="badge warn">Reported, not yet verified</span>`}
          ${p.is_demo ? html`<span class="badge demo">Demo data</span>` : ""}</div>
        <div class="row no-print" style="margin-top:var(--s4)"><button class="btn" type="button" id="print">Print or save as PDF</button>
          <button class="btn" type="button" id="share-report">Share report</button><a class="btn ghost" href="/projects/${p.id}">Back to project</a></div>
      </div>
    </div>
    <div class="report-kpis">
      ${r.people_reached != null ? html`<div class="kpi"><b>${num(r.verified && r.verified_people_reached != null ? r.verified_people_reached : r.people_reached)}</b><span>${r.verified && r.verified_people_reached != null ? "people reached (verified)" : "people reached (reported)"}</span></div>` : ""}
      <div class="kpi"><b>${money(res.money.pledged)}</b><span>funding pledged</span></div>
      <div class="kpi"><b>${money(res.money.spent || r.funds_spent || 0)}</b><span>spent, as recorded</span></div>
      <div class="kpi"><b>${p.supporter_count}</b><span>supporters</span></div>
    </div>
    <section class="panel"><h2>Reported vs verified</h2>
      <p class="small muted">${r.verified ? t("A reviewer independently checked the results. Verified figures appear next to what the project reported.") : t("A reviewer hasn't checked these results yet. Treat them as the project's own report.")}</p>
      ${measures.map(([l, rep, ver, f]) => bar(l, rep, ver, f))}
      ${p.outcomes.length ? html`<h3>Measures of success</h3><div class="table-scroll"><table class="ledger"><thead><tr><th>Measure</th><th class="num">Target</th><th class="num">Reported</th><th class="num">Verified</th></tr></thead><tbody>
        ${p.outcomes.map((o) => html`<tr><td translate="no">${o.metric}</td><td class="num">${o.target ?? "—"} ${o.unit || ""}</td><td class="num">${o.reported_value ?? "—"}</td><td class="num verified-col">${r.verified ? (o.verified_value ?? t("Not checked")) : "—"}</td></tr>`)}</tbody></table></div>` : ""}
      ${r.verification_notes ? html`<p class="notice good"><strong>Reviewer's notes:</strong> <span translate="no">${r.verification_notes}</span></p>` : ""}
    </section>
    <section class="panel"><h2>What was done</h2><p style="white-space:pre-line" translate="no">${r.summary}</p>
      ${r.materials_delivered ? html`<h3>Materials delivered</h3><p translate="no">${r.materials_delivered}</p>` : ""}
      ${r.challenges ? html`<h3>Challenges</h3><p translate="no">${r.challenges}</p>` : ""}</section>
    <section class="panel"><h2>Resources</h2><div class="table-scroll"><table class="ledger"><thead><tr><th>Resource</th><th class="num">Requested</th><th class="num">Pledged</th><th class="num">Received</th></tr></thead><tbody>
      ${res.money.requested ? html`<tr><td>Funding</td><td class="num">${money(res.money.requested)}</td><td class="num">${money(res.money.pledged)}</td><td class="num">${money(res.money.received)}</td></tr>` : ""}
      ${res.volunteers.requested ? html`<tr><td>Volunteers</td><td class="num">${num(res.volunteers.requested)}</td><td class="num">${num(res.volunteers.pledged)}</td><td class="num">${num(res.volunteers.received)}</td></tr>` : ""}
      ${res.materials.map((m) => html`<tr><td translate="no">${m.name}</td><td class="num">${m.requested ?? "—"} ${m.unit || ""}</td><td class="num">${num(m.pledged)}</td><td class="num">${num(m.received)}</td></tr>`)}
    </tbody></table></div></section>
    ${supporters.length ? html`<section class="panel"><h2>Thank you to our supporters</h2><ul class="list">${supporters.map((c) => html`<li class="row between">
      <span><strong translate="no">${c.organization?.name || c.supporter?.name}</strong> <span class="muted small">· ${KIND_LABEL[c.kind]}: ${describeCommitment(c)}</span></span>
      <a class="btn small" href="/certificates/${c.id}">${icon("award")} Certificate</a></li>`)}</ul></section>` : ""}
    ${photos.length ? html`<section class="panel"><h2>Photo proof</h2><div class="photo-grid">${photos.map((f) => html`<button type="button" class="ph" data-lightbox="${f.url}" aria-label="Open photo"><img src="${f.url}" alt="" loading="lazy"></button>`)}</div></section>` : ""}
    <p class="small muted">Generated ${date(new Date().toISOString())} from ImpactBridge records. Reported is not the same as verified. Always check the verification badges.</p>
  </div>`);
  el.querySelector("#print").addEventListener("click", () => window.print());
  el.querySelector("#share-report").addEventListener("click", () => share(`${p.title}: ${t("final impact report")}`, shareUrl(`/projects/${p.id}/report`)));
}

async function share(text, url) {
  if (navigator.share) { navigator.share({ title: text, text, url }).catch(() => {}); return; }
  try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, "_blank", "noopener"); }
}

// ------------------------------------------------------------------ sponsor certificate
function contributionText(c) {
  const d = t(describeCommitment({ ...c.contribution }));
  return c.contribution.kind === "money" ? `${t("funding of")} ${d}` : `${t(KIND_LABEL[c.contribution.kind])}: ${d}`;
}
/** "for contributing X to" in each language's word order: [before, after] around the contribution. */
function forContributing() {
  return { hi: ["इस प्रोजेक्ट में", "का योगदान देने के लिए:"], mr: ["या प्रकल्पासाठी", "चे योगदान दिल्याबद्दल:"] }[currentLang()] || ["for contributing", "to"];
}

async function certificate(el, id) {
  mount(el, html`<div class="wrap"><div class="skeleton" style="height:420px"></div></div>`);
  const { certificate: c } = await api(`/api/certificates/${id}`);
  document.title = `${t("Impact certificate")}: ${c.sponsor.name} — ImpactBridge`;
  const r = c.report || {};
  const people = r.verified && r.verified_people_reached != null ? r.verified_people_reached : r.people_reached;
  const peopleLabel = r.verified && r.verified_people_reached != null ? t("people reached, independently verified") : t("people reached, as reported");
  mount(el, html`<div class="wrap cert-page">
    ${c.project.is_demo ? html`<p class="notice"><strong>Demo data.</strong> This certificate belongs to a sample project and isn't a real record.</p>` : ""}
    <div class="certificate" id="cert">
      <div class="cert-inner">
        <div class="cert-top"><span class="cert-logo">${raw(`<svg class="ib-logo" width="40" height="40" viewBox="0 0 512 512" aria-hidden="true"><defs><linearGradient id="iblg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15936A"/><stop offset="1" stop-color="#08493A"/></linearGradient></defs><rect width="512" height="512" rx="120" fill="url(#iblg)"/><path class="lg-heart" d="M256 268C256 268 174 220 174 164C174 134 197 112 225 112C241 112 252 121 256 133C260 121 271 112 287 112C315 112 338 134 338 164C338 220 256 268 256 268Z" fill="#FFB938"/><g fill="none" stroke="#fff" stroke-linecap="round"><path class="lg-arch" pathLength="1" d="M108 372A168.5 168.5 0 0 1 404 372" stroke-width="34"/><path class="lg-deck" pathLength="1" d="M84 372H428" stroke-width="32"/></g></svg>`)} ImpactBridge</span>
          <span class="cert-no">${c.number}</span></div>
        <p class="cert-kicker">Certificate of community impact</p>
        <p class="cert-presented">Presented to</p>
        <h1 class="cert-name" translate="no">${c.sponsor.name}</h1>
        <p class="cert-for" translate="no">${forContributing()[0]} <strong>${contributionText(c)}</strong> ${forContributing()[1]}</p>
        <h2 class="cert-project" translate="no">${c.project.title}</h2>
        <p class="cert-where" translate="no">${[c.project.city, c.project.region].filter(Boolean).join(", ")}${c.project.cause_label ? html` · <span translate="yes">${causeLabel(c.project.cause)}</span>` : ""}</p>
        ${people != null ? html`<div class="cert-figure"><b>${num(people)}</b><span>${peopleLabel}</span></div>` : ""}
        <div class="cert-foot">
          <div><span class="muted small">Issued</span><br><strong>${date(c.issued_at)}</strong></div>
          <div class="cert-seal ${c.project.completion_verified ? "ok" : ""}">${c.project.completion_verified ? "✓ Completion verified" : "Completion reported"}</div>
          <div style="text-align:right"><span class="muted small">Verify at</span><br><strong class="small" translate="no">${shareUrl(`/certificates/${c.id}`).replace(/^https?:\/\//, "").slice(0, 46)}</strong></div>
        </div>
      </div>
    </div>
    <div class="row no-print" style="justify-content:center;margin-top:var(--s5)">
      <button class="btn primary" type="button" id="dl">Download image</button>
      <button class="btn" type="button" id="sh">Share</button>
      <button class="btn" type="button" id="pr">Print or save as PDF</button>
      <a class="btn ghost" href="/projects/${c.project.id}/report">See the impact report</a>
    </div>
    <p class="small muted" style="text-align:center">Anyone can open this certificate's link to check it against ImpactBridge's records.</p>
  </div>`);
  el.querySelector("#pr").addEventListener("click", () => window.print());
  el.querySelector("#sh").addEventListener("click", () => share(`${c.sponsor.name}: ${t("Certificate of community impact")} — ${c.project.title}`, shareUrl(`/certificates/${c.id}`)));
  el.querySelector("#dl").addEventListener("click", async () => {
    try {
      const blob = await renderCertificatePng(c, contributionText(c), people, peopleLabel);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `ImpactBridge-certificate-${c.number}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { toast(HOSTED ? "Downloads aren't available in this preview. Use Print instead." : "Couldn't create the image. Use Print instead.", "bad"); }
  });
}

/** Draw the certificate on a canvas (1600x1131, A4 landscape ratio) so it can be shared as an image. */
async function renderCertificatePng(c, contribution, people, peopleLabel) {
  await document.fonts?.ready;
  const W = 1600, H = 1131, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const font = (w, px) => `${w} ${px}px "DM Sans", "Noto Sans Devanagari", "Segoe UI", sans-serif`;
  const center = (text, y, f, color = "#0b2a1f", maxW = W - 280) => {
    g.font = f; g.fillStyle = color; g.textAlign = "center";
    const words = String(text).split(" "); let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) { g.fillText(line, W / 2, yy); line = w; yy += parseInt(f.match(/(\d+)px/)[1], 10) * 1.25; }
      else line = test;
    }
    g.fillText(line, W / 2, yy); return yy;
  };
  g.fillStyle = "#f7faf8"; g.fillRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#064e3b"); grad.addColorStop(1, "#10b981");
  g.strokeStyle = grad; g.lineWidth = 28; g.strokeRect(14, 14, W - 28, H - 28);
  g.strokeStyle = "#a7f3d0"; g.lineWidth = 2; g.strokeRect(54, 54, W - 108, H - 108);
  drawLogo(g, 110, 100, 56);
  g.font = font(800, 34); g.fillStyle = "#0b2a1f"; g.textAlign = "left"; g.fillText("ImpactBridge", 182, 140);
  g.font = font(700, 24); g.fillStyle = "#56685f"; g.textAlign = "right"; g.fillText(c.number, W - 110, 140);
  center(t("Certificate of community impact").toUpperCase(), 250, font(800, 30), "#047857");
  center(t("Presented to"), 330, font(500, 28), "#56685f");
  const y1 = center(c.sponsor.name, 420, font(800, 72));
  const [fb, fa] = forContributing();
  const y2 = center(`${fb} ${contribution} ${fa}`, y1 + 80, font(500, 30), "#2d3b35");
  const y3 = center(c.project.title, y2 + 70, font(800, 44), "#065f46");
  const where = [c.project.city, c.project.region].filter(Boolean).join(", ");
  let y4 = center(where, y3 + 52, font(500, 26), "#56685f");
  if (people != null) {
    y4 += 90; center(Number(people).toLocaleString("en-IN"), y4, font(800, 64), "#047857");
    center(peopleLabel, y4 + 44, font(600, 24), "#56685f");
  }
  g.textAlign = "left"; g.font = font(600, 22); g.fillStyle = "#56685f"; g.fillText(t("Issued"), 120, H - 150);
  g.font = font(800, 28); g.fillStyle = "#0b2a1f"; g.fillText(date(c.issued_at), 120, H - 112);
  g.textAlign = "right"; g.font = font(600, 22); g.fillStyle = "#56685f"; g.fillText(t("Verify at"), W - 120, H - 150);
  g.font = font(700, 18); g.fillStyle = "#0b2a1f"; g.fillText(shareUrl(`/certificates/${c.id}`).replace(/^https?:\/\//, "").slice(0, 70), W - 120, H - 112);
  g.textAlign = "center"; g.font = font(800, 24); g.fillStyle = c.project.completion_verified ? "#047857" : "#b45309";
  g.fillText(c.project.completion_verified ? `✓ ${t("Completion verified")}` : t("Completion reported"), W / 2, H - 205);
  if (c.project.is_demo) { g.font = font(800, 26); g.fillStyle = "#b42318"; g.fillText(t("DEMO DATA — NOT A REAL RECORD"), W / 2, 205); }
  return await new Promise((ok, bad) => cv.toBlob((b) => (b ? ok(b) : bad(new Error("toBlob failed"))), "image/png"));
}

