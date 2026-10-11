// Question types, validation and answer checks shared by both pages.

export const TYPES = {
  single: { label: "Single choice", hint: "Pick one answer" },
  multi: { label: "Multiple choice", hint: "Pick all that apply" },
  rating: { label: "Rating", hint: "Pick a number" },
  text: { label: "Short text", hint: "Type a short answer" },
};

export const MAX_QUESTIONS = 30;
export const QUESTION_MAX = 200;
export const OPTION_MAX = 80;
export const END_LABEL_MAX = 40;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const SCALES = [3, 5, 7, 10];
export const TEXT_MAX = 140;

export const isChoice = (q) => q?.type === "single" || q?.type === "multi";
export const letter = (i) => String.fromCharCode(65 + i);

// Kept deliberately short; the presenter can delete any text answer from the screen.
// Stems match at the start of a word (avoids flagging e.g. "Scunthorpe"); "fuck" matches anywhere.
const BLOCKED_STEMS = /^(shit|cunt|nigg|fagg|motherf)|fuck/;
const BLOCKED_WORDS = new Set(`
ass arse asshole arsehole bullshit bitch bastard bollocks cock dick dickhead piss prick pussy
slut whore wanker twat retard fag tits boobs
`.trim().split(/\s+/));

/** Trim and collapse all whitespace (including line breaks) to single spaces. */
export function normalizeLine(raw) {
  return String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function isBlocked(text) {
  return text
    .toLocaleLowerCase()
    .split(/[\s\-'.,!?;:()"]+/)
    .map((t) => t.replace(/[^\p{L}]/gu, ""))
    .some((t) => BLOCKED_WORDS.has(t) || BLOCKED_STEMS.test(t));
}

/** Options of a question as a sorted array of { id, label, order, letter }. */
export function optionsOf(q) {
  return Object.entries(q?.options || {})
    .map(([id, o]) => ({ id, ...o }))
    .sort((a, b) => a.order - b.order)
    .map((o, i) => ({ ...o, letter: letter(i) }));
}

/** Questions as a sorted array of { id, ...question }. */
export function questionList(questions) {
  return Object.entries(questions || {})
    .map(([id, q]) => ({ id, ...q }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Check a participant's answer against the question.
 * Returns { ok: true, answer } (the fields to store) or { ok: false, error }.
 */
export function validateAnswer(q, input) {
  switch (q.type) {
    case "single":
      if (!input || !q.options?.[input]) return { ok: false, error: "Pick an answer first." };
      return { ok: true, answer: { choice: input } };
    case "multi": {
      const picked = [...(input || [])].filter((id) => q.options?.[id]);
      if (!picked.length) return { ok: false, error: "Pick at least one answer." };
      return { ok: true, answer: { choices: Object.fromEntries(picked.map((id) => [id, true])) } };
    }
    case "rating": {
      const n = Number(input);
      if (!Number.isInteger(n) || n < 1 || n > q.scale) return { ok: false, error: "Pick a number first." };
      return { ok: true, answer: { rating: n } };
    }
    case "text": {
      const text = normalizeLine(input);
      if (!text) return { ok: false, error: "Write an answer first." };
      if (text.length > TEXT_MAX) return { ok: false, error: `Keep it to ${TEXT_MAX} characters or fewer.` };
      if (isBlocked(text)) return { ok: false, error: "Let's keep it friendly. Try rewording your answer." };
      return { ok: true, answer: { text } };
    }
    default:
      return { ok: false, error: "Unknown question type." };
  }
}

/** Option ids picked in a response, for choice questions. */
export function pickedOptions(response) {
  if (!response) return [];
  if (response.choice) return [response.choice];
  return Object.keys(response.choices || {});
}

/** True/false for a quiz response against the answer key ({ optId: true }); null if not gradable. */
export function isCorrect(q, key, response) {
  if (!isChoice(q) || !key || !response) return null;
  const picked = new Set(pickedOptions(response));
  const correct = Object.keys(key);
  return picked.size === correct.length && correct.every((id) => picked.has(id));
}

/** Human-readable answer, used in the CSV export and status messages. */
export function describeResponse(q, response) {
  if (!response) return "";
  if (q.type === "rating") return String(response.rating ?? "");
  if (q.type === "text") return response.text ?? "";
  const picked = new Set(pickedOptions(response));
  return optionsOf(q)
    .filter((o) => picked.has(o.id))
    .map((o) => `${o.letter}. ${o.label}`)
    .join("; ");
}
