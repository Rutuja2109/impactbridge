import { $, api, ago, emptyState, html, mount } from "../core.js";
import { refreshUser } from "../app.js";

export default async function notifications({ el }) {
  document.title = "Alerts — ImpactBridge";
  const draw = async () => {
    const [{ notifications: list, unread }, act] = await Promise.all([
      api("/api/notifications"),
      api("/api/activity").catch(() => ({ events: [] })),
    ]);
    mount(el, html`<div class="wrap" style="max-width:820px">
      <div class="page-head row between"><h1 style="margin:0">Alerts</h1>
        ${unread ? html`<button class="btn small" id="all">Mark all as read</button>` : ""}</div>
      ${list.length ? html`<ul class="list panel">${list.map((n) => html`<li class="notif ${n.is_read ? "" : "unread"}">
        <div class="t"><strong>${n.link ? html`<a href="${n.link}" data-nid="${n.id}">${n.title}</a>` : n.title}</strong></div>
        ${n.body ? html`<div class="small">${n.body}</div>` : ""}<div class="small muted">${ago(n.created_at)}</div></li>`)}</ul>`
        : emptyState("You're all caught up", "Review decisions, support offers, deadlines and milestone updates will appear here.")}
      ${act.events.length ? html`<section class="panel" id="activity" style="margin-top:var(--s5)"><h2>Recent activity</h2>
        <ul class="rows">${act.events.slice(0, 20).map((e) => html`<li><div>${e.text}
          <div class="small"><a href="/projects/${e.project.id}" translate="no">${e.project.title}</a> <span class="muted">${ago(e.at)}</span></div></div></li>`)}</ul></section>` : ""}
    </div>`);
    $("#all", el)?.addEventListener("click", async () => { await api("/api/notifications/read", { method: "POST", body: { all: true } }); refreshUser(); draw(); });
    el.querySelectorAll("[data-nid]").forEach((a) => a.addEventListener("click", () => {
      api("/api/notifications/read", { method: "POST", body: { ids: [a.dataset.nid] } }).then(refreshUser).catch(() => {});
    }));
  };
  await draw();
}
