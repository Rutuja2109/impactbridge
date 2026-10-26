import { ago, api, html, money, mount, num, raw, state } from "../core.js";
import { CAUSE_EMOJI, causeIcon, icon, styleFor } from "../art.js";
import { carousel, pct } from "../components.js";

const PROMISES = [
  ["phoneoff", "No sales calls, ever", "Your number is never shared."],
  ["wallet", "We never touch your money", "No platform fee."],
  ["shield", "Results checked by people", "Reported and verified, side by side."],
];

export default async function home(ctx) {
  // Signed-in people land on their own feed (actions, nearby projects, activity), not the welcome page.
  if (state.user) {
    const dash = await import("./dashboard.js");
    return dash.default({ ...ctx, feed: true });
  }
  const { el } = ctx;
  document.title = "ImpactBridge — Turn community problems into collective action";
  const causes = Object.entries(state.meta?.causes || {});
  mount(el, html`
  <section class="h5"><div class="wrap">
    <div class="h5-copy">
      <h1>Help your neighbourhood, one real need at a time.</h1>
      <p class="h5-sub">Real local needs, checked by people. Help with money, time or a skill.</p>
    </div>
    <svg class="h5-art" viewBox="0 0 360 120" aria-hidden="true" focusable="false">
      <circle cx="298" cy="30" r="22" fill="#FFD66B" opacity=".95" class="h5-sun"/>
      <path d="M20 96 C 70 36 130 36 180 96" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>
      <path d="M180 96 C 230 36 290 36 340 96" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>
      <rect x="0" y="94" width="360" height="26" fill="#005F5E" opacity=".55"/>
      ${raw([[60, "#8D5A3B", "#FFE08A"], [110, "#C68B59", "#fff"], [160, "#E0AC82", "#FF9F8E"], [210, "#6E4429", "#BFE9E7"], [260, "#D9A066", "#E4D4FF"]].map(([x, sk, top], i) => `<g class="h5-p" style="animation-delay:${i * 120}ms"><g transform="translate(${x} 62)"><circle cy="-4" r="9" fill="${sk}"/><path d="M-11 34V18a11 11 0 0 1 22 0v16z" fill="${top}"/></g></g>`).join(""))}
      <path d="M180 36c0-9 10-11 14-4 4-7 14-5 14 4 0 8-14 17-14 17s-14-9-14-17z" fill="#FF6B7A" class="h5-heart" transform="translate(-14 -14)"/>
    </svg>
    <div class="h5-actions">
      <a class="act need" href="/share-a-need">
        <span class="act-ic" aria-hidden="true"><svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 30c4-1 7-4 9-7l5-7c1.5-2 4.5-1 4 1.5L24 24h12c2.5 0 3 3.5.5 4l-9 2"/><path d="M8 40c6 0 10-2 14-2h10c3 0 8-4 10-6"/></svg></span>
        <span class="act-t">I need support</span>
        <span class="act-d">Type it, say it, or snap a photo.</span></a>
      <a class="act help" href="/explore?needs=any">
        <span class="act-ic" aria-hidden="true"><svg viewBox="0 0 48 48" width="34" height="34" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40S8 31 8 19a8 8 0 0 1 16-3 8 8 0 0 1 16 3c0 12-16 21-16 21z"/></svg></span>
        <span class="act-t">I want to help</span>
        <span class="act-d">Money, time or a skill, near you.</span></a>
    </div>
    <ul class="trust6" aria-label="Our promises">
      <li><strong>Free</strong><span>no platform fee</span></li>
      <li><strong>Direct</strong><span>help goes to the team</span></li>
      <li><strong>Checked</strong><span>by a real person</span></li>
    </ul>
  </div></section>

  <div class="wrap h5-main">
    <div id="rail-open">${html`<section class="rail"><div class="rail-head"><h2>Needs looking for help</h2></div><div class="rail-track">${[1, 2, 3].map(() => html`<span class="pmini skeleton"></span>`)}</div></section>`}</div>
    <section class="rail"><div class="rail-head"><h2>Browse by cause</h2></div>
      <div class="ex6-cats home7-cats">${causes.map(([k, v], i) => html`<a class="ex6-cat" href="/explore?cause=${k}&needs=any"><span class="ex6-dot">${CAUSE_EMOJI[k] || "💛"}</span><span>${v.split(/ & |, /)[0]}</span></a>`)}</div></section>
    <div id="rail-almost"></div>
    <div id="rail-done"></div>
    <div id="stats"></div>

    <section class="how7" aria-labelledby="how-h">
      <h2 id="how-h">How it works</h2>
      <div class="how7-track">
        <div><span>1</span><strong>Share</strong><p>Tell the problem in your own words.</p></div>
        <div><span>2</span><strong>Checked</strong><p>A person reviews it first.</p></div>
        <div><span>3</span><strong>Support</strong><p>Neighbours give money, time or skills.</p></div>
        <div><span>4</span><strong>Proof</strong><p>Photos and results, checked again.</p></div>
      </div>
    </section>

    <section class="join5">
      <h2>Ready to start?</h2>
      <p>Free for everyone.</p>
      <div class="row"><a class="btn primary pill lg" href="/register">Create a free account</a><a class="btn pill lg" href="/login">I have an account</a></div>
    </section>
  </div>`);

  api("/api/projects", { query: { status: "published,in_progress,completed,verified", per_page: 40 } }).then((r) => {
    const all = r.projects;
    const open = all.filter((p) => ["published", "in_progress"].includes(p.status))
      .sort((a, b) => (a.is_demo - b.is_demo) || (b.need_verified - a.need_verified) || String(b.last_activity_at || "").localeCompare(String(a.last_activity_at || "")));
    const almost = open.filter((p) => { const x = pct(p); return x !== null && x >= 40 && x < 100; });
    const done = all.filter((p) => ["completed", "verified"].includes(p.status));
    mount("#rail-open", open.length ? carousel("Needs looking for help", open.slice(0, 10), { href: "/explore?needs=any" })
      : html`<div class="empty5"><h2>No open needs yet</h2><p>Be the first to share a need from your community.</p><a class="btn primary pill" href="/share-a-need">Share a need</a></div>`);
    mount("#rail-almost", carousel("Almost there", almost.slice(0, 10), { href: "/explore?needs=money" }));
    mount("#rail-done", carousel("Finished, with proof", done.slice(0, 10), { href: "/explore?status=completed,verified" }));
  }).catch(() => mount("#rail-open", html`<p class="notice bad">Projects couldn't be loaded. Refresh to try again.</p>`));

  api("/api/impact").then((imp) => {
    const r = imp.reported, v = imp.verified;
    if (!r.projects && !imp.pledged.money && !imp.pledged.volunteers) return; // no real data yet: show nothing
    mount("#stats", html`<section class="stats5" aria-label="Recorded so far"><h2 class="sr-only">Recorded so far</h2>
      <div><strong>${money(imp.pledged.money)}</strong><span>pledged by supporters</span></div>
      <div><strong>${num(imp.pledged.volunteers)}</strong><span>volunteer places</span></div>
      <div class="v"><strong>${num(v.people_reached || r.people_reached)}</strong><span>${v.people_reached ? "people helped, checked by reviewers" : "people helped, as reported"}</span></div>
      <p class="small muted">Recorded so far, from real projects only.</p></section>`);
  }).catch(() => {});
}
