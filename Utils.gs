/**
 * Utils.gs  (integrator owns this file — everyone CALLS these, nobody rewrites them)
 *
 * Shared helpers: settings, lookups, data validation, status changes, Google Form links, logging.
 * IMPORTANT: Sheet data-validation rules ALSO apply to script writes (setValues/appendRow):
 * a value that breaks a rule throws an error showing that rule's help text. So validate
 * with validateApplication_() / safeCell_() first, to give users a clear message instead.
 *
 * The portal: Home (the hub), Apply + Game, and the Steps page (StepsApi.gs):
 * proof of payment (upload, saved to Drive), requirements (Google Forms listed in the Requirements tab),
 * the 1st GA (calendar link) and room booking. The core team works in the Sheet itself: the LEADS menu
 * (AdminMenu.gs) and hand edits on the three track columns, which are checked + logged.
 *
 * How an applicant moves through LEADS (three tracks, not one line):
 *   Status        the decision      SUBMITTED → UNDER REVIEW → ACCEPTED / WAITLISTED / REJECTED → CONFIRMED
 *   Payment       proof (upload)    NONE → SUBMITTED → VERIFIED             (REJECTED = upload again)
 *   Requirements  the Forms         NONE → PARTIAL → SUBMITTED → APPROVED   (RETURNED = fix and resend)
 * Steps open in order, each only for ACCEPTED applicants and only once its Settings switch is on:
 *   Payment (PaymentOpen) → Requirements (RequirementsOpen, after Payment VERIFIED) → Room booking
 *   (RoomBookingOpen, after Requirements APPROVED). The 1st GA opens once Settings > GACalendarLink is filled in.
 * ACCEPTED + APPROVED + VERIFIED = CONFIRMED (automatic).
 */

const SHEET = {
  APPLICANTS: 'Applicants', SETTINGS: 'Settings', ADMINS: 'Admins', LISTS: 'Lists',
  REQUIREMENTS: 'Requirements',   // one row per requirement Google Form: Form | Link | What to do | Due
  ACTIVITY: 'Activity',  // made automatically by activity_(); status/track changes are its CHANGE rows (the old Log tab)
  DRAFTS: 'Drafts'       // hidden; Apply drafts per account, made automatically (ApplyApi.gs)
};

// The Applicants columns the portal uses. The code finds each one by its HEADER NAME (cols_()), so columns can be
// moved, and unused ones deleted, without breaking anything. Never rename a header. A name missing from the Sheet
// is added at the end automatically (ensureApplicantHeaders_). This order is only the layout for a brand-new Sheet.
const COLS = [
  'ApplicantID', 'Timestamp', 'Email', 'FullName', 'Nickname', 'IDNumber', 'Course', 'YearLevel',
  'Mobile',
  'Status', 'Requirements', 'Payment',                                    // the three tracks
  'ReviewedBy', 'LastUpdated', 'Notes',                                   // core team
  'Block', 'MBTI', 'PastOrgs', 'FirstOvernight', 'OffsiteAvailability', 'DataConsent',
  'WhyParticipant', 'FirstImpression', 'TakesLeadership', 'FearLeadership',   // the 4 essays (Rumors was dropped Oct 2026)
  'GameAnswers',                                                          // Game page choices (JSON)
  'PaymentProof',                                                         // Drive link to the uploaded proof of payment
  'ReferralCode', 'ReferredBy', 'ReferrerID'                              // own code to share / code they used / who that is (Referrals.gs)
];

/** The Applicants header row as it is in the Sheet right now (read once per run). Falls back to COLS on an empty tab. */
function cols_() {
  if (cols_.memo) return cols_.memo;
  const sh = sheet_(SHEET.APPLICANTS), n = sh.getLastColumn();
  const head = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(h => String(h).trim()) : [];
  while (head.length && head[head.length - 1] === '') head.pop();
  return (cols_.memo = head.length ? head : COLS.slice());
}
/** 0-based position of a header in the Applicants tab. Throws if it isn't there. */
function col_(name) {
  const i = cols_().indexOf(name);
  if (i < 0) throw new Error('The Applicants tab has no "' + name + '" column.');
  return i;
}
// The three columns officers change (LEADS menu or by hand). Everything else is written by the portal.
const TRACK_COLS = ['Status', 'Requirements', 'Payment'];

const STATUSES = ['SUBMITTED', 'UNDER REVIEW', 'WAITLISTED', 'ACCEPTED', 'REJECTED', 'CONFIRMED', 'WITHDRAWN'];
const REQUIREMENT_STATES = ['NONE', 'PARTIAL', 'SUBMITTED', 'RETURNED', 'APPROVED'];
const PAYMENT_STATES = ['NONE', 'SUBMITTED', 'VERIFIED', 'REJECTED'];

// Which status can move to which. Anything not listed here is blocked.
const NEXT_STATUS = {
  'SUBMITTED':    ['UNDER REVIEW', 'REJECTED', 'WITHDRAWN'],
  'UNDER REVIEW': ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  'WAITLISTED':   ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  'ACCEPTED':     ['CONFIRMED', 'WITHDRAWN'],   // CONFIRMED also needs Requirements APPROVED + Payment VERIFIED
  'CONFIRMED':    ['WITHDRAWN'],
  'REJECTED':     [],
  'WITHDRAWN':    []
};

// One set of rules for the page AND the server. Pages fetch these with utils_getFormRules().
// stage 'apply' = the Apply page. (Camp info like emergency contacts is collected in the requirements Google Form.)
const RULES = {
  FullName:         { stage: 'apply', required: true, pattern: "^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{1,79}$", msg: 'Letters, spaces, . \' - only (2 to 80 characters).' },
  Nickname:         { stage: 'apply', required: true, pattern: "^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{0,29}$", msg: 'What we should call you at camp (up to 30 letters).' },
  IDNumber:         { stage: 'apply', required: true, pattern: '^\\d{6}$', msg: 'Your 6-digit Ateneo ID number, e.g. 241234.',
                      idMin: 200000, idMax: 280000, rangeMsg: 'Invalid ID number.' },   // range kept vague on purpose
  Course:           { stage: 'apply', required: true, pattern: "^[A-Za-zÀ-ÿÑñ0-9][A-Za-zÀ-ÿÑñ0-9 .,&()/'-]{1,59}$", msg: 'Your degree program, e.g. BS Management Engineering (up to 60 characters).' },
  YearLevel:        { stage: 'apply', required: true, min: 1, max: 5, msg: 'Year level must be 1 to 5.' },
  Block:            { stage: 'apply', requiredIfFreshman: true, pattern: "^[A-Za-z0-9][A-Za-z0-9 -]{0,29}$",
                      msg: 'Letters and numbers only, e.g. 21A.', requiredMsg: 'Block is required for first years (ID 26xxxx or Year 1).' },
  Mobile:           { stage: 'apply', required: true, phone: true, pattern: '^09\\d{9}$', msg: '11 digits starting with 09, e.g. 09171234567.' },
  MBTI:             { stage: 'apply', pattern: '^[EI][NS][TF][JP]$', msg: 'Pick one of the 16 types (or leave it blank).' },
  PastOrgs:         { stage: 'apply', maxLen: 500, multiline: true, msg: 'Keep it under 500 characters.' },
  FirstOvernight:   { stage: 'apply', required: true, options: ['Yes', 'No'], msg: 'Pick Yes or No.' },
  OffsiteAvailability: { stage: 'apply', required: true, options: ['Yes', 'No'], msg: 'Pick Yes or No.' },
  DataConsent:      { stage: 'apply', required: true, options: ['Y'], msg: 'You need to consent to data processing (RA 10173) to apply.' },
  WhyParticipant:   { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  FirstImpression:  { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  TakesLeadership:  { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  FearLeadership:   { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  ReferredBy:       { stage: 'apply', upper: true, pattern: '^([A-Z]{1,12}[0-9]{0,3}|[A-Z]{1,4}-[A-Z0-9]{4})$', msg: "A referral code is the person's name, like BEA. Leave it blank if nobody referred you." }
};

/** "+63 917 123 4567", "0917-123-4567", "9171234567" -> "09171234567". Same logic as normalizePhone() in Apply.html. */
function normalizeMobile_(v) {
  let m = String(v || '').trim().replace(/[\s\-().]/g, '');
  if (m.startsWith('+63')) m = '0' + m.slice(3);
  else if (m.startsWith('63')) m = '0' + m.slice(2);
  else if (m.length === 10 && m[0] === '9') m = '0' + m;
  return m;
}

/** First years (ID starting 26, or Year 1) must give their block. */
function isFreshman_(input) {
  return String(input.IDNumber || '').trim().indexOf('26') === 0 || String(input.YearLevel || '').trim() === '1';
}

/** Adds a header at the end of the Applicants tab for every COLS name it doesn't have yet. Never renames or moves existing ones. */
function ensureApplicantHeaders_() {
  const sh = sheet_(SHEET.APPLICANTS);
  cols_.memo = null;
  const have = cols_().slice();
  const missing = COLS.filter(c => have.indexOf(c) < 0);
  if (!missing.length) return;
  const start = (sh.getLastColumn() && have.length) ? have.length + 1 : 1;
  const need = start - 1 + missing.length;
  if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  sh.getRange(1, start, 1, missing.length).setValues([missing]);
  cols_.memo = null;
}

/* ---------------- settings + lists ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The Sheet has no tab called "' + name + '".');
  return sh;
}

/** Reads the Settings tab (Key | Value) once per run. */
/* ---------- small config tabs (Settings, Lists, Admins) are cached across executions ----------
 * Every page load used to re-read these tabs, which made each call slower and pushed the portal toward Apps Script's
 * limit on simultaneous executions during a rush. They change rarely, so they're kept in CacheService for 2 minutes
 * and cleared by onEdit (AdminMenu.gs) the moment someone edits one of them. Dates come back as ISO text, which
 * parseDate_() reads fine. */
const CONFIG_TTL_ = 120;
function cachedTab_(name) {
  cachedTab_.memo = cachedTab_.memo || {};
  if (cachedTab_.memo[name]) return cachedTab_.memo[name];
  const cache = CacheService.getScriptCache(), key = 'tab:' + name;
  let rows = null;
  try { const hit = cache.get(key); if (hit) rows = JSON.parse(hit); } catch (e) { rows = null; }
  if (!rows) {
    rows = sheet_(name).getDataRange().getValues();
    try { const json = JSON.stringify(rows); if (json.length < 90000) cache.put(key, json, CONFIG_TTL_); } catch (e) { /* too big or cache down: just don't cache */ }
  }
  cachedTab_.memo[name] = rows;
  return rows;
}
function clearConfigCache_() {
  try { CacheService.getScriptCache().removeAll(['tab:' + SHEET.SETTINGS, 'tab:' + SHEET.LISTS, 'tab:' + SHEET.ADMINS, 'tab:' + SHEET.REQUIREMENTS]); } catch (e) { /* fine */ }
}

function getSettings_() {
  if (getSettings_.cache) return getSettings_.cache;
  const rows = cachedTab_(SHEET.SETTINGS).slice(1);
  const out = {};
  rows.forEach(r => { if (r[0] !== '') out[String(r[0]).trim()] = r[1]; });
  getSettings_.cache = out;
  return out;
}
function getSetting_(key) { return getSettings_()[key]; }

function isTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

/**
 * Settings dates may be real Date cells or text like "2026-10-24 23:59".
 * Text is read as Manila time no matter where the server runs. Returns a Date or null.
 */
function parseDate_(v) {
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date(m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) + 'T' + pad(m[4] || 23) + ':' + (m[5] || '59') + ':00+08:00');
    return isNaN(d) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** Reads a column from the Lists tab by header name, skipping blanks. */
function getList_(name) {
  const data = cachedTab_(SHEET.LISTS);
  const col = data[0].indexOf(name);
  if (col < 0) throw new Error('Lists tab has no column called ' + name);
  return data.slice(1).map(r => String(r[col]).trim()).filter(String);
}

/** Are applications open right now? Checks the switch AND the deadline. */
function isOpen_() {
  const s = getSettings_();
  const deadline = parseDate_(s.Deadline);
  return isTrue_(s.ApplicationsOpen) && (!deadline || new Date() <= deadline);
}

/** The core team's switches in Settings: PaymentOpen, RequirementsOpen, RoomBookingOpen (TRUE/FALSE). */
function stepOpen_(key) { return isTrue_(getSetting_(key)); }

/* ---------------- who is this ---------------- */

/** Logged-in email. Blank if the deployment can't see it (wrong access setting / other domain). */
function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function isAllowedDomain_(email) {
  const domains = String(getSetting_('AllowedEmailDomains') || '')
    .split(',').map(d => d.trim().toLowerCase()).filter(String);
  if (!domains.length) return true;
  return domains.some(d => email.endsWith('@' + d));
}

function isAdmin_(email) {
  if (!email) return false;
  isAdmin_.memo = isAdmin_.memo || {};
  if (email in isAdmin_.memo) return isAdmin_.memo[email];
  const rows = cachedTab_(SHEET.ADMINS).slice(1);
  return (isAdmin_.memo[email] = rows.some(r => String(r[0]).trim().toLowerCase() === email));
}

/**
 * For editor-only functions (setup, migration). Any PUBLIC function can be called by any
 * visitor from the browser console, so these must refuse when run through the web app.
 * In the editor the active user IS the script owner; in the web app they differ.
 */
function ownerOnly_() {
  const active = currentEmail_();
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!active || active !== owner) throw new Error('Run this from the Apps Script editor as the owner.');
}

/** Call at the top of every admin_* function. Returns the admin's email or throws. */
function requireAdmin_() {
  const email = currentEmail_();
  if (!isAdmin_(email)) throw new Error('Admins only.');
  return email;
}

/** Call at the top of applicant-side functions. Returns { row, data } for the logged-in person or throws. */
function requireApplicant_() {
  const email = currentEmail_();
  if (!email) throw new Error('Sign in with your Ateneo account first.');
  const found = getApplicantByEmail_(email);
  if (!found) throw new Error('You have not applied yet.');
  return found;
}

/* ---------------- lookups ---------------- */

/** Returns { row, data } for this email, or null. Always look people up by login email. */
function getApplicantByEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  // Search just the Email column (Sheets does it server-side), then read only that row. Much cheaper than reading
  // the whole tab on every page load. Emails are written by the portal from the login, so exact matches work;
  // apply_submit_ still does a full trimmed scan inside its lock before filing anything.
  const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow();
  if (last < 2) return null;
  const hit = sh.getRange(2, col_('Email') + 1, last - 1, 1).createTextFinder(email).matchEntireCell(true).matchCase(false).findNext();
  if (!hit) return null;
  const row = hit.getRow();
  return { row: row, data: toObject_(sh.getRange(row, 1, 1, cols_().length).getValues()[0]) };
}

function getApplicantById_(applicantId) {
  const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues(), c = col_('ApplicantID');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][c]).trim() === applicantId) return { row: i + 1, data: toObject_(values[i]) };
  }
  return null;
}

function toObject_(rowValues, cols) {
  const o = {};
  (cols || cols_()).forEach((c, i) => { if (c) o[c] = rowValues[i] instanceof Date ? rowValues[i].toISOString() : rowValues[i]; });
  COLS.forEach(c => { if (!(c in o)) o[c] = ''; });   // a column not in the Sheet yet reads as blank
  return o;
}

/**
 * Next Applicant ID, e.g. APP-2317. Call this INSIDE a lock.
 * IDs don't start at 0001 or count up by one, so an ID never tells anyone how many people applied or how early
 * they were: numbering starts at Settings › ApplicantIdStart (default 2300) and each new ID skips ahead by a
 * random 1-9. Existing IDs are never renumbered (forms, referrals and the Log point at them).
 */
function nextApplicantId_() {
  const start = parseInt(String(getSetting_('ApplicantIdStart') || ''), 10);
  return nextId_(SHEET.APPLICANTS, 'APP-', isNaN(start) ? 2300 : start, 9);
}

function nextId_(sheetName, prefix, start, maxStep) {
  const sh = sheet_(sheetName);
  const c = sheetName === SHEET.APPLICANTS ? col_('ApplicantID') + 1 : 1;
  const ids = sh.getRange(2, c, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat();
  const max = ids.reduce((m, id) => {
    const n = parseInt(String(id).replace(prefix, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  const step = maxStep ? 1 + Math.floor(Math.random() * maxStep) : 1;
  return prefix + String(Math.max(max, start || 0) + step).padStart(4, '0');
}

/**
 * Writes some fields of one Applicants row (by header name). Call inside a lock.
 * Only the given cells (+ LastUpdated) are written: rewriting the whole row would re-type every other cell
 * (a PastOrgs line starting with "-" would turn into a formula) and undo a core-team edit made in between.
 */
function updateApplicant_(row, fields) {
  const sh = sheet_(SHEET.APPLICANTS);
  if (Object.keys(fields).some(k => cols_().indexOf(k) < 0)) ensureApplicantHeaders_();
  Object.keys(fields).forEach(k => { sh.getRange(row, col_(k) + 1).setValue(textCell_(fields[k])); });
  sh.getRange(row, col_('LastUpdated') + 1).setValue(new Date());
}

/* ---------------- data validation ---------------- */

/** For pages: the same rules + dropdown options the server uses. */
function utils_getFormRules() {
  return {
    rules: RULES,
    lists: {},   // no Apply question uses a Lists dropdown any more (Course is free text, autofilled from MemData)
    isOpen: isOpen_()
  };
}

/**
 * Cleans and checks the Apply form (stage 'apply').
 * Returns { ok, errors: {field: message}, clean }. Never trust what the page sends: this runs
 * on the server every time.
 */
function validateApplication_(input, stage) {
  stage = stage || 'apply';
  const errors = {};
  const clean = {};
  input = input || {};
  const lists = {};

  Object.keys(RULES).forEach(field => {
    const rule = RULES[field];
    if (rule.stage !== stage) return;
    let v = input[field];
    v = (v === null || v === undefined) ? '' : String(v);
    v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim(); // strip control chars
    if (!rule.multiline) v = v.replace(/\s+/g, ' ');                            // collapse spaces
    if (rule.phone) v = normalizeMobile_(v);
    if (rule.upper) v = v.toUpperCase().replace(/\s+/g, '');

    if (v === '') {
      if (rule.required) errors[field] = 'Required.';
      else if (rule.requiredIfFreshman && isFreshman_(input)) errors[field] = rule.requiredMsg || 'Required.';
      else clean[field] = '';
      return;
    }
    if (rule.pattern && !new RegExp(rule.pattern).test(v)) { errors[field] = rule.msg; return; }
    if (rule.idMin !== undefined && (Number(v) < rule.idMin || Number(v) > rule.idMax)) { errors[field] = rule.rangeMsg; return; }
    if (rule.options && rule.options.indexOf(v) < 0) { errors[field] = rule.msg; return; }
    if (rule.list) {
      lists[rule.list] = lists[rule.list] || getList_(rule.list);
      if (lists[rule.list].indexOf(v) < 0) { errors[field] = rule.msg; return; }
    }
    if (rule.min !== undefined) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < rule.min || n > rule.max) { errors[field] = rule.msg; return; }
      v = n;
    }
    if (typeof v === 'string' && ((rule.minLen && v.length < rule.minLen) || (rule.maxLen && v.length > rule.maxLen))) {
      errors[field] = rule.msg + ' (you have ' + v.length + ')'; return;
    }
    clean[field] = v;
  });

  return { ok: Object.keys(errors).length === 0, errors: errors, clean: clean };
}

/**
 * Stops "formula injection": text starting with = + - @ would run as a formula
 * in the Sheet. A leading apostrophe makes Sheets store it as plain text.
 */
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/**
 * For Applicants cells: every non-empty string is stored as plain text (leading apostrophe). Without it Sheets
 * re-types what it can: "09171234567" loses its 0, an ID becomes a number, a block "1-2" or a referral code
 * "MAY-2345" becomes a date. Reading the cell back gives the text without the apostrophe. Numbers and Dates pass through.
 */
function textCell_(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
}

/* ---------------- status + log ---------------- */

/**
 * The ONLY way to change a status. Checks the order, updates the row, logs it.
 * by = who did it (admin email or 'system').
 */
function setStatus_(applicantId, newStatus, by) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return setStatusLocked_(applicantId, newStatus, by);
  } finally {
    lock.releaseLock();
  }
}

/** setStatus without taking the lock. Only call this when you already hold it. */
function setStatusLocked_(applicantId, newStatus, by) {
  if (STATUSES.indexOf(newStatus) < 0) throw new Error('Unknown status: ' + newStatus);
  const found = getApplicantById_(applicantId);
  if (!found) throw new Error('No applicant ' + applicantId);
  const from = found.data.Status;
  if ((NEXT_STATUS[from] || []).indexOf(newStatus) < 0) {
    throw new Error('Can\'t go from ' + from + ' to ' + newStatus + '.');
  }
  if (newStatus === 'CONFIRMED' && !(found.data.Requirements === 'APPROVED' && found.data.Payment === 'VERIFIED')) {
    throw new Error('Confirm only after requirements are APPROVED and payment is VERIFIED.');
  }
  const fields = { Status: newStatus };
  if (by && by !== 'system') fields.ReviewedBy = by;
  updateApplicant_(found.row, fields);
  logChange_(applicantId, 'status', from, newStatus, by);
  return newStatus;
}

/** Records a status/track change as a CHANGE row in Activity (never skipped in a rush, never trimmed). */
function logChange_(applicantId, action, from, to, by) {
  activity_('change_' + action, applicantId + ': ' + (from || '(none)') + ' → ' + (to || '(none)') + ' by ' + (by || currentEmail_() || 'system'),
    { level: 'CHANGE' });
}

/* ---------------- officer changes to Requirements / Payment ---------------- */

/**
 * The ONLY way to change Requirements or Payment from code (the LEADS menu uses it).
 * field = 'Requirements' | 'Payment'. Checks the value, logs, and auto-confirms.
 */
function setTrack_(applicantId, field, value, by) {
  const allowed = { Requirements: REQUIREMENT_STATES, Payment: PAYMENT_STATES }[field];
  if (!allowed) throw new Error('Unknown track: ' + field);
  if (allowed.indexOf(value) < 0) throw new Error(field + ' can\'t be ' + value + '.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const found = getApplicantById_(applicantId);
    if (!found) throw new Error('No applicant ' + applicantId);
    const from = found.data[field];
    if (from === value) return value;
    // a proof upload racing the core team's check must never undo VERIFIED
    if (by === 'system' && field === 'Payment' && from === 'VERIFIED') return from;
    if (['REJECTED', 'WITHDRAWN'].indexOf(found.data.Status) >= 0 && value !== 'NONE') {
      throw new Error(applicantId + ' is ' + found.data.Status + '.');
    }
    const fields = {}; fields[field] = value;
    if (by && by !== 'system') fields.ReviewedBy = by;
    updateApplicant_(found.row, fields);
    logChange_(applicantId, field.toLowerCase(), from, value, by);
    autoConfirmLocked_(applicantId);
    return value;
  } finally {
    lock.releaseLock();
  }
}

/** ACCEPTED + Requirements APPROVED + Payment VERIFIED → CONFIRMED. Call while holding the lock. */
function autoConfirmLocked_(applicantId) {
  const found = getApplicantById_(applicantId);
  const d = found && found.data;
  if (d && d.Status === 'ACCEPTED' && d.Requirements === 'APPROVED' && d.Payment === 'VERIFIED') {
    setStatusLocked_(applicantId, 'CONFIRMED', 'system');
    return true;
  }
  return false;
}

/**
 * This applicant's link to a Google Form (from the Requirements tab). Paste the form's PRE-FILLED link with
 * APP-0000 typed as the Applicant ID answer; the real ID is swapped in so the core team can match responses.
 * Returns '' if it isn't a Google Form link.
 */
function formLink_(link, applicantId) {
  const url = String(link || '').trim();
  if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(url)) return '';
  return applicantId ? url.replace(/APP-0000/g, encodeURIComponent(applicantId)) : url;
}

/* ---------------- progress (what's unlocked for this applicant) ---------------- */

/**
 * The one place that decides what an applicant can do next. The hub and the Steps page
 * both use this, so the rules never drift apart.
 * Each stage: { state: 'locked' | 'open' | 'waiting' | 'action' | 'done' | 'stopped', unlocked, why }
 * why (locked only) says what it's waiting for: 'accept' | 'closed' (Settings switch off) | 'pay' | 'req' | 'link'.
 */
function progress_(a) {
  const status = a ? String(a.Status || '') : '';
  const out = { status: status, apply: {}, review: {}, payment: {}, requirements: {}, ga: {}, room: {}, confirmed: {} };
  const ended = status === 'REJECTED' || status === 'WITHDRAWN';
  const accepted = status === 'ACCEPTED' || status === 'CONFIRMED';
  const lock = why => ({ state: ended ? 'stopped' : 'locked', unlocked: false, why: why });

  out.apply = { state: a ? 'done' : (isOpen_() ? 'open' : 'locked'), unlocked: !a && isOpen_() };

  out.review = { unlocked: !!a };
  if (!a) out.review.state = 'locked';
  else if (accepted) out.review.state = 'done';
  else if (ended) out.review.state = 'stopped';
  else out.review.state = 'waiting'; // SUBMITTED, UNDER REVIEW, WAITLISTED

  // 02 Proof of payment: accepted + Settings > PaymentOpen
  const pay = a ? String(a.Payment || 'NONE') : 'NONE';
  const paid = pay === 'VERIFIED';
  if (paid) out.payment = { state: 'done', unlocked: false };
  else if (!accepted) out.payment = lock('accept');
  else if (!stepOpen_('PaymentOpen')) out.payment = lock('closed');
  else out.payment = { state: pay === 'SUBMITTED' ? 'waiting' : 'action', unlocked: true };   // NONE / REJECTED = upload
  out.payment.value = pay;

  // 03 Requirements: payment verified + Settings > RequirementsOpen
  const req = a ? String(a.Requirements || 'NONE') : 'NONE';
  const reqDone = req === 'APPROVED';
  if (reqDone) out.requirements = { state: 'done', unlocked: true };
  else if (!accepted) out.requirements = lock('accept');
  else if (!paid) out.requirements = lock('pay');
  else if (!stepOpen_('RequirementsOpen')) out.requirements = lock('closed');
  else out.requirements = { state: req === 'SUBMITTED' ? 'waiting' : 'action', unlocked: true };   // NONE, PARTIAL, RETURNED
  out.requirements.value = req;

  // 04 1st GA: accepted + a calendar link in Settings > GACalendarLink
  if (!accepted) out.ga = lock('accept');
  else if (!gaLink_()) out.ga = lock('link');
  else out.ga = { state: 'open', unlocked: true };

  // 05 Room booking: requirements approved + Settings > RoomBookingOpen
  if (!accepted) out.room = lock('accept');
  else if (!reqDone) out.room = lock('req');
  else if (!stepOpen_('RoomBookingOpen')) out.room = lock('closed');
  else out.room = { state: 'open', unlocked: true };

  out.confirmed = { unlocked: false, state: status === 'CONFIRMED' ? 'done' : (ended ? 'stopped' : 'locked') };
  return out;
}

/** Settings > GACalendarLink if it's a real link, else ''. */
function gaLink_() {
  const url = String(getSetting_('GACalendarLink') || '').trim();
  return /^https:\/\//.test(url) ? url : '';
}

/* ---------------- Activity tab: what the portal is doing (debugging + tracking) ----------------
 * One row per event: page views, every server call (with how long it took), applications,
 * validation failures, server errors with their stack, and errors from people's browsers.
 * Columns: When | Level | Who | Page | Event | Details | ms
 * Logging never breaks the portal: if writing fails, the event is dropped (and printed to Executions).
 * Never log essays, ID numbers or phone numbers here: only what's needed to see what happened.
 */
const ACTIVITY_HEAD = ['When', 'Level', 'Who', 'Page', 'Event', 'Details', 'ms'];
const ACTIVITY_MAX_ROWS = 20000;   // oldest 5000 are trimmed when the tab gets this long

function activitySheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(SHEET.ACTIVITY);
  if (sh) return sh;
  sh = ss.insertSheet(SHEET.ACTIVITY);
  sh.getRange(1, 1, 1, ACTIVITY_HEAD.length).setValues([ACTIVITY_HEAD])
    .setFontWeight('bold').setBackground('#10275A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  [160, 60, 220, 70, 170, 520, 60].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  const rules = [['ERROR', '#F4CCCC'], ['WARN', '#FFF2CC'], ['CHANGE', '#D9EAD3']].map(([lvl, color]) =>
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="' + lvl + '"')
      .setBackground(color).setRanges([sh.getRange('A:G')]).build());
  sh.setConditionalFormatRules(rules);
  return sh;
}

/**
 * activity_('apply_submit', 'APP-0012 submitted', { level: 'INFO', page: 'apply', ms: 840 })
 * level: 'INFO' (default) | 'WARN' | 'ERROR' | 'CHANGE' (status/track changes). details can be a string or any object (stored as JSON).
 */
/** True once 40 routine (INFO) rows have been written this minute: during a rush they're skipped to keep calls fast.
 *  WARN and ERROR rows are always written. */
function activityBusy_() {
  try {
    const c = CacheService.getScriptCache(), k = 'act:' + Math.floor(Date.now() / 60000);
    const n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), 120);
    return n > 40;
  } catch (e) { return false; }
}

function activity_(event, details, opts) {
  opts = opts || {};
  if ((opts.level || 'INFO') === 'INFO' && activityBusy_()) return;   // WARN, ERROR and CHANGE are always written
  try {
    let who = '';
    try { who = currentEmail_() || 'guest'; } catch (e) { who = 'unknown'; }
    const text = typeof details === 'string' ? details : JSON.stringify(details === undefined ? '' : details);
    const sh = activitySheet_();
    sh.appendRow([new Date(), opts.level || 'INFO', who, opts.page || '', event,
      String(text).slice(0, 5000), opts.ms === undefined ? '' : opts.ms].map(safeCell_));
    if (sh.getLastRow() > ACTIVITY_MAX_ROWS) trimActivity_(sh);
  } catch (err) {
    console.error('activity_ could not write: ' + err + ' | ' + event);
  }
}

/** Drops the oldest 5000 rows, but keeps the CHANGE rows among them (the record of every status/track change). */
function trimActivity_(sh) {
  // one trim at a time; if another run holds the lock, the next write past the limit trims instead
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(0)) return;
  try { if (sh.getLastRow() > ACTIVITY_MAX_ROWS) trimActivityLocked_(sh); } finally { lock.releaseLock(); }
}
function trimActivityLocked_(sh) {
  const old = sh.getRange(2, 1, 5000, ACTIVITY_HEAD.length).getValues();
  const keep = old.filter(r => r[1] === 'CHANGE');
  sh.deleteRows(2, 5000);
  if (keep.length) { sh.insertRowsBefore(2, keep.length); sh.getRange(2, 1, keep.length, ACTIVITY_HEAD.length).setValues(keep); }
}

/**
 * Runs a public server function and logs it: OK with timing, or ERROR with the message and stack
 * (then rethrows, so the page still gets the error). summarize(result) picks what to log on success.
 */
function traced_(event, page, fn, summarize) {
  const t0 = Date.now();
  try {
    const out = fn();
    const ok = !(out && out.ok === false);
    activity_(event, summarize ? summarize(out) : (ok ? 'ok' : out), { level: ok ? 'INFO' : 'WARN', page: page, ms: Date.now() - t0 });
    return out;
  } catch (err) {
    activity_(event, (err && err.message) + (err && err.stack ? '\n' + err.stack : ''), { level: 'ERROR', page: page, ms: Date.now() - t0 });
    throw err;
  }
}

/** Called by every page (Styles.html) when something breaks in the visitor's browser. Public on purpose. */
function log_client(evt) {
  evt = evt || {};
  // anyone can call this: at most 20 events per person (or 60 for all signed-out visitors together) per 10 minutes
  try {
    const email = currentEmail_(), c = CacheService.getScriptCache(), k = 'clog:' + (email || 'anon');
    const n = Number(c.get(k) || 0) + 1;
    if (n > (email ? 20 : 60)) return false;
    c.put(k, String(n), 600);
  } catch (e) { /* cache down: still log */ }
  const page = String(evt.page || '').slice(0, 30);
  const details = {
    kind: String(evt.kind || 'error').slice(0, 40),
    message: String(evt.message || '').slice(0, 1000),
    where: String(evt.where || '').slice(0, 300),
    ua: String(evt.ua || '').slice(0, 200)
  };
  activity_('client_' + details.kind, details, { level: details.kind === 'info' ? 'INFO' : 'ERROR', page: page });
  return true;
}

/* ---------------- "Report an issue" (Styles.html opens the form on every page) ----------------
 * Emails a detailed, LEADS: Oversight-themed case file to Settings > IssueEmail (or BRAND.report.to).
 * Adds what the reporter can't see: their signed-in account, applicant ID/status/tracks, their last
 * Activity rows and the time on the server. Rate-limited to 3 reports per 10 minutes per person.
 * Needs the "send email as you" permission: the owner runs report_authorize once from the editor.
 */
function report_issue(r) {
  return traced_('report_issue', String((r && r.page) || ''), () => report_issue_(r || {}), x => x.ok ? 'sent ' + x.id : 'not sent: ' + x.reason);
}
function report_issue_(r) {
  const R = BRAND.report || {};
  const to = String(getSetting_('IssueEmail') || R.to || '').trim();
  const email = currentEmail_();
  const contact = String(r.contact || '').trim().slice(0, 120) || email;
  // Signed-out reporters share one bucket: keying on the page-supplied contact let anyone dodge the limit
  // by changing it each call. 10 leaves room for real sign-in trouble without flooding the inbox.
  const cache = CacheService.getScriptCache(), key = email ? 'rep:' + email : 'rep:anon';
  const count = Number(cache.get(key) || 0);
  if (count >= (email ? 3 : 10)) return { ok: false, reason: 'rate', to: to };
  // and a cap for the whole portal per day, so a script can't use up the sending quota
  const dayKey = 'rep:day:' + Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd');
  const today = Number(cache.get(dayKey) || 0);
  if (today >= 150) return { ok: false, reason: 'rate', to: to };
  if (!String(r.what || '').trim()) return { ok: false, reason: 'empty', to: to };

  const id = 'R-' + Utilities.formatDate(new Date(), 'Asia/Manila', 'MMdd-HHmm') + '-' + Math.floor(Math.random() * 900 + 100);
  const clip = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 2000);
  const found = email ? getApplicantByEmail_(email) : null;
  const a = found ? found.data : null;

  // this person's recent activity (newest last), so we can see what they did right before reporting
  let recent = [];
  try {
    const sh = ss_().getSheetByName(SHEET.ACTIVITY);
    // only the signed-in account's own activity: a typed-in contact address could be anyone's
    if (sh && sh.getLastRow() > 1 && email) {
      const n = Math.min(400, sh.getLastRow() - 1);
      const rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
      const who = email.toLowerCase();
      recent = rows.filter(x => String(x[2]).toLowerCase() === who).slice(-10).map(x => [
        Utilities.formatDate(new Date(x[0]), 'Asia/Manila', 'MMM d, HH:mm:ss'), x[1], x[3], x[4], clip(x[5], 300), x[6]]);
    }
  } catch (e) { /* no activity: fine */ }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = s => esc(s).replace(/\n/g, '<br>');
  const sev = clip(r.blocking, 80);
  const sevColor = /can't continue/i.test(sev) ? '#FF2A2A' : (/small/i.test(sev) ? '#8C8C8C' : '#FFFF00');
  const row = (k, v) => '<tr><td style="padding:6px 12px 6px 0;color:#8C8C8C;font:12px/1.5 Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;white-space:nowrap">' + esc(k) +
    '</td><td style="padding:6px 0;color:#EAEAEA;font:14px/1.5 Arial,sans-serif;vertical-align:top">' + (v === '' || v === null || v === undefined ? '<span style="color:#555">—</span>' : v) + '</td></tr>';
  const section = (title, inner) => '<tr><td style="padding:22px 28px 0"><div style="font:700 11px/1 Menlo,Consolas,monospace;letter-spacing:.18em;color:#FFFF00;text-transform:uppercase;border-bottom:1px solid #2E2E2E;padding-bottom:8px;margin-bottom:8px">' + esc(title) + '</div>' + inner + '</td></tr>';
  const table = rows => '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + rows.join('') + '</table>';
  const block = text => '<div style="background:#141414;border-left:3px solid #FFFF00;padding:12px 14px;color:#EAEAEA;font:14px/1.6 Arial,sans-serif">' + (text ? nl(text) : '<span style="color:#555">Not given</span>') + '</div>';
  const c = r.client || {};
  const errs = (c.errors || []).slice(-5).map(e => '<div style="font:12px/1.5 Menlo,Consolas,monospace;color:#FF8A8A;margin:4px 0">' + esc(clip(e, 400)) + '</div>').join('') || '<span style="color:#555;font:13px Arial">None caught on this page</span>';
  const act = recent.length ? '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font:12px/1.45 Menlo,Consolas,monospace">' +
    recent.map(x => '<tr><td style="padding:3px 8px 3px 0;color:#8C8C8C;white-space:nowrap">' + esc(x[0]) + '</td><td style="padding:3px 8px 3px 0;color:' + (x[1] === 'ERROR' ? '#FF2A2A' : x[1] === 'WARN' ? '#FFFF00' : '#EAEAEA') + '">' + esc(x[1]) + '</td><td style="padding:3px 8px 3px 0;color:#7A86FF">' + esc(x[2]) + '</td><td style="padding:3px 8px 3px 0;color:#EAEAEA">' + esc(x[3]) + '</td><td style="padding:3px 0;color:#8C8C8C">' + esc(x[4]) + (x[5] !== '' ? ' (' + esc(x[5]) + 'ms)' : '') + '</td></tr>').join('') + '</table>'
    : '<span style="color:#555;font:13px Arial">No recent activity under this account</span>';

  const html =
    '<div style="background:#0A0A0A;padding:24px 0;margin:0">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;background:#0A0A0A;border:2px solid #FFFF00;border-collapse:collapse">' +
    '<tr><td style="height:12px;background:repeating-linear-gradient(-45deg,#FFFF00 0 14px,#0A0A0A 14px 28px);background-color:#FFFF00"></td></tr>' +
    '<tr><td style="padding:22px 28px 0">' +
      '<div style="font:700 11px/1 Menlo,Consolas,monospace;letter-spacing:.2em;color:#FF2A2A">&#9679; REC // INCIDENT REPORT</div>' +
      '<div style="font:700 30px/1.05 Impact,\'Arial Narrow\',Arial,sans-serif;color:#EAEAEA;text-transform:uppercase;margin:10px 0 4px">LEADS: <span style="color:#FFFF00">Oversight</span></div>' +
      '<div style="font:13px/1.5 Menlo,Consolas,monospace;color:#8C8C8C">Case ' + esc(id) + ' &middot; filed ' + esc(Utilities.formatDate(new Date(), 'Asia/Manila', "EEE, MMM d yyyy 'at' h:mm a")) + ' (Manila)</div>' +
      '<div style="display:inline-block;margin-top:14px;padding:5px 10px;border:1.5px solid ' + sevColor + ';color:' + sevColor + ';font:700 12px/1 Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase">' + esc(sev || 'Severity not given') + '</div>' +
    '</td></tr>' +
    section('01 // The problem', table([row('Category', esc(clip(r.category, 120))), row('When', esc(clip(r.when, 80)))]) + block(clip(r.what, 4000))) +
    section('02 // What they were doing', block(clip(r.doing, 1500))) +
    section('03 // Steps to reproduce', block(clip(r.steps, 2000))) +
    section('04 // Subject', table([
      row('Reply to', contact ? '<a style="color:#7A86FF" href="mailto:' + esc(contact) + '">' + esc(contact) + '</a>' +
        (contact.toLowerCase() !== email ? ' <span style="color:#FFFF00">(typed by the reporter, not verified)</span>' : '') : ''),
      row('Signed in as', email ? esc(email) : '<span style="color:#FF2A2A">Not signed in / account hidden</span>'),
      row('Applicant ID', a ? esc(a.ApplicantID) : 'No application on file'),
      row('Name', a ? esc(a.FullName || '') : ''),
      row('Status', a ? esc(a.Status + ' / Req ' + (a.Requirements || 'NONE') + ' / Pay ' + (a.Payment || 'NONE')) : ''),
      row('Ateneo account', email ? (isAllowedDomain_(email) ? 'Yes' : '<span style="color:#FF2A2A">No (wrong domain)</span>') : '')])) +
    section('05 // Where it happened', table([
      row('Page', esc(clip(c.page || r.page, 40))),
      row('URL', esc(clip(c.url, 300))),
      row('Page title', esc(clip(c.title, 120))),
      row('Local time', esc(clip(c.localTime, 80))),
      row('Browser', esc(clip(c.ua, 300))),
      row('Screen', esc(clip(c.screen, 60))),
      row('Language', esc(clip(c.lang, 30))),
      row('Online', c.online === false ? '<span style="color:#FF2A2A">Offline</span>' : 'Yes'),
      row('In-app browser', c.inApp ? '<span style="color:#FFFF00">' + esc(c.inApp) + '</span>' : 'No'),
      row('CRT effects', c.calm ? 'Off' : 'On')])) +
    section('06 // Errors caught on the page', errs) +
    section('07 // Their last activity (Activity tab)', act) +
    '<tr><td style="padding:24px 28px 26px;font:12px/1.6 Menlo,Consolas,monospace;color:#555">Reply to this email to reach the reporter. ' +
      (r.shot ? 'Screenshot attached. ' : '') + 'Full log: the Sheet\'s Activity tab, filter Who = ' + esc(email || contact || 'their email') + '.</td></tr>' +
    '<tr><td style="height:6px;background:#FFFF00"></td></tr>' +
    '</table></div>';

  const plain = ['LEADS: Oversight // Incident report ' + id, '',
    'Category: ' + clip(r.category, 120), 'Severity: ' + sev, 'When: ' + clip(r.when, 80), '',
    'What happened:', clip(r.what, 4000), '', 'What they were doing:', clip(r.doing, 1500), '', 'Steps:', clip(r.steps, 2000), '',
    'Reply to: ' + contact, 'Signed in as: ' + (email || '(not signed in)'), 'Applicant: ' + (a ? a.ApplicantID + ' ' + a.Status : 'none'),
    'Page: ' + clip(c.page || r.page, 40) + '  URL: ' + clip(c.url, 300), 'Browser: ' + clip(c.ua, 300), 'Screen: ' + clip(c.screen, 60),
    'Errors: ' + (c.errors || []).slice(-5).join(' | ')].join('\n');

  const opts = { to: to, subject: '[LEADS: Oversight] Case ' + id + ' // ' + clip(r.category, 60) + (sev ? ' // ' + sev : ''), htmlBody: html, body: plain, name: 'LEADS: Oversight portal' };
  if (contact && /@/.test(contact)) opts.replyTo = contact;
  if (r.shot && r.shot.data && String(r.shot.data).length < 4.2e6) {
    try {
      const type = /^image\/(png|jpe?g|gif|webp)$/.test(r.shot.type) ? r.shot.type : 'image/png';
      opts.attachments = [Utilities.newBlob(Utilities.base64Decode(r.shot.data), type, clip(r.shot.name, 80) || 'screenshot.png')];
    } catch (e) { /* bad image: send without it */ }
  }
  MailApp.sendEmail(opts);
  cache.put(key, String(count + 1), 600);
  cache.put(dayKey, String(today + 1), 90000);
  return { ok: true, id: id, email: contact };
}

/** Run once from the editor (as the owner) so Google asks for the "send email" permission. Sends a test to the report inbox. */
function report_authorize() {
  ownerOnly_();
  const to = String(getSetting_('IssueEmail') || (BRAND.report || {}).to || '');
  MailApp.sendEmail(to, '[LEADS: Oversight] Issue reports are switched on', 'Reports from the portal will arrive at this address.');
  return 'Test email sent to ' + to;
}