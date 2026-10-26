import { COMMIT_STATUS, KIND_LABEL, api, ago, date, describeCommitment, html, money, mount, num, shareUrl, state, statusBadge, toast } from "../core.js";
import { carousel } from "../components.js";
import { icon } from "../art.js";

const ROLE_INTRO = {
  submitter: ["Your community needs", "Track your proposals, respond to support offers and report progress."],
  club: ["Your club's projects", "Find projects your club can support and keep commitments on track."],
  csr: ["Your CSR portfolio", "See where your budget, volunteers and equipment are committed."],
  ngo: ["Your NGO's work", "Manage needs you've posted and support you've pledged."],
  volunteer: ["Your volunteering", "Offers you've made, upcoming activities and projects you've helped finish."],
  admin: ["Administration", "Review queues and your own activity."],
  verifier: ["Verification", "Review queues and your own activity."],
};

export default async function dashboard({ el, feed }) {
  document.title = feed ? "Home — ImpactBridge" : "Dashboard — ImpactBridge";
  mount(el, html`<div class="wrap"><div class="page-head"><h1>Dashboard</h1></div><div class="skeleton"></div></div>`);
  const u = state.user;
  const [d, near, recs, certs] = await Promise.all([
    api("/api/dashboard"),
    api("/api/projects", { query: { needs: "any", per_page: 10, ...(u.city ? { city: u.city } : {}), status: "published,in_progress" } }).catch(() => ({ projects: [] })),
    api("/api/recommendations").catch(() => ({ projects: [] })),
    api("/api/my/certificates").catch(() => ({ certificates: [] })),
  ]);
  const nearOnly = near.projects.filter((x) => !recs.projects.slice(0, 10).some((r) => r.id === x.id));
  const [title, intro] = ROLE_INTRO[u.role] || ROLE_INTRO.volunteer;
  const supporterRole = ["club", "csr", "ngo", "volunteer"].includes(u.role);
  const reviewer = ["admin", "verifier"].includes(u.role);
  const active = d.my_projects.filter((p) => !["completed", "verified"].includes(p.status));
  const st = d.stats;
  const attention = d.my_projects.filter((p) => ["needs_information", "approved", "draft"].includes(p.status));

  const projectsBlock = html`<section class="panel ${supporterRole ? "" : "wide"}"><div class="row between"><h2>Projects you manage</h2><a class="btn small" href="/share-a-need">Share a need</a></div>
    ${active.length ? html`<ul class="list">${active.map((p) => html`<li><div class="row between"><a href="/projects/${p.id}"><strong>${p.title}</strong></a>${statusBadge(p.status)}</div>
      ${p.status === "needs_information" && p.review_notes ? html`<div class="small notice warn" style="margin:6px 0 0">${p.review_notes}</div>` : ""}
      ${["published", "in_progress"].includes(p.status) ? html`<div class="small muted">${money(p.funding.pledged)} of ${money(p.funding.requested)} pledged, ${p.volunteers.pledged}${p.volunteers.requested ? ` of ${p.volunteers.requested}` : ""} volunteers</div>` : ""}
    </li>`)}</ul>` : html`<p class="muted">You haven't shared a need yet. ${supporterRole ? "Clubs and NGOs can post their own projects too." : ""}</p>`}</section>`;

  const commitmentsBlock = html`<section class="panel"><div class="row between"><h2>Your offers & commitments</h2>${supporterRole ? html`<a class="btn small" href="/match">Match my resources</a>` : ""}</div>
    ${d.my_commitments.length ? html`<ul class="list">${d.my_commitments.slice(0, 12).map((c) => {
      const [label, cls] = COMMIT_STATUS[c.status] || [c.status, ""];
      return html`<li><div class="row between"><span>${KIND_LABEL[c.kind]}: <strong>${describeCommitment(c)}</strong></span><span class="badge ${cls}">${label}</span></div>
        <div class="small"><a href="/projects/${c.project.id}#support">${c.project.title}</a>${c.deadline ? `, due ${date(c.deadline)}` : ""}</div>
        ${c.owner_message && c.status === "changes_requested" ? html`<div class="small notice warn" style="margin:6px 0 0">Owner asked: ${c.owner_message}</div>` : ""}</li>`;
    })}</ul>` : html`<p class="muted">No offers yet. <a href="/explore?needs=any">Find a project that needs support</a>.</p>`}
    ${d.volunteer_hours_pledged ? html`<p class="small muted">${num(d.volunteer_hours_pledged)} volunteer hours pledged in accepted commitments.</p>` : ""}</section>`;

  const hours = d.volunteer_hours_pledged || 0;
  const BADGES = [
    ["🌱", "Joined", "Created your ImpactBridge account", true],
    ["📣", "Voice of the community", "Shared your first need", (st.projects_managed || d.my_projects.length) > 0],
    ["🤝", "First pledge", "A project accepted your support", st.projects_supported > 0],
    ["🧩", "Team player", "Supported 3 projects", st.projects_supported >= 3],
    ["⏱️", "Volunteer hero", "Pledged 10+ volunteer hours", hours >= 10],
    ["💚", "Big heart", "Pledged ₹10,000 or more", st.money_pledged >= 10000],
    ["🏁", "Finisher", "Helped a project reach completion", st.projects_completed > 0],
    ["🏅", "Verified impact", "Earned an impact certificate", certs.certificates.length > 0],
  ];
  const earned = BADGES.filter((b) => b[3]).length;
  const LEVELS = ["Neighbour", "Helper", "Changemaker", "Champion"];
  const level = Math.min(3, Math.floor((earned - 1) / 2));
  const nextBadge = BADGES.find((b) => !b[3]);
  const anyImpact = st.money_pledged || st.volunteer_places || st.projects_supported || st.projects_managed || st.projects_completed;
  const fresh = !anyImpact && !d.my_commitments.length && !active.length && !d.incoming_proposals.length && !d.organizations.length;
  const initials = u.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const invite = () => {
    const url = shareUrl("/");
    const text = "Join me on ImpactBridge: share local needs and help fix them with clubs, companies and volunteers.";
    if (navigator.share) navigator.share({ title: "ImpactBridge", text, url }).catch(() => {});
    else { navigator.clipboard?.writeText(`${text} ${url}`); toast("Invite link copied"); }
  };

  queueMicrotask(() => import("./stories.js").then((m) => m.storiesRail(el.querySelector("#stories"))).catch(() => {}));
  mount(el, html`<div class="wrap feed5">
    <header class="greet"><span class="me-av" aria-hidden="true">${initials}</span>
      <div><h1>Hello, ${u.name.split(" ")[0]}</h1><p>${title}</p></div></header>
    <div id="stories"></div>

    ${reviewer ? html`<div class="counts" style="margin-bottom:var(--s4)">
      <a href="/admin#queue"><b>${d.review_counts?.projects_to_review ?? 0}</b>projects to review</a>
      <a href="/admin#verifications"><b>${d.review_counts?.pending_verifications ?? 0}</b>verification requests</a>
      <a href="/admin#reports"><b>${d.review_counts?.open_reports ?? 0}</b>open reports</a></div>
      <a class="btn primary" href="/admin">Open review queue</a>` : html`
    <section class="impact5" aria-label="Your impact">
      ${anyImpact ? html`<div class="i5-grid">
        ${supporterRole || st.money_pledged ? html`<div><strong>${money(st.money_pledged)}</strong><span>pledged by you</span></div>` : ""}
        ${supporterRole || st.volunteer_places ? html`<div><strong>${num(st.volunteer_places)}</strong><span>volunteer places${hours ? html`<br>${num(hours)} hours` : ""}</span></div>` : ""}
        <div><strong>${st.projects_supported || 0}</strong><span>projects supported</span></div>
        ${st.projects_managed ? html`<div><strong>${st.projects_managed}</strong><span>needs you shared</span></div>` : ""}
        <div><strong>${st.projects_completed || 0}</strong><span>finished</span></div></div>`
        : html`<div class="i5-empty"><strong>Your impact starts here</strong><span>${supporterRole ? "Find a need you can help with, or match your club's resources." : "Share a problem from your area and we'll help you find supporters."}</span>
          ${fresh ? html`<a class="btn primary i5-go" href="${supporterRole ? "/explore?needs=any" : "/share-a-need"}">${supporterRole ? "Find a need to help" : "Share a problem"}</a>` : ""}</div>`}
      ${nextBadge ? html`<p class="i5-next"><span class="i5-lv">Level ${level + 1} · ${LEVELS[level]}</span> Next: <strong>${nextBadge[1]}</strong>, ${nextBadge[2].charAt(0).toLowerCase() + nextBadge[2].slice(1)}.</p>` : html`<p class="i5-next"><span class="i5-lv">Level 4 · Champion</span> You've earned every badge. Thank you!</p>`}
      <details class="i5-badges" ${fresh ? "" : "open"}><summary>Badges <strong>${earned}/${BADGES.length}</strong></summary>
        <ul>${BADGES.map(([e, t, dsc, ok]) => html`<li class="${ok ? "on" : ""}" title="${dsc}"><span class="be" aria-hidden="true">${e}</span><span class="bt">${t}</span></li>`)}</ul></details>
    </section>

    <nav class="quick5" aria-label="Quick actions">
      <a href="/share-a-need"><span class="qi">${icon("plus")}</span>Ask for help</a>
      ${supporterRole ? html`<a href="/match"><span class="qi">${icon("match")}</span>Match resources</a>` : html`<a href="/explore?needs=any"><span class="qi">${icon("search")}</span>Find needs</a>`}
      <a href="/explore?needs=volunteers"><span class="qi">${icon("hand")}</span>Volunteer</a>
      <button type="button" id="invite"><span class="qi">${icon("invite")}</span>Invite friends</button>
    </nav>`}

    ${d.incoming_proposals.length ? html`<section class="blk alert5" id="offers"><h2>Offers waiting for your answer</h2><ul class="rows">${d.incoming_proposals.map((c) => html`<li>
        <div><strong translate="no">${c.organization?.name || c.supporter?.name}</strong> offered ${KIND_LABEL[c.kind].toLowerCase()}: <strong>${describeCommitment(c)}</strong>
        <div class="small muted"><span translate="no">${c.project.title}</span>, ${ago(c.created_at)}</div></div>
        <a class="btn small primary" href="/projects/${c.project.id}#support">Respond</a></li>`)}</ul></section>` : ""}
    ${attention.length ? html`<section class="blk alert5"><h2>Needs your attention</h2><ul class="rows">${attention.map((p) => html`<li><div><a href="/projects/${p.id}" translate="no">${p.title}</a>
      <div class="small muted">${{ needs_information: "Reviewers asked for more information", approved: "Approved and ready to publish", draft: "Draft not yet submitted" }[p.status]}</div></div>
      <a class="btn small" href="/projects/${p.id}">Open</a></li>`)}</ul></section>` : ""}

    ${reviewer ? "" : carousel("Recommended for you", recs.projects.slice(0, 10), { href: "/match" })}
    ${reviewer || (nearOnly.length === 0 && near.projects.length > 0) ? "" : carousel(u.city ? `Needs near you (${u.city})` : "Needs looking for help", nearOnly, { href: `/explore?needs=any${u.city ? `&city=${encodeURIComponent(u.city)}` : ""}`,
      empty: u.city ? `No open needs in ${u.city} right now. Try "Explore" to see needs everywhere.` : "Add your city in your profile to see needs near you." })}

    <div class="blk-grid">
    ${reviewer || fresh ? "" : html`<section class="blk"><div class="row between"><h2>Your offers & commitments</h2>${supporterRole ? html`<a href="/match">Match resources</a>` : ""}</div>
      ${d.my_commitments.length ? html`<ul class="rows">${d.my_commitments.slice(0, 8).map((c) => {
        const [label, cls] = COMMIT_STATUS[c.status] || [c.status, ""];
        return html`<li><div>${KIND_LABEL[c.kind]}: <strong>${describeCommitment(c)}</strong>
          <div class="small"><a href="/projects/${c.project.id}#support" translate="no">${c.project.title}</a>${c.deadline ? `, due ${date(c.deadline)}` : ""}</div>
          ${c.owner_message && c.status === "changes_requested" ? html`<div class="small notice warn" style="margin:6px 0 0">Owner asked: ${c.owner_message}</div>` : ""}</div>
          <span class="badge ${cls}">${label}</span></li>`;
      })}</ul>` : html`<p class="muted">No offers yet. <a href="/explore?needs=any">Find a project that needs support</a>.</p>`}</section>`}

    ${reviewer || fresh ? "" : html`<section class="blk"><div class="row between"><h2>Needs you shared</h2><a href="/share-a-need">Share a need</a></div>
      ${active.length ? html`<ul class="rows">${active.map((p) => html`<li><div><a href="/projects/${p.id}" translate="no"><strong>${p.title}</strong></a>
        ${["published", "in_progress"].includes(p.status) ? html`<div class="small muted">${money(p.funding.pledged)} of ${money(p.funding.requested)} pledged, ${p.volunteers.pledged}${p.volunteers.requested ? ` of ${p.volunteers.requested}` : ""} volunteers</div>` : ""}
        ${p.status === "needs_information" && p.review_notes ? html`<div class="small notice warn" style="margin:6px 0 0">${p.review_notes}</div>` : ""}</div>${statusBadge(p.status)}</li>`)}</ul>`
        : html`<p class="muted">You haven't shared a need yet.${supporterRole ? " Clubs and NGOs can post their own projects too." : ""}</p>`}</section>`}

    ${d.upcoming.length ? html`<section class="blk"><h2>Coming up in the next 30 days</h2><ul class="rows">${d.upcoming.map((x) => html`<li><div>${x.type === "milestone" ? "Milestone" : "Commitment"}: <strong>${x.title}</strong>
      <div class="small"><a href="/projects/${x.project.id}#plan" translate="no">${x.project.title}</a></div></div>
      <span class="badge ${x.overdue ? "bad" : "info"}">${x.overdue ? "Overdue " : ""}${date(x.date)}</span></li>`)}</ul></section>` : ""}

    ${certs.certificates.length ? html`<section class="blk"><h2>Your impact certificates</h2><ul class="rows">${certs.certificates.map((c) => html`<li>
      <div><strong translate="no">${c.project.title}</strong><div class="small muted" translate="no">${c.sponsor.name}</div></div><a class="btn small" href="/certificates/${c.id}">${icon("award")} Open</a></li>`)}</ul></section>` : ""}

    ${d.completed.length ? html`<section class="blk"><h2>Finished work</h2><ul class="rows">${d.completed.map((p) => html`<li><div><a href="/projects/${p.id}#impact" translate="no">${p.title}</a>
      ${p.as_supporter ? html`<div class="small muted">You supported this project</div>` : ""}</div>${statusBadge(p.status)}</li>`)}</ul></section>` : ""}

    ${fresh ? "" : html`<section class="blk"><div class="row between"><h2>Your organizations</h2><a href="/profile#orgs">Manage</a></div>
      ${d.organizations.length ? html`<ul class="rows">${d.organizations.map((o) => html`<li><a href="/organizations/${o.id}" translate="no">${o.name}</a>
        <span class="badge ${o.verification_status === "verified" ? "verified" : o.verification_status === "pending" ? "info" : ""}">${{ verified: "✓ Verified", pending: "Verification pending", rejected: "Not verified", unverified: "Unverified" }[o.verification_status]}</span></li>`)}</ul>`
        : html`<p class="muted">You're not part of an organization. <a href="/profile#orgs">Create or join one</a>.</p>`}</section>`}
    </div>
  </div>`);
  el.querySelector("#invite")?.addEventListener("click", invite);
}
