import { $, api, ago, emptyState, html, mount } from "../core.js";
import { refreshUser } from "../app.js";

export default async function notifications({ el }) {
  document.title = "Notifications — ImpactBridge";
  const draw = async () => {
    const { notifications: list, unread } = await api("/api/notifications");
    mount(el, html`<div class="wrap" style="max-width:820px">
      <div class="page-head row between"><h1 style="margin:0">Notifications</h1>
        ${unread ? html`<button class="btn small" id="all">Mark all as read</button>` : ""}</div>
      ${list.length ? html`<ul class="list panel">${list.map((n) => html`<li class="notif ${n.is_read ? "" : "unread"}">
        <div class="t"><strong>${n.link ? html`<a href="${n.link}" data-nid="${n.id}">${n.title}</a>` : n.title}</strong></div>
        ${n.body ? html`<div class="small">${n.body}</div>` : ""}<div class="small muted">${ago(n.created_at)}</div></li>`)}</ul>`
        : emptyState("You're all caught up", "Review decisions, support offers, deadlines and milestone updates will appear here.")}
    </div>`);
    $("#all", el)?.addEventListener("click", async () => { await api("/api/notifications/read", { method: "POST", body: { all: true } }); refreshUser(); draw(); });
    el.querySelectorAll("[data-nid]").forEach((a) => a.addEventListener("click", () => {
      api("/api/notifications/read", { method: "POST", body: { ids: [a.dataset.nid] } }).then(refreshUser).catch(() => {});
    }));
  };
  await draw();
}
