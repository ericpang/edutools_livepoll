// Participant page: follow the presenter's current question, answer it, see shared results.

import * as db from "./db.js";
import { renderResults } from "./results.js";
import {
  TYPES, TEXT_MAX, optionsOf, validateAnswer, pickedOptions, isChoice, isCorrect, describeResponse,
} from "./questions.js";
import { initThemeToggle } from "./theme.js";
import { $, toast, show, pollCodeFromUrl } from "./ui.js";

const state = {
  code: null,
  uid: null,
  meta: null,
  questions: {},
  qid: null,          // question the answer form is built for
  mine: undefined,    // own response to the current question (undefined = still loading)
  selection: null,    // what's picked in the form: option id, Set of ids, number or text
  dirty: false,       // the form differs from the saved answer
  sending: false,
  responses: {},      // everyone's responses, while shared
  key: null,          // answer key, once revealed
  subs: { mine: null, results: { key: "", off: [] } },
};

initThemeToggle($("#theme-toggle"));
main().catch((err) => {
  console.error(err);
  showMessage("⚠️", "Couldn't connect", friendlyError(err));
});

async function main() {
  if (!db.isConfigured) {
    show($("#config-banner"));
    return;
  }

  const code = pollCodeFromUrl();
  if (!code) return showCodeForm();

  state.uid = await db.ready();
  const meta = await db.getMeta(code);
  if (!meta) return showMessage("🔍", "Poll not found", `There is no poll with the code ${code}. Check the code and try again.`, true);

  state.code = code;
  show($("#session"));
  $("#answer-form").addEventListener("submit", submit);

  db.watchMeta(code, (m) => { state.meta = m || {}; sync(); });
  db.watchQuestions(code, (qs) => { state.questions = qs || {}; sync(); });
}

function showCodeForm() {
  show($("#enter-code"));
  const input = $("#code-input");
  input.focus();
  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();
    if (code) location.search = `?p=${encodeURIComponent(code)}`;
  });
}

function showMessage(emoji, title, body, withCodeForm = false) {
  show($("#session"), false);
  show($("#message"));
  $("#message-emoji").textContent = emoji;
  $("#message-title").textContent = title;
  $("#message-body").textContent = body;
  if (withCodeForm) showCodeForm();
}

const currentQuestion = () => {
  const id = state.meta?.current;
  return id && state.questions[id] ? { id, ...state.questions[id] } : null;
};

/** Re-subscribe when the presenter moves on or changes what's shared, then render. */
function sync() {
  const q = currentQuestion();
  if (!q || !state.meta) return;

  if (q.id !== state.qid) {
    state.qid = q.id;
    state.mine = undefined;
    state.selection = q.type === "multi" ? new Set() : null;
    state.dirty = false;
    state.subs.mine?.();
    state.subs.mine = db.watchMyResponse(state.code, q.id, state.uid, (r) => {
      state.mine = r;
      if (!state.dirty) state.selection = selectionFrom(q, r);
      render();
    }, onActionError);
    buildForm(q);
  }

  const { shareResults, revealed } = state.meta;
  const key = `${q.id}|${shareResults === true}|${revealed === true}`;
  if (key !== state.subs.results.key) {
    state.subs.results.off.forEach((off) => off());
    state.subs.results = { key, off: [] };
    state.responses = {};
    state.key = null;
    const ignore = () => {}; // access ends when the presenter moves on
    if (shareResults === true) {
      state.subs.results.off.push(db.watchResponses(state.code, q.id, (r) => { state.responses = r || {}; render(); }, ignore));
    }
    if (revealed === true && q.quiz) {
      state.subs.results.off.push(db.watchAnswer(state.code, q.id, (a) => { state.key = a; render(); }, ignore));
    }
  }
  render();
}

function selectionFrom(q, r) {
  if (!r) return q.type === "multi" ? new Set() : null;
  if (q.type === "multi") return new Set(pickedOptions(r));
  if (q.type === "single") return r.choice;
  if (q.type === "rating") return r.rating;
  return r.text;
}

/* ---------- Answer form ---------- */

function buildForm(q) {
  const area = $("#answer-area");
  if (isChoice(q)) {
    const group = document.createElement("div");
    group.className = "choices";
    group.setAttribute("role", q.type === "single" ? "radiogroup" : "group");
    group.setAttribute("aria-label", "Answers");
    for (const o of optionsOf(q)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.dataset.id = o.id;
      btn.setAttribute("role", q.type === "single" ? "radio" : "checkbox");
      const badge = document.createElement("span");
      badge.className = "opt-letter";
      badge.textContent = o.letter;
      const label = document.createElement("span");
      label.className = "choice-label";
      label.textContent = o.label;
      const tick = document.createElement("span");
      tick.className = "choice-tick";
      tick.setAttribute("aria-hidden", "true");
      btn.append(badge, label, tick);
      btn.addEventListener("click", () => {
        if (q.type === "single") state.selection = o.id;
        else if (state.selection.has(o.id)) state.selection.delete(o.id);
        else state.selection.add(o.id);
        state.dirty = true;
        render();
      });
      group.append(btn);
    }
    area.replaceChildren(group);
  } else if (q.type === "rating") {
    const scale = document.createElement("div");
    scale.className = `scale scale-${q.scale}`;
    scale.setAttribute("role", "radiogroup");
    scale.setAttribute("aria-label", `Rating from 1 to ${q.scale}`);
    for (let n = 1; n <= q.scale; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scale-btn";
      btn.dataset.id = n;
      btn.setAttribute("role", "radio");
      btn.textContent = n;
      btn.addEventListener("click", () => { state.selection = n; state.dirty = true; render(); });
      scale.append(btn);
    }
    const ends = document.createElement("div");
    ends.className = "scale-ends";
    const low = document.createElement("span");
    low.textContent = q.low || "";
    const high = document.createElement("span");
    high.textContent = q.high || "";
    ends.append(low, high);
    area.replaceChildren(scale, ends);
  } else {
    const input = document.createElement("input");
    input.id = "text-answer";
    input.maxLength = TEXT_MAX;
    input.autocomplete = "off";
    input.placeholder = "Type your answer…";
    input.setAttribute("aria-label", "Your answer");
    const counter = document.createElement("div");
    counter.className = "input-meta";
    const count = document.createElement("span");
    count.id = "char-count";
    counter.append(count);
    input.addEventListener("input", () => {
      state.selection = input.value;
      state.dirty = true;
      render();
    });
    area.replaceChildren(input, counter);
  }
}

function render() {
  const q = currentQuestion();
  if (!q) return;
  const meta = state.meta;
  const open = meta.open !== false;
  const index = Object.values(state.questions).filter((x) => x.order < q.order).length;
  const key = meta.revealed === true ? state.key : null;

  document.title = `${meta.title || "Live Poll"} · Join`;
  $("#poll-title").textContent = meta.title || "";
  $("#q-counter").textContent = `Question ${index + 1} of ${Object.keys(state.questions).length}`;
  $("#q-text").textContent = q.text;
  $("#q-hint").textContent = TYPES[q.type]?.hint || "";

  // Reflect the selection, the correct answer and the open/closed state in the form
  const disabled = !open || state.sending;
  for (const btn of document.querySelectorAll("#answer-area [data-id]")) {
    const id = btn.dataset.id;
    const on = q.type === "multi" ? state.selection?.has(id) : String(state.selection ?? "") === id;
    btn.setAttribute("aria-checked", on ? "true" : "false");
    btn.disabled = disabled;
    btn.classList.toggle("correct", !!key?.[id]);
  }
  const text = $("#text-answer");
  if (text) {
    if (!state.dirty && document.activeElement !== text) text.value = state.selection || "";
    text.disabled = disabled;
    $("#char-count").textContent = `${text.value.length}/${TEXT_MAX}`;
  }

  const submitBtn = $("#submit-btn");
  submitBtn.disabled = disabled || (!!state.mine && !state.dirty);
  submitBtn.textContent = state.sending ? "Sending…" : state.mine ? "Update answer" : "Submit";
  show(submitBtn, open);

  const status = $("#status");
  status.className = "status";
  if (state.mine === undefined) {
    status.textContent = "";
  } else if (!open) {
    status.textContent = state.mine
      ? `🔒 Voting closed. Your answer: ${describeResponse(q, state.mine)}`
      : "🔒 Voting is closed for this question.";
  } else if (state.mine && !state.dirty) {
    status.className = "status ok";
    status.textContent = "✓ Answer sent. You can change it until voting closes.";
  } else {
    status.textContent = "";
  }

  // Quiz verdict once the answer is revealed
  const verdict = $("#verdict");
  const correct = key ? isCorrect(q, key, state.mine) : null;
  show(verdict, !!key);
  if (key) {
    const answer = optionsOf(q).filter((o) => key[o.id]).map((o) => `${o.letter}. ${o.label}`).join("; ");
    verdict.className = `verdict ${correct ? "right" : "wrong"}`;
    verdict.textContent = correct ? "🎉 Correct!" : state.mine ? `Not quite. The answer: ${answer}` : `The answer: ${answer}`;
  }

  const sharing = meta.shareResults === true;
  show($("#results-section"), sharing);
  if (sharing) renderResults($("#results"), q, state.responses, { key, mine: state.mine });
}

async function submit(e) {
  e.preventDefault();
  const q = currentQuestion();
  if (!q || state.sending) return;
  const input = q.type === "text" ? $("#text-answer").value : state.selection;
  const result = validateAnswer(q, input);
  if (!result.ok) return toast(result.error);

  state.sending = true;
  render();
  try {
    await db.setResponse(state.code, q.id, state.uid, result.answer);
    state.dirty = false;
    if (q.type === "text") state.selection = result.answer.text;
  } catch (err) {
    onActionError(err);
  } finally {
    state.sending = false;
    render();
  }
}

function onActionError(err) {
  console.error(err);
  toast(friendlyError(err), 5000);
}

function friendlyError(err) {
  const msg = String(err?.code || err?.message || err);
  if (msg.includes("operation-not-allowed")) return "The presenter needs to enable Anonymous sign-in in Firebase.";
  if (msg.includes("unauthorized-domain")) return "This site isn't authorised in Firebase yet.";
  if (msg.toLowerCase().includes("permission")) return "Your answer wasn't accepted. Voting may have closed or moved on.";
  return "Something went wrong. Check your connection and try again.";
}
