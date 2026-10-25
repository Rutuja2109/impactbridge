import { HOSTED, html, mount, raw, state } from "../core.js";

const hostedNote = () => HOSTED ? html`<div class="notice">This is the preview version running inside Claude. The policy below describes the full ImpactBridge app and website. In this preview, accounts are your Claude sign-in and data is stored with this page; ask the page owner to remove anything you added.</div>` : "";

export default async function info({ el, opts }) {
  if (opts.page === "how") return how(el);
  if (opts.page === "privacy") return privacy(el);
  if (opts.page === "terms") return terms(el);
  if (opts.page === "help") return help(el);
  if (opts.page === "delete") return deleteInfo(el);
  if (opts.page === "offline") return offline(el);
  return guidelines(el);
}

function contact() {
  const e = state.meta?.support_email;
  return e ? html`<a href=${"mailto:" + e}>${e}</a>` : html`the contact address shown on this site`;
}

function privacy(el) {
  document.title = "Privacy policy — ImpactBridge";
  const ai = state.meta?.integrations?.ai_structuring;
  mount(el, html`<div class="wrap prose" style="max-width:820px">
    <div class="page-head"><h1>Privacy policy</h1><p class="lede">This policy covers the ImpactBridge website and Android app. They are the same service and share one account.</p></div>
    ${hostedNote()}
    <h2>What we collect</h2>
    <ul>
      <li><strong>Account details:</strong> your name, email address or mobile number, password (stored only as a one-way hash; phone accounts have none), account type, language, and optionally city, region, bio and skills.</li>
      <li><strong>What you post:</strong> community needs, projects, updates, offers of support, comments, receipts, photos and documents you upload.</li>
      <li><strong>Organization details</strong> you enter, including registration numbers and verification documents.</li>
      <li><strong>Messages:</strong> what you write in a project's chat, visible to that project's team, supporters and interested people.</li>
      <li><strong>Activity records:</strong> notifications, projects you marked as interesting, people you blocked, and an audit log of important actions (for example approvals and verification), kept to prevent abuse.</li>
      <li><strong>Crash reports:</strong> if the app breaks, the error message, the file and line, and the screen path are sent to us. They contain no personal details.</li>
      <li><strong>Push notifications:</strong> if you turn them on, the push address your phone gives us. Push messages carry no content; the app fetches it after you're signed in.</li>
    </ul>
    <p>We do not use advertising, analytics trackers or third-party cookies. One cookie keeps you signed in. Location data (GPS) is removed from photos when they're uploaded. We don't collect your device location.</p>
    <h2>How it's used and shared</h2>
    <p>Information is used only to run the service: showing projects, matching supporters, sending notifications and reviewing content. Your email and phone are never shown publicly.
      Public projects, their updates and the names of supporters who chose to be shown are visible to everyone.</p>
    <p>${ai?.configured ? `When you use AI drafting, your description and attached photos are sent to the AI provider (${ai.provider}) to create the draft. Voice recordings sent for transcription are not stored.`
      : "AI drafting is not enabled on this server, so nothing is sent to an AI provider."}
      If email notifications are switched on, your email address is passed to our email delivery provider. If you sign in with your mobile number, it is passed to our SMS provider to send the code. We never sell personal data.</p>
    <h2>Security</h2>
    <p>All traffic is encrypted (HTTPS). Passwords are hashed. Private files are only available to the people allowed to see them.</p>
    <h2 id="deletion">Deleting your account and data</h2>
    <p>To close your account and remove your personal data, <a href="/delete-account">send us a request</a>.</p>
    <h2>Children</h2>
    <p>ImpactBridge is not intended for anyone under 18. Projects involving children follow our <a href="/guidelines#safeguarding">safeguarding rules</a>.</p>
    <h2>Contact</h2>
    <p>Questions or requests about your data: ${contact()}.</p>
  </div>`);
}

function help(el) {
  document.title = "Help & support — ImpactBridge";
  const faq = [
    ["Is ImpactBridge free?", "Yes. Sharing a need, offering support and using every feature is free. There is no platform fee."],
    ["Does ImpactBridge collect my money?", "No. ImpactBridge never takes or holds money. When you pledge funds, you and the project team agree how to pay or deliver, and the receipt is recorded on the project."],
    ["Will anyone call me asking for donations?", "Never. We don't make sales or donation calls, and we never share your phone number. If someone calls claiming to be ImpactBridge and asks for money, please report it."],
    ["How do I know a need is real?", "Look for the badges. \"Need verified\" means a reviewer checked it, for example by calling or visiting. \"Completion verified\" means the results were checked with evidence. No badge means not checked yet."],
    ["I shared a need. What happens next?", "A reviewer checks it, usually within a few days. You'll get a notification when it's approved, or if they need more information. Then you publish it and supporters can offer help."],
    ["How do I get a certificate for my club or company?", "When a project you supported is completed and its results are checked, a shareable impact certificate appears on your Home screen and on the project."],
    ["How do I delete my account?", "Write to our support team from the email on your account. We remove your personal details within 30 days."],
  ];
  const mail = state.meta?.support_email;
  const wa = state.meta?.support_whatsapp;
  mount(el, html`<div class="wrap prose" style="max-width:760px">
    <div class="page-head"><h1>Help & support</h1><p class="lede">Answers to common questions, and how to reach a person.</p></div>
    ${hostedNote()}
    <div class="help5-contact">
      ${wa ? html`<a class="btn wa" href="https://wa.me/${wa.replace(/\D/g, "")}" target="_blank" rel="noopener">${raw('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg>')} Chat with us on WhatsApp</a>` : ""}
      ${mail ? html`<a class="btn" href="mailto:${mail}">Email ${mail}</a>` : html`<p class="muted">Support contact details appear here once the team adds them.</p>`}
      <a class="btn ghost" href="/guidelines#reporting">Report a concern</a>
    </div>
    <h2>Common questions</h2>
    <div class="faq5">${faq.map(([q, a]) => html`<details><summary>${q}</summary><p>${a}</p></details>`)}</div>
  </div>`);
}

function terms(el) {
  document.title = "Terms of use — ImpactBridge";
  mount(el, html`<div class="wrap prose" style="max-width:820px">
    <div class="page-head"><h1>Terms of use</h1><p class="lede">By creating an account or using ImpactBridge (the website and the Android app) you agree to these terms.</p></div>
    ${hostedNote()}
    <h2>Who can use ImpactBridge</h2>
    <p>You must be 18 or older. If you act for an organization, club or company, you confirm you're allowed to do so.</p>
    <h2>What ImpactBridge is, and isn't</h2>
    <p>ImpactBridge helps people share community needs and connect them with supporters. ImpactBridge does not collect, hold or transfer money.
      A pledge is a commitment between a supporter and a project team, and they arrange payment or delivery directly.
      Badges show what a reviewer checked; they are not a guarantee.</p>
    <h2>Your content</h2>
    <p>You're responsible for what you post: needs, updates, photos, documents and messages. It must be accurate and you must have the right to share it.
      You let ImpactBridge show it on the service so the platform can work. You can ask us to close your account at any time (<a href="/delete-account">how</a>).</p>
    <h2>Not allowed</h2>
    <ul>
      <li>False or exaggerated needs, numbers or results, or claiming partners or approvals you don't have.</li>
      <li>Asking for money for yourself, scams, or anything illegal.</li>
      <li>Harassment, hate speech, threats, sexual content, or content that endangers children or vulnerable people.</li>
      <li>Photos of identifiable children or vulnerable people without consent from them or their guardian.</li>
      <li>Spam, impersonation, or trying to break or misuse the service.</li>
    </ul>
    <h2>Reporting, blocking and moderation</h2>
    <p>Use "Report a concern" on any project or organization. You can block anyone from their project or offer; blocked people can't send you offers.
      Reviewers may hide content, reject projects and suspend accounts that break these terms or our <a href="/guidelines">community guidelines</a>.</p>
    <h2>No warranty</h2>
    <p>ImpactBridge is provided as it is. We work to keep it accurate and available, but we can't promise that every project will be funded,
      delivered or free of errors. Check the details and verification badges before you commit support.</p>
    <h2>Changes</h2>
    <p>We may update these terms. If the changes matter, we'll tell you in the app before they apply.</p>
    <h2>Contact</h2>
    <p>Questions: ${contact()}. These terms are governed by the laws of India.</p>
    <p class="small muted">See also the <a href="/privacy">privacy policy</a>.</p>
  </div>`);
}

function deleteInfo(el) {
  document.title = "Delete your account — ImpactBridge";
  mount(el, html`<div class="wrap prose" style="max-width:820px">
    <div class="page-head"><h1>Delete your ImpactBridge account</h1><p class="lede">Ask us to close your account and remove your personal data, at any time.</p></div>
    ${hostedNote()}
    <h2>How to ask</h2>
    <p>Email ${contact()} from the address on your account, with the subject "Close my account".</p>
    <p>We confirm it is you, then remove your personal details within 30 days.</p>
    <h2>What is deleted immediately</h2>
    <ul>
      <li>Your name, email, phone, city, region, bio, skills and password.</li>
      <li>Projects that were never published (drafts and ones under review), with their photos and files.</li>
      <li>Your notifications, organization memberships and files you uploaded, except evidence on completed projects (below).</li>
      <li>Offers you made that weren't accepted yet are withdrawn. Accepted pledges to live projects are cancelled and the project team is told.</li>
    </ul>
    <h2>What is kept, without your name</h2>
    <ul>
      <li>Published projects you created, and updates, contributions and receipts on public projects, stay visible because other people relied on them. They are shown as "Deleted user".</li>
      <li>An audit record of reviews and verifications, kept to prevent fraud. It no longer contains your personal details.</li>
    </ul>
    <p>Nothing that identifies you is kept. Backups are overwritten within 30 days.</p>
  </div>`);
}

function offline(el) {
  document.title = "You're offline — ImpactBridge";
  mount(el, html`<div class="wrap" style="max-width:620px;text-align:center;padding:var(--s7) 0">
    <h1>You're offline</h1>
    <p class="lede">ImpactBridge needs an internet connection to load projects. Check your connection and try again.</p>
    <p><button class="btn primary" type="button" data-retry>Try again</button></p>
  </div>`);
  el.querySelector("[data-retry]")?.addEventListener("click", () => location.reload());
}

function how(el) {
  document.title = "How it works — ImpactBridge";
  const steps = [
    ["Share a need", "Anyone can describe a problem in their community — by typing, speaking or adding photos. The original words are always kept."],
    ["Structure it", "AI can turn the description into a proposal with a title, requirements, milestones and measures of success. It won't add facts or numbers that weren't given; anything missing becomes a question. The person reviews every field before saving."],
    ["Review and verify", "An ImpactBridge reviewer checks the proposal before it's public. Organizations, needs, budgets and completion are verified separately, each with its own badge."],
    ["Match resources", "Clubs, NGOs and CSR teams enter their budget, volunteers, skills, equipment and location. Projects they can't realistically help are ruled out; the rest are ranked with a plain explanation."],
    ["Collaborate", "Supporters offer money, materials, volunteers, equipment or skills. The project owner accepts, declines or asks for changes. Several supporters can combine their contributions."],
    ["Track progress", "Milestones, deadlines, updates, receipts and spending are recorded on the project. Everyone involved is notified of changes."],
    ["Measure impact", "The project reports its results with evidence. A reviewer independently checks them. Reported and verified figures are always shown side by side."],
  ];
  mount(el, html`<div class="wrap prose" style="max-width:820px">
    <div class="page-head"><h1>How ImpactBridge works</h1><p class="lede">From a problem someone noticed to results someone checked.</p></div>
    <ol class="timeline" style="margin-left:6px">${steps.map(([t, d]) => html`<li><h2 style="font-size:1.3rem">${t}</h2><p>${d}</p></li>`)}</ol>
    <h2>What ImpactBridge doesn't do</h2>
    <p>Money pledges are commitments between supporters and project teams; ImpactBridge does not collect or hold funds.
      Scores and badges are based only on recorded information and reviewer checks.</p>
    <div class="row" style="margin-top:var(--s5)"><a class="btn primary" href="/explore">Find projects to support</a><a class="btn ink" href="/share-a-need">Share a community need</a></div>
  </div>`);
}

function guidelines(el) {
  document.title = "Community guidelines & privacy — ImpactBridge";
  const ai = state.meta?.integrations?.ai_structuring?.configured;
  mount(el, html`<div class="wrap prose" style="max-width:820px">
    <div class="page-head"><h1>Community guidelines & privacy</h1></div>
    <h2>Be accurate</h2>
    <p>Describe needs as they are. Don't exaggerate numbers or urgency, and don't claim partners, approvals or results you don't have.
      Report only what you counted. Misleading projects are hidden and accounts may be suspended.</p>
    <h2 id="safeguarding">Safeguarding children and vulnerable people</h2>
    <p>If a project involves children or vulnerable adults, you must describe who supervises volunteers and how consent is handled.
      Don't publish photos where children or vulnerable people can be identified unless you have consent from them or their guardian.
      For these projects, the exact location is shown only to the project team and reviewers.</p>
    <p>Volunteers must never be alone with children, collect personal details or contact beneficiaries outside the project.</p>
    <h2>Privacy</h2>
    <p>Your email address and phone number are never shown publicly. Organization registration numbers and verification documents are
      visible only to reviewers and the organization's members. Location data (GPS) is removed from photos when they're uploaded.
      Voice recordings sent for transcription are not stored.</p>
    <p>${ai ? "When you use AI drafting, your description and any photos you attach are sent to the configured AI provider to create the draft."
      : "AI drafting is currently not enabled on this server."} Nothing is published until you save it and a reviewer approves it.</p>
    <h2 id="reporting">Reporting a concern</h2>
    <p>Use "Report a concern" on any project or organization page. Reports go to ImpactBridge reviewers, not to the project owner.
      Safeguarding reports are reviewed first. If someone is in immediate danger, contact local emergency services (112 in India) or the
      Childline helpline (1098) first.</p>
  </div>`);
}
