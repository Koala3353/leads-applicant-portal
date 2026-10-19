/**
 * Referrals.gs  (shared: referral codes, checks, counts, and the core team's Referrals tab)
 *
 * - Every applicant gets a code when they submit: first 4 letters of their nickname + 4 random characters,
 *   e.g. BEA-7K2Q (no 0/O/1/I/L, so it's easy to read out). Stored in Applicants › ReferralCode.
 * - A new applicant can enter someone's code (or arrive via ...exec?ref=CODE). On submit the server checks it and
 *   saves ReferredBy (the code) + ReferrerID (that person's ApplicantID). Locked after submit.
 * - Counts are worked out from the Applicants tab (TextFinder on ReferrerID), so there's no second list to keep in sync.
 *   A referral counts once the referred person applies; withdrawn applicants aren't counted.
 * - The Referrals tab (built by referrals_setupTab) groups everyone by who invited them, for separating friends at camp.
 */

const REFERRAL_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "BEA-7K2Q" style code, cleaned. '' if it can't be one. Accepts lower case and stray spaces. */
function normalizeReferral_(v) {
  const s = String(v || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
  return /^[A-Z]{1,4}-[A-Z0-9]{4}$/.test(s) ? s : (s ? s.slice(0, 12) : '');
}

/** The name part: first 4 letters of the nickname (accents dropped, ñ -> N), else of the full name, else "LEAD". */
function referralPrefix_(nickname, fullName) {
  const letters = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  return (letters(nickname) || letters(fullName) || 'LEAD').slice(0, 4);
}

/** A code not in `taken` (a Set of existing codes). */
function makeReferralCode_(nickname, fullName, taken) {
  const prefix = referralPrefix_(nickname, fullName);
  for (let tries = 0; tries < 50; tries++) {
    let tail = '';
    for (let i = 0; i < 4; i++) tail += REFERRAL_CHARS.charAt(Math.floor(Math.random() * REFERRAL_CHARS.length));
    const code = prefix + '-' + tail;
    if (!taken || !taken.has(code)) return code;
  }
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
    if (String(values[i][cStatus]).trim() === 'WITHDRAWN') return { error: BRAND.referral.inactive };
    return { code: code, referrerId: String(values[i][cId]).trim() };
  }
  return { error: BRAND.referral.unknown };
}

/** All referral codes in use (for uniqueness), from rows already read. */
function referralCodesIn_(values) {
  const c = cols_().indexOf('ReferralCode'), set = new Set();
  if (c < 0) return set;
  for (let i = 1; i < values.length; i++) { const v = String(values[i][c] || '').trim(); if (v) set.add(v); }
  return set;
}

/**
 * For the hub: this applicant's code (made now if they applied before referrals existed) and how many people
 * applied with it. Never returns who those people are (RA 10173): counts only.
 */
function referralInfo_(found) {
  const a = found.data;
  let code = String(a.ReferralCode || '').trim();
  if (!code) {
    ensureApplicantHeaders_();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
      const now = values[found.row - 1][col_('ReferralCode')];
      code = String(now || '').trim() || makeReferralCode_(a.Nickname, a.FullName, referralCodesIn_(values));
      if (!String(now || '').trim()) updateApplicant_(found.row, { ReferralCode: code });
    } finally { lock.releaseLock(); }
  }
  const counts = { applied: 0, accepted: 0, confirmed: 0 };
  const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow(), cRef = cols_().indexOf('ReferrerID');
  if (last >= 2 && cRef >= 0) {
    const hits = sh.getRange(2, cRef + 1, last - 1, 1).createTextFinder(String(a.ApplicantID)).matchEntireCell(true).findAll();
    const cStatus = col_('Status') + 1;
    hits.forEach(h => {
      const st = String(sh.getRange(h.getRow(), cStatus).getValue()).trim();
      if (st === 'WITHDRAWN') return;
      counts.applied++;
      if (st === 'ACCEPTED' || st === 'CONFIRMED') counts.accepted++;
      if (st === 'CONFIRMED') counts.confirmed++;
    });
  }
  return { code: code, link: portalUrl_() + '?ref=' + encodeURIComponent(code), counts: counts, open: isOpen_() };
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
  const ss = ss_(), name = 'Referrals';
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  const L = h => columnLetter_(col_(h) + 1);
  const A = "'" + SHEET.APPLICANTS + "'!";
  const rng = h => A + L(h) + '2:' + L(h);
  sh.clear();
  sh.getRange(1, 1, 1, 6).setValues([['ReferrerID', 'Referrer', 'Their code', 'Invited by', 'People referred', 'Referred (name, ID, status)']])
    .setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A2').setFormula('=SORT(UNIQUE(FILTER(' + rng('ReferrerID') + ', ' + rng('ReferrerID') + '<>"")))');
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
