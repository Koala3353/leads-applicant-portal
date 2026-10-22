/**
 * ApplyApi.gs
 * Server implementation for Apply.html (Eyes on LEADS applicant portal).
 *
 * Rules:
 * - Public functions start with apply_ (no trailing _)
 * - Server-only functions end with _
 * - Identify caller ONLY by currentEmail_()
 * - Validate all inputs on the server using validateApplication_() and safeCell_()
 * - All writes execute inside a ScriptLock with state re-verification inside lock
 * - Never return Date objects across the wire
 * - No emojis used anywhere
 */

/**
 * Returns everything the Apply page needs to render, in a single remote call.
 * @return {Object} Context including sign-in state, application status, rules, draft and member autofill.
 */
function apply_getForm() {
  return traced_('apply_getForm', 'apply', apply_getForm_, () => 'form loaded');
}

function apply_getForm_() {
  const email = currentEmail_();
  const found = email ? getApplicantForPortal_(email) : null;
  const deadline = parseDate_(getSetting_('Deadline'));
  const rules = formRules_();
  const contact = String(getSetting_('ContactEmail') || '').trim();

  let draft = null;
  if (email && !found) {
    try {
      draft = apply_getDraft_(email);
    } catch (err) {
      draft = null;
    }
  }

  return {
    signedIn: !!email,
    email: email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    isOpen: rules.isOpen,
    deadline: deadline ? deadline.toISOString() : null,
    alreadyApplied: found ? {
      id: found.data.ApplicantID,
      status: found.data.Status
    } : null,
    rules: rules.rules,
    contact: contact,
    eventDates: String(getSetting_('EventDates') || '').trim(),   // shown in the offsite-availability question
    draft: draft,
    member: email && !found ? apply_memberFor_(email, '') : null
  };
}

/* ---------------- essay integrity (signals only; the core team decides what they mean) ----------------
 * Apply.html counts, per essay, how many times something was pasted in, how many characters were pasted vs typed,
 * and how often the page lost focus (other tabs or apps), overall and while in an essay. Nothing about WHAT was
 * pasted or which tabs. Thresholds are deliberately loose: a flag means "read this one closely", not "cheated". */
const INTEGRITY = { pastedShare: .4, minPasted: 120, manyPastes: 3, awayCount: 8, awayInEssay: 4 };
const ESSAY_FIELDS = ['WhyParticipant', 'FirstImpression', 'TakesLeadership', 'FearLeadership'];
function integrityLog_(raw) {
  try { const o = JSON.parse(String(raw || '')); return o && o.v === 1 ? JSON.stringify(o).slice(0, 2000) : ''; } catch (e) { return ''; }
}
function integrityFlags_(raw, clean) {
  let o; try { o = JSON.parse(String(raw || '')); } catch (e) { return ''; }
  if (!o || o.v !== 1) return '';
  const num = v => Math.max(0, Math.min(1e7, Number(v) || 0));
  const out = [];
  ESSAY_FIELDS.forEach(f => {
    const s = (o.essays || {})[f] || {}, len = String((clean || {})[f] || '').length;
    const pasted = num(s.pasted), pastes = num(s.pastes);
    if (pasted >= INTEGRITY.minPasted && len && pasted >= len * INTEGRITY.pastedShare) out.push(f + ' ~' + Math.min(100, Math.round(pasted / len * 100)) + '% pasted');
    else if (pastes >= INTEGRITY.manyPastes) out.push(f + ' pasted into ' + pastes + 'x');
  });
  const away = o.away || {};
  if (num(away.inEssay) >= INTEGRITY.awayInEssay) out.push('left the page ' + num(away.inEssay) + 'x mid-essay');
  else if (num(away.count) >= INTEGRITY.awayCount) out.push('left the page ' + num(away.count) + 'x (' + Math.round(num(away.ms) / 60000) + ' min away)');
  return out.length ? 'FLAG: ' + out.join('; ') : '';
}

/** The referral picker on Apply: matching codes as the applicant types (Referrals.gs referralSearch_). */
function apply_referralSearch(q) {
  const email = currentEmail_();
  if (!email || !isAllowedDomain_(email)) return { codes: [], exact: false };
  return referralSearch_(q, email);
}

/**
 * Submits an application. Private on purpose: the only way in is game_submitFinal (GameApi.gs),
 * so nobody can skip the Threat Assessment by calling it from the browser console.
 *
 * @param {Object} form Raw form input (the saved draft + GameAnswers).
 * @return {Object} { ok: true, id: string } or { ok: false, errors: Object }
 */
function apply_submit_(form) {
  // 1. Verify sign-in status
  const email = currentEmail_();
  if (!email) {
    throw new Error('Sign in with your Ateneo account first.');
  }

  // 2. Verify email domain (@student.ateneo.edu)
  if (!isAllowedDomain_(email)) {
    throw new Error('Use your Ateneo account to apply.');
  }

  // 2b. Someone who keeps getting "that ID can't be used" or "unknown referral code" is probably guessing other
  // people's IDs or names to learn who applied: after 6 failures in an hour, stop answering for a while.
  const failKey = probeKey_(email);
  if (!bump_(failKey, 6, 3600, true)) {
    return { ok: false, errors: { IDNumber: 'Too many attempts. Wait an hour, or message the core team if something is wrong.' } };
  }
  const failed = errs => { bump_(failKey, 99, 3600); return { ok: false, errors: errs }; };

  // 3. Validate with the shared RULES in Utils.gs (phone cleanup, ID range, Block for first years, consent, choices)
  const input = Object.assign({}, form || {});
  const v = validateApplication_(input, 'apply');
  const errors = v.ok ? {} : Object.assign({}, v.errors);
  const candidateIdStr = String(v.clean.IDNumber || '').trim();

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors: errors };
  }

  // 4. The ID must not belong to another account in the MEA member list (stops anyone filing under a classmate's ID,
  // which would lock the real owner out). IDs not in MemData (e.g. new members) can't be checked and are allowed.
  if (apply_idBelongsToOther_(candidateIdStr, email)) {
    // same words as "already applied" below, so the reply never says WHY (member elsewhere vs. already filed)
    return failed({ IDNumber: "That ID number can't be used for a new application. If it's yours, message the core team." });
  }

  // 5. Data integrity lock and atomic write. Keep the time inside the lock short: every applicant's submit waits on it.
  // One read covers both duplicate checks; the Log row and draft clean-up happen after the lock is released.
  let nextId, referralCode = '', referral = {};
  // a submit is rare and precious: wait longer rather than fail during a rush
  const early = withScriptLock_(30000, () => {
    // Re-verify applications open status inside lock
    if (!isOpen_()) {
      throw new Error('Applications just closed.');
    }

    ensureApplicantHeaders_();   // adds headers for any new COLS the first time
    const idCol = col_('IDNumber'), emailCol = col_('Email');
    const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      // Re-verify applicant has not already applied inside lock
      if (String(values[i][emailCol]).trim().toLowerCase() === email) {
        throw new Error('You already applied.');
      }
    }

    // Referral first: the code must belong to someone else who applied and hasn't withdrawn (Referrals.gs).
    // Checked before the ID so a bogus code can't be used to ask "has this ID applied?" without filing anything.
    const ref = checkReferral_(v.clean.ReferredBy, values, email);
    if (ref.error) return failed({ ReferredBy: ref.error });

    // Check Ateneo IDNumber uniqueness across all applicant rows
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]).trim() === candidateIdStr) {
        activity_('id_conflict', 'submit with an ID already on file (row ' + (i + 1) + ')', { level: 'WARN', page: 'apply' });   // for the core team to check
        return failed({ IDNumber: "That ID number can't be used for a new application. If it's yours, message the core team." });
      }
    }
    referralCode = makeReferralCode_(v.clean.Nickname, v.clean.FullName, referralCodesIn_(values));
    referral = ref;

    // Generate next sequential ApplicantID
    nextId = nextApplicantId_();
    const now = new Date();

    // Each value goes under its header, wherever that column is in the Sheet. Every Apply answer comes straight from
    // RULES (a new question needs no line here), then the fields the portal fills in itself.
    const rowMap = Object.assign({}, v.clean, {
      ApplicantID: nextId,
      Timestamp: now,
      Email: email,
      IDNumber: candidateIdStr,
      YearLevel: Number(v.clean.YearLevel),
      Mobile: String(v.clean.Mobile),
      GameAnswers: String(input.GameAnswers || '').slice(0, 5000),   // JSON of the Game page choices
      IntegrityLog: integrityLog_(input.IntegrityLog),                // essay paste / tab-switch counts (core team only)
      IntegrityFlags: integrityFlags_(input.IntegrityLog, v.clean),   // the short version: blank, or what looked off
      ReferralCode: referralCode,
      ReferredBy: referral.code || '',
      ReferrerID: referral.referrerId || '',
      Status: 'SUBMITTED',
      Requirements: 'NONE',
      Payment: 'NONE',
      ReviewedBy: '',
      LastUpdated: now,
      Notes: ''
    });

    const row = cols_().map(col => textCell_(rowMap[col] !== undefined ? rowMap[col] : ''));   // text stays text (Utils.gs)
    sheet_(SHEET.APPLICANTS).appendRow(row);
    SpreadsheetApp.flush();   // the row is written before the next submit reads the sheet
    return null;
  });
  if (early) return early;   // refused inside the lock (referral or ID problem)
  forgetApplicant_(email);   // the cached "no file yet" must not outlive the submit

  // Outside the lock: appends and a single-row clear don't need it
  logChange_(nextId, 'status', '', 'SUBMITTED', 'system');
  const flags = integrityFlags_(input.IntegrityLog, v.clean);
  if (flags) activity_('integrity_flag', nextId + ': ' + flags, { level: 'WARN', page: 'apply' });   // in the daily report
  if (referral.referrerId) activity_('referral', nextId + ' referred by ' + referral.referrerId + ' (' + referral.code + ')', { page: 'apply' });
  apply_deleteDraft_(email);
  return { ok: true, id: nextId, referralCode: referralCode };
}

/* ---------------- drafts, saved per Google account ----------------
 * One row per account in the hidden Drafts tab. Rows are never deleted or moved (a cleared draft is a blank Data
 * cell), so a save writes straight to the person's own row with NO script lock. Only someone's very first save
 * (appending their row) takes the lock, for a moment. This keeps autosave from queueing behind everyone else's
 * saves and submits when lots of people apply at once. The row number is cached and re-checked before use.
 */

function apply_draftSheet_() {
  return ensureTab_(SHEET.DRAFTS, ['Email', 'SavedAt', 'Data'], { hidden: true });
}

function apply_findDraftRow_(sh, email) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const emails = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (String(emails[i][0]).toLowerCase() === email) return i + 2;
  }
  return 0;
}

/** Row number of this account's draft (cached, verified), or 0. */
function apply_draftRow_(sh, email) {
  const cache = CacheService.getScriptCache(), key = 'draftrow:' + email;
  const hit = Number(cache.get(key) || 0);
  if (hit && hit <= sh.getLastRow() && String(sh.getRange(hit, 1).getValue()).toLowerCase() === email) return hit;
  const row = apply_findDraftRow_(sh, email);
  if (row) cache.put(key, String(row), 21600);
  return row;
}

/** Row for this account, adding it on the first save. Only the append is locked. */
function apply_ensureDraftRow_(sh, email) {
  let row = apply_draftRow_(sh, email);
  if (row) return row;
  row = withScriptLock_(15000, () => {
    const again = apply_findDraftRow_(sh, email);   // someone (another tab) may have added it while we waited
    if (again) return again;
    sh.appendRow([email, '', '']); SpreadsheetApp.flush();
    return sh.getLastRow();
  });
  CacheService.getScriptCache().put('draftrow:' + email, String(row), 21600);
  return row;
}

function apply_getDraft_(email) {
  try {
    const sh = apply_draftSheet_();
    const row = apply_draftRow_(sh, email);
    if (!row) return null;
    const [, savedAt, json] = sh.getRange(row, 1, 1, 3).getValues()[0];
    if (!String(json || '').trim()) return null;   // cleared
    return {
      data: JSON.parse(json || '{}'),
      savedAt: savedAt instanceof Date ? savedAt.toISOString() : String(savedAt)
    };
  } catch (err) {
    activity_('draft_load', String(err && err.message), { level: 'ERROR', page: 'apply' });
    return null;
  }
}

/** Clears the draft (keeps the row so no other row ever moves). */
function apply_deleteDraft_(email) {
  try {
    const sh = apply_draftSheet_();
    const row = apply_draftRow_(sh, email);
    if (row) sh.getRange(row, 2, 1, 2).setValues([['', '']]);
  } catch (err) {
    activity_('draft_delete', String(err && err.message), { level: 'WARN', page: 'apply' });
  }
}

/** Saves the signed-in applicant's draft. Public. No script lock in the normal case (see above). */
function apply_saveDraft(data) {
  const email = currentEmail_();
  if (!email || !isAllowedDomain_(email)) return { ok: false };
  data = data || {};
  const clean = {};
  // every Apply question in RULES, plus the Game's answers
  const fields = Object.keys(RULES).filter(f => RULES[f].stage === 'apply').concat(['GameAnswers', 'IntegrityLog']);
  fields.forEach(f => {
    if (data[f] !== undefined && data[f] !== null) {
      clean[f] = String(data[f]).slice(0, f === 'GameAnswers' ? 5000 : 1500);
    }
  });

  try {
    // Already applied? (A guard only: apply_submit_ re-checks inside its lock and clears the draft.)
    if (getApplicantByEmail_(email)) return { ok: false, applied: true };
    // Nothing is stored on our side until they've ticked the data-privacy consent (RA 10173). Before that the page
    // keeps the draft in this browser only. Unticking it later deletes what we had.
    if ('DataConsent' in clean && clean.DataConsent !== 'Y') {
      apply_deleteDraft_(email);
      return { ok: false, consent: true };
    }
    const sh = apply_draftSheet_();
    // Merge onto the stored draft: Apply sends only its fields and the Game only GameAnswers, so replacing outright
    // would wipe the other page's answers. The per-person lock stops two open tabs (Apply autosaving while the Game
    // saves) from each reading the old draft and writing over the other's answers. It never waits on anyone else.
    const lock = LockService.getUserLock();
    if (!lock.tryLock(10000)) return { ok: false, busy: true };
    try {
      const have = apply_draftRow_(sh, email);
      let stored = {};
      if (have) { try { stored = JSON.parse(sh.getRange(have, 3).getValue() || '{}') || {}; } catch (e) { stored = {}; } }
      // A save without the consent box (the Game sends only its answers) is kept only if consent is already on file
      if (!('DataConsent' in clean) && stored.DataConsent !== 'Y') return { ok: false, consent: true };
      const now = new Date();
      const row = have || apply_ensureDraftRow_(sh, email);
      sh.getRange(row, 2, 1, 2).setValues([[now, JSON.stringify(Object.assign({}, stored, clean))]]);
      return { ok: true, savedAt: now.toISOString() };
    } finally { lock.releaseLock(); }
  } catch (err) {
    activity_('draft_save', String(err && err.message), { level: 'ERROR', page: 'apply' });
    throw err;
  }
}

/** Clears the signed-in applicant's draft ("Discard draft"). No lock needed: nothing moves. */
function apply_discardDraft() {
  const email = currentEmail_();
  if (email) apply_deleteDraft_(email);
  activity_('draft_discard', '', { page: 'apply' });
  return true;
}

/* ---------------- MemData: autofill from member list ---------------- */

// MemData's columns, found by any of these header names (case, spaces and punctuation ignored; headerIndex_ in Utils.gs)
const MEMDATA_COLS = {
  id: ['idnumber', 'studentid', 'idno', 'id'],
  last: ['lastname', 'surname', 'last'],
  first: ['firstname', 'givenname', 'first'],
  mi: ['middleinitial', 'mi', 'middle'],
  semail: ['studentemail', 'ateneoemail', 'studentemailaddress'],
  email: ['emailaddress', 'email', 'primaryemail', 'personalemail'],
  year: ['yearlevel', 'year', 'yr'],
  course: ['course', 'program', 'degree'],
  mobile: ['mobilenumber', 'mobile', 'contactnumber', 'cellphone'],
  block: ['block', 'section'],
  mbti: ['mbti', 'mbtitype', 'personalitytype']
};
const MEMDATA_MBTI_FALLBACK = 27;   // the member form's MBTI answer has a long question as its header: column AB

/** MemData header + the rows where this email appears (found by a server-side search, not by reading every member). */
function apply_memRows_(sh, email) {
  const lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const target = String(email || '').toLowerCase().trim();
  if (!target || lastRow < 2) return [head];
  const hits = sh.getRange(2, 1, lastRow - 1, lastCol).createTextFinder(target).matchEntireCell(true).matchCase(false).findAll();
  const out = [head], seen = {};
  hits.map(c => c.getRow()).sort((x, y) => x - y).forEach(r => {
    if (seen[r]) return; seen[r] = 1;
    out.push(sh.getRange(r, 1, 1, lastCol).getDisplayValues()[0]);
  });
  return out;
}

/** True when MemData lists this ID number only under other email addresses (never this account). */
function apply_idBelongsToOther_(id, email) {
  try {
    const sh = ss_().getSheetByName(SHEET.MEMDATA);
    if (!sh || sh.getLastRow() < 2 || !id) return false;
    const lastCol = sh.getLastColumn();
    const head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const cId = headerIndex_(head, MEMDATA_COLS.id);
    const cMail = [headerIndex_(head, MEMDATA_COLS.semail), headerIndex_(head, MEMDATA_COLS.email)].filter(i => i >= 0);
    if (cId < 0 || !cMail.length) return false;
    const hits = sh.getRange(2, cId + 1, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findAll();
    if (!hits.length) return false;
    const target = String(email).toLowerCase();
    return !hits.some(c => {
      const r = sh.getRange(c.getRow(), 1, 1, lastCol).getDisplayValues()[0];
      return cMail.some(i => String(r[i]).trim().toLowerCase() === target);
    });
  } catch (err) {
    activity_('member_id_check', String(err && err.message), { level: 'WARN', page: 'apply' });
    return false;   // can't check: don't block a real applicant
  }
}

function apply_memberFor_(email, idNumber) {
  try {
    const sh = ss_().getSheetByName(SHEET.MEMDATA);
    if (!sh || sh.getLastRow() < 2) return null;
    const rows = apply_memRows_(sh, email);   // header + only the rows that mention this email
    const c = {};
    Object.keys(MEMDATA_COLS).forEach(k => { c[k] = headerIndex_(rows[0], MEMDATA_COLS[k]); });
    if (c.mbti < 0) c.mbti = MEMDATA_MBTI_FALLBACK;

    const cell = (r, i) => (i >= 0 && i < r.length) ? String(r[i] || '').trim() : '';
    const targetEmail = String(email || '').toLowerCase().trim();

    const mine = r => {
      const e1 = cell(r, c.semail).toLowerCase();
      const e2 = cell(r, c.email).toLowerCase();
      return !!targetEmail && (e1 === targetEmail || e2 === targetEmail);   // only the email columns, never any other cell
    };

    const id = String(idNumber || '').replace(/\D/g, '');
    let row = null;
    for (let i = rows.length - 1; i >= 1; i--) {
      const r = rows[i];
      if (mine(r) && (!id || cell(r, c.id).replace(/\D/g, '') === id)) {
        row = r;
        break;
      }
    }
    if (!row) return null;

    const first = cell(row, c.first), last = cell(row, c.last);
    let mi = cell(row, c.mi).replace(/\.+$/, '');
    if (mi && mi.length <= 2) mi = mi.toUpperCase() + '.';
    const tidy = s => s.replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\S/g, m => m.toUpperCase());
    
    let mobile = cell(row, c.mobile).replace(/\D/g, '');
    if (mobile.length === 10 && mobile[0] === '9') mobile = '0' + mobile;
    if (mobile.length === 12 && mobile.indexOf('639') === 0) mobile = '0' + mobile.slice(2);
    
    // Course is free text: take the member list's value as written (trimmed to what RULES.Course accepts)
    let course = cell(row, c.course).replace(/[^A-Za-zÀ-ÿÑñ0-9 .,&()\/'-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!new RegExp(RULES.Course.pattern).test(course)) course = '';
    const year = (cell(row, c.year).match(/\d/) || [''])[0];

    const foundId = cell(row, c.id).replace(/\D/g, '');
    const idRule = RULES.IDNumber;
    const validId = /^\d{6}$/.test(foundId) && Number(foundId) >= idRule.idMin && Number(foundId) <= idRule.idMax ? foundId : '';

    return {
      FullName: [tidy(first), mi, tidy(last)].filter(Boolean).join(' '),
      Nickname: tidy(first).split(' ')[0],
      IDNumber: validId,
      Course: course,
      YearLevel: year,
      Mobile: /^09\d{9}$/.test(mobile) ? mobile : '',
      Block: cell(row, c.block),
      MBTI: (cell(row, c.mbti).toUpperCase().match(/[EI][NS][TF][JP]/) || [''])[0],   // "intj-a" / "INTJ (Architect)" -> "INTJ"
      matchedBy: id ? 'id+email' : 'email'
    };
  } catch (err) {
    activity_('member_lookup', String(err && err.message), { level: 'ERROR', page: 'apply' });
    return null;
  }
}

/** Public: the page calls this when someone changes their ID number. */
function apply_lookupMember(idNumber) {
  return traced_('apply_lookupMember', 'apply', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) return { found: false };
    const m = apply_memberFor_(email, idNumber);
    return m ? { found: true, member: m } : { found: false };
  }, r => r.found ? 'matched by ' + r.member.matchedBy : 'no match');
}