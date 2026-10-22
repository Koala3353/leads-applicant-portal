/**
 * PreLeadsServer.gs  (renamed from PreLeadsApi.gs: a script file with that name broke the editor and test link)
 * Server implementation for PreLeads.html (LEADS: Oversight applicant portal).
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

const PRELEADS_SHEET_NAME = 'PreLeads';

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
 *   PreLeadsDate, PreLeadsTime, PreLeadsVenue (shown on the page). Blank values use the defaults below.
 */
const PRELEADS_DEFAULTS = {
  deadline: '2026-11-05T17:00:00+08:00',
  date: 'November 5, 2026', time: '5:00 PM – 7:30 PM', venue: 'Onsite (Ateneo de Manila University)'
};
function preleads_isOpen_() {
  const s = getSettings_();
  if (/^(false|no|0|off|closed)$/i.test(String(s.PreLeadsOpen || '').trim())) return false;
  const end = parseDate_(s.PreLeadsDeadline) || new Date(PRELEADS_DEFAULTS.deadline);
  return Date.now() < end.getTime();
}

function preleads_getForm_() {
  const email = currentEmail_();
  const allowed = email ? isAllowedDomain_(email) : false;
  const existing = email ? preleads_findRegistration_(email) : null;
  const member = (email && allowed && !existing) ? preleads_memberFor_(email) : null;   // Ateneo accounts only, like Apply
  const s = getSettings_();

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
      title: 'Pre-LEADS: Oversight Preview',
      date: String(s.PreLeadsDate || PRELEADS_DEFAULTS.date),
      time: String(s.PreLeadsTime || PRELEADS_DEFAULTS.time),
      location: String(s.PreLeadsVenue || PRELEADS_DEFAULTS.venue)
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
  const failKey = 'plfail:' + email;
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

  // Full Name
  const fullName = String(input.FullName || '').trim();
  if (!fullName) {
    errors.FullName = 'Full name is required.';
  } else if (!/^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{1,79}$/.test(fullName)) {
    errors.FullName = 'Letters, spaces, and . \' - only (2 to 80 characters).';
  } else {
    clean.FullName = fullName;
  }

  // Nickname
  const nickname = String(input.Nickname || '').trim();
  if (!nickname) {
    errors.Nickname = 'Nickname is required.';
  } else if (!/^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{0,29}$/.test(nickname)) {
    errors.Nickname = 'Nickname must be letters only (up to 30 characters).';
  } else {
    clean.Nickname = nickname;
  }

  // ID Number
  const idStr = String(input.IDNumber || '').trim();
  if (!/^\d{6}$/.test(idStr)) {
    errors.IDNumber = 'Your 6-digit Ateneo ID number, e.g. 241234.';
  } else {
    const idNum = Number(idStr);
    if (idNum < 200000 || idNum > 280000) {
      errors.IDNumber = 'Invalid ID number.';
    } else {
      clean.IDNumber = idStr;
    }
  }

  // Year Level
  const yr = String(input.YearLevel || '').trim();
  const yrNum = parseInt(yr, 10);
  if (!yr || isNaN(yrNum) || yrNum < 1 || yrNum > 5) {
    errors.YearLevel = 'Year level must be between 1 and 5.';
  } else {
    clean.YearLevel = yrNum;
  }

  // Course
  const course = String(input.Course || '').trim();
  if (!course) {
    errors.Course = 'Course is required.';
  } else if (!/^[A-Za-zÀ-ÿÑñ0-9][A-Za-zÀ-ÿÑñ0-9 .,&()\/'-]{1,59}$/.test(course)) {
    errors.Course = 'Enter a valid degree program (up to 60 characters).';
  } else {
    clean.Course = course;
  }

  // Block: Required for first years (ID starting with 26 or YearLevel == 1)
  const isFreshman = (clean.IDNumber && clean.IDNumber.indexOf('26') === 0) || clean.YearLevel === 1;
  const block = String(input.Block || '').trim();
  if (isFreshman && !block) {
    errors.Block = 'Block is required for first years.';
  } else if (block && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,29}$/.test(block)) {
    errors.Block = 'Letters and numbers only, e.g. 21A.';
  } else {
    clean.Block = block;
  }

  // Mobile
  const rawMobile = String(input.Mobile || '').trim();
  if (rawMobile) {
    const normMobile = normalizeMobile_(rawMobile);
    if (!/^09\d{9}$/.test(normMobile)) {
      errors.Mobile = '11 digits starting with 09, e.g. 09171234567.';
    } else {
      clean.Mobile = normMobile;
    }
  } else {
    clean.Mobile = '';
  }

  // Question: What do you hope to gain from your Pre-LEADS experience? (Answer in 1-2 sentences)
  const qHope = String(input.HopeToGainPreLEADS || '').trim();
  if (!qHope) {
    errors.HopeToGainPreLEADS = 'Please answer in 1–2 sentences.';
  } else if (qHope.length < 10 || qHope.length > 500) {
    errors.HopeToGainPreLEADS = 'Must be between 10 and 500 characters (about 1–2 sentences).';
  } else {
    clean.HopeToGainPreLEADS = qHope;
  }

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
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = preleads_ensureSheet_();

    if (!preleads_isOpen_()) throw new Error('Pre-LEADS registration just closed.');
    // Re-verify no duplicate submission inside the lock. Your own account: say so. Someone else's ID: the
    // generic message, so the reply never confirms whether a given ID registered.
    const dup = preleads_isDuplicateLocked_(sh, email, clean.IDNumber);
    if (dup === 'email') return { ok: false, errors: { form: 'You have already registered for Pre-LEADS with this account.' } };
    if (dup === 'id') { bump_(failKey, 99, 3600); return idTaken; }

    // Each value goes under its header (so the core team can reorder or add columns safely). Missing headers are added.
    const values = {
      Timestamp: new Date(), Email: safeCell_(email), FullName: safeCell_(clean.FullName), Nickname: safeCell_(clean.Nickname),
      IDNumber: textCell_(clean.IDNumber), YearLevel: clean.YearLevel, Course: safeCell_(clean.Course),
      Block: textCell_(clean.Block), Mobile: textCell_(clean.Mobile), Consent: 'Y',
      HopeToGainPreLEADS: safeCell_(clean.HopeToGainPreLEADS), DauntingAspects: safeCell_(clean.DauntingAspects.join('; ')),
      OtherDaunting: safeCell_(clean.OtherDaunting)
    };
    const head = preleads_headers_(sh);
    sh.appendRow(head.map(h => (h in values ? values[h] : '')));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ensures the PreLeads sheet tab exists with appropriate headers.
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function preleads_ensureSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PRELEADS_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PRELEADS_SHEET_NAME);
    sh.getRange(1, 1, 1, PRELEADS_HEADERS.length)
      .setValues([PRELEADS_HEADERS])
      .setFontWeight('bold')
      .setBackground('#10275A')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    sh.getRange('E:E').setNumberFormat('@'); // IDNumber as text
    sh.getRange('H:I').setNumberFormat('@'); // Block and Mobile as text
  } else if (sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, PRELEADS_HEADERS.length)
      .setValues([PRELEADS_HEADERS])
      .setFontWeight('bold')
      .setBackground('#10275A')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
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
  const ss = ss_();
  const sh = ss.getSheetByName(PRELEADS_SHEET_NAME);
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
    if (typeof apply_memberFor_ === 'function') {
      const mem = apply_memberFor_(email, '', null);
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
    }
  } catch (err) {
    console.error('preleads_memberFor_ error: ' + (err && err.message));
  }
  return null;
}
