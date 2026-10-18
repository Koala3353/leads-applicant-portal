/**
 * Utils.gs  (integrator owns this file — everyone CALLS these, nobody rewrites them)
 *
 * Shared helpers: settings, lookups, data validation, status changes, Google Form links, logging.
 * IMPORTANT: Sheet data-validation rules ALSO apply to script writes (setValues/appendRow):
 * a value that breaks a rule throws an error showing that rule's help text. So validate
 * with validateApplication_() / safeCell_() first, to give users a clear message instead.
 *
 * The portal: Home (the hub, with the Dashboard inside it) + Apply. Requirement PDFs and proof of
 * payment come in through two Google Forms (links in Settings). Officers work in the Sheet itself:
 * the LEADS menu (AdminMenu.gs) and hand edits on the three track columns, which are checked + logged.
 *
 * How an applicant moves through LEADS (three tracks, not one line):
 *   Status        the decision      SUBMITTED → UNDER REVIEW → ACCEPTED / WAITLISTED / REJECTED → CONFIRMED
 *   Requirements  the PDFs (Form)   NONE → PARTIAL → SUBMITTED → APPROVED   (RETURNED = fix and resend)
 *   Payment       proof (Form)      NONE → SUBMITTED → VERIFIED             (REJECTED = resend)
 * Officers set Requirements/Payment after checking the Form responses. The requirements form opens
 * once ACCEPTED; the payment form once ACCEPTED, or right after applying when Settings > PaymentStage
 * is ANYTIME. ACCEPTED + APPROVED + VERIFIED = CONFIRMED (automatic).
 */

const SHEET = {
  APPLICANTS: 'Applicants', SETTINGS: 'Settings', ADMINS: 'Admins', LOG: 'Log', LISTS: 'Lists',
  ACTIVITY: 'Activity',  // made automatically by activity_() the first time something is logged
  DRAFTS: 'Drafts'       // hidden; Apply drafts per account, made automatically (ApplyApi.gs)
};

// Column order of the Applicants tab. Change the Sheet AND this list together.
const COLS = [
  'ApplicantID', 'Timestamp', 'Email', 'FullName', 'Nickname', 'IDNumber', 'Course', 'YearLevel',
  'Mobile', 'MEAInvolvement', 'WhyLEADS', 'FearEssay',                  // initial application
  'Status', 'Requirements', 'Payment',                                    // the three tracks
  'ReviewedBy', 'LastUpdated', 'Notes',                                   // core team
  'Block', 'MBTI', 'PastOrgs', 'FirstOvernight', 'OffsiteAvailability', 'DataConsent',   // added Oct 2026 (kept last so old rows line up)
  'WhyParticipant', 'FirstImpression', 'Rumors', 'TakesLeadership', 'FearLeadership'      // added 5-essay prompt update
];
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
  Course:           { stage: 'apply', required: true, list: 'Courses', msg: 'Pick your course from the list.' },
  YearLevel:        { stage: 'apply', required: true, min: 1, max: 5, msg: 'Year level must be 1 to 5.' },
  Block:            { stage: 'apply', requiredIfFreshman: true, pattern: "^[A-Za-z0-9][A-Za-z0-9 -]{0,29}$",
                      msg: 'Letters and numbers only, e.g. 21A.', requiredMsg: 'Block is required for first years (ID 26xxxx or Year 1).' },
  Mobile:           { stage: 'apply', required: true, phone: true, pattern: '^09\\d{9}$', msg: '11 digits starting with 09, e.g. 09171234567.' },
  MBTI:             { stage: 'apply', pattern: '^[EI][NS][TF][JP]$', msg: 'Pick one of the 16 types (or leave it blank).' },
  MEAInvolvement:   { stage: 'apply', required: true, list: 'MEAInvolvement', msg: 'Pick how you are involved in MEA.' },
  WhyLEADS:         { stage: 'apply', minLen: 50, maxLen: 1000, multiline: true, msg: 'Write 50 to 1000 characters.' },
  FearEssay:        { stage: 'apply', minLen: 50, maxLen: 1000, multiline: true, msg: 'Write 50 to 1000 characters.' },
  PastOrgs:         { stage: 'apply', maxLen: 500, multiline: true, msg: 'Keep it under 500 characters.' },
  FirstOvernight:   { stage: 'apply', required: true, options: ['Yes', 'No'], msg: 'Pick Yes or No.' },
  OffsiteAvailability: { stage: 'apply', required: true, options: ['Yes', 'No'], msg: 'Pick Yes or No.' },
  DataConsent:      { stage: 'apply', required: true, options: ['Y'], msg: 'You need to consent to data processing (RA 10173) to apply.' },
  WhyParticipant:   { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  FirstImpression:  { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  Rumors:           { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  TakesLeadership:  { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' },
  FearLeadership:   { stage: 'apply', required: true, minLen: 50, maxLen: 1000, multiline: true, msg: 'Must be between 50 and 1000 characters.' }
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

/** Fills in any missing header cells on the Applicants tab (e.g. after new COLS were added). Never renames existing ones. */
function ensureApplicantHeaders_() {
  const sh = sheet_(SHEET.APPLICANTS);
  if (sh.getMaxColumns() < COLS.length) sh.insertColumnsAfter(sh.getMaxColumns(), COLS.length - sh.getMaxColumns());
  const range = sh.getRange(1, 1, 1, COLS.length);
  const head = range.getValues()[0];
  let changed = false;
  COLS.forEach((c, i) => { if (String(head[i]).trim() === '') { head[i] = c; changed = true; } });
  if (changed) range.setValues([head]);
}

/* ---------------- settings + lists ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The Sheet has no tab called "' + name + '".');
  return sh;
}

/** Reads the Settings tab (Key | Value) once per run. */
function getSettings_() {
  if (getSettings_.cache) return getSettings_.cache;
  const rows = sheet_(SHEET.SETTINGS).getDataRange().getValues().slice(1);
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
  const data = sheet_(SHEET.LISTS).getDataRange().getValues();
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

/** 'ANYTIME' = applicants can pay right after applying. 'AFTER_ACCEPTANCE' = only once accepted. */
function paymentStage_() {
  return String(getSetting_('PaymentStage') || '').trim().toUpperCase() === 'ANYTIME' ? 'ANYTIME' : 'AFTER_ACCEPTANCE';
}

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
  const rows = sheet_(SHEET.ADMINS).getDataRange().getValues().slice(1);
  return rows.some(r => String(r[0]).trim().toLowerCase() === email);
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
  const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
  const emailCol = COLS.indexOf('Email');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][emailCol]).trim().toLowerCase() === email) {
      return { row: i + 1, data: toObject_(values[i]) };
    }
  }
  return null;
}

function getApplicantById_(applicantId) {
  const values = sheet_(SHEET.APPLICANTS).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === applicantId) return { row: i + 1, data: toObject_(values[i]) };
  }
  return null;
}

function toObject_(rowValues, cols) {
  const o = {};
  (cols || COLS).forEach((c, i) => { o[c] = rowValues[i] instanceof Date ? rowValues[i].toISOString() : rowValues[i]; });
  return o;
}

/** Next ID like APP-0007. Call this INSIDE a lock. */
function nextApplicantId_() {
  return nextId_(SHEET.APPLICANTS, 'APP-');
}

function nextId_(sheetName, prefix) {
  const sh = sheet_(sheetName);
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat();
  const max = ids.reduce((m, id) => {
    const n = parseInt(String(id).replace(prefix, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(4, '0');
}

/** Writes some fields of one Applicants row (by header name). Call inside a lock. */
function updateApplicant_(row, fields) {
  const sh = sheet_(SHEET.APPLICANTS);
  const range = sh.getRange(row, 1, 1, COLS.length);
  const values = range.getValues()[0];
  Object.keys(fields).forEach(k => {
    const i = COLS.indexOf(k);
    if (i < 0) throw new Error('Applicants has no column ' + k);
    values[i] = safeCell_(fields[k]);
  });
  values[COLS.indexOf('LastUpdated')] = new Date();
  range.setValues([values]);
}

/* ---------------- data validation ---------------- */

/** For pages: the same rules + dropdown options the server uses. */
function utils_getFormRules() {
  return {
    rules: RULES,
    lists: {
      Courses: getList_('Courses'),
      MEAInvolvement: getList_('MEAInvolvement')
    },
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

/** Adds one row to the Log tab. */
function logChange_(applicantId, action, from, to, by) {
  sheet_(SHEET.LOG).appendRow([
    new Date(), by || currentEmail_() || 'system', applicantId, action, from || '', to || ''
  ].map(safeCell_));
  activity_('change_' + action, applicantId + ': ' + (from || '(none)') + ' → ' + (to || '(none)') + (by ? ' by ' + by : ''));
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
 * This applicant's link to a Google Form. settingKey = 'RequirementsFormURL' | 'PaymentFormURL'.
 * In Settings, paste the form's PRE-FILLED link with APP-0000 typed as the Applicant ID answer;
 * the real ID is swapped in so officers can match responses. Returns '' if not set up.
 */
function formLink_(settingKey, applicantId) {
  const url = String(getSetting_(settingKey) || '').trim();
  if (!/^https:\/\/(docs\.google\.com\/forms\/|forms\.gle\/)/.test(url)) return '';
  return applicantId ? url.replace(/APP-0000/g, encodeURIComponent(applicantId)) : url;
}

/* ---------------- progress (what's unlocked for this applicant) ---------------- */

/**
 * The one place that decides what an applicant can do next. The hub and the Dashboard
 * both use this, so the rules never drift apart.
 * Each stage: { state: 'locked' | 'open' | 'waiting' | 'action' | 'done' | 'stopped', unlocked }
 */
function progress_(a) {
  const status = a ? String(a.Status || '') : '';
  const out = { status: status, apply: {}, review: {}, requirements: {}, payment: {}, confirmed: {} };
  const ended = status === 'REJECTED' || status === 'WITHDRAWN';
  const accepted = status === 'ACCEPTED' || status === 'CONFIRMED';

  out.apply = { state: a ? 'done' : (isOpen_() ? 'open' : 'locked'), unlocked: !a && isOpen_() };

  out.review = { unlocked: !!a };
  if (!a) out.review.state = 'locked';
  else if (accepted) out.review.state = 'done';
  else if (ended) out.review.state = 'stopped';
  else out.review.state = 'waiting'; // SUBMITTED, UNDER REVIEW, WAITLISTED

  const req = a ? String(a.Requirements || 'NONE') : 'NONE';
  out.requirements = { unlocked: accepted && req !== 'APPROVED', value: req };
  if (!accepted) out.requirements.state = ended ? 'stopped' : 'locked';
  else if (req === 'APPROVED') out.requirements.state = 'done';
  else if (req === 'SUBMITTED') out.requirements.state = 'waiting';
  else out.requirements.state = 'action'; // NONE, PARTIAL, RETURNED

  const pay = a ? String(a.Payment || 'NONE') : 'NONE';
  const payOpen = !!a && !ended && (accepted || paymentStage_() === 'ANYTIME');
  out.payment = { unlocked: payOpen && pay !== 'VERIFIED', value: pay };
  if (pay === 'VERIFIED') out.payment.state = 'done';
  else if (!payOpen) out.payment.state = ended ? 'stopped' : 'locked';
  else if (pay === 'SUBMITTED') out.payment.state = 'waiting';
  else out.payment.state = 'action'; // NONE, REJECTED

  out.confirmed = { unlocked: false, state: status === 'CONFIRMED' ? 'done' : (ended ? 'stopped' : 'locked') };
  return out;
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
  const rules = [['ERROR', '#F4CCCC'], ['WARN', '#FFF2CC']].map(([lvl, color]) =>
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="' + lvl + '"')
      .setBackground(color).setRanges([sh.getRange('A:G')]).build());
  sh.setConditionalFormatRules(rules);
  return sh;
}

/**
 * activity_('apply_submit', 'APP-0012 submitted', { level: 'INFO', page: 'apply', ms: 840 })
 * level: 'INFO' (default) | 'WARN' | 'ERROR'. details can be a string or any object (stored as JSON).
 */
function activity_(event, details, opts) {
  opts = opts || {};
  try {
    let who = '';
    try { who = currentEmail_() || 'guest'; } catch (e) { who = 'unknown'; }
    const text = typeof details === 'string' ? details : JSON.stringify(details === undefined ? '' : details);
    const sh = activitySheet_();
    sh.appendRow([new Date(), opts.level || 'INFO', who, opts.page || '', event,
      String(text).slice(0, 5000), opts.ms === undefined ? '' : opts.ms].map(safeCell_));
    if (sh.getLastRow() > ACTIVITY_MAX_ROWS) sh.deleteRows(2, 5000);
  } catch (err) {
    console.error('activity_ could not write: ' + err + ' | ' + event);
  }
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
  const cache = CacheService.getScriptCache(), key = 'rep:' + (email || contact || 'anon');
  const count = Number(cache.get(key) || 0);
  if (count >= 3) return { ok: false, reason: 'rate', to: to };
  if (!String(r.what || '').trim()) return { ok: false, reason: 'empty', to: to };

  const id = 'R-' + Utilities.formatDate(new Date(), 'Asia/Manila', 'MMdd-HHmm') + '-' + Math.floor(Math.random() * 900 + 100);
  const clip = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 2000);
  const found = email ? getApplicantByEmail_(email) : null;
  const a = found ? found.data : null;

  // this person's recent activity (newest last), so we can see what they did right before reporting
  let recent = [];
  try {
    const sh = ss_().getSheetByName(SHEET.ACTIVITY);
    if (sh && sh.getLastRow() > 1 && (email || contact)) {
      const n = Math.min(400, sh.getLastRow() - 1);
      const rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
      const who = String(email || contact).toLowerCase();
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
      row('Reply to', contact ? '<a style="color:#7A86FF" href="mailto:' + esc(contact) + '">' + esc(contact) + '</a>' : ''),
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
  return { ok: true, id: id, email: contact };
}

/** Run once from the editor (as the owner) so Google asks for the "send email" permission. Sends a test to the report inbox. */
function report_authorize() {
  ownerOnly_();
  const to = String(getSetting_('IssueEmail') || (BRAND.report || {}).to || '');
  MailApp.sendEmail(to, '[LEADS: Oversight] Issue reports are switched on', 'Reports from the portal will arrive at this address.');
  return 'Test email sent to ' + to;
}