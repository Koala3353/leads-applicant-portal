# LEADS Applicant Portal

LEADS is MEA's off-site leadership camp. Theme: **LEADS: Oversight** (fear of being watched, of being boxed in, of failing). "You are being watched. Good. Apply anyway."

One Google Sheet (the database) + one small Apps Script web app + two Google Forms.

| Part | What it is | Owner |
|---|---|---|
| **Home** (`.../exec`) | The hub: countdown, the applicant's progress, next step, links to everything. The Dashboard sits inside it. | Keene (done) |
| **Dashboard** | The applicant's own area, inside Home: status, what to prepare, Form buttons when it's their turn | Member B |
| **Apply** (`.../exec?page=apply`) | The application form | Member A |
| **Requirements form**, **Payment form** | Google Forms that collect the PDFs, camp info and proof of payment | officers |
| **Officer side** | The Sheet itself, with a **LEADS** menu | Keene (done) |

The team works from [CONTEXT.md](CONTEXT.md): paste it into your AI first.

## How an applicant moves through LEADS

Three separate tracks, so payment can come before *or* after acceptance:

| Track | Values | Who moves it |
|---|---|---|
| **Status** (the decision) | SUBMITTED → UNDER REVIEW → ACCEPTED / WAITLISTED / REJECTED → CONFIRMED (WITHDRAWN any time) | officers |
| **Requirements** (Form) | NONE → PARTIAL → SUBMITTED → APPROVED (RETURNED = fix and resend) | officers, after checking Form responses |
| **Payment** (Form) | NONE → SUBMITTED → VERIFIED (REJECTED = resend) | officers, after checking Form responses |

- **Pay first.** The payment Form link appears once **ACCEPTED**, or right after applying when Settings › `PaymentStage` = `ANYTIME`.
- The requirements Form link appears once **ACCEPTED and Payment is VERIFIED**.
- ACCEPTED + APPROVED + VERIFIED → **CONFIRMED** automatically.
- `progress_()` in Utils.gs is the one place these unlock rules live. The hub and Dashboard both use it.

## How officers work (in the Sheet)

- **LEADS menu:** select applicant rows in the Applicants tab (any cell in each row; several rows at once is fine) → LEADS → Decision / Requirements / Payment → pick a value. Each row is checked, logged, and auto-confirmed when all three tracks are done. Skipped rows are listed with the reason.
- **Typing in the cells also works:** a change to Status / Requirements / Payment by someone in the Admins tab is checked and logged; a wrong move (e.g. SUBMITTED → CONFIRMED) or a change by a non-officer is **undone** with a message. Pasting over many cells at once isn't checked (it's logged as a bulk edit), so prefer the menu.
- Officers must be in the **Admins** tab **and** be editors of the Sheet, using an account in the same Google Workspace as the owner.
- Officers see an "Open the Sheet" link on the portal's Home page.

## Files

| File | Owner | What it does |
|---|---|---|
| `Code.gs` | Keene | The only `doGet`. Home, or `?page=apply`. Anything else → Home |
| `Utils.gs` | Keene | Settings, lookups, **server-side validation**, status rules, Form links, `progress_()`, the Log and the **Activity** tab |
| `AdminMenu.gs` | Keene | The LEADS menu and the hand-edit check (`onOpen`, `onEdit`) |
| `Brand.gs` | anyone | All copy, colors, fonts. Edit this to re-theme |
| `Setup.gs` | Keene | Sheet validation, colors, Log protection. Safe to re-run |
| `HomeApi.gs` + `Home.html` | Keene | The hub |
| `Styles.html`, `PageTop.html`, `Loader.html`, `Mascot.html` | shared | Base theme; top bar with "Back to the hub"; SVG loading overlay; I.R.I.S. the mascot, a one-eyed CRT (lines, faces and screen colors in `BRAND.mascot`, turn off with `show: false`) |
| `Apply.html` (+ `ApplyApi.gs`, to create) | Member A | Placeholder: the application form |
| `Dashboard.html` + `DashboardApi.gs` | Member B | Placeholder inside Home; `dash_get()` starter already works |

Apps Script won't let a `.gs` and an `.html` share a name, which is why server code is `XxxApi.gs`.

## Setup

1. **Open the Sheet** (owned by MEA's Ateneo account) → Extensions → Apps Script. Name the project "LEADS Applicant Portal".
2. **Paste the files.** Every `.gs` above as a Script (`+ → Script`, no `.gs` in the name), every `.html` as HTML. Replace `appsscript.json` via Project Settings → "Show appsscript.json". If the project still has `Status`, `Upload`, `Payment` or `Admin` files from earlier, delete them.
3. **Sheet tabs.** The Sheet needs `Applicants`, `Settings`, `Lists`, `Admins` and `Log` (already set up; the one-time `Migrate.gs` that built them was deleted on 2026-10-15). Run `setup_applyValidation` once after any column change. The `Activity` tab makes itself the first time the portal logs something.
4. **Make the two Google Forms** (from the same Ateneo account):
   - Turn on *Collect email addresses* (Verified) and *Restrict to users in Ateneo*.
   - Add a short-answer question **"Applicant ID"** (required) as the first question.
   - Requirements form: file-upload questions for each required document, plus camp info (emergency contact + number, dietary, medical, shirt size). Payment form: amount, reference number, the receipt upload.
   - For each form: ⋮ → **Get pre-filled link** → type `APP-0000` in Applicant ID → Get link → Copy. Paste it into Settings › `RequirementsFormURL` / `PaymentFormURL`. The portal swaps in each applicant's own ID.
   - Link each form's responses to a Sheet (Responses → Link to Sheets) so officers can match them by Applicant ID.
5. **Fill the yellow cells.** Settings (event, fee, slots, deadlines, `PaymentStage`, `PaymentInstructions`, `ContactEmail`), Lists (Courses, MEAInvolvement), Admins (officer emails). Delete the EXAMPLE applicant rows.
6. **Reload the Sheet** so the LEADS menu appears.
7. **Test:** Deploy → Test deployments → open the `/dev` link.
8. **Go live:** Deploy → New deployment → Web app. Execute as **Me**, access **Anyone within Ateneo**. Share the `/exec` link. After later changes: Manage deployments → edit → Version: New version.

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
