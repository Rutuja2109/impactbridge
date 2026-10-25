import {
  $, $$, COMMIT_STATUS, KIND_LABEL, api, busy, causeLabel, date, describeCommitment, dialog, esc, formData, html,
  meter, money, mount, navigate, num, raw, showErrors, state, statusBadge, toast, uploadFile, verifiedBadges, ago,
  loc, setAnchor, shareUrl, HOSTED, confirmDialog, celebrate,
} from "../core.js";
import { refreshUser } from "../app.js";
import { causeCover, causeIcon, icon, styleFor } from "../art.js";
import { t } from "../i18n.js";
import { freshness, journey } from "../components.js";

const TABS = [["overview", "Story"], ["support", "Support"], ["updates", "Proof & updates"], ["plan", "Plan & progress"],
  ["resources", "Resources"], ["impact", "Impact"], ["chat", "Chat"], ["history", "History"]];

export default async function projectView({ el, params }) {
  let p;
  let tab = ({ commitments: "support", support: "support", plan: "plan", updates: "updates", impact: "impact", resources: "resources", chat: "chat" })[loc().anchor] || "overview";

  async function load() {
    p = (await api(`/api/projects/${params.id}`)).project;
    document.title = `${p.title} — ImpactBridge`;
    draw();
  }

  function draw() {
    const perms = p.permissions;
    const involved = perms.is_manager || perms.is_reviewer || p.commitments.some((c) => c.is_mine);
    const showImpact = !!p.impact_report || ["completed", "verified"].includes(p.status) || perms.is_manager;
    const tabs = TABS.filter(([k]) => {
      if (k === "history") return perms.is_manager || perms.is_reviewer;
      if (k === "chat") return p.can_chat;
      if (k === "support") return involved || perms.can_support;
      if (k === "impact") return showImpact;
      if (k === "plan" || k === "resources") return involved;
      return true;
    });
    if (!tabs.some(([k]) => k === tab)) tab = "overview";
    if (tab === "chat" && !p.can_chat) tab = "overview";
    const r = p.resources;
    const percent = r.money.requested ? Math.min(100, Math.round((r.money.pledged / r.money.requested) * 100)) : null;
    const who = p.organization ? p.organization.name : p.owner?.name || "";
    const whoIni = who.split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
    const live = ["published", "in_progress", "completed", "verified"].includes(p.status);
    const cs = styleFor(p.cause);
    mount(el, html`<div class="ph5">
      <div class="ph5-cover">${p.photos.length ? html`<img src="${p.photos[0].url}" alt="Photo shared by the project team">`
          : causeCover(p.cause, { height: 230, seed: p.id, label: `${causeLabel(p.cause)} illustration` })}
        <a class="ph5-btn ph5-back" href="/explore" aria-label="Back to projects"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7"/></svg></a>
        ${live ? html`<button class="ph5-btn ph5-share" type="button" id="share-img" aria-label="Share as image"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>` : ""}
        <div class="ph5-tags">${statusBadge(p.status)}${p.is_demo ? html`<span class="badge demo">Sample</span>` : ""}</div>
        ${p.photos.length > 1 ? html`<span class="ph5-count">1 / ${p.photos.length} photos</span>` : !p.photos.length ? html`<span class="credit">Illustration</span>` : ""}</div>
      <div class="ph5-sheet"><div class="wrap">
        <span class="ph5-cause" style="--cc:${cs.soft};--ci:${cs.deep}">${causeIcon(p.cause, 16)}${causeLabel(p.cause)}</span>
        <h1 translate="no">${p.title}</h1>
        <p class="ph5-where">${icon("pin")}<span translate="no">${[p.city, p.region].filter(Boolean).join(", ") || "Location not set"}</span>${freshness({ ...p, last_activity_at: p.last_activity_at })}</p>
        <div class="ptitle-row">${verifiedBadges({ ...p, is_demo: false })} ${p.ai_assisted ? html`<span class="badge info" title="The owner used AI to structure their description, then reviewed it">AI-assisted draft, owner reviewed</span>` : ""}</div>
        ${raw(p.organization ? `<a class="ph5-org" href="/organizations/${encodeURIComponent(p.organization.id)}">` : '<div class="ph5-org">')}
          <span class="me-av" aria-hidden="true">${whoIni}</span>
          <span><span class="small muted">Posted by</span><br><strong translate="no">${who}</strong>${p.organization?.verification_status === "verified" ? html` <span class="tick" title="Verified organization">${icon("check")}</span>` : ""}</span>${raw(p.organization ? "</a>" : "</div>")}
        ${live ? html`<div class="ph5-stats">
          <div><strong>${percent !== null ? (r.money.pledged > 0 ? `${percent}%` : money(r.money.requested)) : num(r.volunteers.requested || 0)}</strong>
            <span>${percent !== null ? (r.money.pledged > 0 ? "funded" : "needed") : "volunteers needed"}</span></div>
          <div><strong>${p.supporter_count}</strong><span>supporter${p.supporter_count === 1 ? "" : "s"}</span></div>
          <div><strong>${r.open_gaps.length}</strong><span>open need${r.open_gaps.length === 1 ? "" : "s"}</span></div>
        </div>
        ${percent !== null ? html`<div class="pc-bar big" role="img" aria-label="${percent}% of funding pledged"><span style="width:${Math.max(percent, 2)}%"></span></div>` : ""}` : ""}
        ${journey(p)}
        ${live ? html`<div class="ph5-share-row">
          <a class="btn wa small" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${p.title} — help this community project on ImpactBridge: ${shareUrl(`/projects/${p.id}`)}`)}">${icon("whatsapp")} WhatsApp</a>
          <button class="btn small" type="button" id="share-img2">${icon("share")} Share as image</button>
          <button class="btn small" id="copy-link">${icon("link")} Copy link</button></div>` : ""}
      </div></div>
    </div>
    <div class="wrap">
      ${p.is_demo ? html`<p class="notice small">This is a sample project to show how ImpactBridge works. Pledges to it aren't real.</p>` : ""}
      ${statusNotice()}
      <div id="actions"></div>
      <div class="split">
        <div>
          <div class="tabs tabs5" role="tablist">${tabs.map(([k, t]) => html`<button role="tab" id="tab-${k}" aria-controls="panel" aria-selected="${tab === k}" data-tab="${k}">${t}</button>`)}</div>
          <div id="panel" role="tabpanel" aria-labelledby="tab-${tab}"></div>
        </div>
        <aside class="side-sticky stack">${sideCard()}</aside>
      </div></div>
      ${p.permissions.can_support || (!state.user && ["published", "in_progress"].includes(p.status) && (!HOSTED || state.identity?.can_write)) ? html`<div class="sticky-cta">
        ${state.user ? html`<button class="btn interest-btn ${p.interest?.mine ? "on" : ""}" id="sticky-interest" type="button" aria-pressed="${!!p.interest?.mine}">${p.interest?.mine ? "★ Interested" : "☆ Interested"}</button>
          <button class="btn primary" id="sticky-support">Offer support</button>`
        : html`<div class="small"><strong>${p.resources.open_gaps.length} open need${p.resources.open_gaps.length === 1 ? "" : "s"}</strong></div>
          <a class="btn primary" href="/login?next=/projects/${p.id}%23support">${HOSTED ? "Create profile" : "Sign in to support"}</a>`}</div>` : ""}`);
    document.body.classList.toggle("has-sticky", !!$(".sticky-cta", el));
    drawActions();
    drawTab();
    const shareImg = async (e) => {
      busy(e.currentTarget);
      try { const { shareProjectImage } = await import("../share.js"); await shareProjectImage(p, t(causeLabel(p.cause))); }
      catch (err) { toast(err.message || "Couldn't create the image", "bad"); } finally { busy(e.currentTarget, false); }
    };
    $("#share-img", el)?.addEventListener("click", shareImg);
    $("#share-img2", el)?.addEventListener("click", shareImg);
    $("#sticky-interest", el)?.addEventListener("click", () => $("#interest-btn", el)?.click());
    $("#interest-btn", el)?.addEventListener("click", async (e) => {
      const on = p.interest?.mine; busy(e.currentTarget);
      try { await api(`/api/projects/${p.id}/interest`, { method: on ? "DELETE" : "POST" }); toast(on ? "Removed from your interests" : "Marked as interested. The team has been told."); await load();
        if (!on) import("../prefs.js").then((m) => m.askForUpdates("We'll tell you when this project needs help or posts an update.")); }
      catch (err) { toast(err.message, "bad"); }
    });
    $$("[data-tab-link]", el).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); tab = a.dataset.tabLink; setAnchor(tab); draw(); }));
    $("#native-share", el)?.addEventListener("click", () => navigator.share({ title: p.title, text: `${p.title}: help this community project on ImpactBridge`, url: shareUrl(`/projects/${p.id}`) }).catch(() => {}));
    $$("[data-tab]", el).forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; setAnchor(tab); draw(); }));
    el.querySelector("[role=tablist]").addEventListener("keydown", (e) => {
      if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
      const bs = $$("[role=tab]", el); const i = bs.findIndex((b) => b.dataset.tab === tab);
      const n = bs[(i + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length];
      tab = n.dataset.tab; draw(); $(`#tab-${tab}`, el).focus();
    });
    $("#support-btn", el)?.addEventListener("click", () => openOffer());
    $("#sticky-support", el)?.addEventListener("click", () => openOffer());
    $("#copy-link", el)?.addEventListener("click", async () => {
      const link = shareUrl(`/projects/${p.id}`);
      try { await navigator.clipboard.writeText(link); toast(HOSTED ? "Link to ImpactBridge copied" : "Link copied"); }
      catch { toast(link); }
    });
    $$("[data-adopt]", el).forEach((b) => b.addEventListener("click", () => openOffer(b.dataset.adopt, b.dataset.item, b.dataset.unit, b.dataset.qty)));
    $("#report-btn", el)?.addEventListener("click", reportDialog);
    if (!el.dataset.blockWired) {
      el.dataset.blockWired = "1";
      el.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-block]");
        if (!b) return;
        const ok = await confirmDialog(`Block ${b.dataset.blockName}? They won't be able to offer support to your projects, and you won't see their projects or updates. Open offers between you are closed. You can unblock them from your profile.`, { confirmLabel: "Block", danger: true });
        if (!ok) return;
        try { await api(`/api/users/${b.dataset.block}/block`, { method: "POST" }); toast("Blocked"); load(); }
        catch (err) { toast(err.message, "bad"); }
      });
    }
  }

  function openOffer(kind, item, unit, qty) {
    tab = "support"; setAnchor("support"); draw();
    const f = $("#propose-form", el);
    if (!f) return;
    if (kind) { f.kind.value = kind; f.kind.dispatchEvent(new Event("change")); }
    if (item) f.item.value = item;
    if (unit) f.unit.value = unit;
    if (qty && Number(qty) > 0) f.quantity.value = qty;
    f.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => f.quantity.focus({ preventScroll: true }), 350);
  }

  function statusNotice() {
    const perms = p.permissions;
    if (!perms.is_manager) return "";
    const map = {
      draft: ["", "This is a private draft. Submit it for review when it's ready."],
      submitted: ["", "Submitted. A reviewer will check it and you'll be notified."],
      needs_information: ["warn", `Reviewers asked for more information: ${p.review_notes || ""}`],
      approved: ["good", "Approved. Publish it when you're ready for supporters to see it."],
      rejected: ["bad", `This project wasn't approved: ${p.review_notes || ""}`],
      completed: ["", "Marked completed. A reviewer will verify the results against your evidence."],
    };
    const m = map[p.status];
    return m ? html`<p class="notice ${m[0]}">${m[1]}</p>` : "";
  }

  function sideCard() {
    return html`<div class="panel sidecard side5">
      ${p.permissions.can_support ? html`<button class="btn primary" id="support-btn" style="width:100%">Offer support</button>
        <button class="btn interest-btn ${p.interest?.mine ? "on" : ""}" id="interest-btn" type="button" aria-pressed="${!!p.interest?.mine}" style="width:100%;margin-top:var(--s2)">${p.interest?.mine ? "★ You're interested" : "☆ I'm interested"}</button>
        <p class="small muted" style="margin:6px 0 0;text-align:center">${p.interest?.count ? `${p.interest.count} ${p.interest.count === 1 ? "person is" : "people are"} interested.` : "Not ready to commit? Show interest and ask the team questions in the chat."}</p>` : ""}
      ${p.permissions.is_manager && p.interest?.people?.length ? html`<h4 style="margin-top:var(--s4)">Interested (${p.interest.people.length})</h4>
        <ul class="list small">${p.interest.people.slice(0, 8).map((x) => html`<li translate="no">${x.name}${x.city ? html` <span class="muted">· ${x.city}</span>` : ""}${(x.skills || []).length ? html` <span class="muted">· ${x.skills.slice(0, 2).join(", ")}</span>` : ""}</li>`)}</ul>
        <a class="btn small" href="#chat" data-tab-link="chat">Message them in the chat</a>` : ""}
      ${!state.user && ["published", "in_progress"].includes(p.status) && (!HOSTED || state.identity?.can_write) ? html`<a class="btn primary" style="width:100%" href="/login?next=/projects/${p.id}%23support">${HOSTED ? "Create a profile to offer support" : "Sign in to offer support"}</a>` : ""}
      <p class="small muted" style="margin:var(--s3) 0 0">${p.allow_multiple_supporters ? "Several supporters can combine their help." : "This project takes one supporter only."}</p>
    </div>
    ${p.blocked_owner ? html`<p class="notice small">You blocked the person who posted this project, or they blocked you. You can't offer support to it.</p>` : ""}
    ${state.user && !p.permissions.is_manager ? html`<div class="row"><button class="btn small ghost" id="report-btn">Report a concern about this project</button>
      ${!HOSTED && p.owner && p.owner.id !== state.user.id && !p.blocked_owner ? html`<button class="btn small ghost" data-block="${p.owner.id}" data-block-name="${p.owner.name}">Block this person</button>` : ""}</div>` : ""}`;
  }

  // ------------------------------------------------------------ actions ---
  function drawActions() {
    const perms = p.permissions, st = p.status;
    const b = [];
    if (perms.is_manager) {
      if (perms.can_edit) b.push(html`<a class="btn" href="/projects/${p.id}/edit">Edit proposal</a>`);
      if (["draft", "needs_information"].includes(st)) b.push(html`<button class="btn primary" data-go="submitted">Submit for review</button>`);
      if (st === "draft") b.push(html`<button class="btn danger" data-del>Delete draft</button>`);
      if (st === "approved") b.push(html`<button class="btn primary" data-go="published">Publish project</button>`);
      if (st === "published") b.push(html`<button class="btn ink" data-go="in_progress">Mark as started</button>`);
      if (st === "in_progress") b.push(html`<button class="btn ink" data-go="completed">Mark as completed</button>`);
      if (["submitted", "approved", "published", "in_progress"].includes(st) && !p.need_verified) b.push(html`<button class="btn" data-verify="project_need">Request need verification</button>`);
      if (p.budget_required && !p.financial_verified && !["draft", "rejected", "verified"].includes(st)) b.push(html`<button class="btn" data-verify="project_financial">Request budget check</button>`);
    }
    if (perms.is_reviewer && !perms.is_manager) {
      if (st === "submitted") b.push(html`<button class="btn good" data-go="approved">Approve</button><button class="btn" data-go="needs_information" data-notes="1">Ask for information</button><button class="btn danger" data-go="rejected" data-notes="1">Reject</button>`);
      if (st === "approved") b.push(html`<button class="btn" data-go="published">Publish</button>`);
      if (st === "completed") b.push(html`<a class="btn good" href="/admin#verifications">Review completion</a>`);
    }
    if (!b.length) return;
    mount($("#actions", el), html`<div class="row" style="margin-bottom:var(--s4)">${b}</div>`);
    $$("[data-go]", el).forEach((btn) => btn.addEventListener("click", () => transition(btn)));
    $("[data-del]", el)?.addEventListener("click", async () => {
      if (!(await confirmDialog("Delete this draft permanently?", { confirmLabel: "Delete draft", danger: true }))) return;
      await api(`/api/projects/${p.id}`, { method: "DELETE" }); toast("Draft deleted"); navigate("/dashboard");
    });
    $$("[data-verify]", el).forEach((btn) => btn.addEventListener("click", () => verifyDialog(btn.dataset.verify)));
  }

  async function transition(btn) {
    const target = btn.dataset.go;
    if (btn.dataset.notes || target === "approved") {
      const label = { approved: "Approve this project", needs_information: "Ask for more information", rejected: "Reject this project" }[target];
      dialog(html`<h2>${label}</h2><form id="tf" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="tn">${target === "approved" ? "Notes for the owner (optional)" : "What should the owner know or change?"}</label><textarea id="tn" name="notes" rows="4"></textarea></div>
        <div class="row"><button class="btn ink" type="submit">${label}</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
        onMount: (d) => $("#tf", d).addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            await api(`/api/projects/${p.id}/transition`, { method: "POST", body: { status: target, notes: formData(e.target).notes } });
            d.close(); toast("Decision saved"); load();
          } catch (err) { showErrors(e.target, err); }
        }),
      });
      return;
    }
    if (target === "completed" && !p.impact_report) {
      toast("Submit an impact report first (Impact tab).", "bad"); tab = "impact"; draw(); return;
    }
    busy(btn);
    try {
      await api(`/api/projects/${p.id}/transition`, { method: "POST", body: { status: target } });
      toast({ submitted: "Submitted for review", published: "Published", in_progress: "Marked as started", completed: "Marked completed. Reviewers will verify it." }[target] || "Saved");
      load();
    } catch (err) {
      busy(btn, false);
      if (err.details?.length) dialog(html`<h2>Almost there</h2><p>${err.message}</p><ul>${err.details.map((d) => html`<li>${d.message}</li>`)}</ul>
        <div class="row">${p.permissions.can_edit ? html`<a class="btn ink" href="/projects/${p.id}/edit" data-close>Edit proposal</a>` : ""}<button class="btn ghost" data-close>Close</button></div>`);
      else toast(err.message, "bad");
    }
  }

  function verifyDialog(kind) {
    const fin = kind === "project_financial";
    dialog(html`<h2>${fin ? "Request a budget check" : "Request need verification"}</h2>
      <p class="muted">${fin ? "Upload a quotation, cost breakdown or receipts. Only reviewers will see these documents."
        : "A reviewer will confirm the need exists — for example by calling a local contact or visiting. Add anything that helps, such as a letter from the school or ward office."}</p>
      <form id="vf" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="vn">Notes for the reviewer</label><textarea id="vn" name="notes" rows="3" placeholder="Who can reviewers contact to confirm?"></textarea></div>
        <div class="field"><label for="vfile">Documents ${fin ? "" : "(optional)"}</label><input type="file" id="vfile" name="file_ids" accept="application/pdf,image/*" multiple></div>
        <div class="row"><button class="btn ink" type="submit">Send request</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#vf", d).addEventListener("submit", async (e) => {
        e.preventDefault(); const btn = e.submitter; busy(btn);
        try {
          const ids = [];
          for (const file of $("#vfile", d).files) ids.push((await uploadFile(file, { purpose: "verification", visibility: "reviewers", project_id: p.id })).id);
          await api("/api/verifications", { method: "POST", body: { kind, subject_id: p.id, notes: $("#vn", d).value, file_ids: ids } });
          d.close(); toast("Request sent to reviewers"); load();
        } catch (err) { showErrors(e.target, err); busy(btn, false); }
      }),
    });
  }

  function reportDialog() {
    const reasons = state.meta.report_reasons;
    dialog(html`<h2>Report a concern</h2><p class="muted">Reports go to ImpactBridge reviewers, not to the project owner. Safeguarding reports are handled first.</p>
      <form id="rf" novalidate><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="rr">Reason</label><select id="rr" name="reason">${Object.entries(reasons).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
        <div class="field"><label for="rd">Details</label><textarea id="rd" name="details" rows="4"></textarea></div>
        <div class="row"><button class="btn ink" type="submit">Send report</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#rf", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await api("/api/reports", { method: "POST", body: { subject_type: "project", subject_id: p.id, ...formData(e.target) } });
          d.close(); toast("Thanks. Reviewers will look into it.");
        } catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  // --------------------------------------------------------------- tabs ---
  function drawTab() {
    const box = $("#panel", el);
    ({ overview, resources, support, plan, updates, impact, chat, history: historyTab })[tab](box);
  }

  function needsCards() {
    const r = p.resources, can = p.permissions.can_support;
    const cards = [];
    const card = (k, name, req, pledged, fmt, adopt) => {
      if (k === "Skill") {
        cards.push(html`<div class="need ${pledged ? "met" : ""}"><span class="k">Skill</span><h4>${name}</h4>
          <span class="small muted">${pledged ? "A supporter has committed this skill" : "No one has committed this yet"}</span>
          ${can && !pledged ? html`<button class="btn small primary" data-adopt="skills" data-item="${name}" data-qty="1">I can give this</button>` : ""}</div>`);
        return;
      }
      const met = req !== null && req !== undefined && pledged >= req;
      const pc = req ? Math.min(100, (pledged / req) * 100) : 0;
      cards.push(html`<div class="need ${met ? "met" : ""}"><span class="k">${k}</span><h4>${name}</h4>
        ${req !== null && req !== undefined ? html`<div class="bar"><span style="width:${pc.toFixed(1)}%"></span></div>
          <span class="small muted">${fmt(pledged)} of ${fmt(req)} pledged${met ? "" : `, ${fmt(req - pledged)} to go`}</span>`
          : html`<span class="small muted">${pledged ? "Pledged" : "Amount not specified"}</span>`}
        ${can && !met ? html`<button class="btn small primary" data-adopt="${adopt.kind}" data-item="${adopt.item || ""}" data-unit="${adopt.unit || ""}" data-qty="${adopt.qty || ""}">I can give this</button>` : ""}</div>`);
    };
    if (r.money.requested) card("Funding", "Money for the project", r.money.requested, r.money.pledged, money, { kind: "money", qty: r.money.gap });
    if (r.volunteers.requested) card("People", "Volunteers", r.volunteers.requested, r.volunteers.pledged, num, { kind: "volunteers", qty: r.volunteers.gap });
    r.materials.forEach((m) => card("Materials", m.name, m.requested, m.pledged, (v) => `${num(v)}${m.unit ? " " + m.unit : ""}`, { kind: "materials", item: m.name, unit: m.unit, qty: m.gap }));
    r.skills.forEach((s) => card("Skill", s.skill, 1, s.pledged ? 1 : 0, (v) => (v ? "Covered" : "Needed"), { kind: "skills", item: s.skill, qty: 1 }));
    return cards.length ? html`<section><h2>What's needed</h2><div class="needs-grid">${cards}</div></section>` : "";
  }

  function overview(box) {
    const story = p.story || (p.problem_statement || "").split(/(?<=[.!?।])\s+/).slice(0, 2).join(" ");
    const helpers = p.participants || [];
    const latest = (p.timeline || []).find((e) => e.kind === "update" || e.kind === "delivered" || e.kind === "milestone");
    const ini = (n) => (n || "").split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
    mount(box, html`
      ${story ? html`<p class="story5" translate="no">${story}</p>` : ""}
      ${needsCards()}
      <section class="helpers5"><h2>Who's helping</h2>
        ${helpers.length ? html`<ul>${helpers.map((x) => html`<li><span class="me-av sm" aria-hidden="true">${ini(x.name)}</span>
          ${x.type === "organization" ? html`<a href="/organizations/${x.id}" translate="no">${x.name}</a>${x.verification_status === "verified" ? html` <span class="tick" title="Verified organization">${icon("check")}</span>` : ""}` : html`<span translate="no">${x.name}</span>`}</li>`)}</ul>`
          : html`<p class="muted">No one yet. Your help could be the first, and the team will see it straight away.</p>`}
      </section>
      ${latest ? html`<section class="latest5"><div class="row between"><h2>Latest from the ground</h2><a href="#updates" data-tab-link="updates">See all</a></div>
        <div class="card"><div class="small muted">${date(latest.at)}${latest.author ? html`, by <span translate="no">${latest.author}</span>` : ""}</div><strong>${latest.title}</strong>
        ${latest.body ? html`<p class="small" style="margin:6px 0 0">${latest.body.slice(0, 220)}${latest.body.length > 220 ? "…" : ""}</p>` : ""}</div></section>` : ""}
      ${p.photos.length > 1 ? html`<section><h2>Photos</h2><div class="gallery">${p.photos.map((f, i) => html`<a href="${f.url}" data-lightbox="${f.url}"><img src="${f.url}" alt="Photo ${i + 1} of the problem" loading="lazy"></a>`)}</div></section>` : ""}
      <details class="more5"><summary>Full details</summary><div class="prose">
        <h3>The problem</h3><p>${p.problem_statement || "Not described yet."}</p>
        <h3>Proposed solution</h3><p>${p.proposed_solution || "Not described yet."}</p>
        <h3>Who benefits</h3><p>${p.beneficiaries || "Not specified."}${p.beneficiary_count ? ` About ${num(p.beneficiary_count)} people, as stated by the project owner.` : ""}</p></div>
        <dl class="kv">
          <dt>Location</dt><dd>${[p.location_detail, p.city, p.region].filter(Boolean).join(", ") || "Not set"}${p.location_detail_hidden ? html`<br><span class="small muted">Exact location is shared with the project team only, to protect the people involved.</span>` : ""}</dd>
          <dt>Duration</dt><dd>${p.duration_weeks ? `${p.duration_weeks} weeks` : "Not set"}</dd>
          <dt>Dates</dt><dd>${p.start_date ? `${date(p.start_date)}${p.end_date ? " to " + date(p.end_date) : ""}` : "Not set"}</dd>
          <dt>Volunteer time</dt><dd>${p.time_commitment || "Not set"}</dd>
          ${p.involves_children || p.involves_vulnerable ? html`<dt>Safeguarding</dt><dd>Involves ${[p.involves_children && "children", p.involves_vulnerable && "vulnerable adults"].filter(Boolean).join(" and ")}${p.safeguarding_notes ? html`<br><span class="small">${p.safeguarding_notes}</span>` : ""}</dd>` : ""}
        </dl>
        ${p.original_description !== undefined ? html`<h3>Original description</h3><p class="small muted">Visible to the project team and reviewers.</p><div class="original">${p.original_description || "—"}</div>
          ${p.missing_info?.length ? html`<p class="small" style="margin-top:var(--s3)"><strong>Noted as missing when drafted:</strong> ${p.missing_info.join("; ")}</p>` : ""}` : ""}
      </details>`);
    $$("[data-tab-link]", box).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); tab = a.dataset.tabLink; setAnchor(tab); draw(); $("#panel", el)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  }

  function resources(box) {
    const r = p.resources, m = r.money, v = r.volunteers;
    const cell = (x, f = num) => (x === null || x === undefined ? "—" : f(x));
    mount(box, html`
      <p class="muted">Each figure comes from recorded commitments. <strong>Pledged</strong> counts only offers the owner accepted.
        <strong>Reported</strong> figures come from the project team; <strong>verified</strong> figures were checked by a reviewer.</p>
      <div class="table-scroll"><table class="ledger">
        <thead><tr><th>Resource</th><th class="num">Requested</th><th class="num">Offers pending</th><th class="num">Pledged</th><th class="num">Received</th><th class="num">Spent / used</th><th class="num">Reported</th><th class="num">Verified</th></tr></thead>
        <tbody>
          <tr><td>Funding</td><td class="num">${cell(m.requested, money)}</td><td class="num">${money(m.proposed)}</td><td class="num">${money(m.pledged)}</td><td class="num">${money(m.received)}</td><td class="num">${money(m.spent)}</td><td class="num">${cell(m.reported_spent, money)}</td><td class="num verified-col">${cell(m.verified_spent, money)}</td></tr>
          <tr><td>Volunteers</td><td class="num">${cell(v.requested)}</td><td class="num">${num(v.proposed)}</td><td class="num">${num(v.pledged)}</td><td class="num">${num(v.received)}</td><td class="num">—</td><td class="num">${cell(v.reported_involved)}</td><td class="num verified-col">${cell(v.verified_involved)}</td></tr>
          <tr><td>Volunteer hours</td><td class="num">—</td><td class="num">—</td><td class="num">${num(v.pledged_hours)}</td><td class="num">—</td><td class="num">—</td><td class="num">${cell(v.reported_hours)}</td><td class="num verified-col">${cell(v.verified_hours)}</td></tr>
          ${r.materials.map((x) => html`<tr><td>${x.name}${x.unit ? html` <span class="muted">(${x.unit})</span>` : ""}</td><td class="num">${cell(x.requested)}</td><td class="num">${num(x.proposed)}</td><td class="num">${num(x.pledged)}</td><td class="num">${num(x.received)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>`)}
        </tbody></table></div>
      ${r.skills.length ? html`<h3 style="margin-top:var(--s5)">Skills</h3><ul class="list">${r.skills.map((s) => html`<li class="row between"><span>${s.skill}</span>${s.pledged ? html`<span class="badge verified">Pledged</span>` : s.proposed ? html`<span class="badge info">Offer pending</span>` : html`<span class="badge warn">Needed</span>`}</li>`)}</ul>` : ""}
      ${r.other_items.length ? html`<h3 style="margin-top:var(--s5)">Other contributions</h3><ul class="list">${r.other_items.map((x) => html`<li>${KIND_LABEL[x.kind]}: ${num(x.quantity)} ${x.unit || ""} ${x.item}</li>`)}</ul>` : ""}`);
  }

  function support(box) {
    const perms = p.permissions;
    const mine = p.commitments.filter((c) => c.is_mine);
    const others = p.commitments.filter((c) => !c.is_mine);
    const myOrgs = state.user?.organizations || [];
    mount(box, html`<div id="commitments">
      ${perms.can_support ? html`<form id="propose-form" class="panel" novalidate>
        <h2>Offer support</h2><p class="muted small">The project owner will accept, decline or ask for changes. Nothing is counted as pledged until they accept.</p>
        <div class="form-error notice bad" hidden></div>
        <div class="form-grid">
          <div class="field"><label for="kind">What are you offering?</label><select id="kind" name="kind">${Object.entries(KIND_LABEL).map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></div>
          <div class="field"><label for="on">On behalf of</label><select id="on" name="org_id"><option value="">Myself</option>${myOrgs.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></div>
          <div class="field" id="item-field"><label for="item">Item or skill</label><input id="item" name="item" list="needed-items">
            <datalist id="needed-items">${[...p.resources.materials.map((m) => m.name), ...p.resources.skills.map((s) => s.skill)].map((x) => html`<option value="${x}">`)}</datalist></div>
          <div class="field"><label for="qty" id="qty-label">Amount (${state.meta.currency})</label><input id="qty" name="quantity" type="number" min="0" step="any" required></div>
          <div class="field" id="unit-field"><label for="unit">Unit</label><input id="unit" name="unit" placeholder="e.g. kg, pieces"></div>
          <div class="field" id="hours-field"><label for="hours">Hours per volunteer</label><input id="hours" name="hours" type="number" min="0" step="0.5"></div>
          <div class="field"><label for="dl">Can deliver by (optional)</label><input id="dl" name="deadline" type="date"></div>
          <div class="field full"><label for="cd">Message to the owner</label><textarea id="cd" name="description" rows="3" placeholder="Conditions, timing, who to contact"></textarea></div>
        </div>
        <button class="btn primary" type="submit">Send offer</button></form>` : ""}
      ${mine.length ? html`<h2 style="margin-top:var(--s5)">Your offers</h2>${mine.map(commitCard)}` : ""}
      <h2 style="margin-top:var(--s5)">${perms.is_manager ? "Offers received" : "Accepted commitments"}</h2>
      ${others.length ? others.map(commitCard) : html`<p class="muted">${perms.is_manager ? "No offers yet. Publishing the project and sharing its link helps supporters find it." : "No accepted commitments yet."}</p>`}
    </div>`);
    const f = $("#propose-form", box);
    if (f) {
      const sync = () => {
        const k = f.kind.value;
        $("#item-field", f).hidden = !["materials", "equipment", "skills"].includes(k);
        $("#unit-field", f).hidden = !["materials", "equipment"].includes(k);
        $("#hours-field", f).hidden = k !== "volunteers";
        $("#qty-label", f).textContent = { money: `Amount (${state.meta.currency})`, volunteers: "Number of volunteers", skills: "Number of people", materials: "Quantity", equipment: "Quantity" }[k];
        if (k === "skills" && !f.quantity.value) f.quantity.value = 1;
      };
      f.kind.addEventListener("change", sync); sync();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = formData(f);
        ["item", "unit", "hours"].forEach((k) => { if ($(`#${k}-field`, f)?.hidden || (k === "hours" && $("#hours-field", f).hidden)) delete d[k]; });
        if ($("#item-field", f).hidden) delete d.item;
        if ($("#unit-field", f).hidden) delete d.unit;
        const btn = e.submitter; busy(btn);
        try {
          await api(`/api/projects/${p.id}/commitments`, { method: "POST", body: d });
          toast("Offer sent to the project owner"); celebrate("Thank you for helping!", "Your offer was sent. The team will reply here."); load();
          setTimeout(() => import("../prefs.js").then((m) => m.askForUpdates("We'll tell you when the team answers your offer and when the work is done.")), 2900);
        } catch (err) { showErrors(f, err); busy(btn, false); }
      });
    }
    $$("[data-cact]", box).forEach((b) => b.addEventListener("click", () => commitAction(b.dataset.cid, b.dataset.cact)));
    $$("[data-cprog]", box).forEach((b) => b.addEventListener("click", () => progressDialog(p.commitments.find((c) => c.id === b.dataset.cprog))));
  }

  function commitCard(c) {
    const [label, cls] = COMMIT_STATUS[c.status] || [c.status, ""];
    const mgr = p.permissions.is_manager;
    const acts = [];
    if (mgr && c.status === "proposed") acts.push(["accept", "Accept", "good"], ["request_changes", "Ask for changes", ""], ["decline", "Decline", "danger"]);
    if (mgr && c.status === "changes_requested") acts.push(["decline", "Decline", "danger"]);
    if (mgr && c.status === "accepted") acts.push(["fulfil", "Mark fully received", "good"]);
    if (c.is_mine && ["proposed", "changes_requested"].includes(c.status)) acts.push(["withdraw", "Withdraw offer", "danger"]);
    if ((c.is_mine || mgr) && c.status === "accepted") acts.push(["cancel", "Cancel commitment", "danger"]);
    return html`<div class="commit">
      <div class="row between"><strong>${KIND_LABEL[c.kind]}: ${describeCommitment(c)}</strong><span class="badge ${cls}">${label}</span></div>
      <div class="small muted">From ${c.organization ? c.organization.name : c.supporter?.name}${c.deadline ? `, by ${date(c.deadline)}` : ""}. Offered ${ago(c.created_at)}.</div>
      ${c.description ? html`<p class="small" style="margin:6px 0 0">${c.description}</p>` : ""}
      ${c.owner_message ? html`<p class="small notice" style="margin:8px 0 0">Owner: ${c.owner_message}</p>` : ""}
      ${["accepted", "fulfilled"].includes(c.status) && ["completed", "verified"].includes(p.status) ? html`<p class="small" style="margin:6px 0 0"><a href="/certificates/${c.id}">🏅 Impact certificate</a></p>` : ""}
      ${["accepted", "fulfilled"].includes(c.status) && (c.received_quantity || c.spent_amount || c.responsibility) ? html`<p class="small" style="margin:6px 0 0">
        Received: <strong>${c.kind === "money" ? money(c.received_quantity) : num(c.received_quantity)}</strong>${c.kind === "money" ? html`, spent: <strong>${money(c.spent_amount)}</strong>` : ""}${c.responsibility ? `. Responsible for: ${c.responsibility}` : ""}</p>` : ""}
      ${c.is_mine && c.status === "changes_requested" ? html`<p class="small" style="margin-top:6px"><button class="linklike" data-cact="revise" data-cid="${c.id}">Update your offer</button></p>` : ""}
      ${acts.length || (mgr && c.status === "accepted") ? html`<div class="row" style="margin-top:var(--s3)">
        ${acts.map(([a, t, k]) => html`<button class="btn small ${k}" data-cact="${a}" data-cid="${c.id}">${t}</button>`)}
        ${mgr && c.status === "accepted" ? html`<button class="btn small" data-cprog="${c.id}">Record receipt or spending</button>` : ""}</div>` : ""}
      ${mgr && !HOSTED && c.supporter && !c.is_mine && ["proposed", "changes_requested"].includes(c.status) ? html`<p class="small" style="margin:8px 0 0"><button class="linklike" data-block="${c.supporter.id}" data-block-name="${c.supporter.name}">Block this person</button></p>` : ""}
    </div>`;
  }

  async function commitAction(cid, action) {
    const c = p.commitments.find((x) => x.id === cid);
    if (action === "revise") return reviseDialog(c);
    const needsMsg = ["decline", "request_changes", "cancel"].includes(action);
    const send = async (message) => {
      await api(`/api/commitments/${cid}/action`, { method: "POST", body: { action, message } });
      toast({ accept: "Offer accepted", decline: "Offer declined", request_changes: "Changes requested", withdraw: "Offer withdrawn", cancel: "Commitment cancelled", fulfil: "Marked as received" }[action]);
      refreshUser(); load();
    };
    if (!needsMsg) { try { await send(null); } catch (err) { toast(err.message, "bad"); } return; }
    const title = { decline: "Decline this offer", request_changes: "Ask for changes", cancel: "Cancel this commitment" }[action];
    dialog(html`<h2>${title}</h2><form id="mf" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="mm">Message</label><textarea id="mm" name="message" rows="3" required></textarea>
      <span class="hint">${action === "cancel" ? "Totals will update immediately." : "The supporter will see this."}</span></div>
      <div class="row"><button class="btn ink" type="submit">${title}</button><button class="btn ghost" type="button" data-close>Back</button></div></form>`, {
      onMount: (d) => $("#mf", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await send($("#mm", d).value.trim()); d.close(); } catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  function reviseDialog(c) {
    dialog(html`<h2>Update your offer</h2>${c.owner_message ? html`<p class="notice">Owner asked: ${c.owner_message}</p>` : ""}
      <form id="uf" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="uq">${c.kind === "money" ? `Amount (${state.meta.currency})` : "Quantity"}</label><input id="uq" name="quantity" type="number" min="0" step="any" value="${c.quantity}"></div>
      ${c.kind === "volunteers" ? html`<div class="field"><label for="uh">Hours per volunteer</label><input id="uh" name="hours" type="number" value="${c.hours ?? ""}"></div>` : ""}
      <div class="field"><label for="ud">Deliver by</label><input id="ud" name="deadline" type="date" value="${c.deadline || ""}"></div>
      <div class="field"><label for="um">Message</label><textarea id="um" name="description" rows="3">${c.description || ""}</textarea></div>
      <div class="row"><button class="btn ink" type="submit">Send updated offer</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#uf", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        const body = { kind: c.kind, item: c.item, unit: c.unit, org_id: c.organization?.id || null, ...formData(e.target) };
        try { await api(`/api/commitments/${c.id}`, { method: "PUT", body }); d.close(); toast("Updated offer sent"); load(); }
        catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  function progressDialog(c) {
    dialog(html`<h2>Record progress</h2><p class="muted">${KIND_LABEL[c.kind]}: ${describeCommitment(c)} pledged by ${c.organization?.name || c.supporter?.name}.</p>
      <form id="pf" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="pr">${c.kind === "money" ? `Received so far (${state.meta.currency})` : c.kind === "volunteers" ? "Volunteers who took part" : "Quantity received"}</label><input id="pr" name="received_quantity" type="number" min="0" step="any" value="${c.received_quantity}"></div>
      ${c.kind === "money" ? html`<div class="field"><label for="ps">Spent so far (${state.meta.currency})</label><input id="ps" name="spent_amount" type="number" min="0" step="any" value="${c.spent_amount}"></div>` : ""}
      <div class="field"><label for="pres">Responsible for</label><input id="pres" name="responsibility" value="${c.responsibility || ""}" placeholder="e.g. Procurement of tanks"></div>
      <div class="field"><label for="pdl">Deadline</label><input id="pdl" name="deadline" type="date" value="${c.deadline || ""}"></div>
      <div class="row"><button class="btn ink" type="submit">Save</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#pf", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api(`/api/commitments/${c.id}/progress`, { method: "PATCH", body: formData(e.target) }); d.close(); toast("Saved"); load(); }
        catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  function plan(box) {
    const mgr = p.permissions.is_manager && !["verified", "rejected"].includes(p.status);
    const doneCount = p.checklist.filter((c) => c.done).length;
    mount(box, html`
      <h2>Milestones</h2>
      ${p.milestones.length ? html`<ol class="timeline">${p.milestones.map((m) => html`<li class="${m.status}">
        <div class="row between"><strong>${m.title}</strong>
          <span class="small ${m.status !== "done" && m.due_date && m.due_date < new Date().toISOString().slice(0, 10) ? "" : "muted"}">${m.status === "done" ? `Done ${date(m.completed_at)}` : m.due_date ? `Due ${date(m.due_date)}` : "No date"}</span></div>
        ${m.responsible ? html`<div class="small muted">Responsible: ${m.responsible}</div>` : ""}
        ${m.description ? html`<div class="small">${m.description}</div>` : ""}
        ${mgr ? html`<div class="row" style="margin-top:6px">
          ${m.status !== "done" ? html`<button class="btn small" data-ms="${m.id}" data-st="${m.status === "pending" ? "in_progress" : "done"}">${m.status === "pending" ? "Start" : "Mark done"}</button>` : ""}
          <button class="btn small ghost" data-msedit="${m.id}">Edit</button></div>` : ""}</li>`)}</ol>` : html`<p class="muted">No milestones yet.</p>`}
      ${mgr ? html`<button class="btn small" id="ms-add">Add milestone</button>` : ""}

      <h2 style="margin-top:var(--s6)">Completion checklist</h2>
      ${p.checklist.length ? html`<p class="small muted">${doneCount} of ${p.checklist.length} done</p>
        <ul class="list">${p.checklist.map((c) => html`<li><label class="check" style="margin:0"><input type="checkbox" data-chk="${c.id}" ${c.done ? "checked" : ""} ${mgr ? "" : "disabled"}><span>${c.text}</span></label></li>`)}</ul>`
        : html`<p class="muted">${mgr ? "Add the things that must be true before you mark the project complete." : "No checklist yet."}</p>`}
      ${mgr ? html`<form id="chk-form" class="row" novalidate><label class="sr-only" for="chk-in">New checklist item</label><input id="chk-in" name="text" placeholder="e.g. Receipts uploaded" style="flex:1"><button class="btn small" type="submit">Add</button></form>` : ""}

      <h2 style="margin-top:var(--s6)">Measures of success</h2>
      ${p.outcomes.length ? html`<div class="table-scroll"><table class="ledger"><thead><tr><th>Measure</th><th class="num">Target</th><th class="num">Reported</th><th class="num">Verified</th>${mgr ? html`<th></th>` : ""}</tr></thead>
        <tbody>${p.outcomes.map((o) => html`<tr><td>${o.metric}${o.unit ? html` <span class="muted">(${o.unit})</span>` : ""}</td><td class="num">${o.target === null ? "—" : num(o.target)}</td><td class="num">${o.reported_value === null ? "—" : num(o.reported_value)}</td><td class="num verified-col">${o.verified_value === null ? "—" : num(o.verified_value)}</td>
          ${mgr ? html`<td><button class="btn small ghost" data-out="${o.id}">Report result</button></td>` : ""}</tr>`)}</tbody></table></div>`
        : html`<p class="muted">No measures defined.</p>`}
      ${mgr ? html`<button class="btn small" id="out-add" style="margin-top:var(--s3)">Add measure</button>` : ""}`);

    $$("[data-ms]", box).forEach((b) => b.addEventListener("click", async () => {
      const m = p.milestones.find((x) => x.id === b.dataset.ms);
      try { await api(`/api/projects/${p.id}/milestones/${m.id}`, { method: "PUT", body: { ...pick(m), status: b.dataset.st } }); toast("Milestone updated"); load(); }
      catch (err) { toast(err.message, "bad"); }
    }));
    $$("[data-msedit]", box).forEach((b) => b.addEventListener("click", () => milestoneDialog(p.milestones.find((x) => x.id === b.dataset.msedit))));
    $("#ms-add", box)?.addEventListener("click", () => milestoneDialog(null));
    $$("[data-chk]", box).forEach((c) => c.addEventListener("change", async () => {
      try { await api(`/api/projects/${p.id}/checklist/${c.dataset.chk}`, { method: "PATCH", body: { done: c.checked } }); load(); }
      catch (err) { toast(err.message, "bad"); c.checked = !c.checked; }
    }));
    $("#chk-form", box)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await api(`/api/projects/${p.id}/checklist`, { method: "POST", body: { text: $("#chk-in", box).value } }); load(); }
      catch (err) { toast(err.message, "bad"); }
    });
    $$("[data-out]", box).forEach((b) => b.addEventListener("click", () => outcomeDialog(p.outcomes.find((o) => o.id === b.dataset.out))));
    $("#out-add", box)?.addEventListener("click", () => outcomeDialog(null));
  }
  const pick = (m) => ({ title: m.title, description: m.description || "", due_date: m.due_date, responsible: m.responsible, status: m.status });

  function milestoneDialog(m) {
    dialog(html`<h2>${m ? "Edit milestone" : "Add milestone"}</h2><form id="mf" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="mt">Title</label><input id="mt" name="title" value="${m?.title || ""}"></div>
      <div class="field"><label for="mdsc">Description</label><textarea id="mdsc" name="description" rows="2">${m?.description || ""}</textarea></div>
      <div class="form-grid"><div class="field"><label for="mdd">Due date</label><input id="mdd" name="due_date" type="date" value="${m?.due_date || ""}"></div>
      <div class="field"><label for="mst">Status</label><select id="mst" name="status">${[["pending", "Not started"], ["in_progress", "In progress"], ["done", "Done"]].map(([k, t]) => html`<option value="${k}" ${m?.status === k ? "selected" : ""}>${t}</option>`)}</select></div></div>
      <div class="field"><label for="mr">Who is responsible</label><input id="mr" name="responsible" value="${m?.responsible || ""}"></div>
      <div class="row"><button class="btn ink" type="submit">Save</button>${m ? html`<button class="btn danger" type="button" id="mdel">Delete</button>` : ""}<button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => {
        $("#mf", d).addEventListener("submit", async (e) => {
          e.preventDefault();
          const body = formData(e.target); body.description = body.description || "";
          try {
            if (m) await api(`/api/projects/${p.id}/milestones/${m.id}`, { method: "PUT", body });
            else await api(`/api/projects/${p.id}/milestones`, { method: "POST", body });
            d.close(); toast("Milestone saved"); load();
          } catch (err) { showErrors(e.target, err); }
        });
        $("#mdel", d)?.addEventListener("click", async () => { await api(`/api/projects/${p.id}/milestones/${m.id}`, { method: "DELETE" }); d.close(); load(); });
      },
    });
  }

  function outcomeDialog(o) {
    dialog(html`<h2>${o ? "Report a result" : "Add a measure"}</h2><form id="of" novalidate><div class="form-error notice bad" hidden></div>
      <div class="field"><label for="om">Measure</label><input id="om" name="metric" value="${o?.metric || ""}"></div>
      <div class="form-grid"><div class="field"><label for="ot">Target</label><input id="ot" name="target" type="number" min="0" step="any" value="${o?.target ?? ""}"></div>
      <div class="field"><label for="ou">Unit</label><input id="ou" name="unit" value="${o?.unit || ""}"></div></div>
      ${o ? html`<div class="field"><label for="orv">Reported result so far</label><input id="orv" name="reported_value" type="number" min="0" step="any" value="${o.reported_value ?? ""}">
        <span class="hint">Report only what you've counted. A reviewer will check it before it's marked verified.</span></div>` : ""}
      <div class="row"><button class="btn ink" type="submit">Save</button><button class="btn ghost" type="button" data-close>Cancel</button></div></form>`, {
      onMount: (d) => $("#of", d).addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          if (o) await api(`/api/projects/${p.id}/outcomes/${o.id}`, { method: "PUT", body: formData(e.target) });
          else await api(`/api/projects/${p.id}/outcomes`, { method: "POST", body: formData(e.target) });
          d.close(); toast("Saved"); load();
        } catch (err) { showErrors(e.target, err); }
      }),
    });
  }

  function updates(box) {
    const canPost = (p.permissions.is_manager || p.commitments.some((c) => c.is_mine && ["accepted", "fulfilled"].includes(c.status)))
      && ["published", "in_progress", "completed"].includes(p.status);
    mount(box, html`
      ${canPost ? html`<form id="upf" class="panel" novalidate><h2>Post an update</h2><div class="form-error notice bad" hidden></div>
        <div class="field"><label for="ut">Title</label><input id="ut" name="title" placeholder="e.g. Tanks delivered to the school"></div>
        <div class="field"><label for="ub">What happened?</label><textarea id="ub" name="body" rows="4"></textarea></div>
        <div class="field"><label for="uf">Photos or documents (optional)</label><input id="uf" type="file" accept="image/*,application/pdf" multiple>
          <label class="check" style="margin-top:6px"><input type="checkbox" id="upub" checked><span>Show these files publicly. Untick to share with the project team only.</span></label>
          ${p.involves_children || p.involves_vulnerable ? html`<label class="check"><input type="checkbox" id="ucons"><span>I have consent for any identifiable people in public photos.</span></label>` : ""}</div>
        <button class="btn ink" type="submit">Post update</button></form>` : ""}
      ${[...p.photos, ...p.evidence].some((f) => f.mime?.startsWith("image/")) ? html`<h2 style="margin-top:var(--s4)">Photo proof</h2>
        <p class="small muted">Photos from the ground, shared by the project team.</p>${gallery([...p.evidence, ...p.photos].filter((f) => f.mime?.startsWith("image/")))}` : ""}
      <h2 style="margin-top:var(--s5)">Proof timeline</h2>
      <p class="muted small">Everything that happened on this project, newest first: pledges, deliveries, milestones, updates and reviewer checks. Built from records only.</p>
      ${p.timeline.length ? html`<ol class="proof">${p.timeline.map((e) => html`<li><span class="ev ${e.kind}" aria-hidden="true">${{ published: "+", pledge: "₹", delivered: "✓", update: "i", milestone: "◆", verified: "✓", report: "≡" }[e.kind] || "•"}</span>
        <div class="card"><div class="when">${date(e.at)}${e.author ? `, by ${e.author}` : ""}</div><div class="t">${e.title}</div>
        ${e.commitment ? html`<div class="small">${KIND_LABEL[e.commitment.kind]}: ${describeCommitment(e.commitment)}</div>` : ""}
        ${e.body ? html`<p class="small" style="white-space:pre-line;margin:6px 0 0">${e.body}</p>` : ""}
        ${e.files?.length ? gallery(e.files) : ""}</div></li>`)}</ol>`
        : html`<p class="muted">Nothing recorded yet. Pledges, milestones and updates will appear here.</p>`}`);
    $("#upf", box)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = e.submitter; busy(btn);
      try {
        const ids = [];
        const pub = $("#upub", box).checked;
        for (const file of $("#uf", box).files) ids.push((await uploadFile(file, { purpose: "evidence", visibility: pub ? "public" : "team", project_id: p.id, consent: $("#ucons", box)?.checked })).id);
        await api(`/api/projects/${p.id}/updates`, { method: "POST", body: { ...formData(e.target), file_ids: ids } });
        toast("Update posted"); load();
      } catch (err) { showErrors(e.target, err); busy(btn, false); }
    });
  }

  function impact(box) {
    const r = p.impact_report;
    const mgr = p.permissions.is_manager;
    const canEdit = mgr && ["in_progress", "completed"].includes(p.status) && !(r && r.verified);
    const row = (label, rep, ver, f = num) => html`<tr><td>${label}</td><td class="num">${rep === null || rep === undefined ? "—" : f(rep)}</td><td class="num verified-col">${r?.verified ? (ver === null || ver === undefined ? "Not checked" : f(ver)) : "—"}</td></tr>`;
    mount(box, html`
      ${r ? html`<div class="panel"><div class="row between"><h2 style="margin:0">Impact report</h2>${r.verified ? html`<span class="badge verified">✓ Verified ${date(r.verified_at)}</span>` : html`<span class="badge warn">Reported, not yet verified</span>`}</div>
        <p class="small muted">Submitted ${date(r.submitted_at)}. ${["completed", "verified"].includes(p.status) ? html`<a href="/projects/${p.id}/report">Open the final impact report</a>` : ""}</p>
        <div class="table-scroll"><table class="ledger"><thead><tr><th>Measure</th><th class="num">Reported by project</th><th class="num">Verified by reviewer</th></tr></thead><tbody>
          ${row("People reached", r.people_reached, r.verified_people_reached)}
          ${row("Volunteers involved", r.volunteers_involved, r.verified_volunteers_involved)}
          ${row("Volunteer hours", r.volunteer_hours, r.verified_volunteer_hours)}
          ${row("Funds spent", r.funds_spent, r.verified_funds_spent, money)}
          ${p.outcomes.map((o) => html`<tr><td>${o.metric}</td><td class="num">${o.reported_value ?? "—"}</td><td class="num verified-col">${r.verified ? (o.verified_value ?? "Not checked") : "—"}</td></tr>`)}
        </tbody></table></div>
        <h3 style="margin-top:var(--s4)">Summary</h3><p style="white-space:pre-line">${r.summary}</p>
        ${r.materials_delivered ? html`<h3>Materials delivered</h3><p>${r.materials_delivered}</p>` : ""}
        ${r.challenges ? html`<h3>Challenges</h3><p>${r.challenges}</p>` : ""}
        ${r.verification_notes ? html`<p class="notice good"><strong>Reviewer's notes:</strong> ${r.verification_notes}</p>` : ""}
        ${p.evidence.length ? html`<h3>Evidence</h3>${gallery(p.evidence)}` : ""}
      </div>` : html`<p class="muted">${mgr ? "Once work is under way, submit an impact report with what was achieved. It's required before marking the project complete." : "No impact report yet."}</p>`}
      ${canEdit ? html`<form id="irf" class="panel" novalidate><h2>${r ? "Update impact report" : "Submit impact report"}</h2>
        <div class="form-error notice bad" hidden></div>
        <p class="small muted">Report only what you counted or recorded. Leave a field empty if you don't know. Reviewers compare this with your evidence.</p>
        <div class="form-grid">
          <div class="field"><label for="i1">People reached</label><input id="i1" name="people_reached" type="number" min="0" value="${r?.people_reached ?? ""}"></div>
          <div class="field"><label for="i2">Volunteers involved</label><input id="i2" name="volunteers_involved" type="number" min="0" value="${r?.volunteers_involved ?? (p.resources.volunteers.received || "")}"></div>
          <div class="field"><label for="i3">Volunteer hours</label><input id="i3" name="volunteer_hours" type="number" min="0" step="0.5" value="${r?.volunteer_hours ?? ""}"></div>
          <div class="field"><label for="i4">Funds spent (${state.meta.currency})</label><input id="i4" name="funds_spent" type="number" min="0" value="${r?.funds_spent ?? (p.resources.money.spent || "")}"></div>
          <div class="field full"><label for="i5">Materials delivered</label><input id="i5" name="materials_delivered" value="${r?.materials_delivered || ""}"></div>
          <div class="field full"><label for="i6">Summary of what was done</label><textarea id="i6" name="summary" rows="4">${r?.summary || ""}</textarea></div>
          <div class="field full"><label for="i7">Challenges (optional)</label><textarea id="i7" name="challenges" rows="2">${r?.challenges || ""}</textarea></div>
          <div class="field full"><label for="i8">Evidence: photos, receipts, attendance sheets</label><input id="i8" type="file" multiple accept="image/*,application/pdf">
            <span class="hint">Shared with the project team and reviewers.</span></div>
        </div><button class="btn ink" type="submit">${r ? "Save changes" : "Submit report"}</button></form>` : ""}`);
    $("#irf", box)?.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = e.submitter; busy(btn);
      try {
        const ids = [...(r?.file_ids || [])];
        for (const f of $("#i8", box).files) ids.push((await uploadFile(f, { purpose: "impact", visibility: "team", project_id: p.id })).id);
        await api(`/api/projects/${p.id}/impact-report`, { method: "PUT", body: { ...formData(e.target), file_ids: ids } });
        toast("Impact report saved"); load();
      } catch (err) { showErrors(e.target, err); busy(btn, false); }
    });
  }

  function gallery(files) {
    const imgs = files.filter((f) => f.mime?.startsWith("image/")), docs = files.filter((f) => !f.mime?.startsWith("image/"));
    return html`${imgs.length ? html`<div class="photo-grid">${imgs.map((f) => html`<button type="button" class="ph" data-lightbox="${f.url}" aria-label="Open photo"><img src="${f.url}" alt="${f.original_name || "Photo"}" loading="lazy"></button>`)}</div>` : ""}
      ${docs.length ? html`<div class="row" style="margin-top:8px">${docs.map((f) => html`<a class="btn small" href="${f.url}" target="_blank" rel="noopener" translate="no">📄 ${f.original_name}</a>`)}</div>` : ""}`;
  }

  async function chat(box) {
    mount(box, html`<div class="panel chat-panel"><div class="row between"><h2 style="margin:0">Project chat</h2><span class="small muted">Team, supporters and interested people</span></div>
      <div class="chat-log" id="chatlog" aria-live="polite"><p class="muted small">Loading…</p></div>
      <form id="chatf" class="chat-form" novalidate><div class="form-error notice bad" hidden></div>
        <label class="sr-only" for="chatbody">Message</label><textarea id="chatbody" name="body" rows="2" maxlength="2000" placeholder="Write a message to the project team and supporters"></textarea>
        <button class="btn primary" type="submit">Send</button></form>
      <p class="small muted" style="margin:8px 0 0">Don't share phone numbers of beneficiaries or children here. Messages can be removed by the project team.</p></div>`);
    const log = $("#chatlog", box);
    const loadMsgs = async () => {
      try {
        const { messages } = await api(`/api/projects/${p.id}/messages`);
        mount(log, messages.length ? html`${messages.map((m) => html`<div class="msg ${m.mine ? "mine" : ""}">
          <div class="who"><strong translate="no">${m.author.name}</strong>${m.author.is_team ? html` <span class="badge info">Project team</span>` : ""}${m.author.is_reviewer ? html` <span class="badge">Reviewer</span>` : ""} <span class="muted">${ago(m.created_at)}</span>
            ${m.mine || p.permissions.is_manager ? html`<button class="linklike small" type="button" data-rmmsg="${m.id}">Remove</button>` : ""}</div>
          <div class="body" translate="no">${m.body}</div></div>`)}`
          : html`<p class="muted">No messages yet. Say hello, ask a question or agree when and where to meet.</p>`);
        log.scrollTop = log.scrollHeight;
      } catch (err) { mount(log, html`<p class="notice bad">${err.message}</p>`); }
    };
    log.addEventListener("click", async (e) => {
      const id = e.target.closest("[data-rmmsg]")?.dataset.rmmsg;
      if (!id || !(await confirmDialog("Remove this message?", { confirmLabel: "Remove", danger: true }))) return;
      await api(`/api/messages/${id}`, { method: "DELETE" }).catch((err) => toast(err.message, "bad")); loadMsgs();
    });
    $("#chatf", box).addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target; const btn = f.querySelector("button"); busy(btn);
      try { await api(`/api/projects/${p.id}/messages`, { method: "POST", body: formData(f) }); f.reset(); await loadMsgs(); }
      catch (err) { showErrors(f, err); } finally { busy(btn, false); }
    });
    $("#chatbody", box).addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#chatf", box).requestSubmit(); });
    loadMsgs();
  }

  async function historyTab(box) {
    mount(box, html`<p class="muted">Loading history…</p>`);
    try {
      const { history: h } = await api(`/api/projects/${p.id}/history`);
      mount(box, html`<p class="muted small">Every change to this project is recorded. Visible to the project team and reviewers.</p>
        <ul class="list">${h.map((x) => html`<li><strong>${x.action.replace(/\./g, " ").replace(/_/g, " ")}</strong>
          <span class="small muted">by ${x.actor_name || "system"}${x.actor_role ? ` (${x.actor_role})` : ""}, ${ago(x.created_at)}</span>
          ${x.details?.notes || x.details?.message ? html`<div class="small">${x.details.notes || x.details.message}</div>` : ""}</li>`)}</ul>`);
    } catch (err) { mount(box, html`<p class="notice bad">${err.message}</p>`); }
  }

  await load();
}
