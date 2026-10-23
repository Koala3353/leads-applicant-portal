/**
 * PreLeadsServer.gs  (renamed from PreLeadsApi.gs: a script file with that name broke the editor and test link)
 * Server implementation for PreLeads.html (Eyes on LEADS applicant portal).
 *
 * Rules:
 * - Public functions start with preleads_ (no trailing _)
 * - Server-only functions end with _
 * - Identify caller ONLY by currentEmail_()
 * - Validate all inputs on the server and sanitize cells with safeCell_() / textCell_()
 * - All writes execute inside a ScriptLock with state re-verification inside lock
 * - Never return Date objects across the wire
 * - User-facing copy says "core team", never "officers"
 * - No emojis used anywhere
 */

const PRELEADS_DAUNTING_OPTIONS = [
  'failing as a leader',
  'making mistakes',
  'being judged',
  'disappointing others',
  'being disliked',
  'not being good enough',
  'losing control',
  'making the wrong decision',
  'taking initiative',
  'stepping outside my comfort zone',
  'trusting others with important responsibilities',
  'Other'
];

/**
 * Pre-LEADS fields, checked by validateFields_ (Utils.gs). The identity fields reuse Apply's RULES, so the two forms
 * can never accept different IDs or names; only the messages (and Mobile being optional) differ.
 * A function, not a const: a top-level const that reads RULES (another file) breaks if this file loads first.
 */
function preleadsRules_() {
  return {
  FullName:   Object.assign({}, RULES.FullName, { requiredMsg: 'Full name is required.', msg: 'Letters, spaces, , . \' - only (2 to 80 characters).' }),   // Apply's message asks for "Last, First"; Pre-LEADS doesn't
  Nickname:   Object.assign({}, RULES.Nickname, { requiredMsg: 'Nickname is required.', msg: 'Nickname must be letters only (up to 30 characters).' }),
  IDNumber:   Object.assign({}, RULES.IDNumber, { requiredMsg: RULES.IDNumber.msg }),
  YearLevel:  Object.assign({}, RULES.YearLevel, { requiredMsg: 'Year level must be between 1 and 5.', msg: 'Year level must be between 1 and 5.' }),
  Course:     Object.assign({}, RULES.Course, { requiredMsg: 'Course is required.', msg: 'Enter a valid degree program (up to 60 characters).' }),
  Block:      Object.assign({}, RULES.Block, { requiredMsg: 'Block is required for first years.' }),
  Mobile:     Object.assign({}, RULES.Mobile, { required: false }),   // optional here
  HopeToGainPreLEADS: { required: true, minLen: 10, maxLen: 500, multiline: true, requiredMsg: 'Please answer in 1–2 sentences.',
                        msg: 'Must be between 10 and 500 characters (about 1–2 sentences).' }
  };
}

const PRELEADS_HEADERS = [
  'Timestamp',
  'Email',
  'FullName',
  'Nickname',
  'IDNumber',
  'YearLevel',
  'Course',
  'Block',
  'Mobile',
  'Consent',
  'HopeToGainPreLEADS',
  'DauntingAspects',
  'OtherDaunting'
];

/**
 * Returns everything the Pre-LEADS page needs to render.
 * @return {Object} Context including sign-in state, existing registration, and autofilled member data.
 */
function preleads_getForm() {
  return traced_('preleads_getForm', 'preleads', preleads_getForm_, () => 'form loaded');
}

/**
 * Open/closed and event details come from Settings, so nobody needs a code change to move the date:
 *   PreLeadsOpen (TRUE/FALSE, blank = open), PreLeadsDeadline (date/time registrations close),
 *   PreLeadsDate, PreLeadsTime, PreLeadsVenue (shown on the page). Blank values use the defaults in
 *   SETTINGS_SCHEMA (Utils.gs).
 */
function preleads_isOpen_() {
  if (!setting_('PreLeadsOpen')) return false;
  const end = setting_('PreLeadsDeadline');
  return !end || Date.now() < end.getTime();
}

function preleads_getForm_() {
  const email = currentEmail_();
  const allowed = email ? isAllowedDomain_(email) : false;
  const existing = email ? preleads_findRegistration_(email) : null;
  const member = (email && allowed && !existing) ? preleads_memberFor_(email) : null;   // Ateneo accounts only, like Apply
  return {
    signedIn: !!email,
    email: email,
    allowedDomain: allowed,
    alreadySubmitted: !!existing,
    existingData: existing ? {
      FullName: existing.FullName,
      Nickname: existing.Nickname,
      Timestamp: existing.Timestamp
    } : null,
    member: member,
    isOpen: preleads_isOpen_(),
    options: {
      daunting: PRELEADS_DAUNTING_OPTIONS
    },
    eventInfo: {
      title: 'Pre-LEADS Preview · Eyes on LEADS',
      date: setting_('PreLeadsDate'),
      time: setting_('PreLeadsTime'),
      location: setting_('PreLeadsVenue')
    }
  };
}

/**
 * Submits a registration for Pre-LEADS.
 * @param {Object} form Raw form input.
 * @return {Object} { ok: true } or { ok: false, errors: Object }
 */
function preleads_submit(form) {
  return traced_('preleads_submit', 'preleads', () => preleads_submit_(form), r => (r && r.ok ? 'registered' : 'validation failed'));
}

function preleads_submit_(form) {
  // 1. Verify sign-in status
  const email = currentEmail_();
  if (!email) {
    throw new Error('Sign in with your Ateneo account first.');
  }

  // 2. Verify email domain
  if (!isAllowedDomain_(email)) {
    throw new Error('Use your Ateneo account to submit.');
  }
  if (!preleads_isOpen_()) throw new Error('Pre-LEADS registration is closed.');

  // Someone who keeps hitting "that ID can't be used" is probably trying other people's IDs: stop after 6 an hour
  const failKey = probeKey_(email);   // the same counter as Apply, so the two forms together still allow only 6
  if (!bump_(failKey, 6, 3600, true)) return { ok: false, errors: { IDNumber: 'Too many attempts. Wait an hour, or message the core team.' } };
  const idTaken = { ok: false, errors: { IDNumber: "That ID number can't be used for this registration. If it's yours, message the core team." } };

  // 3. Validate form inputs
  const input = Object.assign({}, form || {});
  const errors = {};
  const clean = {};

  // Consent (Strictly required: cannot submit without checking it)
  const consentVal = String(input.Consent || '').trim().toUpperCase();
  if (consentVal !== 'Y' && consentVal !== 'YES' && input.Consent !== true) {
    errors.Consent = 'You must agree to the data collection and consent statement to proceed.';
  } else {
    clean.Consent = 'Y';
  }

  // Identity + the "hope to gain" answer: the same checks as Apply (RULES in Utils.gs), with Pre-LEADS' own messages
  const v = validateFields_(input, preleadsRules_());
  Object.assign(errors, v.errors);
  Object.assign(clean, v.clean);

  // Question: Daunting Aspects (Check all that applies)
  let daunting = input.DauntingAspects;
  if (typeof daunting === 'string') {
    try { daunting = JSON.parse(daunting); } catch (e) { daunting = [daunting]; }
  }
  const otherText = String(input.OtherDaunting || '').trim();

  if (!Array.isArray(daunting) || daunting.length === 0) {
    errors.DauntingAspects = 'Please select at least one option.';
  } else {
    const hasOther = daunting.indexOf('Other') >= 0;
    if (hasOther && !otherText) {
      errors.OtherDaunting = 'Please specify your other challenging or daunting aspect.';
    }

    const standardChoices = daunting.filter(s => s !== 'Other' && PRELEADS_DAUNTING_OPTIONS.indexOf(s) >= 0);
    const finalAspects = standardChoices.slice();

    if (hasOther && otherText) {
      finalAspects.push('Other: ' + otherText);
      clean.OtherDaunting = otherText;
    } else {
      clean.OtherDaunting = '';
    }

    if (finalAspects.length === 0) {
      errors.DauntingAspects = 'Please select at least one option.';
    } else {
      clean.DauntingAspects = finalAspects;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors: errors };
  }

  // An ID that belongs to another account in the MEA member list can't be registered by you (stops anyone
  // taking a classmate's ID and locking them out). Same check as Apply.
  if (apply_idBelongsToOther_(clean.IDNumber, email)) { bump_(failKey, 99, 3600); return idTaken; }

  // 4. Data integrity lock and atomic write
  return withScriptLock_(25000, () => {
    const sh = preleads_ensureSheet_();

    if (!preleads_isOpen_()) throw new Error('Pre-LEADS registration just closed.');
    // Re-verify no duplicate submission inside the lock. Your own account: say so. Someone else's ID: the
    // generic message, so the reply never confirms whether a given ID registered.
    const dup = preleads_isDuplicateLocked_(sh, email, clean.IDNumber);
    if (dup === 'email') return { ok: false, errors: { form: 'You have already registered for Pre-LEADS with this account.' } };
    if (dup === 'id') { bump_(failKey, 99, 3600); return idTaken; }

    // Each value goes under its header (so the core team can reorder or add columns safely). Missing headers are added.
    // every string is stored as text (textCell_), so Sheets never turns a Course like "2-1" into a date
    const values = {
      Timestamp: new Date(), Email: email, FullName: clean.FullName, Nickname: clean.Nickname,
      IDNumber: clean.IDNumber, YearLevel: clean.YearLevel, Course: clean.Course,
      Block: clean.Block, Mobile: clean.Mobile, Consent: 'Y',
      HopeToGainPreLEADS: clean.HopeToGainPreLEADS, DauntingAspects: clean.DauntingAspects.join('; '),
      OtherDaunting: clean.OtherDaunting
    };
    const head = preleads_headers_(sh);
    sh.appendRow(head.map(h => textCell_(h in values ? values[h] : '')));
    return { ok: true };
  });
}

/**
 * Ensures the PreLeads sheet tab exists with appropriate headers.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function preleads_ensureSheet_() {
  return ensureTab_(SHEET.PRELEADS, PRELEADS_HEADERS, { dateCol: 1, textCols: [5, 8, 9] });   // ID, Block, Mobile as text
}

/** The PreLeads header row as it is now, adding any of PRELEADS_HEADERS that are missing (at the end). */
function preleads_headers_(sh) {
  const n = sh.getLastColumn();
  const head = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(h => String(h || '').trim()) : [];
  const missing = PRELEADS_HEADERS.filter(h => head.indexOf(h) < 0);
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    return head.concat(missing);
  }
  return head;
}

/**
 * Finds an existing Pre-LEADS registration by email.
 * @param {string} email
 * @return {Object|null}
 */
function preleads_findRegistration_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const sh = ss_().getSheetByName(SHEET.PRELEADS);
  if (!sh || sh.getLastRow() < 2) return null;

  // Search only the Email column (cheap) and read just that row: this runs on every page load.
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const emailCol = headers.indexOf('Email');
  if (emailCol < 0) return null;
  const hit = sh.getRange(2, emailCol + 1, sh.getLastRow() - 1, 1).createTextFinder(email).matchEntireCell(true).matchCase(false).findNext();
  if (!hit) return null;
  const row = sh.getRange(hit.getRow(), 1, 1, headers.length).getValues()[0];
  const at = h => (headers.indexOf(h) >= 0 ? row[headers.indexOf(h)] : '');
  const ts = at('Timestamp');
  return { FullName: at('FullName'), Nickname: at('Nickname'), Timestamp: ts instanceof Date ? ts.toISOString() : String(ts || '') };
}

/**
 * Checks for existing email or ID inside the lock.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh
 * @param {string} email
 * @param {string} idNumber
 * @return {string} 'email' (this account already registered), 'id' (another account has this ID), or ''.
 */
function preleads_isDuplicateLocked_(sh, email, idNumber) {
  if (sh.getLastRow() < 2) return '';
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const emailCol = headers.indexOf('Email');
  const idCol = headers.indexOf('IDNumber');

  const targetEmail = String(email || '').trim().toLowerCase();
  const targetId = String(idNumber || '').trim();

  for (let i = 1; i < data.length; i++) {
    if (emailCol >= 0 && String(data[i][emailCol] || '').trim().toLowerCase() === targetEmail) return 'email';
    if (idCol >= 0 && String(data[i][idCol] || '').trim() === targetId) return 'id';
  }
  return '';
}

/**
 * Pulls member information from the MemData tab if available.
 * @param {string} email
 * @return {Object|null}
 */
function preleads_memberFor_(email) {
  try {
    const mem = apply_memberFor_(email, '');
    if (mem) {
      return {
        FullName: mem.FullName || '',
        Nickname: mem.Nickname || '',
        IDNumber: mem.IDNumber || '',
        Course: mem.Course || '',
        YearLevel: mem.YearLevel || '',
        Block: mem.Block || '',
        Mobile: mem.Mobile || ''
      };
    }
  } catch (err) {
    console.error('preleads_memberFor_ error: ' + (err && err.message));
  }
  return null;
}
