// Quick pledge sheet: the fast path to help (amount chips, kind words, hide-my-name), like the "Contribute" button people know.
// The full offer form (materials, skills, equipment, deadlines) stays on the Support tab for "Other ways to help".
import { $, $$, api, busy, html, mount, raw, money, num, showErrors, shareUrl, state, toast } from "../core.js";
import { icon } from "../art.js";

const CHIPS = [500, 1000, 2500, 5000];

export function chipsFor(gap) {
  if (!gap || gap <= 0) return CHIPS;
  const list = CHIPS.filter((c) => c <= gap);
  if (gap < CHIPS[CHIPS.length - 1] && !list.includes(Math.round(gap))) list.push(Math.round(gap));
  return list.length ? list : [Math.round(gap)];
}

/** Opens the sheet. onDone(result) runs after a pledge is sent; onOther() opens the full form. */
export function openQuickPledge({ project: p, onDone, onOther }) {
  const r = p.resources;
  const gap = r.money.requested ? Math.max(0, r.money.requested - r.money.pledged) : null;
  const canMoney = !!r.money.requested && gap !== 0;
  const canTime = !!r.volunteers.requested && (r.volunteers.requested - r.volunteers.pledged) > 0;
  if (!canMoney && !canTime) { onOther?.(); return; }
  let kind = canMoney ? "money" : "volunteers";
  let amount = chipsFor(gap)[Math.min(1, chipsFor(gap).length - 1)];
  let people = 1;
  let monthly = false, appealShown = false, appeal = false;
  const waText = `Please help: "${p.title}" on ImpactBridge. ${shareUrl(`/projects/${p.id}`)}`;

  const d = document.createElement("div");
  d.className = "qp5"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Pledge your support");
  document.body.append(d); document.body.classList.add("qp-open");
  // Leaving without pledging: ask once, kindly, before the sheet closes.
  const leave = () => {
    if (!appealShown && (canMoney || canTime)) { appealShown = true; appeal = true; draw(); return; }
    close();
  };
  const close = () => { d.classList.add("out"); document.body.classList.remove("qp-open"); setTimeout(() => d.remove(), 200); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => { if (e.key === "Escape") leave(); };
  document.addEventListener("keydown", esc_);

  function drawAppeal() {
    const ask = kind === "money" && amount > 0 ? amount : chipsFor(gap)[0];
    mount(d, html`<div class="qp5-back" data-leave></div>
      <div class="qp5-card qp5-appeal" role="document">
        <div class="ap6-heart" aria-hidden="true">💛</div>
        <h2>Wait, before you go</h2>
        <p class="qp5-sub">${gap ? `“${p.title}” still needs ${money(gap)}.` : `“${p.title}” is still looking for people.`}
          ${kind === "money" && ask ? `Even ${money(ask)} from you gets this community closer.` : "A little time from you can change this for a family."}</p>
        <p class="ap6-quote">Nobody has ever become poorer by giving. A small pledge today is a big day for someone else.</p>
        <button class="btn primary qp5-go" type="button" data-back>${icon("hand")} ${kind === "money" && ask ? `Yes, pledge ${money(ask)}` : "Yes, I'll help"}</button>
        <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(waText)}">Can't now? Share it on WhatsApp</a>
        <button class="linklike qp5-other" type="button" data-leave>No thanks, maybe later</button>
      </div>`);
    $$("[data-leave]", d).forEach((b) => b.addEventListener("click", close));
    $("[data-back]", d).addEventListener("click", () => { appeal = false; if (kind === "money" && !amount) amount = ask; draw(); });
  }

  function draw() {
    if (appeal) return drawAppeal();
    const chips = chipsFor(gap);
    const pctOfGap = gap ? Math.min(100, Math.round((amount / gap) * 100)) : null;
    const label = kind === "money" ? `Pledge ${money(amount || 0)}${monthly ? " / month" : ""}` : `Pledge ${people} ${people === 1 ? "volunteer" : "volunteers"}`;
    mount(d, html`<div class="qp5-back" data-close></div>
      <form class="qp5-card" novalidate>
        <div class="qp5-grab" aria-hidden="true"></div>
        <button class="qp5-x" type="button" data-x aria-label="Close">×</button>
        <h2 translate="no">${p.title}</h2>
        <p class="qp5-sub">${p.supporter_count ? `${p.supporter_count} ${p.supporter_count === 1 ? "neighbour has" : "neighbours have"} already stepped in.` : "Your pledge could be the one that gets this started."}</p>
        ${canMoney && canTime ? html`<div class="qp5-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${kind === "money"}" data-kind="money">Give money</button>
          <button type="button" role="tab" aria-selected="${kind === "volunteers"}" data-kind="volunteers">Give time</button></div>` : ""}
        ${kind === "money" ? html`
          <div class="qp5-chips" role="group" aria-label="Amount">${chips.map((c) => html`<button type="button" class="qp5-chip" aria-pressed="${amount === c}" data-amt="${c}">${money(c)}</button>`)}</div>
          <div class="field qp5-field"><label for="qp-amt">Or type an amount (${state.meta?.currency || "INR"})</label>
            <input id="qp-amt" name="quantity" inputmode="numeric" autocomplete="off" value="${amount || ""}" placeholder="500"></div>
          <p class="qp5-hint" aria-live="polite">${pctOfGap !== null && amount > 0 ? `That covers ${pctOfGap}% of the ${money(gap)} still needed.` : gap ? `${money(gap)} is still needed.` : ""}</p>`
        : html`
          <div class="qp5-step"><span>How many volunteers?</span>
            <div><button type="button" data-step="-1" aria-label="Fewer">−</button><strong id="qp-people">${people}</strong><button type="button" data-step="1" aria-label="More">+</button></div></div>
          <div class="field qp5-field"><label for="qp-hrs">Hours each (optional)</label><input id="qp-hrs" name="hours" inputmode="decimal" placeholder="4"></div>`}
        ${kind === "money" ? html`<label class="check qp5-month"><input type="checkbox" name="monthly" ${monthly ? "checked" : ""}><span><strong>Give every month</strong> <span class="muted">We'll remind you each month. Stop any time.</span></span></label>` : ""}
        <div class="field qp5-field"><label for="qp-msg">Add a few kind words (optional)</label>
          <textarea id="qp-msg" name="description" rows="2" maxlength="200" placeholder="Happy to help. Please keep us posted."></textarea></div>
        <label class="check qp5-anon"><input type="checkbox" name="is_anonymous"><span>Hide my name from the public list</span></label>
        <div class="form-error notice bad" hidden></div>
        <button class="btn primary qp5-go" type="submit">${icon("hand")} ${label}</button>
        <p class="qp5-note">A pledge is a promise, not a payment. The team accepts it and tells you how to send your help straight to them. ImpactBridge charges no fee.</p>
        <button class="linklike qp5-other" type="button" data-other>Other ways to help: items, skills, equipment</button>
      </form>`);
    $$("[data-close], [data-x]", d).forEach((b) => b.addEventListener("click", leave));
    $("[name=monthly]", d)?.addEventListener("change", (e) => { monthly = e.target.checked; $(".qp5-go", d).lastChild.textContent = ` Pledge ${money(amount || 0)}${monthly ? " / month" : ""}`; });
    $("[data-other]", d).addEventListener("click", () => { close(); onOther?.(); });
    $$("[data-kind]", d).forEach((b) => b.addEventListener("click", () => { kind = b.dataset.kind; draw(); }));
    $$("[data-amt]", d).forEach((b) => b.addEventListener("click", () => { amount = Number(b.dataset.amt); draw(); }));
    $("#qp-amt", d)?.addEventListener("input", (e) => {
      amount = Number(String(e.target.value).replace(/[^\d.]/g, "")) || 0;
      $$("[data-amt]", d).forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.amt) === amount)));
      $(".qp5-hint", d).textContent = gap && amount > 0 ? `That covers ${Math.min(100, Math.round((amount / gap) * 100))}% of the ${money(gap)} still needed.` : "";
      $(".qp5-go", d).lastChild.textContent = ` Pledge ${money(amount || 0)}${monthly ? " / month" : ""}`;
    });
    $$("[data-step]", d).forEach((b) => b.addEventListener("click", () => {
      const cap = Math.max(1, r.volunteers.requested - r.volunteers.pledged);
      people = Math.max(1, Math.min(cap, people + Number(b.dataset.step))); $("#qp-people", d).textContent = people;
      $(".qp5-go", d).lastChild.textContent = ` Pledge ${people} ${people === 1 ? "volunteer" : "volunteers"}`;
    }));
    $("form", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget, btn = $(".qp5-go", d);
      const body = { kind, quantity: kind === "money" ? amount : people, description: f.description.value.trim() || null, is_anonymous: f.is_anonymous.checked, frequency: kind === "money" && monthly ? "monthly" : "once" };
      if (kind === "volunteers" && f.hours.value) body.hours = Number(f.hours.value);
      if (kind === "money" && !(amount > 0)) { showErrors(f, { message: "Enter an amount to pledge.", details: [{ field: "quantity", message: "Enter an amount to pledge." }] }); return; }
      busy(btn);
      try {
        const res = await api(`/api/projects/${p.id}/commitments`, { method: "POST", body });
        close(); onDone?.({ kind, amount, people, anonymous: body.is_anonymous, monthly: body.frequency === "monthly", res });
      } catch (err) { showErrors(f, err); busy(btn, false); }
    });
    if (!d.dataset.opened) { d.dataset.opened = "1"; requestAnimationFrame(() => d.classList.add("in")); }
  }
  draw();
}

/** The "thank you" moment after a pledge: confetti, UPI hand-off for money, share, and a warm closing line. */
export function openThanks({ project: p, kind, amount, people, monthly, commitment }) {
  const who = (state.user?.name || "friend").split(" ")[0];
  const upi = kind === "money" && p.upi_id ? p.upi_id : null;
  const org = p.organization?.name || p.owner?.name || "the project team";
  const upiLink = upi ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(org.slice(0, 40))}&am=${amount}&cu=INR&tn=${encodeURIComponent(("ImpactBridge " + p.title).slice(0, 40))}` : "";
  const text = `I just pledged to help "${p.title}" on ImpactBridge. Join me: ${shareUrl(`/projects/${p.id}`)}`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const colors = ["#F4B63E", "#1E9BBF", "#E8505B", "#3FA34D", "#9C6ADE", "#F07A2B"];
  const bits = reduce ? "" : Array.from({ length: 44 }, (_, i) =>
    `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 9) * 45}ms;--dx:${((i * 53) % 120) - 60}px;--r:${(i * 47) % 360}deg"></i>`).join("");
  const d = document.createElement("div");
  d.className = "qp5 th6"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Thank you");
  document.body.append(d); document.body.classList.add("qp-open");
  const close = () => { d.classList.add("out"); document.body.classList.remove("qp-open"); setTimeout(() => d.remove(), 200); };
  let sent = false;
  function draw() {
    mount(d, html`<div class="qp5-back" data-x></div>
      <div class="qp5-card th6-card">
        <div class="cele5-bits th6-bits" aria-hidden="true">${raw(bits)}</div>
        <div class="th6-heart" aria-hidden="true">❤️</div>
        <h2>Thank you, ${who}!</h2>
        <p class="qp5-sub">${kind === "money"
          ? `Your pledge of ${money(amount)}${monthly ? " a month" : ""} is with the team.`
          : `You pledged ${people} ${people === 1 ? "volunteer" : "volunteers"}. The team will be in touch.`}</p>
        ${upi ? html`<div class="th6-upi">
          <strong>Send it straight to the team by UPI</strong>
          <span class="small muted">ImpactBridge never touches your money. It goes to ${org}.</span>
          ${sent ? html`<p class="th6-ok">Noted. The team will confirm once it arrives.</p>` : html`
            <a class="btn primary" href="${upiLink}">Pay ${money(amount)} with any UPI app</a>
            <button class="btn" type="button" data-copy>Copy UPI ID: ${upi}</button>
            <button class="linklike" type="button" data-sent>I've already sent it</button>`}
        </div>` : kind === "money" ? html`<p class="qp5-note">The team will accept your pledge and tell you how to send your help straight to them.</p>` : ""}
        <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Tell your friends on WhatsApp</a>
        <p class="th6-close">Every great change starts with one neighbour saying “I’ll help.” Today, that was you. 💛</p>
        <button class="linklike qp5-other" type="button" data-x>Done</button>
      </div>`);
    $$("[data-x]", d).forEach((b) => b.addEventListener("click", close));
    $("[data-copy]", d)?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(upi); toast("UPI ID copied"); } catch { toast(upi); } });
    $("[data-sent]", d)?.addEventListener("click", async () => {
      try { if (commitment?.id) await api(`/api/commitments/${commitment.id}/paid`, { method: "POST", body: {} }); sent = true; draw(); }
      catch (err) { toast(err.message, "bad"); }
    });
    requestAnimationFrame(() => d.classList.add("in"));
  }
  draw();
}
