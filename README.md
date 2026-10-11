# Live Poll

A real-time poll for classrooms, workshops and meetings.
The presenter puts a question and a QR code on the screen; participants scan it
with their phones and answer; a live chart of the results grows on the
projector as the answers come in.

Use it for quick checks for understanding, quiz questions, opinion polls,
"rate your confidence 1–5" exit tickets, or collecting one-line answers.

- **Hosted for free on GitHub Pages**: static HTML, CSS and JS with no build step
- **Real-time sync** through Firebase Realtime Database (free Spark plan), sharing the **same database** as Live Word Cloud and Live Pin Board. No new Firebase project or database is needed
- **Four question types**: single choice, multiple choice, rating scale and short text
- **Question sets**: prepare several questions and step through them one at a time
- **Quiz mode**: mark the correct answer and reveal it when you are ready
- **You control what the class sees**: hide results on the projector, share them to phones, close voting
- **Day and night themes** that follow the device setting, with a manual toggle
- **QR code join**: no app install and no participant login

> Items marked *(planned)* in the [Roadmap](#roadmap) are not built yet.

---

## Table of contents

1. [How it works](#how-it-works)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Data model](#data-model)
6. [Security rules](#security-rules)
7. [Setup](#setup)
8. [Deploying to GitHub Pages](#deploying-to-github-pages)
9. [Using the app](#using-the-app)
10. [Theming](#theming)
11. [Answer rules](#answer-rules)
12. [Limits and troubleshooting](#limits-and-troubleshooting)
13. [Roadmap](#roadmap)

---

## How it works

GitHub Pages only serves static files, so a hosted real-time database receives
and shares the answers. Every browser connects directly to Firebase:

```
 ┌──────────────────────┐          ┌──────────────────────────┐
 │  Presenter screen    │          │  Participant phones      │
 │  index.html          │          │  join.html?p=ABC123      │
 │  - question + QR     │          │  - current question      │
 │  - live results      │          │  - answer form           │
 │  - next / close /    │          │  - results (if shared)   │
 │    reveal controls   │          │                          │
 └─────────┬────────────┘          └────────────┬─────────────┘
           │  questions + controls              │  one answer per question
           ▼                                    ▼
      ┌─────────────────────────────────────────────────┐
      │      Firebase Realtime Database (free tier)     │
      │  /polls/ABC123/{meta, questions, answers,       │
      │                 responses}                      │
      └─────────────────────────────────────────────────┘
                 ▲
                 │  static files only
      ┌──────────┴──────────┐
      │    GitHub Pages     │
      └─────────────────────┘
```

1. The presenter opens the site, writes one or more questions and clicks
   **Start poll**. The app generates a 6-character code (for example `ABC123`)
   and a QR code pointing to `https://<user>.github.io/<repo>/join.html?p=ABC123`.
2. Participants scan the QR code (or type the code). Their phone always shows
   the question the presenter is on.
3. Each answer is written to `/polls/ABC123/responses/<question>/<participant>`,
   so each person has exactly one answer per question.
4. The presenter's screen counts the answers and redraws the chart within about a second.
5. When the presenter clicks **Next**, every phone switches to the next question.

### How it differs from the other EduTools apps

| | Word Cloud | Pin Board | Live Poll |
| --- | --- | --- | --- |
| What people send | 1–3 words | A short note | A choice, a rating or a short answer |
| What the screen shows | Words sized by frequency | Every note as a card | A bar chart (or answer cards for text) |
| Questions per session | One topic | One prompt | A set of questions, shown one at a time |
| Right answers | — | — | Optional, revealed by the presenter |

---

## Features

### Presenter view (`index.html`)
- Build a **poll** with a title and 1–30 questions. Each question has one of four types:
  - **Single choice**: 2–8 options, pick one (A, B, C…)
  - **Multiple choice**: 2–8 options, pick any number
  - **Rating**: a scale from 1 to 3, 5, 7 or 10, with optional labels for the two ends (for example *Not confident* / *Very confident*)
  - **Short text**: a free answer of up to 140 characters
- For choice questions, optionally tick the **correct answer(s)** to make it a quiz question
- Reorder, duplicate and delete questions before starting
- Large QR code and join code, with a toggle to hide the QR once everyone has joined
- **One question at a time** on screen, with **Previous / Next** and a question list to jump to any question
- Live results:
  - Choice questions: horizontal **bar chart** with counts and percentages
  - Rating: a bar per score, plus the **average**
  - Short text: answer **cards**, newest first, which the presenter can delete
- Live counter of answers for the current question and of participants overall
- Controls:
  - **Close or open voting** for the current question. Moving to a question opens it automatically
  - **Hide results** on the projector (only the answer count shows) to avoid influencing people, then **Show results**
  - **Share results to phones** on or off
  - **Reveal answer** for quiz questions: the correct bar turns green on screen and on phones
  - **Reset** the answers to the current question
  - **Export** every answer to CSV
  - **Fullscreen** mode for projectors
- Day and night theme toggle

### Participant view (`join.html`)
- Mobile-first layout with large tap targets
- Always shows the presenter's **current question**; changes on its own when the presenter moves on
- Answer once per question and **change the answer** while voting is open
- Clear status: *Answer sent*, *Voting closed*, *Waiting for the next question*
- Sees the **results** on the phone when the presenter shares them, with their own choice marked
- Sees whether they got a quiz question **right** once the presenter reveals the answer
- Follows the phone's light or dark setting automatically

---

## Tech stack

| Concern            | Choice                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Hosting            | GitHub Pages                                                           |
| Real-time backend  | Firebase Realtime Database + Anonymous Auth (modular JS SDK via CDN), shared with Live Word Cloud and Live Pin Board |
| Charts             | Plain HTML and CSS bars, no chart library                              |
| QR code            | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) |
| UI                 | Plain HTML, CSS custom properties and ES modules, with no framework or build step |

All libraries load from CDNs with pinned versions, so the repo stays plain
static files that GitHub Pages can serve directly.

---

## Project structure

```
LivePoll/
├── index.html              # Presenter: build questions, QR code, live results, controls
├── join.html               # Participant: answer the current question, see shared results
├── css/
│   └── styles.css          # Layout, question builder, result bars, light/dark theme tokens
├── js/
│   ├── firebase-config.js  # Same Firebase project config as Word Cloud and Pin Board
│   ├── db.js               # Firebase init, auth, read/write helpers for /polls
│   ├── builder.js          # Question builder on the setup screen
│   ├── present.js          # Presenter logic: start/resume poll, navigation, controls, export
│   ├── join.js             # Participant logic: answer forms, status, shared results
│   ├── results.js          # Shared tallying and rendering of results
│   ├── questions.js        # Question types, validation, answer checks, profanity filter
│   ├── theme.js            # Day/night toggle, persisted in localStorage (from Pin Board)
│   └── ui.js               # Small DOM helpers (toast, storage, URL params) (from Pin Board)
├── assets/
│   └── favicon.svg
├── database.rules.json     # Combined rules for Word Cloud + Pin Board + Live Poll (see below)
├── .github/workflows/
│   └── pages.yml           # Deploys the site to GitHub Pages on push
├── .nojekyll               # Serve files as-is on GitHub Pages
└── README.md
```

`theme.js`, `ui.js` and the look of the pages come from Pin Board so the three
apps look and behave the same.

---

## Data model

The Spark plan allows only one Realtime Database per project, so all three apps
live in the same database, side by side under different top-level nodes:

```
edutools-7c110-default-rtdb
├── sessions/   ← Live Word Cloud (unchanged)
├── boards/     ← Live Pin Board (unchanged)
└── polls/      ← Live Poll (new)
```

Live Poll only reads and writes under `polls`, so it never touches the other
apps' data. Poll codes are separate from session and board codes, so `ABC123`
can exist in all three apps without clashing.

```jsonc
{
  "polls": {
    "ABC123": {
      "meta": {
        "title": "Photosynthesis check-in",
        "owner": "<presenter anonymous uid>",
        "current": "q2",              // the question everyone sees now
        "open": true,                 // false = voting closed on the current question
        "showResults": true,          // false = projector shows only the answer count
        "shareResults": false,        // true = phones see the results of the current question
        "revealed": false,            // true = correct answer of the current question is shown
        "createdAt": 1760000000000
      },
      "questions": {
        "q1": {
          "order": 0,
          "type": "single",           // "single" | "multi" | "rating" | "text"
          "text": "Which gas do plants take in?",
          "options": {
            "o1": { "label": "Oxygen",         "order": 0 },
            "o2": { "label": "Carbon dioxide", "order": 1 },
            "o3": { "label": "Nitrogen",       "order": 2 }
          },
          "quiz": true                // has a correct answer in /answers
        },
        "q2": {
          "order": 1,
          "type": "rating",
          "text": "How confident do you feel about today's topic?",
          "scale": 5,
          "low": "Not at all",        // optional end labels
          "high": "Very"
        },
        "q3": { "order": 2, "type": "text", "text": "One word to describe chlorophyll?" }
      },
      "answers": {                    // answer key, hidden until revealed
        "q1": { "o2": true }
      },
      "responses": {
        "q1": {
          "<uid>": { "choice": "o2", "ts": 1760000001234 }
        },
        "q2": {
          "<uid>": { "rating": 4, "ts": 1760000005678 }
        },
        "q3": {
          "<uid>": { "text": "Green", "ts": 1760000009012 }
        }
        // multiple choice: { "choices": { "o1": true, "o3": true }, "ts": … }
      }
    }
  }
}
```

- Each response is keyed by the participant's anonymous `uid`, so a person has
  at most one answer per question and changing it simply overwrites it.
- Results are counted in the browser from `responses`; no counters are stored,
  so they can't drift or be faked.
- The answer key lives in its own `answers` node rather than inside `questions`.
  Database rules cannot hide individual fields, so this is the only way to stop
  a curious student from finding the right answer in the browser's developer tools
  before it is revealed.

---

## Security rules

The rules live in `database.rules.json`. They enforce:

| Who | Can do |
| --- | --- |
| Anyone | Read `meta` and `questions` |
| Anyone signed in | Read `answers/<q>` only while `<q>` is the current question **and** `revealed` is true |
| Anyone signed in | Read all `responses/<q>` only while `<q>` is the current question **and** `shareResults` is true |
| A participant | Read **their own** response to any question |
| A participant | Write or delete **their own** response (`responses/<q>/<their uid>`) only for the current question while `open` is true. The answer must match the question type: a choice that exists, a set of choices that exist, a whole number within the scale, or text of 1–140 characters. The timestamp must be server time |
| The presenter (owner) | Everything on their poll: edit `meta`, `questions` and `answers`, read every response, delete a response, reset a question |

> **Important: one rules file for all three apps.** Word Cloud, Pin Board and
> Live Poll share one Firebase project, and Firebase has only one set of rules
> per database. Publishing Live Poll's rules on their own would delete the other
> apps' rules. `database.rules.json` therefore contains the `sessions`, `boards`
> **and** `polls` blocks, and the same file is kept in all three project folders.
> Always publish the combined file.

---

## Setup

Because Live Poll reuses the Firebase project created for Live Word Cloud,
most of the setup is already done. Do **not** create a second database.

1. **Firebase project and database**: already exist (`edutools-7c110`, Realtime
   Database in `asia-southeast1`). Anonymous sign-in is already enabled.
2. **Config**: `js/firebase-config.js` uses the same values as the other two apps.
3. **Rules**: paste the combined `database.rules.json` into
   **Realtime Database → Rules** and click Publish. The same combined file is
   also copied to `WordCloud/database.rules.json` and `PinBoard/database.rules.json`,
   so publishing from any of the three projects is safe.
4. **Run locally**: ES modules do not load from `file://` URLs, so serve the folder over HTTP:

   ```bash
   # any one of these
   npx serve .
   python -m http.server 8080
   ```

   Open <http://localhost:8080>. To test from a phone on the same Wi-Fi, use your
   computer's LAN IP address instead of `localhost`, for example `http://192.168.1.20:8080`.

---

## Deploying to GitHub Pages

1. Push the project to a GitHub repository, for example `LivePoll`.
2. In the repo, open **Settings → Pages** and set *Source* to **GitHub Actions**.
   The included workflow (`.github/workflows/pages.yml`) publishes the site on every push to `main`.
3. The site will be live at `https://<your-username>.github.io/LivePoll/`.
4. In Firebase, **Authentication → Settings → Authorized domains** must include
   `<your-username>.github.io`. If you already added it for the other apps, nothing more is needed.

---

## Using the app

**Presenter**
1. Open the site on the computer connected to the projector.
2. Give the poll a title and add your questions. For a quiz question, tick the correct option(s).
3. Click **Start poll** and leave the QR code on screen while people join.
4. Watch the answers arrive. Use **Hide results** if you don't want early answers to sway the class.
5. Click **Close voting**, then **Reveal answer** for quiz questions, and discuss.
6. Click **Next** for the following question.
7. When you are done, click **Export CSV**.

**Participants**
1. Scan the QR code, or go to the site and enter the 6-character code.
2. Answer the question on screen and tap **Submit**. You can change your answer until voting closes.
3. Wait for the next question; your phone moves on by itself.

Polls persist, so the presenter can refresh or reopen `index.html?p=ABC123` in
the same browser and keep control of the poll. Opening that link in another
browser gives a read-only view.

---

## Theming

Theming works exactly as in the other apps: CSS custom properties, a
`data-theme` attribute on `<html>`, following the OS setting until the ☀️/🌙
toggle overrides it (saved in `localStorage`).

Result bars use the accent colour; a revealed correct answer is green and the
participant's own choice is outlined, so the meaning never relies on colour alone
(correct answers also get a ✓).

---

## Answer rules

`js/questions.js` checks every answer before it is saved, and the database rules
check it again:

1. **One answer per person per question**, which can be changed while voting is open.
2. **Choices** must be options of the question; a single-choice answer has exactly one.
3. **Ratings** are whole numbers from 1 to the question's scale.
4. **Short text** is trimmed, 1–140 characters, single line, and passes the same
   small profanity blocklist as the other apps. The presenter can delete any text
   answer from the screen.
5. Answers are **anonymous**. The anonymous `uid` is never displayed; the CSV export
   numbers participants as *P1, P2, …* instead.

---

## Limits and troubleshooting

**Firebase Spark (free) plan limits** are shared by all three apps:

| Limit                  | Value       | What it means in practice               |
| ---------------------- | ----------- | --------------------------------------- |
| Simultaneous connections | 100       | About 99 phones plus 1 presenter, across **all three** apps at the same moment |
| Storage                | 1 GB        | Millions of answers                      |
| Download               | 10 GB/month | Fine for regular class use               |

Participants stay connected for the whole poll so their phone can follow the
presenter. For larger audiences, upgrade to the pay-as-you-go **Blaze** plan.

| Problem | Fix |
| ------- | --- |
| Word Cloud or Pin Board stopped working after setting up Live Poll | Rules were published without their blocks. Publish the combined `database.rules.json` |
| `auth/operation-not-allowed` | Enable **Anonymous** sign-in in Firebase Authentication |
| Works locally but not on GitHub Pages | Add `<user>.github.io` to Firebase **Authorized domains** |
| `auth/requests-from-referer-…-are-blocked` | The API key has website restrictions. In Google Cloud Console → **APIs & Services → Credentials**, open the browser API key and add the address under **Website restrictions**, for example `http://localhost:8080/*` or your LAN IP. Keep the existing entries |
| `PERMISSION_DENIED` when answering | Voting is closed, the presenter has moved to another question, or the answer is invalid |
| Phones don't show results | The presenter hasn't turned on **Share results** |
| Blank page, module errors in console | You opened the file via `file://`; serve it over HTTP |

---

## Roadmap

- [ ] *(planned)* Add or edit questions while a poll is running
- [ ] *(planned)* Countdown timer that closes voting automatically
- [ ] *(planned)* Save a question set as a template and reuse it in a new poll
- [ ] *(planned)* Leaderboard for quiz polls (optional names)
- [ ] *(planned)* Word cloud view for short-text answers
- [ ] *(planned)* Ranking and image-choice question types
- [ ] Optional presenter PIN for reclaiming a poll from another device
- [ ] Automatic cleanup of polls older than 30 days

---

## License

MIT
