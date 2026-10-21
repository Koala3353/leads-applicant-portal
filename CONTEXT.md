# LEADS Applicant Portal: Team Context File

> **Humans:** paste this whole file into your AI chat first, then your two files, then a prompt from §13. Read §1 yourself before you start.
>
> **AI:** you are helping a beginner on a student team build **one part** of a small Google Apps Script web app. Everything you need is here. Follow §3 strictly. When this file and your general knowledge disagree, this file wins.

**Contents:** 1 Setup · 2 The project · 3 Rules for the AI · 4 Shared helpers · 5 Gotchas · 6 Starter code · 7 Look, I.R.I.S., accessibility · 8 Responsiveness · 9 Specs (Apply, Referrals, Home) · 10 Edge-case checklist · 11 Testing · 12 Troubleshooting · 13 Prompts

---

## 1. Setup (humans, read this)

**Where you work.** The Google **Sheet** is the database (one row per applicant in `Applicants`). **Apps Script** is the code attached to it (Sheet → **Extensions → Apps Script**). It runs as a **web app** at a link ending in `/exec` (live) or `/dev` (your test version). No GitHub, nothing to install: edit in the browser, **Save** (Ctrl/Cmd+S), reload `/dev`.

**Access.** Ask Keene (the integrator) to share the Sheet with you as **Editor**; that includes the Apps Script project. Use your **Ateneo account**. Several Google accounts signed in at once confuses the web app ("unable to open the file", or the wrong email shows): click **Sign out** in the portal's top bar (signs you out of Google, then back to sign in), or use a separate Chrome profile / incognito with only your Ateneo account.

**Who owns what**

| Part | Where people see it | Files | Owner |
|---|---|---|---|
| **Home (the hub)** | plain link `.../exec` | `Home.html`, `HomeApi.gs` | Keene (done) |
| **Application form** | `.../exec?page=apply` | `Apply.html`, `ApplyApi.gs` | **Member A** |
| **Threat assessment game** (step 2 of applying) | `.../exec?page=game` | `Game.html`, `GameApi.gs` | **Nathan** |
| **Home (the hub)** | `.../exec` | `Home.html`, `HomeApi.gs` | **Member B**, shared with Keene |
| Requirements + proof of payment | two **Google Forms** (not code); links shown on Home | Forms, links in Settings | officers |
| Officer side | **the Sheet itself**, with a **LEADS** menu | `AdminMenu.gs` | Keene (done) |

Member B: you edit `Home.html` + `HomeApi.gs` and the payment view of `Steps.html` + `StepsApi.gs` directly (all shared with Keene; pull before you start). Read §9.2 first. Everything else is **shared: don't edit it** (`Code.gs`, `Utils.gs`, `Brand.gs`, `Referrals.gs`, `Setup.gs`, `AdminMenu.gs`, `Styles.html`, `PageTop.html`, `Loader.html`, `Mascot.html`). Need a change there? Message Keene with *what*, *why*, and the exact function signature you want. Don't edit it even if your AI suggests it.

**Making your files.** Editor → **+** next to Files → **Script** → name it **without** `.gs` (e.g. `ApplyApi`) → delete the empty `myFunction` → paste → Save. `Apply.html` / `Home.html` / `HomeApi.gs` already exist; open and replace their contents. A `.gs` and an `.html` **can't share a name**, hence `Apply.html` + `ApplyApi.gs`.

**Testing.**
- **Deploy → Test deployments** → copy the Web app URL (ends `/dev`). Member A: add `?page=apply`. Member B: the plain link (Home). After each change: Save, reload. No redeploy needed for `/dev` (editors only; applicants use `/exec`, which Keene deploys).
- Run server code by hand: pick a function in the toolbar → **Run**. First time: **Review permissions → your account → Advanced → Go to LEADS Applicant Portal (unsafe) → Allow** (normal for internal scripts). Output in the **Execution log**. For functions with arguments, write a throwaway `function test_x() { console.log(apply_submit({ FullName: 'Test' })); }`, run it, **delete it**.
- Errors: browser → right-click → Inspect → **Console**. Server → editor's **Executions** (☰ icon): every call with its error and `console.log` output.

**Golden rules.** (1) Only edit your two files: in Apps Script, whoever saves last wins. (2) Before pasting AI code, back up your current file in a note; there's no undo after closing the tab. (3) Never test on real applicant data (§11). (4) No `console.log` of personal data in final code. (5) Never rename Sheet column headers.

**What to paste into your AI:** this file → your current two files → (optional) `Utils.gs` if it needs to see a helper → a prompt from §13.

---

## 2. The project

### 2.1 What LEADS is

**LEADS** is an off-site **leadership camp** by **MEA** (Management Engineering Association, Ateneo) for its members, **MEAns**. The portal takes someone from application to "you're in":

1. **Apply** (Member A): one application per person.
2. **Review:** officers accept / waitlist / reject **in the Sheet** (LEADS menu).
3. **Payment (first):** proof of payment through the **payment Google Form**, after acceptance or any time after applying (a setting); officers mark Payment.
4. **Requirements (after payment):** once Payment is **VERIFIED**, accepted applicants send PDFs + camp info through the **requirements Google Form**; officers check and mark Requirements.
5. **Confirmed:** ACCEPTED + Requirements APPROVED + Payment VERIFIED → automatically **CONFIRMED**.
6. **Home:** where each person sees where they are and what's next; each step after acceptance has its own page (Steps.html). Member B works on Home and the payment page.

**Theme: LEADS: Oversight.** "Oversight" means (1) watchful supervision and (2) an inadvertent error. The fears are being watched, feeling boxed in, and failing; the third reading is oversight as leadership. Brand-book concept: **"I Can See You / Do You See Yourself?"**: it starts unsettling and ends introspective; the applicant feels watched, then realizes the observer is a mirror (tone and voice in §7.5). Tagline "Someone is already watching. Apply anyway." The mood is **1984-style surveillance and analog horror, eerie, with scripted jump scares allowed, but never gory**: CCTV, case files, REC timestamps, watching eyes, warning tape, photocopy grain, CRT scanlines. No blood, skulls, ghosts or horror fonts. The mascot is **I.R.I.S.** (Inspection, Reconnaissance & Identification System: the portal's Big Brother), a pocket CRT television whose screen shows a real-looking eye that follows you; its power light, on-screen word and antennas change with its emotion (§7.2). Home has a CCTV wall of four custom SVG feeds (CAM 01 Lobby with a figure in the doorway, CAM 02 Hallway with flickering lights and a figure that steps closer, CAM 03 You with red tracking brackets on the pointer, CAM 04 Archive with colour bars and NO SIGNAL); it is Home-only, so don't copy it. Copy can be ominous in headings and labels; instructions and errors stay **clear first, creepy second**.

**Users:** Ateneo students, mostly **on phones**, signed in with `@student.ateneo.edu`. Timezone **Asia/Manila**. Currency **₱**.

### 2.2 How it's built

- Apps Script (V8) web app, deployed **Execute as: Me** (MEA's Ateneo account) and **Access: Anyone within Ateneo**. All server code runs with the owner's permissions, and **any visitor can call any public function**, so each one checks who's calling (§3.2).
- **One** `doGet` (Code.gs): no `?page=` → Home, `?page=apply` → Apply, `?page=game` → Game, `?page=pay | reqs | ga | room` → Steps, anything else → Home. Pages are HTML templates (`<?= ?>` scriptlets).
- Pages talk to the server only through `google.script.run` (async). The Sheet is the database. The only file the portal handles is the **proof of payment**: `steps_uploadProof` saves it to the Drive folder in Settings › `PaymentFolder` and links it in `PaymentProof`. Requirement files go through the Google Forms.
- Plain HTML/CSS/JS and Apps Script. **No React, Vue, Tailwind, jQuery, npm, CDNs.**

| File | What it does |
|---|---|
| `Code.gs` | `doGet` routing; `include(name)`, `includeTemplate(name, vars)`, `includeOptional_(name, vars)`. Passes `BRAND`, `baseUrl`, `notice`, `page` into every template. |
| `Utils.gs` | All shared logic: settings, lookups, validation, status rules, Form links, `progress_()`, logging (§4). |
| `Brand.gs` | `BRAND`: all copy, colors, fonts, I.R.I.S.'s lines/faces/colors. `brand_css()`, `brand_json()`. |
| `AdminMenu.gs` | The LEADS menu, and the check that logs/undoes hand edits to the three track columns. |
| `Setup.gs` | `setup_applyValidation()`: Sheet validation rules (owner runs it). |
| `HomeApi.gs` + `Home.html` | **Member B, shared with Keene.** The hub: status card, next step, one card per step, referral card, FAQ/testimonials for non-applicants. |
| `StepsApi.gs` + `Steps.html` | **Member B works on the payment view (`?page=pay`), shared with Keene.** The steps after acceptance, one page with four views: `?page=pay` (02 proof of payment: details, QR codes, upload), `reqs` (03 requirements: the forms from the Requirements tab, with an inline preview), `ga` (04 1st GA: calendar button), `room` (05 room booking: placeholder). Copy in `BRAND.steps`. |
| `Styles.html` · `PageTop.html` · `Loader.html` · `Mascot.html` | Shared CSS · top bar (logo, "← Back to the hub", **Sign out**) · full-screen loading overlay with a bouncing I.R.I.S. · **I.R.I.S.** in the bottom-right corner (§7.2). |
| `Apply.html` + `ApplyApi.gs` | **Member A.** Placeholder now; you create `ApplyApi.gs`. |

### 2.3 The Sheet

Navy headers: **never rename** them. The code finds every Applicants column by its **header name** (`cols_()` / `col_(name)` in Utils.gs), so moving a column or deleting one the portal doesn't use is safe. Yellow cells: the core team edits.

**`Applicants`** (`COLS` in Utils.gs lists the columns the portal needs; a missing one is added at the end automatically):

| Column | Format | Set by / notes |
|---|---|---|
| `ApplicantID` | `APP-2317` style, unique. Starts at Settings › `ApplicantIdStart` (default 2300) and jumps by a random 1–9, so IDs don't reveal how many applied or who was first. Never renumber existing IDs. | Apply via `nextApplicantId_()`. Never typed by users; applicants enter it in the Forms (pre-filled). |
| `Timestamp` | Date | Apply |
| `Email` | lowercase, allowed domain, unique | Apply, **from the login**, never a form field. How we identify people. |
| `FullName` | 2–80 letters, spaces, `. ' -`, accents/ñ | Apply |
| `Nickname` | 1–30 letters | Apply. Used for "Hi ___". |
| `IDNumber` | exactly 6 digits within 200000–280000, **text**, unique | Apply (check uniqueness yourself, §9.1). Out-of-range IDs just get "Invalid ID number." (never reveal the range to applicants) |
| `Course` | free text, ≤60 chars | Apply. Autofilled from MemData's course column when the member is found. (`MEAInvolvement` was removed Oct 2026.) |
| `YearLevel` | integer 1–5 | Apply |
| `Mobile` | `09` + 9 digits, **text** (leading zero!) | Apply. `+63 917…`, `0917-…`, `917…` are cleaned to `09…` by `normalizeMobile_()` (server) / `normalizePhone()` (page) |
| `Status` / `Requirements` / `Payment` | §2.4 | Apply creates `SUBMITTED`/`NONE`/`NONE`; then core team only |
| `ReviewedBy`, `LastUpdated` | email, Date | automatic |
| `Notes` | text | **core team only, never shown to applicants** |
| `Block` | letters/numbers, ≤30 | Apply. **Required for first years** (ID starts with `26` or YearLevel 1), optional otherwise |
| `MBTI` | one of the 16 types (`INTJ`…) or blank | Apply. Autofilled from MemData (header "MBTI", else column AB); `INTJ-A` → `INTJ` |
| `PastOrgs` | ≤500 chars, multiline, optional | Apply |
| `FirstOvernight` / `OffsiteAvailability` | `Yes` / `No` | Apply. Availability question shows Settings › `EventDates` |
| `DataConsent` | `Y` (must be Y to submit) | Apply (RA 10173) |
| `WhyParticipant` / `FirstImpression` / `TakesLeadership` / `FearLeadership` | 50–1000 chars each, multiline, required | Apply (the 4 essays). `Rumors` was dropped Oct 2026; its old column can stay in the Sheet. |
| `GameAnswers` | JSON text (≤5000 chars) | Game page: the choices made in the 3 CCTV rooms |
| `PaymentProof` | Drive link | Steps page upload (`steps_uploadProof`). A new upload replaces the link; old files stay in the folder. |
| `ReferralCode` | e.g. `BEA-7K2Q` | Made on submit (`makeReferralCode_`): first 4 letters of the nickname + 4 random characters (no 0/O/1/I/L). Applicants from before referrals get one the first time they open the hub. |
| `ReferredBy` | a code, or blank | The code they applied with (optional field on Apply, pre-filled from `?ref=`). Checked and **locked on submit**. |
| `ReferrerID` | ApplicantID or blank | Who that code belongs to, filled in by the server. Filter/sort by it to see who invited whom. |

`WhyLEADS` / `FearEssay` were retired (replaced by the essays) and are deleted by `setup_cleanupAfterDeploy()` (Setup.gs). `ensureApplicantHeaders_()` adds any missing `COLS` header at the end.

Camp info (emergency contact, dietary, medical, shirt size) and requirement files live in the **Form responses**, not here.

**`Settings`** (Key | Value | What it does; any may be **blank**, so hide the line or show "TBA" / "check back here"):
- Event: `EventName`, `EventDates`, `EventVenue`, `ApplicationsOpen` (TRUE/FALSE), `Deadline`, `AllowedEmailDomains` (comma list), `ContactEmail`.
- 02 Payment: `PaymentOpen` (TRUE/FALSE switch), `PaymentDetails` (amount + how to pay, line breaks kept), `PaymentQRCodes` (one per line: `Label | link`; a Drive file link is read by the script as the owner, so it needn't be shared), `PaymentDeadline`, `PaymentFolder` (made on the first upload).
- 03 Requirements: `RequirementsOpen` (switch), `RequirementsNote`, `RequirementsDeadline`. The forms are rows in the **`Requirements`** tab: `Form | Link | What to do | Due`.
- 04 1st GA: `GACalendarLink` (the step stays locked until it's filled in), `GADetails`.
- 05 Room booking: `RoomBookingOpen` (switch), `RoomBookingNote`.
- Dates may come back as a `Date` **or** text: always `parseDate_()`. Deadlines are **display-only**.
- Requirement form links can be pre-filled links with `APP-0000` as the Applicant ID: `formLink_(link, id)` swaps in the real ID.

**Other tabs.** The Sheet has `Applicants`, `Settings`, `Requirements`, `Lists`, `Admins`, `MemData` (member list for Apply autofill), plus **`Activity`** (the portal's debug/tracking log, see §4 `activity_`; status/track changes are its **CHANGE** rows, which are never skipped or trimmed. This replaced the old `Log` tab). A hidden **`Drafts`** tab (`Email | SavedAt | Data`) holds each applicant's unsent Apply draft, so it follows their account across browsers; `apply_saveDraft` writes only the signed-in person's row; rows are **never deleted or moved** (a cleared draft is a blank Data cell), so saving needs no script lock except the one-time append of a new row. Submitting/discarding clears the cell. Don't add code that deletes Drafts rows. This portal is for participants only, not core-team applications. `Lists`: the track dropdowns (Statuses, RequirementStates, PaymentStates) via `getList_()`. `Admins`: `Email | Name | Role` (LEADS menu, can edit tracks, see "Open the Sheet" on Home).

### 2.4 The three tracks

| Track | Values | Who changes it |
|---|---|---|
| **Status** | `SUBMITTED` → `UNDER REVIEW` → `ACCEPTED` / `WAITLISTED` / `REJECTED` → `CONFIRMED`; `WITHDRAWN` | Apply creates SUBMITTED; officers (menu or by hand, both checked); system auto-sets CONFIRMED |
| **Payment** | `NONE` → `SUBMITTED` → `VERIFIED`; `REJECTED` = upload again | the upload sets SUBMITTED; the core team verifies/rejects |
| **Requirements** | `NONE` → `PARTIAL` → `SUBMITTED` → `APPROVED`; `RETURNED` = fix and resend | the core team |

**Your code never changes these** (the proof upload's SUBMITTED goes through `setTrack_`). Allowed status moves (`NEXT_STATUS`): SUBMITTED → UNDER REVIEW, REJECTED, WITHDRAWN · UNDER REVIEW → ACCEPTED, WAITLISTED, REJECTED, WITHDRAWN · WAITLISTED → ACCEPTED, REJECTED, WITHDRAWN · ACCEPTED → CONFIRMED (only if APPROVED **and** VERIFIED), WITHDRAWN · CONFIRMED → WITHDRAWN · REJECTED, WITHDRAWN → final.

**Unlock rules live only in `progress_(applicantData)`. Never re-implement them.**
Every step after the decision needs Status **ACCEPTED/CONFIRMED** and opens **in order**, each only once the core team switches it on:
1. **Apply** (+ the Game).
2. **Proof of payment**: `PaymentOpen` = TRUE. Locks again once VERIFIED.
3. **Requirements**: `RequirementsOpen` = TRUE **and Payment VERIFIED** (pay first).
4. **1st GA**: opens as soon as `GACalendarLink` has a link.
5. **Room booking**: `RoomBookingOpen` = TRUE **and Requirements APPROVED**.
- REJECTED/WITHDRAWN still **see** their status, but every step shows as closed.

```js
progress_(a) → {
  status: 'ACCEPTED',
  apply: { state, unlocked }, review: { state, unlocked },
  payment:      { state, unlocked, value, why },   // value = Payment column
  requirements: { state, unlocked, value, why },   // value = Requirements column
  ga:   { state, unlocked, why },  room: { state, unlocked, why },
  confirmed: { state, unlocked }
}
// state: 'open' | 'locked' | 'waiting' (on the core team) | 'action' (applicant's move) | 'done' | 'stopped' (rejected/withdrawn)
// why (when locked): 'accept' | 'closed' (switch off) | 'pay' | 'req' | 'link' (no GA link). Locked-card text: BRAND.lockedWhy.
```

---

## 3. Rules for the AI (follow strictly)

### 3.1 Scope
1. Only write the user's **own two files** (A: `Apply.html`, `ApplyApi.gs` · B: `Home.html`, `HomeApi.gs`, and the payment view of `Steps.html` / `StepsApi.gs`, all shared with Keene). Never output edits to shared files (§1). If a shared change is truly needed, add a labeled **"Ask Keene"** note with the exact function wanted; never duplicate shared code into the user's file.
2. Don't build what the portal deliberately doesn't do: **no uploads** (Forms collect files), **no admin pages** (officers use the Sheet), **no new `?page=` routes, no emails, no code that changes Status/Requirements/Payment.**
3. Reuse §4 helpers; don't re-implement validation, lookups, Form links, status or unlock logic, and don't invent helpers that aren't listed. Need one? Put it in the user's `.gs` with the page prefix and a trailing `_` (e.g. `apply_isIdTaken_()`).
4. Plain HTML/CSS/vanilla JS + Apps Script. No frameworks, no CDNs, no `fetch` to other sites.

### 3.2 Security (non-negotiable)
1. **Any public server function (no trailing `_`) can be called by any visitor with any arguments.** Public = only what the page calls, prefixed by page (`apply_`, `home_`, `game_`, `steps_`). Everything else ends in `_`.
2. Identify the user with `requireApplicant_()` / `currentEmail_()`. **Never** accept an email, ApplicantID or row number from the page to decide whose data to read or change.
3. **Validate on the server** even if the page did (`validateApplication_`); whitelist fields, ignore unknown keys. Every Sheet write goes through `safeCell_()` (blocks `=IMPORTXML(...)` etc.; `updateApplicant_()` already does).
4. **Return only what the page needs.** Never `Notes`, `ReviewedBy`, other applicants, the Admins list, or a Form link `progress_()` says is locked. Sensitive data never in template scriptlets; load it with `google.script.run` from a guarded function.
5. In the browser, insert user text with **`textContent`**; if you must build HTML, escape with `esc()` (§6.2). No personal data in `console.log`. Respect **RA 10173**: applicants see only their own data.

### 3.3 Data integrity
1. Every write happens inside a script lock, and you **re-read inside it** before deciding anything:
   ```js
   const lock = LockService.getScriptLock();
   lock.waitLock(20000);
   try { /* re-read, check, write */ } finally { lock.releaseLock(); }
   ```
2. `updateApplicant_()` and `nextApplicantId_()` expect you to hold the lock.
3. Read the Sheet in bulk (`getValues()` once), never cell by cell.

### 3.4 Must-haves on every page (1:1 with the hub)

Shared pieces are **included, never copied or redrawn**, so when Keene changes I.R.I.S., the loader or the top bar, every page updates. Confirm each item in your answer.

**A full page (Apply)**, all shown in the §6.2 skeleton:
1. `<head>`: `<base target="_top">`, `<?!= include('Styles') ?>`, `<?!= brand_css() ?>`. No other fonts; colors only from CSS variables.
2. `<body data-loader-wait>`; first line `<?!= include('Loader') ?>`; second line `<?!= includeOptional_('Mascot', { BRAND: BRAND, page: page }) ?>` (**I.R.I.S.**; pass `page` as-is so I.R.I.S. says this page's hello line).
3. Inside `.wrap`, first: `<?!= includeTemplate('PageTop', { BRAND: BRAND, baseUrl: baseUrl }) ?>` (logo, back to the hub, **Sign out**).
4. `const BRAND = <?!= brand_json() ?>;`. Never hard-code text that exists in `BRAND`.
5. The `call()` wrapper unchanged: its failure path fires `portal:error` so **I.R.I.S. reacts to server errors**. Any raw `google.script.run` failure handler must fire it too.
6. `Loader.hide()` on success **and** on error.
7. States: **loading, not signed in, wrong account, locked/not allowed yet, empty, error with retry, success.** Not signed in → **Sign in** button; wrong account → **Switch account** button (§7.3).
8. I.R.I.S. reacts to the page's big moments via the guarded `kuya()` helper (§7.2), and the same message is also on the page.
9. Buttons disable while working (no double submits). Keyboard and screen-reader friendly.
10. Nothing fixed in the bottom-right corner (I.R.I.S.'s spot). Responsive per §8 at every width; this is a hard requirement, not polish.

### 3.5 Output format (every answer)
1. **Complete files**, never snippets or "…rest unchanged…": both files, each in its own code block with the filename above.
2. **How to install:** which file, paste, save, reload `/dev?page=apply` (or plain `/dev` for Home).
3. **Edge cases handled:** map to §10 and the page's list in §9; say what's not handled and why.
4. **Must-haves:** confirm each §3.4 item.
5. **Responsive check** (§8.4): one line per width (320, 360, 390, 768, 1024, 1440) and confirm every §8 rule. If one fails, fix the code first; don't just report it.
6. **How to test** (§11): which rows to fake, what they should see.
7. Style: 2-space indent, `const`/`let`, short functions, comments explain *why*; match `Utils.gs` / `Home.html`. If the request is ambiguous, state your assumption in one line and go ahead.

---

## 4. Shared helpers (already exist; just call them)

Functions ending in `_` are server-only. Public shared functions: `home_getContext()`, `utils_getFormRules()` `include()`, `includeTemplate()`, `brand_css()`, `brand_json()`, `doGet()`, plus the officers' `menu_…`/`onOpen`/`onEdit` (never call those).

| Helper | Returns / does |
|---|---|
| **Constants** | `SHEET` (tab names: `APPLICANTS, SETTINGS, ADMINS, LISTS, REQUIREMENTS, ACTIVITY, DRAFTS`), `COLS` (the Applicants columns the portal needs; find them with `col_(name)`, never by position), `TRACK_COLS` (`['Status','Requirements','Payment']`), `STATUSES`, `REQUIREMENT_STATES`, `PAYMENT_STATES`, `NEXT_STATUS`, `RULES` (Apply field rules: `{ stage, required, requiredIfFreshman, requiredMsg, pattern, list, options, min, max, idMin, idMax, rangeMsg, phone, minLen, maxLen, multiline, msg }`; the page's `fieldError()` mirrors `validateApplication_()` from the same rules, so add new fields here, not as one-off checks), `BRAND` (copy, colors, `statusCopy`, `messages`, `buttons`, `modules`, `mascot`) |
| `getSettings_()` / `getSetting_(key)` | Settings as `{ Key: value }` (cached per execution; values may be `Date`, number, boolean, `''`) / one value |
| `isTrue_(v)` · `parseDate_(v)` | `true` for `true`/`"TRUE"` · `Date` or `null` (text like `2026-10-24 23:59` read as Manila time) |
| `getList_(name)` | non-blank strings from a Lists column; throws if the column doesn't exist |
| `isOpen_()` · `stepOpen_(key)` · `gaLink_()` | applications open (switch **and** deadline) · a Settings step switch (`PaymentOpen`, `RequirementsOpen`, `RoomBookingOpen`) is TRUE · the 1st GA calendar link or `''` |
| `cols_()` · `col_(name)` | the Applicants header row as it is now · 0-based position of a header (throws if missing) |
| `formLink_(link, applicantId)` | a Google Form link (from the Requirements tab) with `APP-0000` swapped for the applicant's ID, or `''`. **Only after `progress_()` says that step is unlocked.** |
| `currentEmail_()` | logged-in email (lowercase) or `''` (not signed in / Google hides it) |
| `isAllowedDomain_(email)` · `isAdmin_(email)` | domain in AllowedEmailDomains · email in Admins |
| `requireAdmin_()` · `requireApplicant_()` | admin email or throws `'Admins only.'` · `{ row, data }` or throws (`'Sign in…'` / `'You have not applied yet.'`) |
| `ownerOnly_()` | throws unless run from the editor by the owner |
| `getApplicantByEmail_(email)` · `getApplicantById_(id)` | `{ row, data }` or `null`; `data` keyed by `COLS`, Dates already ISO strings |
| `toObject_(rowValues, cols?)` | row array → object (Dates → ISO) |
| `nextApplicantId_()` | next ID (random step of 1–9 from the highest, at least `ApplicantIdStart`). **Inside a lock.** |
| `updateApplicant_(row, { Field: value })` | writes through `safeCell_`, sets `LastUpdated`. **Inside a lock.** Throws on unknown column. |
| `safeCell_(v)` | prefixes `'` to text starting with `= + - @` |
| `textCell_(v)` | for Applicants cells: prefixes `'` to every non-empty string so Sheets keeps it as text (mobile numbers keep their 0, IDs/blocks/referral codes never turn into numbers or dates). Used by `apply_submit_` and `updateApplicant_`, which writes **only the given cells** (never the whole row). |
| `validateApplication_(input, 'apply')` | `{ ok, errors: { Field: msg }, clean: { Field: value } }`. Trims, strips control chars, collapses spaces (not essays), checks pattern/list/range/length; `YearLevel` → number. Does **not** check IDNumber uniqueness. |
| `utils_getFormRules()` *(public)* | `{ rules: RULES, lists: {}, isOpen }` (no Apply question uses a Lists dropdown now) so the page shows the same messages as the server |
| `logChange_(id, action, from, to, by)` | writes a CHANGE row to Activity (`by` defaults to current email or `'system'`). Member A uses it once: `logChange_(id, 'status', '', 'SUBMITTED', 'system')`. |
| `traced_(event, page, fn, summarize?)` | **Wrap every public server function in it** (see `apply_submit` / `home_getContext`): logs OK + ms, `{ ok:false }` as WARN, and throws as ERROR with the stack, to the Activity tab. Pattern: `function x_get() { return traced_('x_get', 'x', x_get_, r => 'short summary'); }` with the real code in `x_get_()`. |
| `activity_(event, details, { level, page, ms })` | one row in the **Activity** tab (`When | Level | Who | Page | Event | Details | ms`); level `INFO`/`WARN`/`ERROR`. Never throws. **Never log essays, ID numbers, phone numbers or other private answers**, just IDs, statuses and field names. |
| `log_client(evt)` *(public)* | Styles.html calls it for browser errors (max 5 per page load). Don't call it yourself. |
| `setStatus_` / `setStatusLocked_` / `setTrack_` | officers only (LEADS menu). **Not for your code.** |
| `progress_(dataOrNull)` | unlock states (§2.4). The only source of truth. |
| `home_getContext()` *(public)* | `{ email, signedIn, allowedDomain, isOpen, deadline, campStart, contact, isAdmin, event:{name,dates,venue}, applicant:{id,firstName,status,requirements,payment}\|null, progress, sheetUrl }`. Each step's page is `baseUrl + '?page=pay'` (`reqs`, `ga`, `room`). |
| `steps_get(page)` · `steps_uploadProof(file)` *(public, StepsApi.gs)* | the Steps page's data for `pay`/`reqs`/`ga`/`room` (content only once unlocked) · saves the proof of payment, links it in `PaymentProof`, sets Payment SUBMITTED |

**In templates and pages**
- Template variables: `BRAND`, `baseUrl` (the `/exec` or `/dev` URL, pinned to the school domain by `portalUrl_()`: `https://script.google.com/a/macros/student.ateneo.edu/s/<id>/exec`), `notice`, `page`. Always build links from `baseUrl`, never from `ScriptApp.getService().getUrl()`: the plain `/macros/s/...` link shows Google's "file not found" page to anyone signed in to several Google accounts.
- `includeOptional_(name, vars)`: like `includeTemplate` but returns `''` if the file is missing or throws, so an optional piece can't break the page (Home uses it for I.R.I.S.).
- **Hub events:** after `home_getContext()` returns, Home fires `document` event **`hub:context`** (`detail` = that object) and sets `window.HUB = { type: 'context', detail }`. On failure: **`hub:error`** (`detail.message`).
- **Loader:** `Loader.show('Sending…')` / `Loader.hide()`. With `data-loader-wait` on `<body>` it stays up until you call `hide()`; auto-hides after 20s as a last resort. It also shows automatically on clicks to other portal pages.
- **I.R.I.S.:** `window.Iris.say([face, text], ms?)`, `window.Iris.error()`, and the `portal:error` event (§7.2). Always guard with `if (window.Iris)`.

---

## 5. Apps Script gotchas (these break silently)

1. **Trailing `_` = invisible to the page.** `google.script.run.foo_()` fails silently.
2. **`google.script.run` is async and returns nothing**: use the `call()` wrapper (§6.2). One chain = one call. Failure handlers fire `portal:error` (I.R.I.S. reacts) **and** show your own message: I.R.I.S. is extra, not the error UI.
3. **Can cross page↔server:** strings, numbers, booleans, `null`, plain arrays/objects. **Never a `Date`** (one Date can make the whole result `null`). Row helpers already convert; **Settings values don't**: `parseDate_(x) ? parseDate_(x).toISOString() : null`. No functions, no `undefined` in arrays, no class instances.
4. **Thrown errors** reach the failure handler as `err.message`: throw friendly text (`throw new Error('Applications are closed.')`), not stack traces.
5. **Scriptlets run even inside HTML comments.** Never write a scriptlet tag in a comment.
6. `<?= x ?>` escapes (safe for text). `<?!= x ?>` prints raw: only for `include`, `brand_css`, `brand_json`, the templates in §3.4. Never for user data.
7. **The page is in an iframe.** Links need `target="_top"` (the `<base>` tag does it); build them as `baseUrl + '?page=apply'`. **No `href="#x"` jumps** (reloads the portal); use a button + `el.scrollIntoView()`. Google Form links: `target="_blank" rel="noopener"`.
8. **Server has no `setTimeout`, `fetch`, `URL`, `FormData`** (use `Utilities.sleep`, `UrlFetchApp`). They're fine in the browser.
9. Calls take ~0.5–2s (6-minute cap): **load everything in one call.**
10. Uploads → always a link to the Google Form, never our code.
11. `IDNumber` and `Mobile` are text columns: pass **strings** (`'09171234567'`), never `Number(...)`.
12. Script timezone is Asia/Manila; on the client format with `{ timeZone: 'Asia/Manila' }`.
13. `currentEmail_()` can be `''` (not signed in, or non-Ateneo account): treat as not signed in.
14. `/dev` = latest saved code (editors). `/exec` = last **deployed** version; Keene redeploys.
15. **Sheet validation also checks script writes**: a bad value makes `setValues`/`appendRow` throw the rule's help text (e.g. `Exception: 11 digits starting with 09`). Validate first; `IDNumber`/`Email` must be unique.
16. `localStorage` is per-browser: unsent drafts at most (wrapped in try/catch), never the source of truth.

---

## 6. Starter code

### 6.1 Server file (`ApplyApi.gs`)

```js
/**
 * ApplyApi.gs  (server code for Apply.html; public functions start with apply_)
 * Every public function: identify the user from the login, never from arguments.
 */

/** Everything the Apply page needs to draw itself, in one call. */
function apply_getForm() {
  const email = currentEmail_();
  const found = email ? getApplicantByEmail_(email) : null;
  const deadline = parseDate_(getSetting_('Deadline'));
  const rules = utils_getFormRules();
  return {
    signedIn: !!email,
    email: email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    isOpen: rules.isOpen,
    deadline: deadline ? deadline.toISOString() : null,   // never return a Date object
    alreadyApplied: found ? { id: found.data.ApplicantID, status: found.data.Status } : null,
    rules: rules.rules,
    lists: rules.lists
  };
}

// apply_submit(form): see the steps in §9.1.
```

**Return shapes:** validation problems → **return** `{ ok: false, errors: { Field: 'message' } }`; success → `{ ok: true, ...data }`; anything else (not allowed, closed, not signed in, unexpected) → **throw** `new Error('friendly message')`.

### 6.2 Page skeleton (Apply)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<base target="_top">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?!= include('Styles') ?>
<?!= brand_css() ?>
<style>
  /* page-only styles; reuse Styles.html classes first */
  .state{display:none}
  .state.show{display:block}
</style>
</head>
<body data-loader-wait>
<?!= include('Loader') ?>
<?!= includeOptional_('Mascot', { BRAND: BRAND, page: page }) ?>
<div class="wrap">
  <?!= includeTemplate('PageTop', { BRAND: BRAND, baseUrl: baseUrl }) ?>

  <section class="page-head">
    <p class="eyebrow">01 · Apply</p>
    <h1>Apply to LEADS</h1>
  </section>

  <!-- exactly one of these is visible at a time -->
  <div class="card state show" id="loading" role="status" aria-live="polite">Loading…</div>
  <div class="card state" id="error" role="alert">
    <p id="errorMsg"></p>
    <button class="btn ghost" type="button" id="retry">Try again</button>
  </div>
  <div class="state" id="content"><!-- your page --></div>
</div>

<script>
  const BRAND = <?!= brand_json() ?>;
  const BASE = <?!= JSON.stringify(String(baseUrl)) ?>;   // safe: our own URL
  const $ = id => document.getElementById(id);

  /** google.script.run as a Promise: await call('apply_getForm'). A failure also makes I.R.I.S. react. */
  function call(fn, ...args) {
    return new Promise((resolve, reject) =>
      google.script.run.withSuccessHandler(resolve).withFailureHandler(err => {
        document.dispatchEvent(new CustomEvent('portal:error', { detail: err }));
        reject(err);
      })[fn](...args));
  }
  /** For the rare time you must build HTML from text. Prefer textContent. */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /** Account links (same as the hub's): Sign in / Switch account buttons (§7.3). */
  const ACCOUNT = {
    out: 'https://accounts.google.com/Logout?continue=' + encodeURIComponent('https://appengine.google.com/_ah/logout?continue=' + BASE),
    choose: 'https://accounts.google.com/AccountChooser?continue=' + encodeURIComponent(BASE)
  };
  /** I.R.I.S., the mascot (§7.2). Guarded: I.R.I.S. can be hidden or turned off. */
  const kuya = (face, text) => { try { if (window.Iris) window.Iris.say([face, text]); } catch (e) { /* never break the page */ } };

  function show(id) {
    ['loading', 'error', 'content'].forEach(x => $(x).classList.toggle('show', x === id));
    if (id !== 'loading') Loader.hide();   // first load done (data or error)
  }
  function fail(err) { $('errorMsg').textContent = (err && err.message) || String(err); show('error'); }

  async function load() {
    show('loading');
    try { render(await call('apply_getForm')); show('content'); }
    catch (err) { fail(err); }
  }
  function render(data) { /* build with textContent, never innerHTML with user data */ }

  $('retry').addEventListener('click', load);
  load();
</script>
</body>
</html>
```

### 6.3 Submitting safely (no double submits)

```js
async function onSubmit(e) {
  e.preventDefault();
  const btn = $('submitBtn');
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Sending…';
  clearErrors();
  try {
    const res = await call('apply_submit', readForm());   // plain object, not the <form> element
    if (!res.ok) { showErrors(res.errors); kuya('thinking', "A few fields need a look. They're marked in red."); return; }
    showSuccess(res);
    kuya('excited', 'Sent! Your ID is ' + res.id + '.');
  } catch (err) {
    showFormError(err.message);                           // I.R.I.S. already reacted through call()
  } finally {
    btn.disabled = false; btn.textContent = 'Submit';
  }
}
```

## 7. Look, I.R.I.S., accessibility

### 7.1 Look and classes
- A surveillance case file on a dark CRT. Near-black background (`--night`), files in `--night-2`, **square corners everywhere** (`--radius` is 0), 1.5px borders, hairline grids. Palette is only black, white `--text`, grey `--muted`, warning-tape yellow `--glow` (main button, labels, countdown), CRT blue `--blue` (button shadows, glow) and alarm red `--danger` (errors, REC dot, "FEAR //" lines). `--sky` is a lighter blue only for links.
- Type: **Anton** (condensed grotesque) for uppercase headlines, **JetBrains Mono** for labels, buttons and data (uppercase, letter-spaced), **Inter** for body text. Buttons are mono uppercase with a hard blue offset shadow.
- Analog horror is already laid over every page by Styles.html: moving grain, scanlines, a rolling VHS tracking band and a dark vignette. Don't add your own. Put class `rgb` on **one** big headline per page for the red/blue tape misregistration. The "signal interrupted" cutaways and whispering tagline are Home only. **Jump scares are allowed** (owner's decision, Oct 2026; currently the Game reveal and Home cutaways), but never while someone is typing or choosing an answer (not on Apply's fields, not mid-question in the Game), never strobing (one flash at most), and always skipped in CRT-off mode and for reduced motion. Use bracket/slash labels sparingly (`FILE 01 // APPLY`, `[ CASE FILE ]`). Never gore or Halloween (§2.1).
- **CSS variables:** `--night` (bg), `--night-2` (card), `--text`, `--muted`, `--sky` (links/eyebrows), `--glow` (yellow), `--blue`, `--pink`, `--danger`, `--ok`, `--line` (borders), `--radius`; fonts `--display`, `--body`, `--mono`, `--kicker` (one short mono label like "Case file 26/27", never body text). I.R.I.S.'s emotion colors are in `BRAND.mascot.colors` on the client.
- **Classes (Styles.html):** `.wrap` (container), `.page-head` (+ `.eyebrow`, `h1`, `p`), `.card`, `.btn` (yellow) / `.btn.ghost` (outline; `aria-disabled="true"` or `disabled` greys out), `.pill` + `.ok`/`.warn`/`.wait`/`.dim`, `.field-error`, `.mono`, `.eyebrow`. `.notice`/`.notice.warn` live in Home; copy the rule if needed.
- **Retro layer (Oct 2026, end of Styles.html):** the portal is a 90s OS left in a basement. `.btn` / `.btn.ghost` are bevelled 90s buttons (VT323, `--os`) that push in on click; `.card` is a dark bevelled window with a cut corner and a misregistered blue ghost outline; `.top` is a grey taskbar; dialogs get a grey frame and a navy title bar; fields are sunken (`border:2px inset`). Opt-in pieces: `.winbar` (title bar, first child of a `.card`; set `--py/--px` if the card's padding isn't 20px/22px), `.torn` (zigzag bottom edge), `.cut` / `.glitch-corner` (broken outlines), `.scrap` (taped paper note, `--r` = tilt), `.tape-strip`, `.stamp-ink`, `.redbar` (decorative redaction bar), and `.reye` (photo-like monochrome eye; markup `<span class="reye"><span class="reye-ball"><i></i></span></span>`, pupil follows `--px/--py`). Fonts: `--os` (VT323) for OS chrome, `--type` (Special Elite) for paper. **Tilt and overlap decoration, never inputs, answer choices or submit buttons**, and never put `.torn`/`.cut` (masks/clips) on a card that holds a dropdown. Home: stacked CRT TVs with eyes + a "You are being watched" poster, tilted windows, FAQ as manila case folders (fields, redaction bars, stamp, clipped photo), testimonials as torn printouts.
- **Brand-book templates in code (Oct 2026):** **Broadcast Card** = `.bcast` (inline; `.bcast.strip` for a one-line banner) or `Broadcast.show({ top, big, sub, btn })` for a full-screen one with a button (Styles.html). Used for Home's one-time ACCEPTED / CONFIRMED announcement (once per status per browser), the "closes today" strip, Apply's closed state and the idle card. **Negative + Findings** = Home's camper transcripts (inverted silhouette, tap to develop, typed FINDING from `fear`). **Case File** = Apply's `.intake` paper sheet in a manila folder: typed header fields that fill from the form, and a photo corner that resolves with progress (`--res` 0 to 1 on `#intake`); fields on the paper are white sunken boxes. **Margin notes** = I.R.I.S.'s comments also written in red pen (`--hand`, Reenie Beanie) under the field, plus "Hesitated N seconds here." and "Rewrote this twice."; decorative (`aria-hidden`). **Live Feed** = Game's `.mstatus` bars (MISSION STATUS / CAPTURE TIME / STREAMS / SUBJECT), driven by `paintStatus()`.
- **Badge colors:** CONFIRMED/ACCEPTED/APPROVED/VERIFIED `.ok` · REJECTED/RETURNED/WITHDRAWN `.warn` · SUBMITTED/UNDER REVIEW/WAITLISTED/PARTIAL `.wait` · NONE/locked `.dim`.
- **Copy:** `BRAND.statusCopy[status]` for status sentences. Fear theme in headings and empty states; errors plain: what happened + what to do. Follow the voice in §7.5.
- **No** searchlight or watching-eye background effects on your page (Home only). I.R.I.S. already watches every page.
- **Loading:** the Loader covers first load and page changes. For a slow action you may `Loader.show('Sending your application…')` and `Loader.hide()` in `finally`; quick actions use inline button text ("Saving…"). Always hide on error too.

### 7.2 I.R.I.S., the mascot (shared, `Mascot.html`)

I.R.I.S. is a **pocket CRT television** with rabbit-ear antennas (redesigned Oct 2026; it replaced a wall-mounted camera that looked wrong when dragged around, since a TV stands on its own anywhere). Its screen shows a real-looking eye that **follows the pointer**, and the whole set leans a few degrees toward you. A power **LED** shows the face's colour (`BRAND.mascot.colors`) and an on-screen display shows a REC dot and a word: REC, NOTED, MATCH, ALERT, IDLE, SAVED, CLEARED, READING. The antennas carry the mood too (perk up when excited, droop when sad or off). **Hover it and the screen shows your own silhouette** (the mirror: the observer is you). It idles every ~7s, alternating a body move (the eye scans the room, antennas re-tune, tilt, shiver, bump, sink out of view and climb back, turn side-on) with a screen effect (glitch, static, stare, red panic, rolling picture, colour bars, channel change, one flash, mirror). Apply's power-on intro starts it `off` (dark screen) and switching it on plays a CRT warm-up line. It can be dragged anywhere (spot remembered per browser), hidden for the session ("Hide I.R.I.S."; a small 90s button brings it back), and says each page's hello line from `BRAND.mascot.hello[page]`. Its messages appear in a small 90s window titled "I.R.I.S. // TRANSMISSION". On server errors the LED goes red, it shakes and says `BRAND.mascot.error` ("SIGNAL LOST…"), then rests on the sad face (antennas drooped, screen dimmed, LED grey).

**Voice:** the brand book's (§7.5): deadpan, clinical, second person, study vocabulary ("recorded", "noted", "your file"), quiet and specific, always ending on an invitation. No exclamation marks or emoji.

| Face | LED + screen + antennas | Use for |
|---|---|---|
| `nervous` | red LED blinking, REC (default) | neutral, waiting, "take your time" |
| `happy` | green, NOTED, eye smiles, antennas up a little | saved, recorded, friendly hello |
| `excited` | yellow, MATCH, pupil wide, picture zooms, antennas up | big moments: application filed, accepted |
| `scared` | red fast blink, ALERT, pinpoint pupil, red veins, picture jitters, shake | errors, deadline panic |
| `sad` | grey, IDLE, lid half down, screen dims, antennas droop | rejected, withdrawn, after an error |
| `wink` | white, SAVED, eye half shut | small playful lines |
| `love` | amber (the one warm light), CLEARED, warm screen | confirmed, thank-yous |
| `thinking` | blue, READING, a bright band rolls down the screen | "check this", validation, sign-in needed |

```js
window.Iris.say(['excited', 'Sent! Your ID is APP-0042.'], 9000);   // [face, text], ms optional (default 7s)
window.Iris.error();                                                  // red + shake + BRAND.mascot.error, then sad
document.dispatchEvent(new CustomEvent('portal:error'));              // same as error(); call() already does it
```

**Rules**
1. **Always guard** (`if (window.Iris)`, or the `kuya()` helper): I.R.I.S. can be hidden, off (`BRAND.mascot.show = false`) or fail to load; the page must work without it.
2. **Never redraw, copy, restyle or move I.R.I.S.**; never style `.kuya*` classes or `#kuya*` ids. Keep the bottom-right corner free; the body already has bottom padding for it.
3. **I.R.I.S. is extra, not the UI**: everything it says must also be on the page.
4. **Big moments only.** Apply: submit success (`excited`), validation errors (`thinking`), closed (`sad`), already applied (`happy`). Home: status changes and the referral card only. Server errors are automatic.
5. Lines: one or two short sentences, first person, watchful and a little ominous but on the applicant's side ("File received. You are now on record."), plain text, no gore.
6. New face, color or shared line → it's Brand.gs: ask Keene.

### 7.3 Sign in / sign out / switch account
PageTop always has **Sign out**. "Not signed in" state → **Sign in** button (`ACCOUNT.choose`, Google's account picker). "Wrong account" → **Switch account** (`ACCOUNT.out`). Both are plain links (`<a class="btn" href="…" target="_top">`), never `window.open`. Sign out signs out of **every** Google account in that browser; say so in a `title` or small note.

### 7.4 Forms and accessibility
- **Home extras for non-applicants:** an FAQ of "classified files" (`BRAND.faq`, `{fee} {dates} {venue}` filled from Settings; `todo: true` answers only show to admins) and past-camper quotes (`BRAND.testimonials`; `sample: true` shows a SAMPLE stamp). Both hide once the person has a file (`body.applied`). Confirmed campers' countdown switches to camp start (Settings › `CampStart`, else the first date in `EventDates`).
- **Dropdowns are themed** (`CustomSelect` in Styles.html): every `<select>` on every page is replaced by a styled button + listbox on load, with the real select kept underneath for the value and validation. Use plain `<select>` in your markup; setting `el.value` from code updates the themed one too. Don't style native selects yourself.
- **Report an issue** (`ReportIssue` in Styles.html, `report_issue` in Utils.gs, copy in `BRAND.report`): a red "Report an issue" button is added to every page's top bar and footer automatically (any `[data-report]` element opens it too). The form asks for the category, what happened, what they were doing, steps, when, how bad and a reply email (+ optional screenshot). It attaches the page, browser, screen, in-app browser, recent page errors, their account, applicant ID/status and last Activity rows, then emails a themed case file to Settings › `IssueEmail` (or `BRAND.report.to`). Max 3 reports per person per 10 minutes. The owner must run `report_authorize` once so Google allows sending email.
- **Wording: say "core team", never "officers"**, in anything applicants see. The footer reads "Portal issues? …".
- **Autofill from MemData** (ApplyApi.gs `apply_memberFor_`): the `MemData` tab (MEA member sign-ups) fills empty Apply fields. Matched ONLY by the signed-in email (Student Email / Email Address), never by ID alone, so nobody can pull someone else's details by guessing IDs. The ID Number is question 1; changing it re-runs the lookup among rows tied to the same email and refills anything autofilled that wasn't edited. Prefilled fields get a yellow edge until edited. Assume every applicant is in MemData, but never block someone who isn't. Autofilled: ID, name, nickname, course, year level, mobile, Block and MBTI (header "MBTI", else column AB; cleaned to the 4 letters). Only the email columns are compared, never other cells.
- **Wrong-account pop-up** (`SignInHelp` in Styles.html, copy in `BRAND.signInHelp`): opens once per session on Home/Apply when the visitor isn't signed in or is on a non-Ateneo account; a "Trouble signing in?" link reopens it. It gives the school-pinned portal link (`baseUrl`) plus private-window and sign-out steps.
- **I.R.I.S. judges your answers on Apply** (`judge` in Apply.html, lines in `BRAND.mascot.judge`): it comments after a pause or when you leave a field, at most once every 7s, and calls out invalid IDs/mobiles, short or very long essays, "leadership" clichés, big deletions and long idles. Validation errors use `judge.force()`. Comments are extra; the page's own error messages stay the source of truth.
  - **Every question has a reaction.** `judge` entries come in three shapes: a list of `[face, text]` lines (random pick, `{v}` = their answer), e.g. `FullName`, `Block`, `PastOrgs`; an object keyed by answer, e.g. `YearLevel {1,4,other}`, `FirstOvernight {Yes,No}`, `OffsiteAvailability {Yes,No}`, `DataConsent {Y,N}`; and `MBTI {I,E,other}`, keyed by the type's first letter. Each field/answer is commented on once. Each of the 5 essays has its own line, said once the answer reaches 50–700 characters (otherwise the shared `essayShort` / `essayLong`).
  - **Progress check** every 40s: `slow` ("So Bea, you've put in only your name so far…"), `halfway`, `allDone`. Field names in those lines come from `LABEL` in Apply.html, so **a new question needs a `LABEL` entry and a `judge` line** in Brand.gs.
  - The ID/mobile call-outs use `fieldError()`, so I.R.I.S. never disagrees with the form (and never says the ID range out loud).
- **Page transitions** (Loader.html) match the retro layer: a tilted "CONNECTING.EXE" 90s window on a grainy CRT backdrop, with the photo-like eye looking around on a small monitor, a `C:\>` status line, a block progress bar and a REC clock. Opening: the backdrop fades in and the window pops up with one soft brightness flicker; closing: the window shrinks away like a minimise, then the backdrop fades. Only opacity/transform/filter animate. Reduced motion gets a plain fade.
- **Apply opens with a wake-up intro** (Apply.html, `initIrisWakeSequence`): the form is hidden behind a black stage with I.R.I.S. centred and switched off (`data-mood="off"`); clicking it (or the prompt button, which gets focus) turns it on, it docks bottom-left and the form fades in. Skipped once seen this session (`sessionStorage leads-iris-awake`), when I.R.I.S. is hidden, and for reduced motion / CRT off. On Apply, I.R.I.S. can't be dragged and types its lines out. The top-bar toggle reads **CRT on / CRT off** (`BRAND.horror.lightsOn/lightsOff`).
- **Apply looks like an official form under observation.** Number every question with `<span class="q-num">Q.04 / 09</span>` above its label. Show progress with the shared CCTV-timeline bar: `<div class="tape-progress" data-label="04 / 09"><span style="--p:44%"></span></div>` (update `--p` and `data-label` as fields get filled). I.R.I.S. reacts once when the fear essay passes 50 characters: `kuya('happy', "Noted. That one's going in your file.")`.
- **Redacted words** are **off** (`BRAND.hero.redact: []`); don't add black-bar redactions to any page. The `.redact` class stays in Styles only so it can be switched back on. The **Lights on/off** toggle (`data-lights` buttons; PageTop already has one) is shared. Respect `document.documentElement.classList.contains('calm')`: in lights-on mode, add no motion of your own.
- Every input has a visible `<label for>` above it. `autocomplete` (`name`, `nickname`, `tel`), `maxlength`, live counters on essays ("120 / 1000, need 50+"). Errors next to the field (`aria-describedby`) **and** a summary at the top; focus and scroll to the first error.
- Inputs on dark: use the `.field` CSS in §8.3 (readable dropdown options too).
- Loading text `role="status"`, errors `role="alert"`, actions are `<button>`, navigation is `<a>`. Color is never the only signal (pills have text). `prefers-reduced-motion` is already handled by Styles.

### 7.5 Tone and voice (from the LEADS brand book)

**Concept.** "I Can See You / Do You See Yourself?" Three readings of Oversight: surveillance (being watched, boxed in), error (fear of failing), leadership (agency). Method: reflection through case study; every applicant is a subject who ends up reading their own file. Through-line: *Fear gets your attention. The mirror keeps it.* Message: *You were never being hunted; you were being asked to look.*

**Personality.** Deadpan, clinical, observant, intimate. LEADS speaks in the second person, like a study that knows you a little too well, and it **always ends on an invitation, never a threat**.

**Do**
- Short declarative sentences. Speak to "you" directly.
- Borrow study and case-file vocabulary: subject, file, finding, protocol, observation, debrief, intake, clearance.
- Save the reveal for the last line. Keep it quiet and specific (a time, a number, a detail they just did).
- Let the scare be visual and timed (jump scares are allowed, §7.1); let the words stay calm.

**Don't**
- Gore, blood, injury or body horror.
- An eye inside a triangle/pyramid (reads as the Illuminati symbol; not allowed). For "watching" icons use a CCTV camera, a plain eye, a REC dot or a monitor.
- Jokes at the expense of the unsettling mood.
- Over-explain the fear.
- End a line, screen or flow on a threat. A scary beat is followed by an invitation (e.g. "FOUND YOU." then "Now look closer.").
- Shout: no exclamation marks, no emoji. All caps only for labels, stamps and broadcast cards.

**Sample lines.** "We have been watching. Please remain seated." / "Subject 000, your file is ready." / "Who are you when you're not performing?" / "You were never being hunted. You were being asked to look."

**Where the voice bends.** Instructions, form labels, errors and anything legal (consent, RA 10173) stay **clear first, creepy second**: plain words, what happened, what to do. The voice lives in headings, empty states, I.R.I.S., the Game, cutaways and stamps.

**Visual language (same book).** Elements: eyes, CCTV, signage ("YOUR ACTIONS ARE BEING MONITORED"), subject tags and numbers, REC + timestamp + detection boxes, manila folders and intake forms, negative portraits with notes, mask and mirror. Layout templates: **Case File** (folder/intake form, photo corner, stamped fields, handwritten notes), **Live Feed** (monitor frame, REC, timestamp, status bar "MISSION STATUS: IN PROGRESS"), **System Dialog** (retro OS windows), **Broadcast Card** (solid blue field, bold centered caps, simple icon), **Negative + Findings** (inverted portrait with a typed note). Photo phases: **Surveillance** (high, wide, cold, grain, dither, timestamp), **Reveal** (eye-level, close, into a mirror, cleaner, a warm note allowed), **Negatives** (inverted portrait paired with a typed finding).

---

## 8. Responsiveness (strict, every page)

Most applicants are on phones, often on slow data, from a group-chat link. Every rule here must pass; check before answering.

### 8.1 Apps Script specifics
- The viewport tag is set by `Code.gs`; a `<meta name="viewport">` in your HTML does nothing (the page is in Google's iframe). Don't remove Code.gs's.
- The iframe fills the window: `vw`, `dvh` and media queries work, but never assume a fixed height. Google may show a banner at the top ("created by another user"): don't pin things to `top:0`.

### 8.2 Widths, breakpoints, rules

**Test at** 320 (small Android, split screen) · **360** (main target) · 390–430 (iPhones) · 768 (tablet) · 1024 (laptop) · 1440+ (desktop; content must not stretch), plus **landscape phone** (740×360), **200% zoom** and Android **large font**.

**Breakpoints, mobile-first** (base CSS = phones; add with `min-width`, never patch desktop down): `560px` (big phones: 2 columns where useful) · `860px` (side-by-side layouts) · `1080px` (content stops growing; `.wrap` max 1080px). Only add another query if these can't solve it, and say why.

**Layout**
1. **No horizontal scroll** at any width ≥ 320: `document.documentElement.scrollWidth === innerWidth`.
2. No fixed widths on containers: `width:100%` + `max-width`, `min()`, `clamp()`, `%`, `fr`, `minmax()`. Fixed px only for small things (icons, a 44px button).
3. Content inside `.wrap` (max 1080px, 20px side padding). Paragraphs/essays `max-width:40em`.
4. Rows of cards/buttons: flex with `flex-wrap:wrap`, or grid `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`.
5. Every flex/grid child holding text gets `min-width:0`. Long strings (emails, links, IDs, essays) get `overflow-wrap:anywhere`. Test with `a.very.long.name.with.dots@student.ateneo.edu`.
6. Images/SVG: `max-width:100%; height:auto`.
7. Never fix the height of text containers (`min-height`; full-screen = `100vh` fallback then `100dvh`).
8. Big headings and section padding use `clamp()`; body text ≥ 1rem, small labels ≥ 12px, line-height ≥ 1.4; `rem`/`em` sizes; never disable zoom.

**Touch and input**

9. Tap targets ≥ 44×44px with ≥ 8px between them.
10. Inputs/selects/textareas `font-size:16px`+ (or iPhones zoom in).
11. Right keyboard: ID `inputmode="numeric" pattern="[0-9]*"`; mobile `type="tel" inputmode="tel"`.
12. Nothing hover-only; hover effects inside `@media (hover:hover)`.
13. After an error, `scrollIntoView({ block: 'center' })` + focus the first bad field. Never a `position:fixed` submit bar.

**Components**

14. Main buttons full-width on phones, side by side from 560px; labels never wrap to 3 lines.
15. Forms: one column on phones; two only from 860px for short related fields (Course + Year level); labels above inputs.
16. Modals (if any): full-screen on phones, scroll inside, 44px close button; centered with `max-height:90dvh; overflow:auto` on larger screens; lock background scroll.
17. **No tables**: cards and lists. Pills sit in a wrapping row.
18. **No fixed/sticky elements of your own** if avoidable. I.R.I.S. is fixed bottom-right (~68–88px): keep that corner free, never cover inputs, don't override the body's bottom padding. Anything stuck to an edge adds `padding-bottom: max(16px, env(safe-area-inset-bottom))`.
19. Performance: one server call to load, loader shown instantly, no big images or extra fonts (inline SVG only), never call the server per keystroke.

**Instant fails:** fixed px width on a container/form/card · `white-space:nowrap` on user text · `position:absolute` for page layout · `height:100vh` on growing content · `overflow:hidden` on `html`/`body` to hide sideways scroll · separate mobile and desktop copies of content · fonts < 12px or inputs < 16px · tables · mouse-only interactions.

### 8.3 Starter CSS (copy into your `<style>`)

```css
/* fields */
.field{display:flex;flex-direction:column;gap:6px;margin:0 0 16px;min-width:0}
.field label{font-weight:700}
.field input,.field select,.field textarea{
  width:100%;font:inherit;font-size:16px;            /* 16px = no iPhone zoom */
  color:var(--text);background:rgba(7,18,43,.7);
  border:1.5px solid var(--line);border-radius:12px;padding:.75em .9em;min-height:44px}
.field textarea{min-height:9em;resize:vertical}
.field :focus-visible{outline:3px solid var(--sky);outline-offset:2px}
.form-grid{display:grid;gap:0 16px;grid-template-columns:1fr}
@media (min-width:860px){.form-grid{grid-template-columns:1fr 1fr}.form-grid .full{grid-column:1/-1}}

/* card lists that reflow on their own */
.cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}

/* button rows */
.actions{display:flex;flex-wrap:wrap;gap:12px}
.actions .btn{width:100%;justify-content:center;min-height:44px}
@media (min-width:560px){.actions .btn{width:auto}}

/* long words never break the layout */
.wrap,.card{min-width:0;overflow-wrap:anywhere}
p{max-width:40em}

/* hover only where hover exists */
@media (hover:hover){.btn:hover{transform:translate(-2px,-2px)}}
```

### 8.4 The responsive check (AI must report it)
At 320, 360, 390, 768, 1024, 1440: (1) no sideways scroll (name the widest element and why it fits); (2) columns/stacking at each width; (3) all tap targets ≥ 44px, inputs 16px; (4) long email / 60-char name / 1000-char essay wrap; (5) modals full-screen on phones; (6) landscape 740×360: nothing hidden behind fixed elements (including I.R.I.S.); (7) 200% zoom usable.

Console snippet to find what's too wide:
```js
[...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1)
  .forEach(el => console.log(el, Math.round(el.getBoundingClientRect().width) + 'px'));
console.log('page', document.documentElement.scrollWidth, 'vs screen', innerWidth);
```

---

## 9. Specs

### 9.1 Apply (`Apply.html` + `ApplyApi.gs`), Member A

**Server**
```
apply_getForm()    → { signedIn, email, allowedDomain, isOpen, deadline (ISO|null), alreadyApplied: {id,status}|null, rules, lists, contact, eventDates, draft, member }
apply_submit(form) → { ok:false, errors } | { ok:true, id }
```
`apply_submit` **must**, in order:
1. `email = currentEmail_()`; blank → throw "Sign in with your Ateneo account first."
2. `!isAllowedDomain_(email)` → throw "Use your Ateneo account to apply."
3. `v = validateApplication_(form, 'apply')` (covers phone cleanup, ID range, Block-for-first-years, consent, Yes/No choices); `!v.ok` → return `{ ok:false, errors: v.errors }`. Build the row from `v.clean`, never raw input.
4. Take the lock. **Inside it:** `!isOpen_()` → throw "Applications just closed." · `getApplicantByEmail_(email)` → throw "You already applied." · same `IDNumber` on another row → return `{ ok:false, errors:{ IDNumber:'That ID number already has an application. Message an officer if this is wrong.' } }` · `id = nextApplicantId_()` · build the row in **`COLS` order** (every column; `ReviewedBy`/`Notes` blank; `Timestamp`/`LastUpdated` = `new Date()`; `Email` = login; `SUBMITTED`/`NONE`/`NONE`; `IDNumber`/`Mobile` as strings; everything through `safeCell_`) · `sheet_(SHEET.APPLICANTS).appendRow(row)` · `logChange_(id, 'status', '', 'SUBMITTED', 'system')`.
5. Return `{ ok:true, id }`.

**Page must**
- **16 questions** (`FIELDS` in Apply.html, progress tape shows `NN / 16`): DataConsent (Y/N; must be Y), IDNumber, FullName, Nickname, Course (free text, autofilled from MemData), YearLevel (select 1–5), Block, Mobile, MBTI (select of 16), PastOrgs, FirstOvernight (Yes/No), OffsiteAvailability (Yes/No, shows `eventDates`), then **4 essays**: WhyParticipant, FirstImpression, TakesLeadership, FearLeadership (50–1000 chars each).
- **Applying is two steps.** Apply's button ("Proceed to Threat Assessment") does **not** submit: it checks the form, saves it as the account's draft (`apply_saveDraft`) and only if that save returns `ok` opens `?page=game`. The Game page (`Game.html` / `GameApi.gs`, 3 timed CCTV rooms of choices, then a random "monster" reveal: Sir Kerish 60%, Sir Chums 30%, Sir Aly 10%) submits at the end with `game_submitFinal(answers)` = saved draft + `GameAnswers` → `apply_submit_()`. The game sends people back to Apply if they have no draft, and to the hub if they already applied. If the final submit returns field errors, they're handed to Apply via `sessionStorage['leads-apply-errors']` and shown on the form.
- **Never put `//` inside a backtick string** in page JS (e.g. `` `CAM ${n} // ROOM` ``). Apps Script's comment stripper can treat it as a comment and cut the line, which kills the whole script with "Unexpected token". Use normal quotes and `+`. Page JS errors show up in the `Activity` tab as `client_js_error`.
- **Redirects after a server call can be blocked** (Google only allows leaving the frame right after a click), so `go(url, label, msg)` in Apply/Game tries `window.open(url, '_top')` and then shows a themed card with a real `target="_top"` link.
- **Leaving a page from script:** use `window.open(url, '_top')` (or a link with `target="_top"`). `location.href = …` inside the Apps Script frame just shows a blank page. No `alert()`; use the themed notice / I.R.I.S.
- **The reveal (owner allows jump scares, Oct 2026)** runs full screen in `#theater` (Game.html, `reveal()`): (1) "All feeds clear" while a low beating drone fades in; (2) CAM 03 REVERSED fills the screen: the subject's breathing silhouette tagged with their own Nickname (`game_getInit().nickname`), the caption types "This camera is pointed at you.", two photo-like eyes open in the silhouette and follow the pointer, then it lurches closer three times with screen tears as the drone bends up; (3) the drone cuts dead, black, a barely visible "behind you"; (4) the jump scare (face punch-in, "FOUND YOU", one flash, thud/screech/static, phone buzz); (5) "The one watching you" / "was you.", the subject as a negative tagged OBSERVER, "Who are you when you're not performing?" and an "Open your file" button (auto after 24s). Then the **debrief** (`#state-reveal`, `playDebrief()`): the observer's photo with eyes that follow you and a split-second flicker to *your* negative every few seconds, a paper case sheet that types itself (subject, observer, threat, status, the findings from `LEAN`), the observer's line in red pen and an OBSERVED stamp. Sound only exists because the last answer was a click. CRT-off / reduced motion skip to the debrief with everything shown at once. Faces are CSS stand-ins (`faceHTML()`) until real photos are added; never hot-link placeholder sites.
- **Unsettling eyes on Home** (CSS classes on `.reye`, Home.html): `bloodshot`, `dilated`, `wide` (pinpoint pupil), `twitch` (tics + double blinks), `late` (follows a beat too slowly), `noblink`, `weep` (dark tear track), `wrong` (the poster eye looks away until it snaps onto you every few seconds, `.caught`), and a rare `void-flash` (an eye goes black for a moment, from the creep engine). Only some eyes get them so the normal ones feel worse.
- **Home observation protocol** (Home.html, after the creep engine): OBSERVATION.LOG window in the hero types back what the subject does (sections reached, hovering Start 3 times without clicking, files opened, staring at the poster, idling, leaving/returning); built in the browser, never sent anywhere. Shy eyes (TV eyes shut when pointed at, then stare). Idle 45s → blue broadcast card "SUBJECT INACTIVE / We will wait.", snaps back on movement. Returning to the tab after 5s+ → "subject reacquired": the page VHS-rewinds with a timecode of the time away, a reticle locks on the cursor, eyes stare, CAM 03 shows "REPLAY · Ns AGO"; after 20s+ away, 30% chance of a face flash with a thud (sound only after an earlier click). CRT-off / reduced motion keep only the log. `window.Obs.log(text)` adds a line.
- **Home creep engine** (Home.html, copy in `BRAND.horror.creep`): every 10-22s one random moment (90s MESSAGE.EXE alert in a corner, a TV losing signal or showing a word, an eye that stops following and stares, the poster/hub heading changing for 2.6s), plus the tab title calling them back when they leave. Off in CRT-off mode; never the bottom-right corner; decorative only.
  - **No email field**: show "Applying as juan@…". Examples use `.ex-tag` (one line) / `.ex-box` (multi-line).
- **How an answer gets saved, end to end:**
  1. While typing: every change saves to localStorage at once; the account copy (all 18 fields, plus `GameAnswers` from the Game page) syncs to the hidden `Drafts` tab via `apply_saveDraft` after a 6s pause, at most every 20s, only if something changed, and immediately when the tab is hidden. This keeps server load low when many people apply at once.
  - **Capacity (load-tested Oct 2026):** the web app runs as the owner, so Apps Script's ~30 simultaneous executions are shared by everyone. Measured call times (Activity tab): home_getContext ~2.3s, apply_getForm ~2.6s, submit ~4.4s. Defences: every page calls the server through `runServer()` (Styles.html), which retries "too busy"/timeout/lock errors 3 times with growing random waits and only then fires `portal:error`; `game_submitFinal` is idempotent (an existing file returns ok + its ID, so retries and double taps are safe); Settings/Lists/Admins are cached 2 min (`cachedTab_`, cleared by onEdit); applicant and MemData lookups use TextFinder instead of reading whole tabs; routine Activity rows are skipped after 40 per minute (WARN/ERROR always kept). A discrete-event simulation with the measured times showed 100 people arriving within 10s: old code ~40 people hit errors, new code 0-2 (only initial page loads, which Google serves and nobody can retry from the page). Only submits and someone's first draft save take the script lock.
  2. On submit: the page runs `validateClientForm()` → `fieldError()` per field (same `RULES` as the server). Mobile is normalized to `09…` on blur.
  3. Server (called by `game_submitFinal`): `apply_submit_` → `validateApplication_()` → row built from `v.clean` in `COLS` order → `ensureApplicantHeaders_()` → `appendRow` → `logChange_` → draft deleted.
  4. **Adding a question** = add it to `RULES` (Utils.gs), `COLS` (append at the **end**), `FIELDS` + the HTML field (Apply.html), the draft field list in `apply_saveDraft`, and a `judge` line + `LABEL`. Miss `COLS` and the answer is silently dropped.
- Selects from `lists` (never hard-coded). Deadline in Manila time. Client checks use the same `rules` and `rule.msg`; live essay counters.
- Success (on the Game page, after the reveal): show the ApplicantID + a button back to the hub.
- I.R.I.S.: `excited` on success (with the ID), `thinking` on validation errors, `sad` when closed, `happy` when already applied (each also shown on the page).
- Not signed in → **Sign in** button; non-Ateneo account → **Switch account** button.

**Edge cases**
- Not signed in / non-Ateneo → no form, clear message, account button, link to the hub.
- Already applied → no form; their ID/status + link to the hub.
- Closed (switch off or deadline passed) → no form; "Applications are closed" + contact.
- Deadline passes **while typing** → server refuses; show it and **keep their text** so they can copy it.
- Double click / two tabs → one row only (lock + email check).
- Duplicate IDNumber → field error, not a crash.
- Names with ñ, accents, `O'Neil`, hyphens → accepted; emojis/numbers in names → rejected with the rule message.
- Essays: line breaks and emojis OK; exactly 50 and 1000 chars accepted, 49/1001 rejected; count like the server (`.trim().length`).
- Mobile typed `0917 123 4567` / `+639171234567` / `9171234567` → normalized to `09171234567` (page on blur, server in `validateApplication_`).
- Leading/trailing spaces trimmed; text starting `= + - @` stored safely (server).
- A Lists option removed mid-application → server field error; show it.
- Network error / timeout → error state, values kept, retry.
- Drafts: saved per account in the `Drafts` tab (localStorage fallback, try/catch); the newer copy wins; deleted after success.
- First year (ID `26…` or Year 1) with no Block → field error; everyone else may leave it blank.
- ID outside 200000–280000 → "Invalid ID number." (no range shown, on the page or by I.R.I.S.).
- Consent "No" → can't submit; I.R.I.S. explains why.
- MemData MBTI like `INTJ-A` → autofilled as `INTJ`; anything unrecognisable → left blank.

### 9.1b Referrals (`Referrals.gs`, shared)

- **Purpose:** referrals earn an advantage at camp, and the core team uses them to **separate friend groups**.
- **Code:** every applicant gets one when they submit (shown on the Game "file received" screen and in the hub's REFERRALS.EXE card, with copy/share). Link form: `.../exec?ref=CODE`. Home remembers the code in `localStorage['leads-ref']` and passes it to Apply, where it pre-fills the optional "Referral code" field (it's outside `FIELDS`, so it doesn't count toward the progress tape; it is in the draft).
- **Checks on submit** (`checkReferral_`, inside the submit lock): the code must exist, can't be your own, and its owner can't be WITHDRAWN. Bad codes come back as a `ReferredBy` field error. Valid → `ReferredBy` + `ReferrerID` saved, an Activity `referral` row written. Only the core team can change it after (by editing the Sheet).
- **Counting:** a referral counts once the referred person **applies** (not WITHDRAWN). `referralInfo_` counts with a TextFinder on `ReferrerID`. Referrers see **counts only, never names** (RA 10173).
- **Closed applications:** the card says the count is final and hides the share buttons; the server already refuses all submits when closed.
- **Referrals tab (core team):** LEADS menu › *Rebuild Referrals tab* (`referrals_setupTab`). Live formulas over Applicants: ReferrerID, name, code, who invited *them*, how many they brought in, and the list of people they referred (name, ID, status). Safe to rebuild any time; never type in it.
- **Copy** lives in `BRAND.referral`.

### 9.2 Home, the hub (`Home.html` + `HomeApi.gs`), Member B, shared with Keene

The Dashboard files were removed (Oct 2026): everything an applicant sees about their own file lives directly in Home. Edit `Home.html` / `HomeApi.gs`; Keene edits them too, so **`git pull` + `clasp pull` before every session** and commit often (AGENTS.md).

- **Data:** one call, `home_getContext()` → `{ email, signedIn, allowedDomain, isOpen, deadline, campStart, contact, isAdmin, event, applicant:{id,firstName,status,requirements,payment}|null, progress, referral:{code,link,counts,open}|null, sheetUrl }`. Add fields there (in `home_getContext_`) rather than adding a second call; keep it cheap (TextFinder lookups, no full-sheet reads per visitor).
- **What each person sees:** guest / wrong account → sign-in help only · signed in, not applied → apply button, FAQ, testimonials · applied → status card (`BRAND.statusCopy`), the step cards (locked steps say why: `progress[step].why` → `BRAND.lockedWhy`), the referral card · CONFIRMED → camp countdown.
- **Next action** comes from `progress` (`nextMove()`), never re-derived. Each step's content stays on its own page (Steps.html); Home only links.
- **Don't break:** `hub:context` / `hub:error` events (the report button reads them), `data-base` / `data-ref` on `<body>`, the I.R.I.S. include, `Loader.hide()` on success and error, the bottom-right corner (I.R.I.S.).
- **Payment page** (`?page=pay`, also Member B): `steps_get('pay')` gives the details, QR codes (Settings › `PaymentQRCodes`, Drive files) and deadline once Payment is unlocked; `steps_uploadProof(file)` saves the proof to the Drive folder in Settings › `PaymentFolder`, writes the link to `PaymentProof` and sets Payment SUBMITTED. Steps.html also runs `reqs`, `ga` and `room`: keep payment changes inside the `pay` view and its functions so the other steps keep working, and test all four views on /dev before pushing. Copy lives in `BRAND.steps` (Brand.gs is shared: ask Keene).
- **Edge cases:** deadlines blank/passed (never "Invalid Date"), long names/emails wrap, one column on phones (§8), no `//` inside backtick strings (§5).

## 10. Edge-case checklist (go through it; say which apply and how)

- **Who:** not signed in (`''`) · wrong/non-Ateneo account · signed in but not applied · officer who also applied · someone calling your public functions from the console with wrong/missing/malicious arguments (`null`, `{}`, huge strings, other people's IDs, `=FORMULA`).
- **When:** closed / deadline passed / reopened · state changed between page load and click · Settings blank, text instead of a date, number stored as text.
- **What:** every Status, Requirements and Payment value · each step switch on and off · an empty Requirements tab, blank PaymentDetails/QR codes, no GA link · long text, line breaks, emojis, ñ/accents, extra spaces · leading-zero numbers stay strings.
- **Shared pieces (§3.4):** Styles/brand_css, Loader, I.R.I.S., PageTop exactly as §6.2 · `call()` fires `portal:error`; `Loader.hide()` on success and error · I.R.I.S. reacts to success and validation errors, guarded, with the same message on the page · Sign in / Switch account buttons · bottom-right corner free · no Halloween visuals or wording.
- **Layout:** every §8 rule at every test width (report per §8.4).
- **How:** loading state within 100ms, never blank · server error → readable message + retry, nothing half-saved · double click / two tabs → no duplicates · slow or dropped connection while submitting · keyboard-only and screen reader · no `Date` from the server; "undefined", "null", "NaN", "Invalid Date" never on screen · user text via `textContent` · no personal data in `console.log`.

---

## 11. Testing

You can't make fake Google accounts, so **fake states with your own row**:
1. Apply once with your account on `/dev` (or, until Apply works, add a row by hand in `Applicants` with **your** email, a unique `APP-9xxx` ID, `Notes` = `TEST - delete`).
2. Change your row's `Status` / `Requirements` / `Payment` and reload. You must be in `Admins` (non-officer edits are undone on purpose), or ask Keene to use the LEADS menu. Illegal jumps (SUBMITTED → CONFIRMED) are blocked: follow §2.4.
3. Flip Settings: `ApplicationsOpen`, clear `Deadline`, flip `PaymentOpen` / `RequirementsOpen` / `RoomBookingOpen`, clear `GACalendarLink`. **Put them back after.**
4. Not signed in: open `/dev` signed into a personal Gmail only (you may get a Google error page since `/dev` needs edit access; test the real path on `/exec` after Keene deploys).
5. Officer vs not: add/remove your email in `Admins`.
6. I.R.I.S.: check the hello line, a success/validation reaction, and an error (temporarily throw in your server function). Click "Hide I.R.I.S." and confirm the page still works, then open a new tab to get it back.
7. Phone: open `/dev` in mobile Chrome/Safari with your Ateneo account; portrait and landscape; type in every field; tap the Form buttons.
8. Laptop: Inspect → device toolbar (Ctrl/Cmd+Shift+M) → Responsive → 320, 360, 390, 768, 1024, 1440; scroll sideways at each; run the §8.4 snippet; try 200% zoom.
9. **Clean up:** delete your TEST row and test Form responses (its Activity CHANGE rows stay).

Server-only: `function test_mine() { console.log(JSON.stringify(home_getContext(), null, 2)); }` → Run → read the log → delete it.

---

## 12. Troubleshooting

**First stop: the Sheet's Activity tab.** Filter `Level` = ERROR, or `Who` = the person's email. Server errors there include the stack (file and line); browser errors show as `client_js_error`.

| You see | Fix |
|---|---|
| Button does nothing when calling the server | Function ends in `_`, is misspelled, or its file isn't saved |
| Success handler gets `null` | You returned a `Date` (often from Settings): convert to ISO |
| `Script function not found: doGet` | Saved with errors, or Code.gs edited: fix red marks, don't touch Code.gs |
| `?page=apply` shows the hub | `Apply.html` missing or misnamed |
| `No HTML file named PageTop` | Shared file missing: ask Keene |
| Page shows raw `<?= ?>` | Used `include()` on a file with scriptlets: use `includeTemplate()` |
| Infinite loading / "Maximum call stack" | A scriptlet tag inside an HTML comment |
| Loader stuck (vanishes after 20s) | `data-loader-wait` without `Loader.hide()`, often missing in the error path |
| `Loader is not defined` | `include('Loader')` missing or not first in `<body>` |
| I.R.I.S. missing | Mascot include missing, or "Hide I.R.I.S." was clicked (open a new tab) |
| `I.R.I.S. is not defined` / page breaks when I.R.I.S. is hidden | Use the guarded `kuya()` helper |
| I.R.I.S. covers my button | Something is in the bottom-right corner: move it |
| I.R.I.S. doesn't react to errors | A raw `google.script.run` without `portal:error`: use `call()` |
| Wrong email / "unable to open the file" | Several Google accounts: **Sign out**, then sign in with only the Ateneo account |
| `Exception: You do not have permission…` | Run any function from the editor once and Allow |
| My Status/Requirements/Payment edit was undone | Not in Admins, or illegal move: add yourself / follow §2.4 / use the LEADS menu |
| No LEADS menu | Reload the Sheet tab |
| "Link coming soon" on a Form button | Form URL blank or not a Google Forms link in Settings |
| `You have not applied yet.` | No row with your email: add a TEST row (§11) |
| `Can't go from X to Y.` | Not allowed by `NEXT_STATUS`, or someone changed it first: refresh |
| `Exception:` + a short rule (e.g. `6 digits, and only once in this column`) | Sheet validation rejected the write: validate and check uniqueness first |
| Sideways scroll on phones | Run the §8.4 snippet; fix that element (`min-width:0`, `overflow-wrap:anywhere`, `minmax(min(100%,260px),1fr)`) |
| iPhone zooms into fields | Input font under 16px |
| Bottom button behind keyboard/iPhone bar | No fixed submit bar; `100dvh`; `env(safe-area-inset-bottom)` |
| Heading one word per line on phones | Use `clamp()` |
| Mobile shows `9171234567` | Written as a number: write strings |
| Links open in a tiny frame / do nothing | Missing `target="_top"` or not using `baseUrl` |
| "Sorry, unable to open the file" / file not found | Several Google accounts signed in and the link isn't the `/a/macros/student.ateneo.edu/` one. Share only that link; inside the portal use `baseUrl`. |
| Works on `/dev`, not `/exec` | Ask Keene to redeploy |
| `Service invoked too many times` / slow | Reading cells in a loop: one `getValues()` |

---

## 13. Prompts (fill in, paste after this file)

**Build my page**
> I'm Member **[A/B]**. I own **[Apply.html + ApplyApi.gs / Home.html + HomeApi.gs + the payment view of Steps.html + StepsApi.gs (shared with Keene)]**. Using the context file above, build both files completely, following §3 (including every §3.4 must-have: Loader, I.R.I.S., PageTop, `call()`, account buttons), my spec in §9 and the §10 checklist. Current files: [paste]. Give full files, install steps, edge cases handled, the must-haves, the §8.4 responsive check, and a test plan.

**Fix a bug**
> I'm Member **[X]** on **[file]**. Expected: **[…]**. Actual: **[…]**. Error from Console/Executions: **[exact text]**. Files: [paste]. Explain the cause in 2–3 sentences and give the full fixed files. Don't touch shared files.

**Add a feature**
> Add **[feature]** to my page. Stay in my two files, reuse §4 helpers, keep existing behavior, keep the §3.4 must-haves, and list new edge cases.

**Review before I hand it in**
> Review my files against §3 (rules, security, must-haves), §5 (gotchas), §8 (responsiveness) and §10 (edge cases). List problems as severity, where, why, fix, then give the corrected full files.

**Make it responsive**
> Audit my page against §8 at 320, 360, 390, 768, 1024, 1440, landscape phone and 200% zoom. List every broken rule (number, element, why), then give the full fixed files and the §8.4 check.

**I'm stuck and new**
> Explain this code line by line in simple words, then tell me the exact next step to get it working on my `/dev` link: [paste].
