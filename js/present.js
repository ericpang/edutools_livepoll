// Presenter page: build or resume a poll, show the QR code, step through questions, show live results.

import * as db from "./db.js";
import { initBuilder } from "./builder.js";
import { renderResults } from "./results.js";
import { TYPES, questionList, isChoice, isCorrect, describeResponse } from "./questions.js";
import { initThemeToggle } from "./theme.js";
import { $, toast, show, storageGet, storageSet, pollCodeFromUrl } from "./ui.js";

const LAST_POLL_KEY = "lastPoll";

const state = {
  code: null,
  uid: null,
  isOwner: false,
  meta: null,
  questions: [],     // sorted array of { id, ...question }
  answers: {},       // answer key per question (owner: all; viewer: current once revealed)
  responses: {},     // responses per question (owner: all; viewer: current while shared)
  viewerSubs: { key: "", off: [] }, // read-only viewers re-subscribe as the presenter moves on
};

initThemeToggle($("#theme-toggle"));
main().catch((err) => {
  console.error(err);
  toast(friendlyError(err), 6000);
});

async function main() {
  if (!db.isConfigured) {
    show($("#config-banner"));
    show($("#setup"));
    $("#start-btn").disabled = true;
    return;
  }

  state.uid = await db.ready();
  const code = pollCodeFromUrl();

  if (code) {
    const meta = await db.getMeta(code);
    if (meta) return startPoll(code, meta.owner === state.uid);
    toast(`Poll ${code} was not found.`);
    history.replaceState(null, "", location.pathname);
  }
  showSetup();
}

/* ---------- Setup ---------- */

function showSetup() {
  show($("#setup"));
  const builder = initBuilder({
    list: $("#questions-list"),
    addBtn: $("#add-question"),
    titleInput: $("#title-input"),
  });
  $("#title-input").focus();

  const last = storageGet(LAST_POLL_KEY);
  if (last) {
    const link = $("#resume-link");
    link.textContent = last;
    link.href = `?p=${encodeURIComponent(last)}`;
    show($("#resume"));
  }

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const poll = builder.collect();
    if (!poll.ok) {
      toast(poll.error);
      builder.focusQuestion(poll.index);
      return;
    }

    const btn = $("#start-btn");
    btn.disabled = true;
    btn.textContent = "Starting…";
    try {
      const code = await db.createPoll(state.uid, poll);
      history.replaceState(null, "", `?p=${code}`);
      show($("#setup"), false);
      startPoll(code, true);
    } catch (err) {
      console.error(err);
      toast(friendlyError(err), 6000);
      btn.disabled = false;
      btn.textContent = "Start poll";
    }
  });
}

/* ---------- Poll ---------- */

function startPoll(code, isOwner) {
  state.code = code;
  state.isOwner = isOwner;
  if (isOwner) storageSet(LAST_POLL_KEY, code);

  show($("#poll"));
  show($("#join-pill"));
  $("#code").textContent = code;
  $("#pill-code").textContent = code;

  const joinUrl = new URL(`join.html?p=${code}`, location.href).href;
  $("#join-url").textContent = joinUrl.replace(/^https?:\/\//, "");
  renderQr(joinUrl);

  // Viewers who don't own the poll (e.g. a second screen) get a read-only view
  show($("#controls"), isOwner);
  show($("#hint"), isOwner);
  show($("#prev-btn"), isOwner);
  show($("#next-btn"), isOwner);
  wireControls();

  db.watchMeta(code, (meta) => {
    state.meta = meta || {};
    if (!isOwner) syncViewerSubs();
    render();
  });
  db.watchQuestions(code, (questions) => { state.questions = questionList(questions); render(); });
  if (isOwner) {
    db.watchAnswers(code, (answers) => { state.answers = answers || {}; render(); }, onActionError);
    db.watchAllResponses(code, (responses) => { state.responses = responses || {}; render(); }, onActionError);
  }
}

/** Read-only viewers may read the current question's results only while shared or revealed. */
function syncViewerSubs() {
  const { current, shareResults, revealed } = state.meta;
  const key = `${current}|${shareResults === true}|${revealed === true}`;
  if (key === state.viewerSubs.key) return;
  state.viewerSubs.off.forEach((off) => off());
  state.viewerSubs = { key, off: [] };
  state.responses = {};
  state.answers = {};
  if (!current) return;
  const ignore = () => {}; // access ends when the presenter moves on
  if (shareResults === true) {
    state.viewerSubs.off.push(db.watchResponses(state.code, current, (r) => {
      state.responses = { [current]: r || {} };
      render();
    }, ignore));
  }
  if (revealed === true) {
    state.viewerSubs.off.push(db.watchAnswer(state.code, current, (a) => {
      state.answers = a ? { [current]: a } : {};
      render();
    }, ignore));
  }
}

function renderQr(url) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  $("#qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

const currentIndex = () => state.questions.findIndex((q) => q.id === state.meta?.current);

function render() {
  const meta = state.meta;
  if (!meta || !state.questions.length) return;

  document.title = meta.title ? `${meta.title} · Live Poll` : "Live Poll";
  const index = currentIndex();
  const q = state.questions[index];
  if (!q) return;

  const open = meta.open !== false;
  const revealed = meta.revealed === true;
  const responses = state.responses[q.id] || {};
  const key = state.answers[q.id] || null;

  $("#q-counter").textContent = `Question ${index + 1} of ${state.questions.length}`;
  $("#q-type").textContent = TYPES[q.type]?.hint || "";
  $("#q-text").textContent = q.text;
  show($("#closed-badge"), !open);
  show($("#shared-badge"), meta.shareResults === true);

  const canSeeResults = state.isOwner || meta.shareResults === true;
  const result = renderResults($("#results"), q, responses, {
    key: revealed ? key : null,
    hidden: meta.showResults === false || !canSeeResults,
    onDeleteText: state.isOwner ? (uid) => deleteText(q, uid) : null,
  });

  const count = canSeeResults ? result.total : null;
  $("#answer-count").textContent = count ?? "–";
  $("#answer-label").textContent = count === 1 ? "answer" : "answers";
  $("#stat-answers").textContent = count ?? "–";
  const people = new Set(Object.values(state.responses).flatMap((r) => Object.keys(r || {})));
  $("#stat-people").textContent = canSeeResults ? people.size : "–";

  const grades = revealed && key ? Object.values(responses).map((r) => isCorrect(q, key, r)) : [];
  $("#stat-correct").textContent = grades.length
    ? `${Math.round((grades.filter(Boolean).length / grades.length) * 100)}%`
    : "–";

  $("#prev-btn").disabled = index <= 0;
  $("#next-btn").disabled = index >= state.questions.length - 1;

  if (state.isOwner) {
    $("#open-btn").textContent = open ? "🔒 Close voting" : "🔓 Open voting";
    $("#show-btn").textContent = meta.showResults === false ? "👁 Show results" : "🙈 Hide results";
    $("#show-btn").classList.toggle("primary", meta.showResults === false);
    $("#share-btn").textContent = meta.shareResults ? "📱 Sharing: on" : "📱 Sharing: off";
    const quiz = isChoice(q) && !!state.answers[q.id];
    $("#reveal-btn").disabled = !quiz;
    $("#reveal-btn").title = quiz ? "" : "This question has no correct answer";
    $("#reveal-btn").textContent = revealed ? "✓ Hide answer" : "✓ Reveal answer";
  }

  renderNav(index);
}

function renderNav(index) {
  $("#question-nav").replaceChildren(...state.questions.map((q, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-item";
    btn.disabled = !state.isOwner;
    if (i === index) btn.setAttribute("aria-current", "true");
    const num = document.createElement("span");
    num.className = "nav-num";
    num.textContent = i + 1;
    const text = document.createElement("span");
    text.className = "nav-text";
    text.textContent = q.text;
    const count = document.createElement("span");
    count.className = "nav-count";
    const n = Object.keys(state.responses[q.id] || {}).length;
    count.textContent = state.isOwner ? n : "";
    count.title = `${n} ${n === 1 ? "answer" : "answers"}`;
    btn.append(num, text, count);
    btn.addEventListener("click", () => goTo(i));
    li.append(btn);
    return li;
  }));
}

function goTo(index) {
  const q = state.questions[index];
  if (!state.isOwner || !q || q.id === state.meta.current) return;
  db.goTo(state.code, q.id).catch(onActionError);
}

function deleteText(q, uid) {
  if (!confirm("Delete this answer? This cannot be undone.")) return;
  db.deleteResponse(state.code, q.id, uid).catch(onActionError);
}

/* ---------- Controls ---------- */

function wireControls() {
  if (!state.isOwner) return;

  $("#prev-btn").addEventListener("click", () => goTo(currentIndex() - 1));
  $("#next-btn").addEventListener("click", () => goTo(currentIndex() + 1));
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft") goTo(currentIndex() - 1);
    if (e.key === "ArrowRight") goTo(currentIndex() + 1);
  });

  const toggleMeta = (field, fallback, messages) => () => {
    const next = !(state.meta[field] ?? fallback);
    db.updateMeta(state.code, { [field]: next })
      .then(() => toast(messages[next ? 1 : 0]))
      .catch(onActionError);
  };

  $("#open-btn").addEventListener("click",
    toggleMeta("open", true, ["Voting closed", "Voting open"]));
  $("#show-btn").addEventListener("click",
    toggleMeta("showResults", true, ["Results hidden on this screen", "Results shown"]));
  $("#share-btn").addEventListener("click",
    toggleMeta("shareResults", false, ["Results no longer shared to phones", "Results shared to phones"]));
  $("#reveal-btn").addEventListener("click",
    toggleMeta("revealed", false, ["Answer hidden", "Answer revealed"]));

  $("#reset-btn").addEventListener("click", () => {
    const q = state.questions[currentIndex()];
    if (!q || !confirm("Delete all answers to this question? This cannot be undone.")) return;
    db.resetQuestion(state.code, q.id).then(() => toast("Answers cleared")).catch(onActionError);
  });

  $("#qr-btn").addEventListener("click", () => {
    const panel = $("#qr-panel");
    const hide = !panel.hidden;
    show(panel, !hide);
    $("#poll").classList.toggle("qr-hidden", hide);
    $("#qr-btn").textContent = hide ? "Show QR" : "Hide QR";
  });

  $("#fullscreen-btn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  $("#csv-btn").addEventListener("click", exportCsv);
}

function exportCsv() {
  // Participants are numbered in the order they first answered; the uid is never exported
  const all = state.questions.flatMap((q, i) =>
    Object.entries(state.responses[q.id] || {}).map(([uid, r]) => ({ q, i, uid, r })));
  const firstSeen = new Map();
  for (const { uid, r } of [...all].sort((a, b) => (a.r.ts || 0) - (b.r.ts || 0))) {
    if (!firstSeen.has(uid)) firstSeen.set(uid, `P${firstSeen.size + 1}`);
  }

  const rows = [["question_no", "question", "type", "participant", "answer", "correct", "answered_at"]];
  for (const { q, i, uid, r } of all.sort((a, b) => a.i - b.i || (a.r.ts || 0) - (b.r.ts || 0))) {
    const correct = isCorrect(q, state.answers[q.id], r);
    rows.push([
      i + 1,
      q.text,
      TYPES[q.type]?.label || q.type,
      firstSeen.get(uid),
      describeResponse(q, r),
      correct == null ? "" : correct ? "yes" : "no",
      r.ts ? new Date(r.ts).toISOString() : "",
    ]);
  }
  if (rows.length === 1) return toast("No answers to export yet.");

  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `livepoll-${state.code}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onActionError(err) {
  console.error(err);
  toast(friendlyError(err), 5000);
}

function friendlyError(err) {
  const msg = String(err?.code || err?.message || err);
  if (msg.includes("operation-not-allowed")) return "Enable Anonymous sign-in in Firebase Authentication.";
  if (msg.includes("unauthorized-domain")) return "Add this domain to Firebase Authentication → Authorized domains.";
  if (msg.includes("are-blocked")) return "This address is blocked by the API key's website restrictions in Google Cloud Console. See the README's troubleshooting table.";
  if (msg.toLowerCase().includes("permission")) return "Permission denied. Check that the combined database rules are published.";
  return "Something went wrong. Check the browser console for details.";
}
