# LEADS Applicant Portal

LEADS is MEA's off-site leadership camp. Theme: **LEADS: Oversight** (fear of being watched, of being boxed in, of failing). "You are being watched. Good. Apply anyway."

One Google Sheet (the database) + one small Apps Script web app + the requirement Google Forms.

| Part | What it is | Owner |
|---|---|---|
| **Home** (`.../exec`) | The hub: countdown, the applicant's progress, next step, links to everything. The Dashboard sits inside it. | Keene (done) |
| **Dashboard** | The applicant's own area, inside Home: status, what to prepare, Form buttons when it's their turn | Member B |
| **Apply** (`.../exec?page=apply`) | The application form | Member A |
| **Steps** (`?page=pay`, `reqs`, `ga`, `room`) | Proof of payment (upload), requirements (links to the Google Forms), 1st GA, room booking | Keene |
| **Requirement forms** | Google Forms listed in the Requirements tab: PDFs and camp info | the core team |
| **Officer side** | The Sheet itself, with a **LEADS** menu | Keene (done) |

The team works from [CONTEXT.md](CONTEXT.md): paste it into your AI first.

## How an applicant moves through LEADS

Five steps, each with its own page. Steps 02 to 05 are only for **ACCEPTED** applicants, open **in order**, and stay locked until the core team switches them on in **Settings**:

| Step | Page | Opens when |
|---|---|---|
| 01 Apply (+ the Game) | `?page=apply` | `ApplicationsOpen` and before `Deadline` |
| 02 Proof of payment: payment details, QR codes, upload (saved to Drive, linked in `PaymentProof`) | `?page=pay` | `PaymentOpen` = TRUE |
| 03 Requirements: the forms in the **Requirements** tab, with instructions and a preview | `?page=reqs` | `RequirementsOpen` = TRUE **and** Payment VERIFIED |
| 04 1st GA: "Add to Google Calendar" | `?page=ga` | `GACalendarLink` is filled in |
| 05 Room booking (placeholder for now) | `?page=room` | `RoomBookingOpen` = TRUE **and** Requirements APPROVED |

Three tracks record where each applicant is:

| Track | Values | Who moves it |
|---|---|---|
| **Status** (the decision) | SUBMITTED → UNDER REVIEW → ACCEPTED / WAITLISTED / REJECTED → CONFIRMED (WITHDRAWN any time) | the core team |
| **Payment** (upload) | NONE → SUBMITTED → VERIFIED (REJECTED = upload again) | the upload sets SUBMITTED; the core team verifies |
| **Requirements** (Forms) | NONE → PARTIAL → SUBMITTED → APPROVED (RETURNED = fix and resend) | the core team, after checking Form responses |

- ACCEPTED + APPROVED + VERIFIED → **CONFIRMED** automatically.
- `progress_()` in Utils.gs is the one place these unlock rules live. The hub, the Dashboard and the Steps page all use it.

## How officers work (in the Sheet)

- **LEADS menu:** select applicant rows in the Applicants tab (any cell in each row; several rows at once is fine) → LEADS → Decision / Requirements / Payment → pick a value. Each row is checked, logged, and auto-confirmed when all three tracks are done. Skipped rows are listed with the reason.
- **Typing in the cells also works:** a change to Status / Requirements / Payment by someone in the Admins tab is checked and logged; a wrong move (e.g. SUBMITTED → CONFIRMED) or a change by a non-officer is **undone** with a message. Pasting over many cells at once isn't checked (it's logged as a bulk edit), so prefer the menu.
- Officers must be in the **Admins** tab **and** be editors of the Sheet, using an account in the same Google Workspace as the owner.
- Officers see an "Open the Sheet" link on the portal's Home page.

## Files

| File | Owner | What it does |
|---|---|---|
| `Code.gs` | Keene | The only `doGet`. Home, `?page=apply`, `game`, `pay`, `reqs`, `ga`, `room`. Anything else → Home |
| `Utils.gs` | Keene | Settings, lookups, **server-side validation**, status rules, `progress_()`, the **Activity** tab (incl. CHANGE rows for every status/track change). Columns are found by header name |
| `AdminMenu.gs` | Keene | The LEADS menu and the hand-edit check (`onOpen`, `onEdit`) |
| `Brand.gs` | anyone | All copy, colors, fonts. Edit this to re-theme |
| `Setup.gs` | Keene | Sheet validation, colors, Activity protection. Safe to re-run. `setup_cleanupAfterDeploy` = the one-time Oct 2026 clean-up |
| `StepsApi.gs` + `Steps.html` | Keene | Steps 02 to 05: payment upload, requirements, 1st GA, room booking |
| `HomeApi.gs` + `Home.html` | Keene | The hub |
| `Styles.html`, `PageTop.html`, `Loader.html`, `Mascot.html` | shared | Base theme; top bar with "Back to the hub"; SVG loading overlay; I.R.I.S. the mascot, a pocket CRT television (lines, faces and LED colors in `BRAND.mascot`, turn off with `show: false`) |
| `Apply.html` (+ `ApplyApi.gs`, to create) | Member A | Placeholder: the application form |
| `Dashboard.html` + `DashboardApi.gs` | Member B | Placeholder inside Home; `dash_get()` starter already works |

Apps Script won't let a `.gs` and an `.html` share a name, which is why server code is `XxxApi.gs`.

## Setup

1. **Open the Sheet** (owned by MEA's Ateneo account) → Extensions → Apps Script. Name the project "LEADS Applicant Portal".
2. **Paste the files.** Every `.gs` above as a Script (`+ → Script`, no `.gs` in the name), every `.html` as HTML. Replace `appsscript.json` via Project Settings → "Show appsscript.json". If the project still has `Status`, `Upload`, `Payment` or `Admin` files from earlier, delete them.
3. **Sheet tabs.** `Applicants`, `Settings`, `Requirements`, `Lists`, `Admins`, `MemData`, plus `Activity` and the hidden `Drafts` (both made automatically). Run `setup_applyValidation` once after any column change.
4. **Drive permission (once).** Run `steps_authorizeDrive` from the editor and allow Drive. It makes the proof-of-payment folder and saves its link in Settings › `PaymentFolder`; share that folder with the core team.
5. **Requirement forms** (from the same Ateneo account): turn on *Collect email addresses* (Verified) and *Restrict to users in Ateneo*, and add a short-answer **"Applicant ID"** question first. ⋮ → **Get pre-filled link** → type `APP-0000` → copy. Add one row per form to the **Requirements** tab (`Form | Link | What to do | Due`). The portal swaps in each applicant's own ID.
6. **Fill Settings** (each row says what it does): event details, deadlines, `PaymentDetails`, `PaymentQRCodes` (`Label | Drive link`, one per line), `ContactEmail`. Turn steps on with `PaymentOpen`, `RequirementsOpen`, `RoomBookingOpen`; the 1st GA opens when `GACalendarLink` is filled in. Lists (Courses, MEAInvolvement), Admins (core team emails).
7. **Reload the Sheet** so the LEADS menu appears.
8. **Test:** Deploy → Test deployments → open the `/dev` link.
9. **Go live:** Deploy → New deployment → Web app. Execute as **Me**, access **Anyone within Ateneo**. Share the `/exec` link. After later changes: Manage deployments → edit → Version: New version.

> **Deploy from an Ateneo account.** If the owner is in a different Google Workspace (e.g. a personal or company account), Google hides applicants' emails and everyone shows as "not signed in". `setup_applyValidation` logs a warning when this is the case. If `student.ateneo.edu` and `ateneo.edu` are separate Workspaces, deploy from the one applicants use (and keep `AllowedEmailDomains` in sync).

## The Activity tab (is it working?)

Every page view, server call, application, validation failure and error lands in the Sheet's **Activity** tab: `When | Level | Who | Page | Event | Details | ms`. ERROR rows are red, WARN rows yellow. Errors in someone's browser show up too (`client_js_error`). Use it to check the portal is working, to debug ("what happened when X tried to apply?"), and to track traffic. It never stores essays, ID numbers or phone numbers. It trims itself (oldest 5,000 rows) past 20,000 rows.

## Rules for builders (details in CONTEXT.md)

- Every function a page calls with `google.script.run` must be **public** (no trailing `_`) and prefixed: `apply_` or `dash_`. Everything else ends in `_`.
- Look people up with `requireApplicant_()` / `getApplicantByEmail_(currentEmail_())`. Never trust an ID or email sent from the page.
- Writes go through `validateApplication_(form, 'apply')` → lock → `safeCell_`. Applicant code never changes Status / Requirements / Payment.
- Form links only through `formLink_()`, and only when `progress_()` says that step is unlocked.
- **Never put a scriptlet tag in an HTML comment.** Apps Script runs scriptlets inside comments too.

## Data validation: two layers

1. **Sheet** (`setup_applyValidation` + `AdminMenu.gs`): regex/list/range rules on every Applicants column, and order checks on the three track columns, so bad hand edits get rejected or undone.
2. **Code** (`Utils.gs`): script writes are *also* checked by the Sheet rules, and a bad value throws that rule's help text, which users would see as a confusing error. So the server checks everything first (`RULES`, `validateApplication_`), strips control characters, and blocks formula injection (`safeCell_`). The Apply page fetches the same rules with `utils_getFormRules()`.

## Working on the code (GitHub + clasp)

Repo: https://github.com/Koala3353/leads-applicant-portal · Apps Script project "LEADS App Portal Sample".

One-time setup (you need edit access to the Apps Script project):

```bash
npm install -g @google/clasp
clasp login                      # sign in with the account that can edit the project
git clone https://github.com/Koala3353/leads-applicant-portal.git && cd leads-applicant-portal
printf '{"scriptId":"1PNYSoaJXNKVgqW4TGj5cbaPQn3rBvcNLUuPglIbjSlo2OOtf-p0G7nTT","rootDir":".","fileExtension":"gs","scriptExtensions":[".gs"],"htmlExtensions":[".html"],"jsonExtensions":[".json"]}\n' > .clasp.json
```

If `clasp` says the Apps Script API is off, turn it on at https://script.google.com/home/usersettings.

Every time:

1. `git pull` then `clasp pull` (get everyone's latest, including edits made in the browser editor).
2. Edit locally.
3. `clasp push` (updates the editor / test deployment only, NOT what applicants see).
4. `git add -A && git commit -m "what you changed" && git push`.
5. Publishing to applicants is still manual: Deploy → Manage deployments → Edit → New version. Ask Keene first.

If you edit in the browser editor instead, run `clasp pull` and commit afterwards so GitHub doesn't fall behind.
