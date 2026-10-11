// Firebase initialisation and all database reads/writes.
// Live Poll shares the Word Cloud / Pin Board database; everything here lives under /polls.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes("YOUR_"));

let auth, db;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

/**
 * Sign in anonymously. Firebase persists the anonymous user in this browser and
 * returns the same one on later visits, so the presenter keeps ownership on refresh.
 */
export async function ready() {
  const { user } = await signInAnonymously(auth);
  return user.uid;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const pollRef = (code, path = "") => ref(db, `polls/${code}${path ? "/" + path : ""}`);

/**
 * Create a poll. `meta` is written first because the rules for `questions` and
 * `answers` check the poll's owner, which must already exist.
 */
export async function createPoll(uid, { title, questions, answers }) {
  const first = Object.entries(questions).sort((a, b) => a[1].order - b[1].order)[0][0];
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    if ((await get(pollRef(code, "meta"))).exists()) continue;
    await set(pollRef(code, "meta"), {
      title, owner: uid, current: first,
      open: true, showResults: true, shareResults: false, revealed: false,
      createdAt: serverTimestamp(),
    });
    await update(pollRef(code), { questions, answers });
    return code;
  }
  throw new Error("Could not allocate a poll code. Please try again.");
}

export async function getMeta(code) {
  const snap = await get(pollRef(code, "meta"));
  return snap.exists() ? snap.val() : null;
}

/* ---------- Subscriptions (each returns an unsubscribe function) ---------- */

const watch = (path) => (code, callback, onError) =>
  onValue(pollRef(code, path), (snap) => callback(snap.val()), onError);

export const watchMeta = watch("meta");
export const watchQuestions = watch("questions");

/** Presenter: the whole answer key. */
export const watchAnswers = watch("answers");

/** Presenter: every response to every question. */
export const watchAllResponses = watch("responses");

/** Anyone: the answer key of the current question, once revealed. */
export const watchAnswer = (code, qid, callback, onError) => watch(`answers/${qid}`)(code, callback, onError);

/** Anyone: all responses to the current question, while results are shared. */
export const watchResponses = (code, qid, callback, onError) => watch(`responses/${qid}`)(code, callback, onError);

/** Participant: their own response to a question. */
export const watchMyResponse = (code, qid, uid, callback, onError) =>
  watch(`responses/${qid}/${uid}`)(code, callback, onError);

/* ---------- Participant writes ---------- */

export const setResponse = (code, qid, uid, answer) =>
  set(pollRef(code, `responses/${qid}/${uid}`), { ...answer, ts: serverTimestamp() });

/* ---------- Presenter writes ---------- */

export const updateMeta = (code, fields) => update(pollRef(code, "meta"), fields);

/** Move everyone to a question; it opens for answers and its answer starts hidden. */
export const goTo = (code, qid) => updateMeta(code, { current: qid, open: true, revealed: false });

export const deleteResponse = (code, qid, uid) => remove(pollRef(code, `responses/${qid}/${uid}`));

export const resetQuestion = (code, qid) => remove(pollRef(code, `responses/${qid}`));
