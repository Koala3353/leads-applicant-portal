/**
 * ApplyApi.gs
 * Server implementation for Apply.html (LEADS: Oversight applicant portal).
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
 * @return {Object} Context including sign-in state, application status, rules, and lists.
 */
function apply_getForm() {
  return traced_('apply_getForm', 'apply', apply_getForm_, () => 'form loaded');
}

function apply_getForm_() {
  const email = currentEmail_();
  const found = email ? getApplicantByEmail_(email) : null;
  const deadline = parseDate_(getSetting_('Deadline'));
  const rules = utils_getFormRules();
  const contact = String(getSetting_('ContactEmail') || '').trim();

  let draft = null;
  if (email && !found) {
    try {
      draft = typeof apply_getDraft_ === 'function' ? apply_getDraft_(email) : null;
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
    lists: rules.lists,
    contact: contact,
    eventDates: String(getSetting_('EventDates') || '').trim(),   // shown in the offsite-availability question
    draft: draft,
    member: email && !found ? apply_memberFor_(email, '', rules.lists) : null
  };
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

  // 3. Validate with the shared RULES in Utils.gs (phone cleanup, ID range, Block for first years, consent, choices)
  const input = Object.assign({}, form || {});
  const v = validateApplication_(input, 'apply');
  const errors = v.ok ? {} : Object.assign({}, v.errors);
  const candidateIdStr = String(v.clean.IDNumber || '').trim();

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors: errors };
  }

  // 5. Data integrity lock and atomic write. Keep the time inside the lock short: every applicant's submit waits on it.
  // One read covers both duplicate checks; the Log row and draft clean-up happen after the lock is released.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);   // a submit is rare and precious: wait longer rather than fail during a rush
  let nextId, referralCode = '', referral = {};
  try {
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
      // Check Ateneo IDNumber uniqueness across all applicant rows
      if (String(values[i][idCol]).trim() === candidateIdStr) {
        return {
          ok: false,
          errors: {
            IDNumber: 'That ID number already has an application. Message the core team if this is wrong.'
          }
        };
      }
    }

    // Referral: the code must belong to someone else who applied and hasn't withdrawn (Referrals.gs)
    const ref = checkReferral_(v.clean.ReferredBy, values, email);
    if (ref.error) return { ok: false, errors: { ReferredBy: ref.error } };
    referralCode = makeReferralCode_(v.clean.Nickname, v.clean.FullName, referralCodesIn_(values));
    referral = ref;

    // Generate next sequential ApplicantID
    nextId = nextApplicantId_();
    const now = new Date();

    // Each value goes under its header, wherever that column is in the Sheet
    const rowMap = {
      ApplicantID: nextId,
      Timestamp: now,
      Email: email,
      FullName: v.clean.FullName,
      Nickname: v.clean.Nickname,
      IDNumber: candidateIdStr,
      Course: v.clean.Course,
      YearLevel: Number(v.clean.YearLevel),
      Mobile: String(v.clean.Mobile),
      DataConsent: v.clean.DataConsent,
      Block: v.clean.Block,
      MBTI: v.clean.MBTI,
      PastOrgs: v.clean.PastOrgs,
      FirstOvernight: v.clean.FirstOvernight,
      OffsiteAvailability: v.clean.OffsiteAvailability,
      WhyParticipant: v.clean.WhyParticipant,
      FirstImpression: v.clean.FirstImpression,
      Rumors: v.clean.Rumors,
      TakesLeadership: v.clean.TakesLeadership,
      FearLeadership: v.clean.FearLeadership,
      GameAnswers: String(input.GameAnswers || '').slice(0, 5000),   // JSON of the Game page choices
      ReferralCode: referralCode,
      ReferredBy: referral.code || '',
      ReferrerID: referral.referrerId || '',
      Status: 'SUBMITTED',
      Requirements: 'NONE',
      Payment: 'NONE',
      ReviewedBy: '',
      LastUpdated: now,
      Notes: ''
    };

    const row = cols_().map(col => safeCell_(rowMap[col] !== undefined ? rowMap[col] : ''));
    sheet_(SHEET.APPLICANTS).appendRow(row);
    SpreadsheetApp.flush();   // the row is written before the next submit reads the sheet
  } finally {
    lock.releaseLock();
  }

  // Outside the lock: appends and a single-row clear don't need it
  logChange_(nextId, 'status', '', 'SUBMITTED', 'system');
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
  const tabName = 'Drafts';
  const ss = ss_();
  let sh = ss.getSheetByName(tabName);
  if (sh) return sh;
  sh = ss.insertSheet(tabName);
  sh.getRange(1, 1, 1, 3).setValues([['Email', 'SavedAt', 'Data']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.hideSheet();
  return sh;
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
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    row = apply_findDraftRow_(sh, email);   // someone (another tab) may have added it while we waited
    if (!row) { sh.appendRow([email, '', '']); SpreadsheetApp.flush(); row = sh.getLastRow(); }
  } finally {
    lock.releaseLock();
  }
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
  const fields = [
    'DataConsent', 'IDNumber', 'FullName', 'Nickname', 'Course', 'YearLevel', 'Mobile',
    'Block', 'MBTI', 'PastOrgs', 'FirstOvernight', 'OffsiteAvailability',
    'WhyParticipant', 'FirstImpression', 'Rumors', 'TakesLeadership', 'FearLeadership', 'GameAnswers', 'ReferredBy'
  ];
  fields.forEach(f => {
    if (data[f] !== undefined && data[f] !== null) {
      clean[f] = String(data[f]).slice(0, f === 'GameAnswers' ? 5000 : 1500);
    }
  });

  try {
    // Already applied? (A guard only: apply_submit_ re-checks inside its lock and clears the draft.)
    if (getApplicantByEmail_(email)) return { ok: false, applied: true };
    const sh = apply_draftSheet_();
    const now = new Date();
    const row = apply_ensureDraftRow_(sh, email);
    // Merge onto the stored draft: Apply sends only its 18 fields and the Game only GameAnswers,
    // so replacing outright would wipe the other page's answers. Only this account writes this row.
    let stored = {};
    try { stored = JSON.parse(sh.getRange(row, 3).getValue() || '{}') || {}; } catch (e) { stored = {}; }
    const merged = Object.assign({}, stored, clean);
    sh.getRange(row, 2, 1, 2).setValues([[now, JSON.stringify(merged)]]);
    return { ok: true, savedAt: now.toISOString() };
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

function apply_memberFor_(email, idNumber, lists) {
  try {
    const sh = ss_().getSheetByName('MemData');
    if (!sh || sh.getLastRow() < 2) return null;
    const rows = apply_memRows_(sh, email);   // header + only the rows that mention this email
    const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
    const head = rows[0].map(norm);
    
    const col = (...names) => {
      for (const n of names) {
        const i = head.indexOf(n);
        if (i >= 0) return i;
      }
      return -1;
    };

    const c = {
      id: col('idnumber', 'studentid', 'idno', 'id'),
      last: col('lastname', 'surname', 'last'),
      first: col('firstname', 'givenname', 'first'),
      mi: col('middleinitial', 'mi', 'middle'),
      semail: col('studentemail', 'ateneoemail', 'studentemailaddress'),
      email: col('emailaddress', 'email', 'primaryemail', 'personalemail'),
      year: col('yearlevel', 'year', 'yr'),
      course: col('course', 'program', 'degree'),
      mobile: col('mobilenumber', 'mobile', 'contactnumber', 'cellphone'),
      block: col('block', 'section'),
      mbti: col('mbti', 'mbtitype', 'personalitytype') >= 0 ? col('mbti', 'mbtitype', 'personalitytype') : 27 // fallback: Column AB (0-indexed 27)
    };

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
    const m = apply_memberFor_(email, idNumber, utils_getFormRules().lists);
    return m ? { found: true, member: m } : { found: false };
  }, r => r.found ? 'matched by ' + r.member.matchedBy : 'no match');
}