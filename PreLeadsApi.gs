/**
 * PreLeadsApi.gs
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
  'trusting others with important responsibilities'
];

const PRELEADS_ENVIRONMENT_OPTIONS = [
  'Small-group discussions',
  'Individual reflection',
  'Interactive games and team challenges',
  'Listening to others share their experiences',
  'Open discussions with the whole group',
  'No particular preference'
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
  'DevelopInLEADS',
  'HopeToGainPreLEADS',
  'LeadershipChallenge',
  'DauntingAspects',
  'ComfortableEnvironment'
];

/**
 * Returns everything the Pre-LEADS page needs to render.
 * @return {Object} Context including sign-in state, existing registration, and autofilled member data.
 */
function preleads_getForm() {
  return traced_('preleads_getForm', 'preleads', preleads_getForm_, () => 'form loaded');
}

function preleads_getForm_() {
  const email = currentEmail_();
  const allowed = email ? isAllowedDomain_(email) : false;
  const existing = email ? preleads_findRegistration_(email) : null;
  const member = (email && !existing) ? preleads_memberFor_(email) : null;

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
    options: {
      daunting: PRELEADS_DAUNTING_OPTIONS,
      environment: PRELEADS_ENVIRONMENT_OPTIONS
    },
    eventInfo: {
      title: 'Pre-LEADS: Oversight Preview',
      date: 'November 5, 2026',
      time: '5:00 PM – 7:30 PM',
      location: 'Onsite (Ateneo de Manila University)'
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
    throw new Error('Use your Ateneo account (@student.ateneo.edu) to submit.');
  }

  // 3. Validate form inputs
  const input = Object.assign({}, form || {});
  const errors = {};
  const clean = {};

  // Consent
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

  // Question 1: What would you like to learn more about or develop in your LEADS experience? (Answer in 2-3 Sentences)
  const q1 = String(input.DevelopInLEADS || '').trim();
  if (!q1) {
    errors.DevelopInLEADS = 'Please answer in 2-3 sentences.';
  } else if (q1.length < 20 || q1.length > 1000) {
    errors.DevelopInLEADS = 'Must be between 20 and 1000 characters (about 2-3 sentences).';
  } else {
    clean.DevelopInLEADS = q1;
  }

  // Question 2: What do you hope to gain from your Pre-LEADS experience? (Answer in 2-3 Sentences)
  const q2 = String(input.HopeToGainPreLEADS || '').trim();
  if (!q2) {
    errors.HopeToGainPreLEADS = 'Please answer in 2-3 sentences.';
  } else if (q2.length < 20 || q2.length > 1000) {
    errors.HopeToGainPreLEADS = 'Must be between 20 and 1000 characters (about 2-3 sentences).';
  } else {
    clean.HopeToGainPreLEADS = q2;
  }

  // Question 3: Reflecting on your past experiences, what is one challenge you've encountered when working with or leading others? (Answer in 2-3 sentences)
  const q3 = String(input.LeadershipChallenge || '').trim();
  if (!q3) {
    errors.LeadershipChallenge = 'Please answer in 2-3 sentences.';
  } else if (q3.length < 20 || q3.length > 1000) {
    errors.LeadershipChallenge = 'Must be between 20 and 1000 characters (about 2-3 sentences).';
  } else {
    clean.LeadershipChallenge = q3;
  }

  // Question 4: Daunting Aspects (Check all that apply)
  let daunting = input.DauntingAspects;
  if (typeof daunting === 'string') {
    try { daunting = JSON.parse(daunting); } catch (e) { daunting = [daunting]; }
  }
  if (!Array.isArray(daunting) || daunting.length === 0) {
    errors.DauntingAspects = 'Please select at least one option.';
  } else {
    const filtered = daunting.map(s => String(s || '').trim()).filter(s => PRELEADS_DAUNTING_OPTIONS.indexOf(s) >= 0);
    if (filtered.length === 0) {
      errors.DauntingAspects = 'Please select valid options from the list.';
    } else {
      clean.DauntingAspects = filtered;
    }
  }

  // Question 5: Comfortable Environment (Multiple Choice)
  const envChoice = String(input.ComfortableEnvironment || '').trim();
  if (!envChoice || PRELEADS_ENVIRONMENT_OPTIONS.indexOf(envChoice) < 0) {
    errors.ComfortableEnvironment = 'Please select your preferred environment from the choices.';
  } else {
    clean.ComfortableEnvironment = envChoice;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors: errors };
  }

  // 4. Data integrity lock and atomic write
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = preleads_ensureSheet_();

    // Re-verify no duplicate submission inside the lock
    if (preleads_isDuplicateLocked_(sh, email, clean.IDNumber)) {
      return {
        ok: false,
        errors: { form: 'A registration for Pre-LEADS has already been submitted under this account or ID number.' }
      };
    }

    const row = [
      new Date(),
      safeCell_(email),
      safeCell_(clean.FullName),
      safeCell_(clean.Nickname),
      textCell_(clean.IDNumber),
      clean.YearLevel,
      safeCell_(clean.Course),
      textCell_(clean.Block),
      textCell_(clean.Mobile),
      'Y',
      safeCell_(clean.DevelopInLEADS),
      safeCell_(clean.HopeToGainPreLEADS),
      safeCell_(clean.LeadershipChallenge),
      safeCell_(clean.DauntingAspects.join('; ')),
      safeCell_(clean.ComfortableEnvironment)
    ];

    sh.appendRow(row);
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

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const emailCol = headers.indexOf('Email');
  const nameCol = headers.indexOf('FullName');
  const nickCol = headers.indexOf('Nickname');
  const timeCol = headers.indexOf('Timestamp');

  if (emailCol < 0) return null;

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][emailCol] || '').trim().toLowerCase();
    if (rowEmail === email) {
      const ts = data[i][timeCol];
      return {
        FullName: nameCol >= 0 ? data[i][nameCol] : '',
        Nickname: nickCol >= 0 ? data[i][nickCol] : '',
        Timestamp: ts instanceof Date ? ts.toISOString() : String(ts || '')
      };
    }
  }
  return null;
}

/**
 * Checks for existing email or ID inside the lock.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh
 * @param {string} email
 * @param {string} idNumber
 * @return {boolean}
 */
function preleads_isDuplicateLocked_(sh, email, idNumber) {
  if (sh.getLastRow() < 2) return false;
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const emailCol = headers.indexOf('Email');
  const idCol = headers.indexOf('IDNumber');

  const targetEmail = String(email || '').trim().toLowerCase();
  const targetId = String(idNumber || '').trim();

  for (let i = 1; i < data.length; i++) {
    if (emailCol >= 0 && String(data[i][emailCol] || '').trim().toLowerCase() === targetEmail) {
      return true;
    }
    if (idCol >= 0 && String(data[i][idCol] || '').trim() === targetId) {
      return true;
    }
  }
  return false;
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
