import { icon } from "../art.js";
import { $, $$, setUrl, api, busy, causeLabel, esc, html, money, mount, navigate, raw, showErrors, state, toast, uploadFile } from "../core.js";
import { currentLang } from "../i18n.js";

const SPEECH = { en: ["en-IN", "English"], hi: ["hi-IN", "हिन्दी"], mr: ["mr-IN", "मराठी"] };

export default async function create({ el, params, opts }) {
  const NAMES = ["Describe the problem", "Photos and place", "The proposal", "What's needed", "Plan and safety", "Check and submit"];
  const s = {
    step: 1, sub: 1, voiceLang: currentLang(), description: "", city: state.user.city || "", region: state.user.region || "", cause: "",
    photos: [], consent: false, proposal: null, aiProvider: null, project: null,
  };
  // Unsent work is kept on this device so a dropped connection or a closed app doesn't lose it.
  const DRAFT_KEY = `ib-need-draft:${state.user.id}`;
  const saveLocal = (extra = {}) => {
    if (opts.edit) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...s, project: null, ...extra, saved_at: Date.now() })); } catch { /* storage unavailable */ }
  };
  const clearLocal = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
  let restored = false;
  if (!opts.edit) {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && Date.now() - d.saved_at < 30 * 86400000 && (d.description || d.proposal)) { Object.assign(s, d, { project: null }); restored = true; }
    } catch { /* ignore */ }
  }
  if (opts.edit) {
    const { project } = await api(`/api/projects/${params.id}`);
    if (!project.permissions.can_edit) {
      mount(el, html`<div class="wrap state"><h1>This project can't be edited now</h1>
        <p>Projects can be edited while they are drafts or when reviewers ask for more information.</p>
        <a class="btn" href="/projects/${project.id}">Back to project</a></div>`);
      return;
    }
    s.project = project;
    s.description = project.original_description;
    s.proposal = project;
    s.step = 3;
  }
  document.title = (opts.edit ? "Edit project" : "Share a community need") + " — ImpactBridge";
  draw();

  function draw() {
    const n = s.step < 3 ? s.step : 2 + s.sub;
    mount(el, html`<div class="wrap" style="max-width:760px">
      <div class="page-head"><h1>${opts.edit ? "Edit your project" : "Share a community need"}</h1>
        ${!opts.edit && n === 1 ? html`<p class="lede">Describe the problem the way you'd explain it to a neighbour. You'll check
          everything before it's submitted, and reviewers check it before it's public.</p>` : ""}</div>
      ${restored ? html`<div class="notice row between" id="restored"><span>We kept your unfinished need on this device.</span>
        <button class="btn small ghost" type="button" id="startover">Start over</button></div>` : ""}
      <div class="wiz-progress" aria-label="Progress"><div class="row between"><strong>Step ${n} of 6</strong><span class="muted">${NAMES[n - 1]}</span></div>
        <div class="wiz-bar"><span style="width:${Math.round((n / 6) * 100)}%"></span></div></div>
      <div id="stage"></div></div>`);
    $("#startover", el)?.addEventListener("click", () => {
      clearLocal(); restored = false;
      Object.assign(s, { step: 1, sub: 1, description: "", cause: "", photos: [], consent: false, proposal: null, aiProvider: null });
      draw();
    });
    if (s.step === 1) describeStep($("#stage", el));
    else if (s.step === 2) placeStep($("#stage", el));
    else reviewStep($("#stage", el));
    window.scrollTo(0, 0);
  }

  // -------------------------------------------------------- step 1 ---
  function describeStep(box) {
    const ints = state.meta?.integrations || {};
    const aiOK = ints.ai_structuring?.configured;
    const SR = window.IB_HOSTED ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
    const whisperOK = ints.voice_transcription?.configured && window.MediaRecorder;
    mount(box, html`<form id="d" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="field"><label for="desc">What is the problem, and who does it affect?</label>
        <textarea id="desc" name="description" rows="9" maxlength="8000" placeholder="For example: The lane behind our school floods every monsoon because the drains are blocked with plastic. About 60 families are affected. We think it needs a clean-up day with 20 people and gloves and shovels.">${s.description}</textarea>
        <span class="hint">Include what you know: the place, how many people are affected, what has been tried, and any budget, volunteers or materials you think are needed. Leave out anything you're unsure about — you'll be asked.</span>
        <span class="hint" id="charcount"></span></div>
      <div class="row" style="margin-bottom:var(--s4)">
        ${SR || whisperOK ? html`<div class="voice-box"><div class="voice-lang" role="radiogroup" aria-label="Language you'll speak">
            <span class="small muted">I'll speak in</span>${Object.entries(SPEECH).map(([k, [, label]]) => html`<button type="button" class="chip-btn" data-vlang="${k}" aria-pressed="${s.voiceLang === k}" translate="no">${label}</button>`)}</div>
          <div class="row">${SR ? html`<button type="button" class="btn mic" id="dictate">🎙️ Speak now</button>` : ""}
          ${whisperOK ? html`<button type="button" class="btn ${SR ? "small" : "mic"}" id="record">${SR ? "Record a voice note instead" : "🎙️ Record a voice note"}</button>` : ""}</div></div>` : ""}
        <span id="voice-status" class="small muted" aria-live="polite">${!SR && !whisperOK ? (window.IB_HOSTED ? "Tip: use your phone keyboard's microphone button to dictate into the box." : "Voice input isn't available in this browser.") : ""}</span>
      </div>
      ${state.meta?.integrations?.ai_structuring?.configured ? html`<div class="notice quick-ai" id="quick-ai" ${s.description.length >= 30 ? "" : "hidden"}>
        <span>Done describing? AI can fill in the whole proposal from what you said, in your language. You'll check every field.</span>
        <button type="button" class="btn primary" id="quick-ai-btn">✨ Fill in the proposal</button></div>` : ""}
      <div class="wiz-nav"><span></span><button class="btn primary" type="submit">Next: photos and place</button></div>
    </form>`);
    const f = $("#d", box);
    const desc = $("#desc", f);
    const count = () => { $("#charcount", f).textContent = `${desc.value.length} characters${desc.value.length < 30 ? " (at least 30 needed)" : ""}`; };
    desc.addEventListener("input", count); count();
    const syncQuick = () => { const q = $("#quick-ai", f); if (q) q.hidden = desc.value.trim().length < 30; };
    desc.addEventListener("input", () => { s.description = desc.value; saveLocal(); syncQuick(); });
    new MutationObserver(syncQuick).observe($("#voice-status", f), { childList: true, characterData: true, subtree: true });
    f.addEventListener("click", (e) => {
      const v = e.target.closest("[data-vlang]");
      if (!v) return;
      s.voiceLang = v.dataset.vlang; saveLocal();
      $$("[data-vlang]", f).forEach((b) => b.setAttribute("aria-pressed", String(b === v)));
    });
    $("#quick-ai-btn", f)?.addEventListener("click", async (e) => {
      s.description = desc.value.trim();
      if (s.description.length < 30) { showErrors(f, { message: "Please describe the problem in at least 30 characters.", field: "description" }); return; }
      const btn = e.currentTarget; busy(btn); btn.textContent = "Drafting… this can take up to a minute";
      try {
        const r = await api("/api/ai/structure", { method: "POST", body: { description: s.description, city: s.city || null, region: s.region || null, cause: s.cause || null, photo_file_ids: [], language: currentLang() } });
        s.proposal = r.proposal; s.aiProvider = r.proposal.provider; s.step = 3; s.sub = 1; saveLocal(); draw();
        toast("Draft ready. Please check every field.");
      } catch (err) { showErrors(f, err); busy(btn, false); btn.textContent = "✨ Fill in the proposal"; }
    });

    // browser dictation
    if (SR) {
      let rec = null;
      $("#dictate", f).addEventListener("click", (e) => {
        const btn = e.currentTarget;
        if (rec) { rec.stop(); return; }
        rec = new SR();
        rec.lang = SPEECH[s.voiceLang]?.[0] || "en-IN";
        rec.continuous = true; rec.interimResults = false;
        rec.onresult = (ev) => {
          for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) {
            desc.value = (desc.value + " " + ev.results[i][0].transcript).trim(); count();
          }
        };
        rec.onerror = (ev) => { $("#voice-status", f).textContent = `Dictation stopped: ${ev.error}`; };
        rec.onend = () => { rec = null; btn.textContent = "Dictate with your browser"; mount($("#voice-status", f), ""); };
        rec.start();
        btn.textContent = "Stop dictation";
        mount($("#voice-status", f), html`<span class="rec"><span class="dot"></span>Listening…</span>`);
      });
    }
    // recorded voice note → Whisper
    if (whisperOK) {
      let mr = null, chunks = [];
      $("#record", f).addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        if (mr) { mr.stop(); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mr = new MediaRecorder(stream); chunks = [];
          mr.ondataavailable = (ev) => chunks.push(ev.data);
          mr.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            mr = null; btn.textContent = "Record a voice note";
            $("#voice-status", f).textContent = "Transcribing…";
            const fd = new FormData();
            fd.append("file", new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }), "note.webm");
            fd.append("language", s.voiceLang);
            try {
              const r = await api("/api/ai/transcribe", { method: "POST", form: fd });
              desc.value = (desc.value + "\n" + r.text).trim(); count();
              $("#voice-status", f).textContent = "Transcript added. Please check it for mistakes.";
            } catch (err) { $("#voice-status", f).textContent = err.message; }
          };
          mr.start();
          btn.textContent = "Stop recording";
          mount($("#voice-status", f), html`<span class="rec"><span class="dot"></span>Recording… the audio isn't stored.</span>`);
        } catch { $("#voice-status", f).textContent = "Microphone access was blocked."; }
      });
    }

    f.addEventListener("submit", (e) => {
      e.preventDefault();
      s.description = desc.value.trim();
      if (s.description.length < 30) {
        showErrors(f, { message: "Please describe the problem in at least 30 characters.", field: "description" });
        return;
      }
      s.step = 2; saveLocal(); draw();
    });
  }

  // -------------------------------------------------------- step 2: photos and place ---
  function placeStep(box) {
    const aiOK = state.meta?.integrations?.ai_structuring?.configured;
    mount(box, html`<form id="d" novalidate>
      <div class="form-error notice bad" hidden></div>
      <div class="form-grid">
        <div class="field"><label for="city">City or town</label><input id="city" name="city" value="${s.city}"></div>
        <div class="field"><label for="region">State / region</label><input id="region" name="region" value="${s.region}"></div>
        <div class="field full"><label for="cause">Cause (optional)</label><select id="cause" name="cause"><option value="">Let me decide later</option>
          ${Object.entries(state.meta.causes).map(([k, v]) => html`<option value="${k}" ${s.cause === k ? "selected" : ""}>${v}</option>`)}</select></div>
      </div>
      <fieldset><legend>Photos</legend>
        <p class="small muted">Add at least one real photo of the problem, like the blocked drain or the broken roof. Needs with real photos get far more help. You can add up to 4. Location data is removed when you upload them.</p>
        <label class="check"><input type="checkbox" id="consent" ${s.consent ? "checked" : ""}><span>These photos don't show identifiable children or vulnerable people, or I have their (or their guardian's) consent to share them publicly.</span></label>
        <label class="btn photo-pick" for="photos">${icon("camera")} Add photos</label>
        <input type="file" id="photos" accept="image/*" multiple class="sr-only">
        <span id="voice-status" class="small muted" aria-live="polite"></span>
        <div class="thumbs" id="thumbs" style="margin-top:var(--s3)"></div>
      </fieldset>
      ${aiOK ? "" : html`<p class="small muted">Next you'll fill in the proposal. What you wrote is kept as it is.</p>`}
      <div class="wiz-nav"><button type="button" class="btn ghost" id="back1">Back</button>
        <div class="row">${aiOK ? html`<button class="btn primary" type="submit" data-mode="ai">Draft my proposal with AI</button>` : ""}
        <button class="btn ${aiOK ? "" : "primary"}" type="submit" data-mode="manual">${aiOK ? "Fill in the form myself" : "Next: the proposal"}</button></div></div>
      ${aiOK ? html`<p class="small muted" style="margin-top:var(--s3)">AI only organises what you wrote. It won't add numbers, people or facts you didn't mention; gaps become questions for you.</p>` : ""}
    </form>`);
    const f = $("#d", box);
    const keep = () => { s.city = $("#city", f).value.trim(); s.region = $("#region", f).value.trim(); s.cause = $("#cause", f).value; s.consent = $("#consent", f).checked; saveLocal(); };
    f.addEventListener("input", keep); f.addEventListener("change", keep);
    $("#back1", f).addEventListener("click", () => { keep(); s.step = 1; draw(); });
    drawThumbs();

    $("#photos", f).addEventListener("change", async (e) => {
      const files = [...e.target.files].slice(0, 4 - s.photos.length);
      for (const file of files) {
        $("#voice-status", f).textContent = `Uploading ${file.name}…`;
        try {
          const up = await uploadFile(file, { purpose: "need_photo", visibility: "public", consent: $("#consent", f).checked });
          s.photos.push(up);
        } catch (err) { toast(err.message, "bad"); }
      }
      $("#voice-status", f).textContent = "";
      e.target.value = "";
      if (s.photos.length) $(".form-error", f).hidden = true;
      drawThumbs(); saveLocal();
    });
    function drawThumbs() {
      mount($("#thumbs", box), html`${s.photos.map((p, i) => html`<figure><img src="${p.url}" alt="Uploaded photo ${i + 1}">
        <button type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>`)}`);
      $$("[data-rm]", box).forEach((b) => b.addEventListener("click", () => {
        const [p] = s.photos.splice(Number(b.dataset.rm), 1);
        api(`/api/files/${p.id}`, { method: "DELETE" }).catch(() => {});
        drawThumbs(); saveLocal();
      }));
    }


    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mode = e.submitter?.dataset.mode || "manual";
      keep();
      if (state.meta?.require_project_photo !== false && !s.photos.length) {
        const box = $(".form-error", f);
        box.hidden = false; box.textContent = "Please add at least one real photo of the problem before you continue.";
        $("#photos", f).closest("fieldset").scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (mode === "manual") {
        s.proposal = s.proposal && !s.aiProvider ? s.proposal : { title: "", problem_statement: s.description, city: s.city, region: s.region, cause: s.cause || null,
          materials: [], skills: [], milestones: [], outcomes: [] };
        s.aiProvider = null; s.step = 3; s.sub = 1; saveLocal(); draw(); return;
      }
      const btn = e.submitter; busy(btn);
      btn.textContent = "Drafting… this can take up to a minute";
      try {
        const r = await api("/api/ai/structure", { method: "POST", body: {
          description: s.description, city: s.city || null, region: s.region || null, cause: s.cause || null,
          photo_file_ids: s.photos.map((p) => p.id), language: currentLang() } });
        s.proposal = r.proposal; s.aiProvider = r.proposal.provider; s.step = 3; s.sub = 1; saveLocal(); draw();
        toast("Draft ready. Please check every field.");
      } catch (err) {
        showErrors(f, err);
        busy(btn, false); btn.textContent = "Draft my proposal with AI";
      }
    });
  }

  // -------------------------------------------------------- step 2 ---
  function reviewStep(box) {
    const p = s.proposal;
    const ai = !!s.aiProvider;
    const flag = (k) => (ai && p[k] !== null && p[k] !== undefined && p[k] !== "" && !(Array.isArray(p[k]) && !p[k].length)) ? "ai-flag" : "";
    const orgs = state.user.organizations || [];
    const v = (x) => (x === null || x === undefined ? "" : x);
    const nav = (n) => html`<div class="wiz-nav">${n > 1 || !opts.edit ? html`<button type="button" class="btn ghost" data-goto="${n - 1}">Back</button>` : html`<span></span>`}
      <button type="button" class="btn primary" data-goto="${n + 1}">Next: ${["", "what's needed", "plan and safety", "check and submit"][n]}</button></div>`;
    mount(box, html`<form id="r" novalidate>
      <div class="form-error notice bad" hidden></div>
      <section class="wiz-page" data-page="1">
      ${s.project?.review_notes && s.project.status === "needs_information" ? html`<div class="notice warn"><p><strong>Reviewer's request:</strong> ${s.project.review_notes}</p></div>` : ""}
      ${ai ? html`<div class="notice"><p><strong>This is an AI draft.</strong> Fields highlighted in yellow were filled in by AI
        from your description. Correct anything that's wrong, and add what's missing.</p>
        ${p.removed_unstated_values?.length ? html`<p class="small">Some numbers the AI suggested weren't in your description, so they were removed: ${p.removed_unstated_values.join(", ").replace(/_/g, " ")}.</p>` : ""}</div>` : ""}
      ${(p.missing_information?.length || p.follow_up_questions?.length || p.missing_info?.length) ? html`<div class="notice warn">
        <p><strong>Still missing</strong></p><ul>${[...(p.missing_information || p.missing_info || [])].map((m) => html`<li>${m}</li>`)}</ul>
        ${(p.follow_up_questions || []).length ? html`<p><strong>Questions to answer in the form</strong></p><ul>${p.follow_up_questions.map((q) => html`<li>${q}</li>`)}</ul>` : ""}</div>` : ""}
      ${s.description ? html`<details class="panel tight" style="margin-bottom:var(--s4)"><summary><strong>Your original description</strong> (kept unchanged, visible to you and reviewers)</summary>
        <div class="original" style="margin-top:var(--s3)">${s.description}</div></details>` : ""}

      <fieldset><legend>The problem</legend>
        <div class="field ${flag("title")}"><label for="title">Project title</label><input id="title" name="title" maxlength="120" value="${v(p.title)}" placeholder="Who is affected and what would change, e.g. Help Ward 12 school children wash their hands"></div>
        <div class="field ${flag("story")}"><label for="story">The story (shown first to supporters)</label>
          <textarea id="story" name="story" rows="3" maxlength="600" placeholder="Two or three sentences about the people and a moment from their day. Then say what changes when it's fixed.">${v(p.story)}</textarea>
          <p class="hint">Make it real, not sad. People help when they can picture the place and the people.</p></div>
        <div class="field ${flag("problem_statement")}"><label for="ps">Problem statement</label><textarea id="ps" name="problem_statement" rows="5">${v(p.problem_statement)}</textarea></div>
        <div class="field ${flag("proposed_solution")}"><label for="sol">Proposed solution</label><textarea id="sol" name="proposed_solution" rows="4">${v(p.proposed_solution)}</textarea></div>
        <div class="form-grid">
          <div class="field ${flag("beneficiaries")}"><label for="ben">Who benefits</label><input id="ben" name="beneficiaries" value="${v(p.beneficiaries)}"></div>
          <div class="field ${flag("beneficiary_count")}"><label for="benc">How many people (approx.)</label><input id="benc" name="beneficiary_count" type="number" min="0" value="${v(p.beneficiary_count)}"></div>
          <div class="field ${flag("cause")}"><label for="cause2">Cause</label><select id="cause2" name="cause"><option value="">Choose a cause</option>
            ${Object.entries(state.meta.causes).map(([k, t]) => html`<option value="${k}" ${p.cause === k ? "selected" : ""}>${t}</option>`)}</select></div>
          <div class="field"><label for="org">Posting on behalf of</label><select id="org" name="org_id"><option value="">Myself</option>
            ${orgs.map((o) => html`<option value="${o.id}" ${(p.organization?.id || p.org_id) === o.id ? "selected" : ""}>${o.name}</option>`)}</select></div>
        </div>
      </fieldset>

      <fieldset><legend>Location</legend><div class="form-grid">
        <div class="field ${flag("city")}"><label for="pcity">City or town</label><input id="pcity" name="city" value="${v(p.city)}"></div>
        <div class="field ${flag("region")}"><label for="preg">State / region</label><input id="preg" name="region" value="${v(p.region)}"></div>
        <div class="field full ${flag("location_detail")}"><label for="ploc">Exact location or landmark (optional)</label><input id="ploc" name="location_detail" value="${v(p.location_detail)}">
          <span class="hint">Hidden from the public for projects involving children or vulnerable people.</span></div>
      </div></fieldset>
      ${nav(1)}</section>

      <section class="wiz-page" data-page="2">

      <fieldset><legend>What's needed</legend><div class="form-grid">
        <div class="field full ${flag("upi_id")}"><label for="upi">UPI ID to receive money (optional)</label><input id="upi" name="upi_id" value="${v(p.upi_id)}" placeholder="yourgroup@bank" autocapitalize="none" autocomplete="off" inputmode="email">
          <span class="hint">Supporters see it only after they pledge. Use an account in your group's name, never a personal one you don't control.</span></div>
        <div class="field ${flag("budget_required")}"><label for="bud">Budget needed (${state.meta.currency})</label><input id="bud" name="budget_required" type="number" min="0" step="1" value="${v(p.budget_required)}" inputmode="numeric"><span class="hint">Leave empty if you don't know yet.</span>
          ${p.budget_estimate?.amount && !p.budget_required ? html`<div class="estimate"><span><strong>AI estimate: about ${money(p.budget_estimate.amount)}</strong><br><span class="small" translate="no">${p.budget_estimate.basis}</span><br>
            <span class="small muted">A rough guess from typical costs, not a quote. Check prices locally before you use it.</span></span>
            <button type="button" class="btn small" id="use-est" data-amount="${p.budget_estimate.amount}">Use this estimate</button></div>` : ""}</div>
        <div class="field ${flag("volunteers_required")}"><label for="vol">Volunteers needed</label><input id="vol" name="volunteers_required" type="number" min="0" value="${v(p.volunteers_required)}"></div>
        <div class="field ${flag("time_commitment")}"><label for="tc">Time commitment for volunteers</label><input id="tc" name="time_commitment" value="${v(p.time_commitment)}" placeholder="e.g. Two Sunday mornings"></div>
        <div class="field ${flag("duration_weeks")}"><label for="dur">Expected duration (weeks)</label><input id="dur" name="duration_weeks" type="number" min="0" value="${v(p.duration_weeks)}"></div>
        <div class="field"><label for="sd">Start date (optional)</label><input id="sd" name="start_date" type="date" value="${v(p.start_date)}"></div>
        <div class="field"><label for="ed">End date (optional)</label><input id="ed" name="end_date" type="date" value="${v(p.end_date)}"></div>
      </div>
      <div class="field ${flag("materials")}"><span class="label">Materials and equipment</span><div id="materials"></div>
        <button type="button" class="btn small" id="add-mat">Add material</button></div>
      <div class="field ${flag("skills")}"><label for="skill-in">Skills needed</label>
        <div class="row"><input id="skill-in" placeholder="Type a skill and press Add" style="flex:1"><button type="button" class="btn small" id="add-skill">Add</button></div>
        <div class="chips-input" id="skills"></div></div>
      <label class="check"><input type="checkbox" name="allow_multiple_supporters" ${p.allow_multiple_supporters === false ? "" : "checked"}><span>Several supporters can combine their contributions</span></label>
      </fieldset>
      ${nav(2)}</section>

      <section class="wiz-page" data-page="3">

      <fieldset><legend>Plan</legend>
        <div class="field ${flag("milestones")}"><span class="label">Milestones${ai ? " (suggested)" : ""}</span><div id="milestones"></div>
          <button type="button" class="btn small" id="add-ms">Add milestone</button></div>
        <div class="field ${flag("outcomes")}"><span class="label">How you'll measure success</span>
          <span class="hint">Add a target only if you know it. Results are reported later and checked by reviewers.</span><div id="outcomes"></div>
          <button type="button" class="btn small" id="add-out">Add measure</button></div>
      </fieldset>

      <fieldset><legend>Safeguarding</legend>
        <label class="check"><input type="checkbox" name="involves_children" ${p.involves_children ? "checked" : ""}><span>This project involves children</span></label>
        <label class="check"><input type="checkbox" name="involves_vulnerable" ${p.involves_vulnerable ? "checked" : ""}><span>This project involves vulnerable adults (elderly, disabled, survivors of abuse, etc.)</span></label>
        <div class="field" id="sg-field"><label for="sg">Safeguarding arrangements</label><textarea id="sg" name="safeguarding_notes" rows="3" placeholder="Who supervises volunteers, how consent is collected, what won't be photographed.">${v(p.safeguarding_notes)}</textarea>
          <span class="hint">Only the project team and reviewers see this.</span></div>
      </fieldset>
      ${nav(3)}</section>

      <section class="wiz-page" data-page="4">
        <div class="panel tight" id="summary"></div>
        ${ai ? html`<label class="check"><input type="checkbox" id="reviewed"><span>I've checked this draft and it describes the real situation accurately.</span></label>` : ""}
        <p class="small muted">After you submit, an ImpactBridge reviewer checks the proposal. Nothing is public until it's approved and you publish it.</p>
        <div class="wiz-nav"><button type="button" class="btn ghost" data-goto="3">Back</button>
          <div class="row"><button class="btn" type="submit" data-submit="0">Save draft</button>
          <button class="btn primary" type="submit" data-submit="1">Submit for review</button></div></div>
      </section>
    </form>`);
    const f = $("#r", box);
    const mats = [...(p.materials || [])], skills = [...(p.skills || [])];
    const mss = (p.milestones || []).filter((m) => m.status !== "done").map((m) => ({ title: m.title, description: m.description || "", due_date: m.due_date || "" }));
    const outs = (p.outcomes || []).map((o) => ({ metric: o.metric, target: o.target, unit: o.unit }));

    const drawMats = () => mount($("#materials", f), html`${mats.map((m, i) => html`<div class="repeater-row">
      <div><label class="sr-only" for="mn${i}">Material</label><input id="mn${i}" data-mat="${i}" data-k="name" value="${m.name || ""}" placeholder="Material"></div>
      <div><label class="sr-only" for="mq${i}">Quantity</label><input id="mq${i}" data-mat="${i}" data-k="quantity" type="number" min="0" value="${m.quantity ?? ""}" placeholder="Qty"></div>
      <div><label class="sr-only" for="mu${i}">Unit</label><input id="mu${i}" data-mat="${i}" data-k="unit" value="${m.unit || ""}" placeholder="Unit"></div>
      <button type="button" class="btn small danger" data-rmmat="${i}" aria-label="Remove material">Remove</button></div>`)}`);
    const drawSkills = () => mount($("#skills", f), html`${skills.map((x, i) => html`<span class="chip">${x}<button type="button" data-rmskill="${i}" aria-label="Remove ${x}">×</button></span>`)}`);
    const drawMs = () => mount($("#milestones", f), html`${mss.map((m, i) => html`<div class="repeater-row" style="grid-template-columns:1fr 160px auto">
      <div><label class="sr-only" for="ms${i}">Milestone</label><input id="ms${i}" data-ms="${i}" data-k="title" value="${m.title}" placeholder="Milestone"></div>
      <div><label class="sr-only" for="md${i}">Due date</label><input id="md${i}" data-ms="${i}" data-k="due_date" type="date" value="${m.due_date || ""}"></div>
      <button type="button" class="btn small danger" data-rmms="${i}">Remove</button></div>`)}`);
    const drawOuts = () => mount($("#outcomes", f), html`${outs.map((o, i) => html`<div class="repeater-row">
      <div><label class="sr-only" for="om${i}">Measure</label><input id="om${i}" data-out="${i}" data-k="metric" value="${o.metric}" placeholder="e.g. Families with clean water"></div>
      <div><label class="sr-only" for="ot${i}">Target</label><input id="ot${i}" data-out="${i}" data-k="target" type="number" min="0" value="${o.target ?? ""}" placeholder="Target"></div>
      <div><label class="sr-only" for="ou${i}">Unit</label><input id="ou${i}" data-out="${i}" data-k="unit" value="${o.unit || ""}" placeholder="Unit"></div>
      <button type="button" class="btn small danger" data-rmout="${i}">Remove</button></div>`)}`);
    drawMats(); drawSkills(); drawMs(); drawOuts();

    $("#use-est", f)?.addEventListener("click", (e) => { $("#bud", f).value = e.currentTarget.dataset.amount; e.currentTarget.closest(".estimate").remove(); toast("Estimate added. You can change it any time."); });
    const pages = $$(".wiz-page", f);
    const summary = () => {
      const g = (n) => f.elements[n]?.value?.trim();
      const rows = [
        ["Title", g("title") || "Not set yet"], ["Cause", g("cause") ? causeLabel(g("cause")) : "Not set yet"],
        ["Place", [g("city"), g("region")].filter(Boolean).join(", ") || "Not set yet"],
        ["Budget", g("budget_required") ? `${state.meta.currency} ${Number(g("budget_required")).toLocaleString("en-IN")}` : "Not set"],
        ["Volunteers", g("volunteers_required") || "None"], ["Materials", mats.filter((m) => (m.name || "").trim()).map((m) => m.name).join(", ") || "None"],
        ["Skills", skills.join(", ") || "None"], ["Milestones", String(mss.filter((m) => (m.title || "").trim()).length)],
      ];
      mount($("#summary", f), html`<h2 style="margin-top:0">Check your proposal</h2><dl class="kv">${rows.map(([k, v]) => html`<dt>${k}</dt><dd translate="no">${v}</dd>`)}</dl>
        <p class="small"><button type="button" class="linklike" data-goto="1">Change something</button></p>`);
    };
    const showPage = (n) => {
      if (n < 1) { s.step = 2; keepReview(); draw(); return; }
      s.sub = Math.min(4, n);
      pages.forEach((pg) => { pg.hidden = Number(pg.dataset.page) !== s.sub; });
      if (s.sub === 4) summary();
      const prog = el.querySelector(".wiz-progress");
      if (prog) {
        const k = 2 + s.sub;
        prog.querySelector("strong").textContent = `Step ${k} of 6`;
        prog.querySelector(".muted").textContent = NAMES[k - 1];
        prog.querySelector(".wiz-bar span").style.width = `${Math.round((k / 6) * 100)}%`;
      }
      window.scrollTo(0, 0);
    };
    const keepReview = () => { s.proposal = { ...collect(), missing_information: p.missing_information || p.missing_info || [], follow_up_questions: p.follow_up_questions || [], removed_unstated_values: p.removed_unstated_values, budget_estimate: p.budget_estimate }; saveLocal(); };
    f.addEventListener("click", (e) => {
      const go2 = e.target.closest("[data-goto]");
      if (go2) { e.preventDefault(); keepReview(); showPage(Number(go2.dataset.goto)); }
    });
    let saveT;
    f.addEventListener("input", () => { clearTimeout(saveT); saveT = setTimeout(keepReview, 600); });
    showPage(s.sub || 1);

    f.addEventListener("input", (e) => {
      const t = e.target, k = t.dataset.k;
      const val = t.type === "number" ? (t.value === "" ? null : Number(t.value)) : t.value;
      if (t.dataset.mat !== undefined) mats[t.dataset.mat][k] = val;
      if (t.dataset.ms !== undefined) mss[t.dataset.ms][k] = val;
      if (t.dataset.out !== undefined) outs[t.dataset.out][k] = val;
    });
    f.addEventListener("click", (e) => {
      const t = e.target;
      if (t.id === "add-mat") { mats.push({ name: "", quantity: null, unit: "" }); drawMats(); $(`#mn${mats.length - 1}`, f).focus(); }
      if (t.id === "add-ms") { mss.push({ title: "", due_date: "" }); drawMs(); $(`#ms${mss.length - 1}`, f).focus(); }
      if (t.id === "add-out") { outs.push({ metric: "", target: null, unit: "" }); drawOuts(); $(`#om${outs.length - 1}`, f).focus(); }
      if (t.id === "add-skill") addSkill();
      if (t.dataset.rmmat) { mats.splice(+t.dataset.rmmat, 1); drawMats(); }
      if (t.dataset.rmms) { mss.splice(+t.dataset.rmms, 1); drawMs(); }
      if (t.dataset.rmout) { outs.splice(+t.dataset.rmout, 1); drawOuts(); }
      if (t.dataset.rmskill) { skills.splice(+t.dataset.rmskill, 1); drawSkills(); }
    });
    const addSkill = () => {
      const i = $("#skill-in", f); const val = i.value.trim();
      if (val && !skills.includes(val)) { skills.push(val); drawSkills(); }
      i.value = ""; i.focus();
    };
    $("#skill-in", f).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } });
    const syncSg = () => { $("#sg-field", f).hidden = !(f.involves_children.checked || f.involves_vulnerable.checked); };
    f.addEventListener("change", syncSg); syncSg();

    function collect() {
      const g = (n) => f.elements[n];
      const numOrNull = (n) => (g(n).value === "" ? null : Number(g(n).value));
      const body = {
        title: g("title").value.trim(), story: g("story").value.trim(), problem_statement: g("problem_statement").value.trim(),
        proposed_solution: g("proposed_solution").value.trim(), beneficiaries: g("beneficiaries").value.trim(),
        beneficiary_count: numOrNull("beneficiary_count"), cause: g("cause").value || null, org_id: g("org_id").value || null,
        city: g("city").value.trim() || null, region: g("region").value.trim() || null, location_detail: g("location_detail").value.trim() || null, upi_id: g("upi_id").value.trim() || null,
        budget_required: numOrNull("budget_required"), volunteers_required: numOrNull("volunteers_required"),
        time_commitment: g("time_commitment").value.trim() || null, duration_weeks: numOrNull("duration_weeks"),
        start_date: g("start_date").value || null, end_date: g("end_date").value || null,
        materials: mats.filter((m) => (m.name || "").trim()).map((m) => ({ name: m.name.trim(), quantity: m.quantity ?? null, unit: (m.unit || "").trim() || null })),
        skills, allow_multiple_supporters: g("allow_multiple_supporters").checked,
        milestones: mss.filter((m) => (m.title || "").trim()).map((m) => ({ title: m.title.trim(), description: m.description || "", due_date: m.due_date || null })),
        outcomes: outs.filter((o) => (o.metric || "").trim()).map((o) => ({ metric: o.metric.trim(), target: o.target ?? null, unit: (o.unit || "").trim() || null })),
        involves_children: g("involves_children").checked, involves_vulnerable: g("involves_vulnerable").checked,
        safeguarding_notes: g("safeguarding_notes").value.trim() || null,
        original_description: s.description || null, ai_assisted: ai || !!s.project?.ai_assisted, ai_provider: s.aiProvider,
        missing_info: p.missing_information || p.missing_info || [], follow_up_questions: p.follow_up_questions || [],
        photo_file_ids: s.photos.map((x) => x.id),
      };
      return body;
    }

    const pageOf = (field) => {
      const name = (field || "").split(".")[0];
      const input = name && f.elements[name];
      const pg = (input?.length && !input.tagName ? input[0] : input)?.closest?.(".wiz-page");
      return pg ? Number(pg.dataset.page) : null;
    };
    const fail = (err) => {
      const n = pageOf(err.field) || (err.details?.length ? 1 : null);
      if (n && n !== s.sub) showPage(n);
      showErrors(f, err);
    };

    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submit = e.submitter?.dataset.submit === "1";
      if (s.sub !== 4) { showPage(s.sub + 1); return; }
      if (ai && !$("#reviewed", f).checked) {
        showErrors(f, { message: "Please confirm you've checked the AI draft before saving." }); return;
      }
      const body = collect();
      const btn = e.submitter; busy(btn);
      try {
        const r = s.project
          ? await api(`/api/projects/${s.project.id}`, { method: "PUT", body })
          : await api("/api/projects", { method: "POST", body });
        const pid = r.project.id;
        s.project = r.project; s.photos = [];
        if (submit) {
          try {
            await api(`/api/projects/${pid}/transition`, { method: "POST", body: { status: "submitted" } });
            toast("Submitted for review. You'll be notified of the decision.");
            import("../prefs.js").then((m) => m.askForUpdates("We'll tell you as soon as a reviewer checks your need, and when someone offers help."));
          } catch (err) {
            toast("Saved as a draft. " + err.message, "bad");
            clearLocal(); fail(err); busy(btn, false);
            setUrl(`/projects/${pid}/edit`);
            return;
          }
        } else toast("Draft saved");
        clearLocal();
        navigate(`/projects/${pid}`);
      } catch (err) { fail(err); busy(btn, false); }
    });
  }
}
