/**
 * Referrals.gs  (shared: referral codes, checks, counts, and the core team's Referrals tab)
 *
 * - Every applicant gets a code when they submit: just their nickname in capitals, e.g. BEA. If that's taken,
 *   a number is added (BEA2, BEA3...). Stored in Applicants › ReferralCode. Older BEA-7K2Q style codes still work.
 * - A new applicant can enter someone's code (or arrive via ...exec?ref=CODE). On submit the server checks it and
 *   saves ReferredBy (the code) + ReferrerID (that person's ApplicantID). Locked after submit.
 * - Counts are worked out from the Applicants tab (one read of the ReferrerID + Status columns), so there's no second
 *   list to keep in sync.
 *   A referral counts once the referred person applies; withdrawn applicants aren't counted.
 * - The Referrals tab (built by referrals_setupTab) groups everyone by who invited them, for separating friends at camp.
 */

/** A referral code, cleaned: "bea" -> "BEA", " Bea 2 " -> "BEA2". Accepts the older BEA-7K2Q style too. */
function normalizeReferral_(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 15);
}

/** The name: the nickname in capitals (accents dropped, ñ -> N, spaces/symbols removed), else the first name, else "LEAD". */
function referralPrefix_(nickname, fullName) {
  const letters = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters(nickname) || letters(String(fullName || '').trim().split(/\s+/)[0]) || 'LEAD').slice(0, 12);
}

/** The name if it's free, else the name + the lowest free number (BEA2, BEA3...). `taken` = Set of existing codes. */
function makeReferralCode_(nickname, fullName, taken) {
  const name = referralPrefix_(nickname, fullName);
  if (!taken || !taken.has(name)) return name;
  for (let n = 2; n < 1000; n++) if (!taken.has(name + n)) return name + n;
  throw new Error('Could not make a unique referral code. Try again.');
}

/**
 * Checks a referral code against the Applicants rows already read inside the submit lock.
 * Returns { code, referrerId } when valid, { error } when not, or {} when blank.
 */
function checkReferral_(raw, values, email) {
  const code = normalizeReferral_(raw);
  if (!code) return {};
  const head = cols_(), cCode = head.indexOf('ReferralCode'), cId = col_('ApplicantID'), cEmail = col_('Email'), cStatus = col_('Status');
  if (cCode < 0) return { error: BRAND.referral.unknown };
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][cCode]).trim().toUpperCase() !== code) continue;
    if (String(values[i][cEmail]).trim().toLowerCase() === email) return { error: BRAND.referral.self };
    if (String(values[i][cStatus]).trim() === 'WITHDRAWN') return { error: BRAND.referral.unknown };   // same words as unknown: a code must not reveal that someone withdrew
    return { code: code, referrerId: String(values[i][cId]).trim() };
  }
  return { error: BRAND.referral.unknown };
}

/**
 * For the Apply page's referral picker: up to 3 active codes that START with what was typed (3+ letters, so typing
 * one or two letters can't list who applied). Codes only, never names or IDs. A code is someone's nickname, so this
 * is also rate limited (30 searches per person per 10 minutes); the full list never leaves the server. The submit still runs
 * checkReferral_, so the picker is a convenience, not the check. { codes, exact } — exact = the typed code exists.
 */
function referralSearch_(raw, email) {
  const q = normalizeReferral_(raw);
  if (q.length < REF_MIN_LETTERS) return { codes: [], exact: false };
  if (!bump_('refsearch:' + email, 30, 600)) return { codes: [], exact: false, slow: true };
  const all = activeReferralCodes_();
  const hits = all.filter(c => c.indexOf(q) === 0).sort((x, y) => x.length - y.length || (x < y ? -1 : 1));
  return { codes: hits.slice(0, 3), exact: all.indexOf(q) >= 0 };
}
const REF_MIN_LETTERS = 3;   // the Apply page uses the same number (BRAND.referral.minLetters)

/** Every code an applicant can still use (not withdrawn). Read from two columns, cached for a minute (a rush of typing must not re-read the tab). */
function activeReferralCodes_() {
  const cache = CacheService.getScriptCache();
  try { const hit = cache.get('refcodes'); if (hit) return JSON.parse(hit); } catch (e) { /* read it fresh */ }
  const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow(), cCode = cols_().indexOf('ReferralCode');
  const out = [];
  if (last >= 2 && cCode >= 0) {
    const codes = sh.getRange(2, cCode + 1, last - 1, 1).getValues();
    const stat = sh.getRange(2, col_('Status') + 1, last - 1, 1).getValues();
    for (let i = 0; i < codes.length; i++) {
      const c = String(codes[i][0] || '').trim().toUpperCase();
      if (c && String(stat[i][0]).trim() !== 'WITHDRAWN') out.push(c);
    }
  }
  try { cache.put('refcodes', JSON.stringify(out), 60); } catch (e) { /* too big: fine, just slower */ }
  return out;
}

/**
 * { referrerApplicantId: [first names of the people who applied with their code] }, withdrawn left out. Built from three
 * columns once a minute (cached), so a rush of hub loads doesn't re-read the tab each time. A submit with a code clears it.
 */
function referralMap_() {
  const cache = CacheService.getScriptCache();
  try { const hit = cache.get('refmap'); if (hit) return JSON.parse(hit); } catch (e) { /* read it fresh */ }
  const out = {}, sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow(), cRef = cols_().indexOf('ReferrerID');
  if (last >= 2 && cRef >= 0) {
    const refs = sh.getRange(2, cRef + 1, last - 1, 1).getValues();
    const stat = sh.getRange(2, col_('Status') + 1, last - 1, 1).getValues();
    const full = sh.getRange(2, col_('FullName') + 1, last - 1, 1).getValues();
    for (let i = 0; i < refs.length; i++) {
      const by = String(refs[i][0]).trim();
      if (!by || String(stat[i][0]).trim() === 'WITHDRAWN') continue;
      (out[by] = out[by] || []).push(firstName_(full[i][0]));
    }
  }
  try { cache.put('refmap', JSON.stringify(out), 60); } catch (e) { /* too big: fine, just slower */ }
  return out;
}
function forgetReferralMap_() { try { CacheService.getScriptCache().remove('refmap'); } catch (e) { /* runs out in a minute */ } }

/** "Dela Cruz, Juan P." -> "Juan"; "Juan P. Dela Cruz" -> "Juan" (the form asks for Last name, First name). */
function firstName_(fullName) {
  const s = String(fullName || '').trim();
  const part = s.indexOf(',') >= 0 ? s.slice(s.indexOf(',') + 1) : s;
  return (part.trim().split(/\s+/)[0] || '').slice(0, 30);
}

/** All referral codes in use (for uniqueness), from rows already read. */
function referralCodesIn_(values) {
  const c = cols_().indexOf('ReferralCode'), set = new Set();
  if (c < 0) return set;
  for (let i = 1; i < values.length; i++) { const v = String(values[i][c] || '').trim(); if (v) set.add(v); }
  return set;
}

/**
 * For the hub: this applicant's code (made now if they applied before referrals existed), how many people applied
 * with it and their FIRST NAMES only (core team decision, Oct 23 2026: nothing else, never their status), and points:
 * 1 per person who applied with your code + 1 if you applied with someone else's. Points decide the advantage at room
 * booking and at camp.
 */
function referralInfo_(found) {
  const a = found.data;
  let code = String(a.ReferralCode || '').trim();
  if (!code) {
    const made = withScriptLock_(10000, () => {
      ensureApplicantHeaders_();   // inside the lock, so it can't race a submit adding the same columns
      const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
      // find the row again by email: the core team may have sorted or deleted rows since found.row was read
      const cEmail = col_('Email'), me = String(a.Email || '').trim().toLowerCase();
      const i = values.findIndex((r, n) => n > 0 && String(r[cEmail]).trim().toLowerCase() === me);
      if (i < 1) return '';
      const now = String(values[i][col_('ReferralCode')] || '').trim();
      if (now) return now;
      const fresh = makeReferralCode_(a.Nickname, a.FullName, referralCodesIn_(values));
      updateApplicant_(i + 1, { ReferralCode: fresh }, String(a.ApplicantID));
      return fresh;
    });
    if (!made) return null;
    code = made;
  }
  // How many applied with the code, and their first names. Never their statuses: that would tell a referrer whether a
  // friend got in (RA 10173). One read of three columns instead of one call per referral.
  const names = (referralMap_()[String(a.ApplicantID)] || []).slice();
  const applied = names.length;
  const usedCode = String(a.ReferredBy || '').trim();
  const counts = { applied: applied };
  return { code: code, link: portalUrl_() + '?ref=' + encodeURIComponent(code), counts: counts, open: isOpen_(),
    names: names.filter(Boolean).slice(0, 50), usedCode: usedCode, points: applied + (usedCode ? 1 : 0) };
}

/**
 * Core team: (re)builds the "Referrals" tab. Live formulas over Applicants, so it never goes stale:
 * one row per person who referred someone, with their code, who invited THEM, how many they brought in,
 * and the names + IDs of everyone they referred (to separate friend groups at camp).
 * Run from the LEADS menu › Referrals › Rebuild Referrals tab (safe to run again; it only rewrites that tab).
 */
function referrals_setupTab() {
  requireAdmin_();
  ensureApplicantHeaders_();
  const ss = ss_(), name = SHEET.REFERRALS;
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const L = h => columnLetter_(col_(h) + 1);
  const A = "'" + SHEET.APPLICANTS + "'!";
  const rng = h => A + L(h) + '2:' + L(h);
  sh.clear();
  sh.getRange(1, 1, 1, 6).setValues([['ReferrerID', 'Referrer', 'Their code', 'Invited by', 'People referred', 'Referred (name, ID, status)']])
    .setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + rng('ReferrerID') + ', ' + rng('ReferrerID') + '<>""))), "")');   // blank, not #N/A, until the first referral
  sh.getRange('B2').setFormula('=ARRAYFORMULA(IF(A2:A="",, IFERROR(XLOOKUP(A2:A, ' + rng('ApplicantID') + ', ' + rng('FullName') + '))))');
  sh.getRange('C2').setFormula('=ARRAYFORMULA(IF(A2:A="",, IFERROR(XLOOKUP(A2:A, ' + rng('ApplicantID') + ', ' + rng('ReferralCode') + '))))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(IF(A2:A="",, IFERROR(XLOOKUP(A2:A, ' + rng('ApplicantID') + ', ' + rng('ReferrerID') + '))))');
  sh.getRange('E2').setFormula('=ARRAYFORMULA(IF(A2:A="",, COUNTIFS(' + rng('ReferrerID') + ', A2:A, ' + rng('Status') + ', "<>WITHDRAWN")))');
  sh.getRange('F2').setFormula('=BYROW(A2:A, LAMBDA(r, IF(r="",, TEXTJOIN(CHAR(10), TRUE, FILTER(' +
    rng('FullName') + ' & " (" & ' + rng('ApplicantID') + ' & ", " & ' + rng('Status') + ' & ")", ' + rng('ReferrerID') + ' = r)))))');
  sh.getRange('F:F').setWrap(true);
  sh.setColumnWidths(1, 5, 130); sh.setColumnWidth(6, 420);
  sh.getRange('A1:F1').setNote('Built by the portal (referrals_setupTab). Formulas only: edit the Applicants tab, not this one.');
  activity_('referrals_tab', 'rebuilt', { page: 'admin' });
  return 'Referrals tab ready.';
}
