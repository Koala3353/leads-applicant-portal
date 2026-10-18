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

  // 5. Data integrity lock and atomic write
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Re-verify applications open status inside lock
    if (!isOpen_()) {
      throw new Error('Applications just closed.');
    }

    // Re-verify applicant has not already applied inside lock
    if (getApplicantByEmail_(email)) {
      throw new Error('You already applied.');
    }

    // Check Ateneo IDNumber uniqueness across all applicant rows
    const idCol = COLS.indexOf('IDNumber');
    const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]).trim() === candidateIdStr) {
        return {
          ok: false,
          errors: {
            IDNumber: 'That ID number already has an application. Message the core team if this is wrong.'
          }
        };
      }
    }

    // Generate next sequential ApplicantID
    const nextId = nextApplicantId_();
    const now = new Date();

    // Build row adhering strictly to COLS order
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
      MEAInvolvement: v.clean.MEAInvolvement,
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
      Status: 'SUBMITTED',
      Requirements: 'NONE',
      Payment: 'NONE',
      ReviewedBy: '',
      LastUpdated: now,
      Notes: ''
    };

    ensureApplicantHeaders_();   // adds headers for any new COLS the first time
    const row = COLS.map(col => safeCell_(rowMap[col] !== undefined ? rowMap[col] : ''));
    sheet_(SHEET.APPLICANTS).appendRow(row);

    // Log initial status change and clear draft
    logChange_(nextId, 'status', '', 'SUBMITTED', 'system');
    apply_deleteDraft_(email);

    return { ok: true, id: nextId };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- drafts, saved per Google account ---------------- */

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

function apply_getDraft_(email) {
  try {
    const sh = apply_draftSheet_();
    const row = apply_findDraftRow_(sh, email);
    if (!row) return null;
    const [, savedAt, json] = sh.getRange(row, 1, 1, 3).getValues()[0];
    return {
      data: JSON.parse(json || '{}'),
      savedAt: savedAt instanceof Date ? savedAt.toISOString() : String(savedAt)
    };
  } catch (err) {
    activity_('draft_load', String(err && err.message), { level: 'ERROR', page: 'apply' });
    return null;
  }
}

function apply_deleteDraft_(email) {
  try {
    const sh = apply_draftSheet_();
    const row = apply_findDraftRow_(sh, email);
    if (row) sh.deleteRow(row);
  } catch (err) {
    activity_('draft_delete', String(err && err.message), { level: 'WARN', page: 'apply' });
  }
}

/** Saves the signed-in applicant's draft. Public. */
function apply_saveDraft(data) {
  const email = currentEmail_();
  if (!email || !isAllowedDomain_(email)) return { ok: false };
  data = data || {};
  const clean = {};
  const fields = [
    'DataConsent', 'IDNumber', 'FullName', 'Nickname', 'Course', 'YearLevel', 'Mobile',
    'MEAInvolvement', 'Block', 'MBTI', 'PastOrgs', 'FirstOvernight', 'OffsiteAvailability',
    'WhyParticipant', 'FirstImpression', 'Rumors', 'TakesLeadership', 'FearLeadership', 'GameAnswers'
  ];
  fields.forEach(f => {
    if (data[f] !== undefined && data[f] !== null) {
      clean[f] = String(data[f]).slice(0, f === 'GameAnswers' ? 5000 : 1500);
    }
  });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (getApplicantByEmail_(email)) return { ok: false, applied: true };
    const sh = apply_draftSheet_();
    const now = new Date();
    const row = apply_findDraftRow_(sh, email);
    // Merge onto the stored draft (re-read inside the lock): Apply sends only its 18 fields and the
    // Game only GameAnswers, so replacing outright would wipe the other page's answers.
    let stored = {};
    if (row) { try { stored = JSON.parse(sh.getRange(row, 3).getValue() || '{}') || {}; } catch (e) { stored = {}; } }
    const merged = Object.assign({}, stored, clean);
    const values = [[email, now, JSON.stringify(merged)]];
    if (row) sh.getRange(row, 1, 1, 3).setValues(values);
    else sh.appendRow(values[0]);
    return { ok: true, savedAt: now.toISOString() };
  } catch (err) {
    activity_('draft_save', String(err && err.message), { level: 'ERROR', page: 'apply' });
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Deletes the signed-in applicant's draft ("Discard draft"). */
function apply_discardDraft() {
  const email = currentEmail_();
  if (email) {
    // deleteRow shifts rows: hold the lock so a concurrent apply_saveDraft can't write to a stale row number
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { apply_deleteDraft_(email); } finally { lock.releaseLock(); }
  }
  activity_('draft_discard', '', { page: 'apply' });
  return true;
}

/* ---------------- MemData: autofill from member list ---------------- */

function apply_memberFor_(email, idNumber, lists) {
  try {
    const sh = ss_().getSheetByName('MemData');
    if (!sh || sh.getLastRow() < 2) return null;
    const rows = sh.getDataRange().getDisplayValues();
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
    
    const courses = (lists && lists.Courses) || [];
    const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const course = courses.find(x => key(x) === key(cell(row, c.course))) || '';
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