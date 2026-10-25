// Quick pledge sheet: the fast path to help (amount chips, kind words, hide-my-name), like the "Contribute" button people know.
// The full offer form (materials, skills, equipment, deadlines) stays on the Support tab for "Other ways to help".
import { $, $$, api, busy, html, mount, money, num, showErrors, state } from "../core.js";
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

  const d = document.createElement("div");
  d.className = "qp5"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "Pledge your support");
  document.body.append(d); document.body.classList.add("qp-open");
  const close = () => { d.classList.add("out"); document.body.classList.remove("qp-open"); setTimeout(() => d.remove(), 200); document.removeEventListener("keydown", esc_); };
  const esc_ = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc_);

  function draw() {
    const chips = chipsFor(gap);
    const pctOfGap = gap ? Math.min(100, Math.round((amount / gap) * 100)) : null;
    const label = kind === "money" ? `Pledge ${money(amount || 0)}` : `Pledge ${people} ${people === 1 ? "volunteer" : "volunteers"}`;
    mount(d, html`<div class="qp5-back" data-close></div>
      <form class="qp5-card" novalidate>
        <div class="qp5-grab" aria-hidden="true"></div>
        <button class="qp5-x" type="button" data-close aria-label="Close">×</button>
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
        <div class="field qp5-field"><label for="qp-msg">Add a few kind words (optional)</label>
          <textarea id="qp-msg" name="description" rows="2" maxlength="200" placeholder="Happy to help. Please keep us posted."></textarea></div>
        <label class="check qp5-anon"><input type="checkbox" name="is_anonymous"><span>Hide my name from the public list</span></label>
        <div class="form-error notice bad" hidden></div>
        <button class="btn primary qp5-go" type="submit">${icon("hand")} ${label}</button>
        <p class="qp5-note">A pledge is a promise, not a payment. The team accepts it and tells you how to send your help straight to them. ImpactBridge charges no fee.</p>
        <button class="linklike qp5-other" type="button" data-other>Other ways to help: items, skills, equipment</button>
      </form>`);
    $$("[data-close]", d).forEach((b) => b.addEventListener("click", close));
    $("[data-other]", d).addEventListener("click", () => { close(); onOther?.(); });
    $$("[data-kind]", d).forEach((b) => b.addEventListener("click", () => { kind = b.dataset.kind; draw(); }));
    $$("[data-amt]", d).forEach((b) => b.addEventListener("click", () => { amount = Number(b.dataset.amt); draw(); }));
    $("#qp-amt", d)?.addEventListener("input", (e) => {
      amount = Number(String(e.target.value).replace(/[^\d.]/g, "")) || 0;
      $$("[data-amt]", d).forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.amt) === amount)));
      $(".qp5-hint", d).textContent = gap && amount > 0 ? `That covers ${Math.min(100, Math.round((amount / gap) * 100))}% of the ${money(gap)} still needed.` : "";
      $(".qp5-go", d).lastChild.textContent = ` Pledge ${money(amount || 0)}`;
    });
    $$("[data-step]", d).forEach((b) => b.addEventListener("click", () => {
      const cap = Math.max(1, r.volunteers.requested - r.volunteers.pledged);
      people = Math.max(1, Math.min(cap, people + Number(b.dataset.step))); $("#qp-people", d).textContent = people;
      $(".qp5-go", d).lastChild.textContent = ` Pledge ${people} ${people === 1 ? "volunteer" : "volunteers"}`;
    }));
    $("form", d).addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget, btn = $(".qp5-go", d);
      const body = { kind, quantity: kind === "money" ? amount : people, description: f.description.value.trim() || null, is_anonymous: f.is_anonymous.checked };
      if (kind === "volunteers" && f.hours.value) body.hours = Number(f.hours.value);
      if (kind === "money" && !(amount > 0)) { showErrors(f, { message: "Enter an amount to pledge.", details: [{ field: "quantity", message: "Enter an amount to pledge." }] }); return; }
      busy(btn);
      try {
        const res = await api(`/api/projects/${p.id}/commitments`, { method: "POST", body });
        close(); onDone?.({ kind, amount, people, anonymous: body.is_anonymous, res });
      } catch (err) { showErrors(f, err); busy(btn, false); }
    });
    if (!d.dataset.opened) { d.dataset.opened = "1"; requestAnimationFrame(() => d.classList.add("in")); }
  }
  draw();
}
