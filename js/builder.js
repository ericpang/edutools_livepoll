// Question builder on the presenter's setup screen.
// The draft is kept in localStorage so a refresh doesn't lose the questions.

import {
  TYPES, SCALES, MAX_QUESTIONS, MIN_OPTIONS, MAX_OPTIONS,
  QUESTION_MAX, OPTION_MAX, END_LABEL_MAX, isChoice, letter, normalizeLine,
} from "./questions.js";
import { storageGet, storageSet } from "./ui.js";

const DRAFT_KEY = "livepollDraft";

const blankQuestion = (type = "single") => ({
  type,
  text: "",
  options: [{ label: "", correct: false }, { label: "", correct: false }, { label: "", correct: false }],
  scale: 5,
  low: "",
  high: "",
});

const clone = (q) => JSON.parse(JSON.stringify(q));

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function iconButton(text, title, onClick) {
  const btn = el("button", { type: "button", className: "icon-btn small", textContent: text, title });
  btn.setAttribute("aria-label", title);
  btn.addEventListener("click", onClick);
  return btn;
}

export function initBuilder({ list, addBtn, titleInput }) {
  let draft;
  try { draft = JSON.parse(storageGet(DRAFT_KEY) || "null"); } catch { draft = null; }
  const state = {
    title: typeof draft?.title === "string" ? draft.title : "",
    questions: Array.isArray(draft?.questions) && draft.questions.length ? draft.questions : [blankQuestion()],
  };

  const save = () => storageSet(DRAFT_KEY, JSON.stringify(state));

  titleInput.value = state.title;
  titleInput.addEventListener("input", () => { state.title = titleInput.value; save(); });

  addBtn.addEventListener("click", () => {
    const last = state.questions[state.questions.length - 1];
    state.questions.push(blankQuestion(last?.type));
    render();
    save();
    list.lastElementChild?.querySelector(".q-text")?.focus();
  });

  function render() {
    list.replaceChildren(...state.questions.map((q, i) => card(q, i)));
    addBtn.disabled = state.questions.length >= MAX_QUESTIONS;
  }

  function card(q, index) {
    const count = state.questions.length;
    const move = (to) => {
      const [item] = state.questions.splice(index, 1);
      state.questions.splice(to, 0, item);
      render();
      save();
    };

    const typeSelect = el("select", { className: "q-type" },
      ...Object.entries(TYPES).map(([value, t]) => el("option", { value, textContent: t.label, selected: q.type === value })));
    typeSelect.setAttribute("aria-label", "Question type");
    typeSelect.addEventListener("change", () => {
      q.type = typeSelect.value;
      if (q.type === "single") {
        // Single choice allows one correct answer: keep the first tick only
        let seen = false;
        for (const o of q.options) { if (o.correct && seen) o.correct = false; seen ||= o.correct; }
      }
      render();
      save();
    });

    const up = iconButton("↑", "Move up", () => move(index - 1));
    const down = iconButton("↓", "Move down", () => move(index + 1));
    const dup = iconButton("⧉", "Duplicate", () => {
      state.questions.splice(index + 1, 0, clone(q));
      render();
      save();
    });
    const del = iconButton("✕", "Delete question", () => {
      state.questions.splice(index, 1);
      render();
      save();
    });
    up.disabled = index === 0;
    down.disabled = index === count - 1;
    dup.disabled = count >= MAX_QUESTIONS;
    del.disabled = count <= 1;

    const text = el("input", {
      className: "q-text", maxLength: QUESTION_MAX, value: q.text, autocomplete: "off",
      placeholder: q.type === "rating" ? "How confident do you feel about today's topic?" : "Type your question",
    });
    text.setAttribute("aria-label", `Question ${index + 1}`);
    text.addEventListener("input", () => { q.text = text.value; save(); });

    const head = el("div", { className: "q-head" },
      el("span", { className: "q-num", textContent: `Q${index + 1}` }),
      typeSelect,
      el("div", { className: "q-actions" }, up, down, dup, del));

    return el("li", { className: "q-card" }, head, text, body(q));
  }

  function body(q) {
    if (isChoice(q)) return choiceBody(q);
    if (q.type === "rating") return ratingBody(q);
    return el("p", { className: "q-hint", textContent: "Participants type a short answer (up to 140 characters)." });
  }

  function choiceBody(q) {
    const wrap = el("div", { className: "q-body" });
    const options = el("ol", { className: "q-options" });
    const correctType = q.type === "single" ? "radio" : "checkbox";
    const group = `correct-${Math.random().toString(36).slice(2)}`;

    q.options.forEach((o, i) => {
      const input = el("input", { maxLength: OPTION_MAX, value: o.label, placeholder: `Option ${letter(i)}`, autocomplete: "off" });
      input.setAttribute("aria-label", `Option ${letter(i)}`);
      input.addEventListener("input", () => { o.label = input.value; save(); });

      const tick = el("input", { type: correctType, name: group, checked: o.correct });
      tick.addEventListener("click", () => {
        // A ticked radio can be clicked again to clear it, so a question can stop being a quiz
        if (q.type === "single") {
          const was = o.correct;
          q.options.forEach((x) => { x.correct = false; });
          o.correct = !was;
          tick.checked = o.correct;
        } else {
          o.correct = tick.checked;
        }
        save();
      });
      const correct = el("label", { className: "correct-toggle", title: "Correct answer" }, tick, el("span", { textContent: "✓" }));

      const remove = iconButton("✕", "Remove option", () => {
        q.options.splice(i, 1);
        render();
        save();
      });
      remove.disabled = q.options.length <= MIN_OPTIONS;

      options.append(el("li", {}, el("span", { className: "opt-letter", textContent: letter(i) }), input, correct, remove));
    });

    const add = el("button", { type: "button", className: "btn small", textContent: "＋ Add option" });
    add.disabled = q.options.length >= MAX_OPTIONS;
    add.addEventListener("click", () => {
      q.options.push({ label: "", correct: false });
      render();
      save();
    });

    wrap.append(options, el("div", { className: "q-foot" },
      add, el("small", { className: "muted", textContent: "Tick ✓ the correct answer to make it a quiz question" })));
    return wrap;
  }

  function ratingBody(q) {
    const scale = el("select", {},
      ...SCALES.map((n) => el("option", { value: n, textContent: `1 – ${n}`, selected: q.scale === n })));
    scale.addEventListener("change", () => { q.scale = Number(scale.value); save(); });

    const endLabel = (field, placeholder, caption) => {
      const input = el("input", { maxLength: END_LABEL_MAX, value: q[field], placeholder, autocomplete: "off" });
      input.addEventListener("input", () => { q[field] = input.value; save(); });
      return el("label", {}, caption, input);
    };

    return el("div", { className: "q-body rating-setup" },
      el("label", {}, "Scale", scale),
      endLabel("low", "Not at all", "Label for 1 (optional)"),
      endLabel("high", "Very", "Label for the top (optional)"));
  }

  /**
   * Turn the draft into database objects.
   * Returns { ok: true, title, questions, answers } or { ok: false, error, index }.
   */
  function collect() {
    const title = normalizeLine(state.title);
    if (!title) return { ok: false, error: "Give the poll a title.", index: -1 };

    const questions = {};
    const answers = {};
    for (const [i, q] of state.questions.entries()) {
      const text = normalizeLine(q.text);
      if (!text) return { ok: false, error: `Question ${i + 1} needs some text.`, index: i };
      const id = `q${i + 1}`;
      const out = { order: i, type: q.type, text };

      if (isChoice(q)) {
        const options = q.options
          .map((o) => ({ label: normalizeLine(o.label), correct: o.correct }))
          .filter((o) => o.label);
        if (options.length < MIN_OPTIONS) {
          return { ok: false, error: `Question ${i + 1} needs at least ${MIN_OPTIONS} options.`, index: i };
        }
        out.options = {};
        const key = {};
        options.forEach((o, n) => {
          out.options[`o${n + 1}`] = { label: o.label, order: n };
          if (o.correct) key[`o${n + 1}`] = true;
        });
        if (Object.keys(key).length) {
          out.quiz = true;
          answers[id] = key;
        }
      } else if (q.type === "rating") {
        out.scale = SCALES.includes(q.scale) ? q.scale : 5;
        const low = normalizeLine(q.low);
        const high = normalizeLine(q.high);
        if (low) out.low = low;
        if (high) out.high = high;
      }
      questions[id] = out;
    }
    return { ok: true, title, questions, answers };
  }

  function focusQuestion(index) {
    if (index < 0) return titleInput.focus();
    list.children[index]?.querySelector(".q-text")?.focus();
  }

  render();
  return { collect, focusQuestion };
}
