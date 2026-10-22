# AI instructions: LEADS: Oversight applicant portal

Google Apps Script web app. Read `CONTEXT.md` before writing any code (rules, file ownership, sheet columns, specs).
`README.md` has the one-time clasp setup.

## How code moves
- **GitHub** = shared history. **Apps Script editor** = what runs. **clasp** syncs local files <-> editor.
- `clasp push` updates the editor / test deployment only. Applicants see changes only after a manual
  *Deploy > Manage deployments > Edit > New version*. **Never publish. Tell the human to ask Keene.**

## First time only
1. `npm install -g @google/clasp && clasp login`
2. Create `.clasp.json` exactly as in README.md (sets `fileExtension: "gs"`; without it clasp makes `.js` duplicates).
3. If clasp says the Apps Script API is off: https://script.google.com/home/usersettings

## Start of every session (before touching any file)
```
git pull
clasp pull
git status
```
If `clasp pull` changed files, someone edited in the browser. Commit those first
(`git add -A && git commit -m "sync from editor" && git push`) before your own work.

## While working
- Only edit the files the human owns (CONTEXT.md ownership table). `Home.html` + `HomeApi.gs` and `Steps.html` +
  `StepsApi.gs` (Member B: the payment view, `?page=pay`) are shared between Member B and Keene: both may edit, so pull first and keep commits small. For the other shared files (`Utils.gs`, `Activity.gs`, `ReportApi.gs`,
  `Styles.html`, `Brand.gs`, `Referrals.gs`, `Mascot.html`, `Loader.html`, `Code.gs`) write an **"Ask Keene"** note instead of editing.
- **Never name a script file `PreLeadsApi`** (in any form, e.g. `PreLeadsApi.gs`). In Oct 2026 a file with that name made the
  Apps Script editor show "500" and the /dev link "You need access" for everyone; the same code as `PreLeadsServer.gs` works.
  If the editor suddenly 500s after someone adds a file, take that file out with clasp first and re-add it under another name.
- Create new files locally and `clasp push` them; don't type a name ending in `.gs` in the editor (it adds another: `X.gs.gs`).
- Keep `.gs` as `.gs`; never create `.js` copies. Never rename sheet headers (the code finds Applicants columns by header name, `col_()` in Utils.gs; never by position).
- New Apply question = `RULES` + `COLS` (append at the END) in Utils.gs, `FIELDS` + HTML in Apply.html,
  and a `judge` line + `LABEL` for I.R.I.S. (CONTEXT.md §9.1). The saved row and draft come from `RULES`.
- Never make a top-level `const` that reads a const from another file (e.g. `const X = RULES.Y` outside a function):
  Apps Script's file load order isn't guaranteed, and if that file loads first the whole project fails to start.
- User-facing copy says "core team", never "officers".

## End of every change (in this order)
1. `clasp pull`: catch anyone who pushed while you worked. If it overwrote your files, **stop** and tell the human.
2. `clasp push`: only after step 1 is clean.
3. Test with the editor's *Deploy > Test deployments* link (HEAD), not the public `/exec` link.
4. `git add -A && git commit -m "<what changed, one line>" && git push`
5. Report: files changed, what to test, and whether it needs publishing (Keene does that).

## Handover / swapping who works on it
- Before stopping, finish "End of every change" completely. Never leave work clasp-pushed but not committed,
  or committed but not clasp-pushed. Post in the group chat: "Done on <files>, pushed + committed <commit id>".
- The next person starts with "Start of every session". One person per file at a time; claim it in the
  group chat first ("taking Apply.html").
- If two people touched the same file, do **not** `clasp push` over it: `git pull`, resolve the conflict in git, then `clasp push`.
- If anything looks off (missing files, `.js` files, huge diffs), stop and ask Keene instead of pushing.
