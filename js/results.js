// Tallying and rendering of results, shared by the presenter screen and phones.

import { optionsOf, pickedOptions, isChoice } from "./questions.js";

/**
 * Count responses to a question.
 * Choice and rating questions return { total, rows: [{ id, letter, label, count }], average? };
 * text questions return { total, texts: [{ uid, text, ts }] } newest first.
 */
export function tally(q, responses) {
  const list = Object.entries(responses || {});
  const total = list.length;

  if (q.type === "text") {
    const texts = list
      .filter(([, r]) => typeof r.text === "string")
      .map(([uid, r]) => ({ uid, text: r.text, ts: r.ts || 0 }))
      .sort((a, b) => b.ts - a.ts);
    return { total, texts };
  }

  if (q.type === "rating") {
    const counts = Array(q.scale).fill(0);
    let sum = 0;
    for (const [, r] of list) {
      if (Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= q.scale) { counts[r.rating - 1]++; sum += r.rating; }
    }
    const rows = counts.map((count, i) => ({
      id: String(i + 1),
      letter: String(i + 1),
      label: i === 0 ? q.low || "" : i === q.scale - 1 ? q.high || "" : "",
      count,
    }));
    return { total, rows, average: total ? sum / total : null };
  }

  const counts = {};
  for (const [, r] of list) for (const id of pickedOptions(r)) counts[id] = (counts[id] || 0) + 1;
  const rows = optionsOf(q).map((o) => ({ id: o.id, letter: o.letter, label: o.label, count: counts[o.id] || 0 }));
  return { total, rows };
}

const pct = (count, total) => (total ? Math.round((count / total) * 100) : 0);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Render results into `container`.
 * @param {object} opts
 * @param {Record<string,true>|null} opts.key   revealed answer key, or null
 * @param {object|null} opts.mine              the viewer's own response (participants)
 * @param {boolean} opts.hidden                show only the answer count
 * @param {(uid:string)=>void} [opts.onDeleteText] presenter: delete a text answer
 */
export function renderResults(container, q, responses, { key = null, mine = null, hidden = false, onDeleteText } = {}) {
  const result = tally(q, responses);

  if (hidden) {
    container.dataset.sig = "hidden";
    container.className = "results hidden-results";
    container.replaceChildren(
      el("span", "hidden-icon", "🙈"),
      el("strong", null, "Results hidden"),
      el("small", null, `${result.total} ${result.total === 1 ? "answer" : "answers"} so far`),
    );
    return result;
  }

  if (q.type === "text") {
    renderTexts(container, q, result, onDeleteText);
    return result;
  }

  // Rebuild rows only when the question or its options change, so bar widths animate between updates
  const sig = `${q.id}|${q.type}|${result.rows.map((r) => r.id + r.label).join(",")}`;
  if (container.dataset.sig !== sig) {
    container.dataset.sig = sig;
    container.className = `results bars ${q.type}`;
    container.replaceChildren(...result.rows.map((row) => buildRow(row)));
    if (q.type === "rating") container.prepend(el("p", "average"));
  }

  const picked = new Set(q.type === "rating" ? (mine ? [String(mine.rating)] : []) : pickedOptions(mine));
  const rowEls = container.querySelectorAll(".bar-row");
  result.rows.forEach((row, i) => {
    const node = rowEls[i];
    const share = pct(row.count, result.total);
    const correct = isChoice(q) && key ? key[row.id] === true : false;
    node.classList.toggle("correct", correct);
    node.classList.toggle("dim", isChoice(q) && !!key && !correct);
    node.classList.toggle("mine", picked.has(row.id));
    node.querySelector(".bar-fill").style.width = `${share}%`;
    node.querySelector(".bar-count").textContent = row.count;
    node.querySelector(".bar-pct").textContent = `${share}%`;
    const name = row.label ? `${row.letter}. ${row.label}` : row.letter;
    node.title = `${name}: ${row.count} of ${result.total} (${share}%)${correct ? " · correct answer" : ""}`;
  });

  const avg = container.querySelector(".average");
  if (avg) {
    avg.replaceChildren(
      el("span", null, "Average "),
      el("strong", null, result.average == null ? "–" : result.average.toFixed(1)),
      el("span", null, ` / ${q.scale}`),
    );
  }
  return result;
}

function buildRow(row) {
  const node = el("div", "bar-row");
  const label = el("div", "bar-label");
  label.append(el("span", "opt-letter", row.letter));
  if (row.label) label.append(el("span", "opt-text", row.label));
  label.append(el("span", "correct-mark", "✓ Correct"), el("span", "you-badge", "You"));

  const line = el("div", "bar-line");
  const track = el("div", "bar-track");
  track.append(el("div", "bar-fill"));
  const value = el("div", "bar-value");
  value.append(el("strong", "bar-count", "0"), el("span", "bar-pct", "0%"));
  line.append(track, value);

  node.append(label, line);
  return node;
}

const seenTexts = new WeakMap();

function renderTexts(container, q, { texts }, onDeleteText) {
  const sig = `${q.id}|text`;
  const fresh = container.dataset.sig !== sig;
  container.dataset.sig = sig;
  container.className = "results texts";
  const seen = fresh ? new Set() : seenTexts.get(container) || new Set();

  if (!texts.length) {
    container.replaceChildren(el("p", "results-empty", "No answers yet"));
    seenTexts.set(container, seen);
    return;
  }

  container.replaceChildren(...texts.map(({ uid, text }) => {
    const card = el("article", "text-card");
    if (!fresh && !seen.has(uid + text)) card.classList.add("pop");
    card.append(el("p", null, text));
    if (onDeleteText) {
      const del = el("button", "note-action", "🗑");
      del.type = "button";
      del.title = "Delete this answer";
      del.setAttribute("aria-label", "Delete this answer");
      del.addEventListener("click", () => onDeleteText(uid));
      card.append(del);
    }
    return card;
  }));
  seenTexts.set(container, new Set(texts.map((t) => t.uid + t.text)));
}
