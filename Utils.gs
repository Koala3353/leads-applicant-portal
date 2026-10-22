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

// Every tab the code touches. The Status / Requirements / Payment dropdowns come from the constants below (the old
// Lists tab is gone): setup_applyValidation (Setup.gs) builds them.
const SHEET = {
  APPLICANTS: 'Applicants', SETTINGS: 'Settings', ADMINS: 'Admins',
  REQUIREMENTS: 'Requirements',   // one row per requirement Google Form: Form | Link | What to do | Due
  ACTIVITY: 'Activity',  // made automatically by activity_(); status/track changes are its CHANGE rows (the old Log tab)
  DRAFTS: 'Drafts',      // hidden; Apply drafts per account, made automatically (ApplyApi.gs)
  PRELEADS: 'PreLeads',  // Pre-LEADS registrations, made automatically (PreLeadsServer.gs)
  REFERRALS: 'Referrals',   // formulas only, built from the LEADS menu (Referrals.gs)
  MEMDATA: 'MemData'     // the MEA member list (read only): autofill + the ID ownership check (ApplyApi.gs)
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
  'ReferralCode', 'ReferredBy', 'ReferrerID',                             // own code to share / code they used / who that is (Referrals.gs)
  'MessageToApplicant'                                                    // core team: a note shown on the applicant's hub (plain text)
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
// The three columns the core team changes (LEADS menu or by hand). Everything else is written by the portal.
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

// One set of rules for the page AND the server. Pages get these from formRules_() (via apply_getForm).
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

/* ---------------- settings ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
/** The Sheet's link for the core team's "Open the Sheet" button, cached (it never changes; one less Sheets call per hub load). */
function sheetUrl_() {
  const cache = CacheService.getScriptCache();
  let url = null;
  try { url = cache.get('sheetUrl'); } catch (e) { /* read it */ }
  if (!url) { url = ss_().getUrl(); try { cache.put('sheetUrl', url, 21600); } catch (e) { /* fine */ } }
  return url;
}
function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('The Sheet has no tab called "' + name + '".');
  return sh;
}

/**
 * The tab called `name`, made the first time with a bold, frozen header row. An existing tab is returned as it is
 * (its headers are never rewritten). opts: hidden, widths (pixels per column), dateCol (1-based, shown as date+time),
 * textCols (1-based columns kept as plain text, e.g. IDs and phone numbers).
 */
function ensureTab_(name, headers, opts) {
  opts = opts || {};
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (sh && sh.getLastColumn() > 0) return sh;
  sh = sh || ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#10275A').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  (opts.widths || []).forEach((w, i) => sh.setColumnWidth(i + 1, w));
  if (opts.dateCol) sh.getRange(1, opts.dateCol, sh.getMaxRows(), 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  (opts.textCols || []).forEach(c => sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'));
  if (opts.hidden) sh.hideSheet();
  return sh;
}

/**
 * Finds a column in a header row by any of several names, ignoring case, spaces and punctuation
 * ("Student Email" = "studentemail"). Returns the 0-based index, or -1.
 */
function headerIndex_(head, names) {
  const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
  const have = head.map(norm);
  for (const n of names) { const i = have.indexOf(norm(n)); if (i >= 0) return i; }
  return -1;
}

/** 1 -> A, 27 -> AA */
function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Writes a Settings value (adds the row, with its help text from SETTINGS_SCHEMA, if it's missing). */
function writeSetting_(key, value) {
  const sh = sheet_(SHEET.SETTINGS);
  const keys = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  const i = keys.indexOf(key);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(value);
  else sh.appendRow([key, value, ((SETTINGS_SCHEMA.find(s => s.key === key) || {}).help) || '']);
  clearConfigCache_();
  getSettings_.cache = null; cachedTab_.memo = {};
}

/* ---------- small config tabs (Settings, Admins, Requirements) are cached across executions ----------
 * Every page load used to re-read these tabs, which made each call slower and pushed the portal toward Apps Script's
 * limit on simultaneous executions during a rush. They change rarely, so they're kept in CacheService for 2 minutes
 * and cleared by onEdit (AdminMenu.gs) the moment someone edits one of them. Dates come back as ISO text, which
 * parseDate_() reads fine. */
const CONFIG_TTL_ = 120;
const CONFIG_TABS = [SHEET.SETTINGS, SHEET.ADMINS, SHEET.REQUIREMENTS];   // an edit in one of these clears the cache (onEdit)
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
  try { CacheService.getScriptCache().removeAll(CONFIG_TABS.map(n => 'tab:' + n)); } catch (e) { /* fine */ }
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

/**
 * Every Settings row the portal reads, in Sheet order: its type, what a BLANK cell means, and the help text shown in
 * column C. setting_(key) returns the typed value; setup_formatSheets (Setup.gs) adds any missing row with its help.
 * Types: bool (TRUE / ticked), date (a Date cell or "2026-11-11 23:59", Manila time), int, text.
 */
const SETTINGS_SCHEMA = [
  // the event
  { key: 'EventName', type: 'text', def: '', help: 'Shown on the hub, e.g. LEADS 2026' },
  { key: 'EventDates', type: 'text', def: '', help: 'Plain text, e.g. Nov 21 to 23, 2026' },
  { key: 'EventVenue', type: 'text', def: '', help: 'Plain text, e.g. Tagaytay' },
  { key: 'CampStart', type: 'date', def: null, help: 'Optional. When camp starts (for the countdown), e.g. 2027-01-29 08:00. Blank = the first date in EventDates.' },
  // 01 applications
  { key: 'ApplicationsOpen', type: 'bool', def: false, help: 'Ticked = applications open. Untick to close the application form right away, no code change.' },
  { key: 'Deadline', type: 'date', def: null, help: 'Application form closes after this (Manila time)' },
  { key: 'AllowedEmailDomains', type: 'text', def: '', help: 'Comma-separated. Only these accounts can apply. Blank = student.ateneo.edu, ateneo.edu.' },
  { key: 'ApplicantIdStart', type: 'int', def: 2300, help: 'Applicant IDs start above this number (default 2300) and skip ahead randomly, so IDs never show how many applied.' },
  { key: 'ContactEmail', type: 'text', def: '', help: 'Core team email shown in the footer (leave blank to hide)' },
  { key: 'ResultsReleased', type: 'bool', def: false, help: 'Tick to show decisions to applicants. Unticked = ACCEPTED, WAITLISTED, REJECTED and CONFIRMED all show as UNDER REVIEW in the portal, and payment stays locked.' },
  { key: 'ActivityVerbose', type: 'bool', def: false, help: 'Tick only while debugging: also logs every page view and page load in the Activity tab. Leave unticked for launch (those writes slow the Sheet down in a rush).' },
  { key: 'IssueEmail', type: 'text', def: '', help: 'Optional. Where "Report an issue" emails go. Blank = the default in Brand.gs.' },
  // 02 payment
  { key: 'PaymentOpen', type: 'bool', def: false, help: 'STEP 02. Tick to open Proof of payment for ACCEPTED applicants.' },
  { key: 'PaymentDetails', type: 'text', def: '', help: 'Shown on the payment page: amount, account names, what to write in the notes. Line breaks are kept.' },
  { key: 'PaymentQRCodes', type: 'text', def: '', help: 'One QR per line: Label | link to the QR image, e.g. GCash (Juan Dela Cruz) | https://drive.google.com/file/d/... (the Drive file does not need to be shared).' },
  { key: 'PaymentDeadline', type: 'date', def: null, help: 'Last day to send proof of payment, e.g. 2026-12-01 23:59 (shown to applicants)' },
  { key: 'PaymentFolder', type: 'text', def: '', help: 'Drive folder where uploaded proofs are saved. Made automatically on the first upload; share it with the core team.' },
  // 03 requirements
  { key: 'RequirementsOpen', type: 'bool', def: false, help: 'STEP 03. Tick to open Requirements for accepted applicants whose Payment is VERIFIED. The forms are listed in the Requirements tab.' },
  { key: 'RequirementsNote', type: 'text', def: '', help: 'Shown above the forms: general instructions for every requirement.' },
  { key: 'RequirementsDeadline', type: 'date', def: null, help: 'Last day to finish requirements, e.g. 2026-12-15 23:59 (shown to applicants)' },
  // 04 GA, 05 rooms
  { key: 'GACalendarLink', type: 'text', def: '', help: 'STEP 04. Google Calendar link for the 1st GA. The step stays locked until this is filled in.' },
  { key: 'GADetails', type: 'text', def: '', help: 'Shown with the calendar button: date, time, room, what to bring.' },
  { key: 'RoomBookingOpen', type: 'bool', def: false, help: 'STEP 05. Tick to open Room booking for accepted applicants whose Requirements are APPROVED (placeholder page for now).' },
  { key: 'RoomBookingNote', type: 'text', def: '', help: 'Shown on the room booking page. Blank shows: details will be posted here.' },
  // Pre-LEADS
  { key: 'PreLeadsOpen', type: 'bool', def: true, help: 'Untick / FALSE to close Pre-LEADS registration right away. Blank = open.' },
  { key: 'PreLeadsDeadline', type: 'date', def: '2026-11-05 17:00', help: 'When Pre-LEADS registration closes, e.g. 2026-11-05 17:00. Blank = Nov 5, 2026, 5 PM.' },
  { key: 'PreLeadsDate', type: 'text', def: 'November 5, 2026', help: 'Shown on the Pre-LEADS page. Blank = November 5, 2026.' },
  { key: 'PreLeadsTime', type: 'text', def: '5:00 PM – 7:30 PM', help: 'Shown on the Pre-LEADS page. Blank = 5:00 PM – 7:30 PM.' },
  { key: 'PreLeadsVenue', type: 'text', def: 'Onsite (Ateneo de Manila University)', help: 'Shown on the Pre-LEADS page. Blank = Onsite (Ateneo de Manila University).' }
];

/** A Settings value with its type applied; a blank (or missing) cell gives the schema's default. */
function setting_(key) {
  const spec = SETTINGS_SCHEMA.find(s => s.key === key);
  if (!spec) throw new Error('Unknown setting: ' + key);
  const raw = getSetting_(key);
  const blank = raw === undefined || raw === null || String(raw).trim() === '';
  if (spec.type === 'bool') return blank ? spec.def : isTrue_(raw);
  if (spec.type === 'date') return parseDate_(blank ? spec.def : raw);
  if (spec.type === 'int') { const n = parseInt(String(raw), 10); return blank || isNaN(n) ? spec.def : n; }
  return blank ? spec.def : String(raw).trim();
}

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

/** Are applications open right now? Checks the switch AND the deadline. */
function isOpen_() {
  const deadline = setting_('Deadline');
  return setting_('ApplicationsOpen') && (!deadline || new Date() <= deadline);
}

/** The core team's switches in Settings: PaymentOpen, RequirementsOpen, RoomBookingOpen (TRUE/FALSE). */
function stepOpen_(key) { return setting_(key) === true; }

/* ---------------- who is this ---------------- */

/** Logged-in email. Blank if the deployment can't see it (wrong access setting / other domain). */
function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

/** Settings › AllowedEmailDomains. A blank cell means the school default, never "everyone". */
const DEFAULT_DOMAINS = ['student.ateneo.edu', 'ateneo.edu'];
function allowedDomains_() {
  const list = String(getSetting_('AllowedEmailDomains') || '')
    .split(',').map(d => d.trim().toLowerCase().replace(/^@/, '')).filter(String);
  return list.length ? list : DEFAULT_DOMAINS.slice();
}
function isAllowedDomain_(email) {
  email = String(email || '').toLowerCase();
  return !!email && allowedDomains_().some(d => email.endsWith('@' + d));
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
  const found = getApplicantForPortal_(email);
  if (!found) throw new Error('You have not applied yet.');
  return found;
}

// Decisions an applicant can't see until Settings › ResultsReleased is ticked: until then they read as UNDER REVIEW.
const HIDDEN_UNTIL_RELEASE = ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'CONFIRMED'];

/**
 * The applicant's row as the PORTAL may show it (every page an applicant opens goes through this, never
 * getApplicantByEmail_ directly): the decision is masked until results are released, so the core team can set
 * statuses in the Sheet ahead of time. Server-side checks that must see the real row (duplicates) use the raw lookup.
 */
function getApplicantForPortal_(email) {
  const found = getApplicantByEmail_(email);
  if (!found || setting_('ResultsReleased') || HIDDEN_UNTIL_RELEASE.indexOf(String(found.data.Status)) < 0) return found;
  return { row: found.row, data: Object.assign({}, found.data, { Status: 'UNDER REVIEW' }), masked: true };
}

/* ---------------- lookups ---------------- */

/**
 * Returns { row, data } for this email, or null. Always look people up by login email.
 * Cached per person for a minute (CacheService): in a load test, page loads queued for up to 40s behind each other's
 * Sheet reads once ~60 people loaded at the same moment, and a returning visitor's hub needs no Sheet read at all
 * this way. Every write through the portal (updateApplicant_, a submit) and every hand edit (onEdit) clears that
 * person's entry, so a change shows on their next load; anything else (rows deleted by hand) shows within a minute.
 * Writes never trust the cached row number: updateApplicant_ re-checks it by ApplicantID.
 */
const APPLICANT_TTL = 60;
function getApplicantByEmail_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  const cache = CacheService.getScriptCache(), key = 'appl:' + email;
  try { const hit = cache.get(key); if (hit) { const v = JSON.parse(hit); return v.none ? null : v; } } catch (e) { /* read it fresh */ }
  const found = readApplicantByEmail_(email);
  try { cache.put(key, JSON.stringify(found || { none: 1 }), APPLICANT_TTL); } catch (e) { /* too big or cache down: fine */ }
  return found;
}
/** Drops one person's cached lookup (after anything changes their row). */
function forgetApplicant_(email) {
  email = String(email || '').trim().toLowerCase();
  if (email) try { CacheService.getScriptCache().remove('appl:' + email); } catch (e) { /* fine */ }
}
function readApplicantByEmail_(email) {
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

/** Returns { row, data } for this Applicant ID, or null. Searches only the ID column, then reads that one row. */
function getApplicantById_(applicantId) {
  applicantId = String(applicantId || '').trim();
  if (!applicantId) return null;
  const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow();
  if (last < 2) return null;
  const hit = sh.getRange(2, col_('ApplicantID') + 1, last - 1, 1).createTextFinder(applicantId).matchEntireCell(true).findNext();
  if (!hit) return null;
  const row = hit.getRow();
  return { row: row, data: toObject_(sh.getRange(row, 1, 1, cols_().length).getValues()[0]) };
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
  const sh = sheet_(SHEET.APPLICANTS);
  const ids = sh.getRange(2, col_('ApplicantID') + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().flat();
  const max = ids.reduce((m, id) => {
    const n = parseInt(String(id).replace('APP-', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return 'APP-' + String(Math.max(max, setting_('ApplicantIdStart')) + 1 + Math.floor(Math.random() * 9)).padStart(4, '0');
}

/**
 * Writes some fields of one Applicants row (by header name). Call inside a lock.
 * Only the given cells (+ LastUpdated) are written: rewriting the whole row would re-type every other cell
 * (a PastOrgs line starting with "-" would turn into a formula) and undo a core-team edit made in between.
 */
function updateApplicant_(row, fields, applicantId) {
  const sh = sheet_(SHEET.APPLICANTS);
  if (Object.keys(fields).some(k => cols_().indexOf(k) < 0)) ensureApplicantHeaders_();
  // Sorting by hand doesn't wait for the script lock: if the row no longer holds this applicant, find it again
  if (applicantId && String(sh.getRange(row, col_('ApplicantID') + 1).getValue()).trim() !== applicantId) {
    const again = getApplicantById_(applicantId);
    if (!again) throw new Error('No applicant ' + applicantId);
    row = again.row;
  }
  Object.keys(fields).forEach(k => { sh.getRange(row, col_(k) + 1).setValue(textCell_(fields[k])); });
  sh.getRange(row, col_('LastUpdated') + 1).setValue(new Date());
  forgetApplicant_(sh.getRange(row, col_('Email') + 1).getValue());   // their next page load reads the new values
}

/* ---------------- data validation ---------------- */

/** For pages: the same rules the server uses. */
function formRules_() {
  return { rules: RULES, isOpen: isOpen_() };
}

/**
 * Cleans and checks the Apply form (stage 'apply').
 * Returns { ok, errors: {field: message}, clean }. Never trust what the page sends: this runs
 * on the server every time.
 */
function validateApplication_(input, stage) {
  stage = stage || 'apply';
  const rules = {};
  Object.keys(RULES).forEach(f => { if (RULES[f].stage === stage) rules[f] = RULES[f]; });
  return validateFields_(input, rules);
}

/**
 * The checker behind every form (Apply, Pre-LEADS): one rule per field, same options as RULES.
 * requiredMsg (optional) replaces "Required." for a blank field.
 */
function validateFields_(input, rules) {
  const errors = {};
  const clean = {};
  input = input || {};

  Object.keys(rules).forEach(field => {
    const rule = rules[field];
    let v = input[field];
    v = (v === null || v === undefined) ? '' : String(v);
    v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim(); // strip control chars
    if (!rule.multiline) v = v.replace(/\s+/g, ' ');                            // collapse spaces
    if (rule.phone) v = normalizeMobile_(v);
    if (rule.upper) v = v.toUpperCase().replace(/\s+/g, '');

    if (v === '') {
      if (rule.required || (rule.requiredIfFreshman && isFreshman_(input))) errors[field] = rule.requiredMsg || 'Required.';
      else clean[field] = '';
      return;
    }
    if (rule.pattern && !new RegExp(rule.pattern).test(v)) { errors[field] = rule.msg; return; }
    if (rule.idMin !== undefined && (Number(v) < rule.idMin || Number(v) > rule.idMax)) { errors[field] = rule.rangeMsg; return; }
    if (rule.options && rule.options.indexOf(v) < 0) { errors[field] = rule.msg; return; }
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
 * Runs fn while holding the script lock (the one every write to Applicants takes), waiting up to ms for it.
 * Throws "busy" if it can't get it in time.
 */
function withScriptLock_(ms, fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(ms)) throw new Error('The portal is busy. Try again in a minute.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/**
 * The ONLY way to change a status. Checks the order, updates the row, logs it.
 * by = who did it (admin email or 'system').
 */
function setStatus_(applicantId, newStatus, by) {
  return withScriptLock_(20000, () => setStatusLocked_(applicantId, newStatus, by));
}

/** setStatus without taking the lock. Only call this when you already hold it. */
function setStatusLocked_(applicantId, newStatus, by) {
  if (STATUSES.indexOf(newStatus) < 0) throw new Error('Unknown status: ' + newStatus);
  const found = getApplicantById_(applicantId);
  if (!found) throw new Error('No applicant ' + applicantId);
  const from = found.data.Status;
  const problem = statusMoveError_(from, newStatus, found.data);
  if (problem) throw new Error(problem);
  const fields = { Status: newStatus };
  if (by && by !== 'system') fields.ReviewedBy = by;
  updateApplicant_(found.row, fields, applicantId);
  logChange_(applicantId, 'status', from, newStatus, by);
  return newStatus;
}

/**
 * The rules for a change, shared by the LEADS menu (setStatus_ / setTrack_) and hand edits (AdminMenu.gs).
 * Each returns '' when the change is allowed, else the reason in plain words.
 */
function statusMoveError_(from, to, d) {
  if (from && (NEXT_STATUS[from] || []).indexOf(to) < 0) return 'Can\'t go from ' + from + ' to ' + (to || 'blank') + '.';
  if (to === 'CONFIRMED' && !(d.Requirements === 'APPROVED' && d.Payment === 'VERIFIED')) {
    return 'Confirm only after Requirements is APPROVED and Payment is VERIFIED.';
  }
  return '';
}
function trackChangeError_(field, to, d) {
  const list = { Requirements: REQUIREMENT_STATES, Payment: PAYMENT_STATES }[field];
  if (!list) return 'Unknown track: ' + field;
  if (list.indexOf(to) < 0) return field + ' can\'t be ' + (to || 'blank') + '.';
  if (['REJECTED', 'WITHDRAWN'].indexOf(d.Status) >= 0 && to !== 'NONE') return (d.ApplicantID || 'This applicant') + ' is ' + d.Status + '.';
  return '';
}

/** Records a status/track change as a CHANGE row in Activity (never skipped in a rush, never trimmed). */
function logChange_(applicantId, action, from, to, by) {
  activity_('change_' + action, applicantId + ': ' + (from || '(none)') + ' → ' + (to || '(none)') + ' by ' + (by || currentEmail_() || 'system'),
    { level: 'CHANGE' });
}

/* ---------------- core team changes to Requirements / Payment ---------------- */

/**
 * The ONLY way to change Requirements or Payment from code (the LEADS menu uses it).
 * field = 'Requirements' | 'Payment'. Checks the value, logs, and auto-confirms.
 */
function setTrack_(applicantId, field, value, by) {
  const bad = trackChangeError_(field, value, {});
  if (bad) throw new Error(bad);
  return withScriptLock_(20000, () => {
    const found = getApplicantById_(applicantId);
    if (!found) throw new Error('No applicant ' + applicantId);
    const from = found.data[field];
    if (from === value) return value;
    // a proof upload racing the core team's check must never undo VERIFIED
    if (by === 'system' && field === 'Payment' && from === 'VERIFIED') return from;
    const problem = trackChangeError_(field, value, found.data);
    if (problem) throw new Error(problem);
    const fields = {}; fields[field] = value;
    if (by && by !== 'system') fields.ReviewedBy = by;
    updateApplicant_(found.row, fields, applicantId);
    logChange_(applicantId, field.toLowerCase(), from, value, by);
    const now = Object.assign({}, found.data, fields);
    if (shouldConfirm_(now)) setStatusLocked_(applicantId, 'CONFIRMED', 'system');
    else if (shouldUnconfirm_(now)) {
      updateApplicant_(found.row, { Status: 'ACCEPTED' }, applicantId);
      logChange_(applicantId, 'status', 'CONFIRMED', 'ACCEPTED', 'system (' + field.toLowerCase() + ' moved back)');
    }
    return value;
  });
}

/** ACCEPTED + Requirements APPROVED + Payment VERIFIED → CONFIRMED (the menu and hand edits both use this). */
function shouldConfirm_(d) {
  return !!d && d.Status === 'ACCEPTED' && d.Requirements === 'APPROVED' && d.Payment === 'VERIFIED';
}
/** A CONFIRMED camper whose Payment or Requirements moved back (e.g. a bounced payment) drops to ACCEPTED. */
function shouldUnconfirm_(d) {
  return !!d && d.Status === 'CONFIRMED' && !(d.Requirements === 'APPROVED' && d.Payment === 'VERIFIED');
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
  const url = setting_('GACalendarLink');
  return /^https:\/\//.test(url) ? url : '';
}

// The Activity tab, rate limits and the daily clean-up are in Activity.gs; "Report an issue" is in ReportApi.gs.
