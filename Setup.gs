/**
 * Setup.gs  (run from the editor; safe to run again any time, it replaces old rules)
 * Select setup_applyValidation in the dropdown → Run → Allow.
 *
 * It (re)applies Google-Sheets-native data validation, including regex checks
 * that an .xlsx file can't carry, plus status colors and Activity protection.
 * Remember: these rules guard hand edits. The code guards itself in Utils.gs.
 */
function setup_applyValidation() {
  ownerOnly_();
  const ss = ss_();
  const sh = sheet_(SHEET.APPLICANTS);
  const max = sh.getMaxRows();
  ensureApplicantHeaders_();
  const col = name => col_(name) + 1;   // found by header name
  const range = name => sh.getRange(2, col(name), max - 1, 1);
  const r = name => columnLetter_(col(name));
  const B = SpreadsheetApp.newDataValidation;

  // clear old rules on the data area
  sh.getRange(2, 1, max - 1, sh.getMaxColumns()).clearDataValidations();

  const custom = (name, formula, help) => range(name).setDataValidation(
    B().requireFormulaSatisfied(formula).setAllowInvalid(false).setHelpText(help).build());

  custom('ApplicantID', `=REGEXMATCH(TO_TEXT(${r('ApplicantID')}2),"^APP-\\d{4,}$")`, 'Made by the script: APP-2317');
  // email domains come from Settings > AllowedEmailDomains, so porting needs no code change
  const domainRe = '(' + allowedDomains_().map(d => d.replace(/[.]/g, '\\.')).join('|') + ')';
  custom('Email', `=AND(REGEXMATCH(LOWER(${r('Email')}2),"^[a-z0-9._%+-]+@${domainRe}$"),COUNTIF($${r('Email')}:$${r('Email')},${r('Email')}2)=1)`,
    'Allowed email domain only, and only once in this column');
  // the same patterns and lengths as RULES (Utils.gs), so a hand edit is held to what the form accepts
  const re = name => RULES[name].pattern.replace(/"/g, '""');
  custom('FullName', `=REGEXMATCH(${r('FullName')}2,"${re('FullName')}")`, RULES.FullName.msg);
  custom('Nickname', `=REGEXMATCH(${r('Nickname')}2,"${re('Nickname')}")`, RULES.Nickname.msg);
  custom('IDNumber', `=AND(REGEXMATCH(TO_TEXT(${r('IDNumber')}2),"${re('IDNumber')}"),COUNTIF($${r('IDNumber')}:$${r('IDNumber')},${r('IDNumber')}2)=1)`,
    '6 digits, and only once in this column');
  custom('Mobile', `=REGEXMATCH(TO_TEXT(${r('Mobile')}2),"${re('Mobile')}")`, RULES.Mobile.msg);
  Object.keys(RULES).filter(n => RULES[n].minLen && cols_().indexOf(n) >= 0).forEach(name =>
    custom(name, `=AND(LEN(${r(name)}2)>=${RULES[name].minLen},LEN(${r(name)}2)<=${RULES[name].maxLen})`, RULES[name].msg));

  // keep leading zeros (09...) and stop Sheets turning IDs into numbers
  ['IDNumber', 'Mobile'].forEach(name => range(name).setNumberFormat('@'));

  range('YearLevel').setDataValidation(B().requireNumberBetween(1, 5).setAllowInvalid(false)
    .setHelpText('Whole number 1 to 5').build());
  range('Timestamp').setDataValidation(B().requireDate().setAllowInvalid(false).build());
  range('LastUpdated').setDataValidation(B().requireDate().setAllowInvalid(false).build());

  // the three track dropdowns come from the constants in Utils.gs (one list, so the Sheet and the code never disagree)
  const dropdown = (name, values) => range(name).setDataValidation(
    B().requireValueInList(values, true).setAllowInvalid(false).build());
  dropdown('Status', STATUSES);
  dropdown('Requirements', REQUIREMENT_STATES);
  dropdown('Payment', PAYMENT_STATES);

  // colors for the three tracks
  const color = (name, pairs) => pairs.map(([text, bg]) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(text).setBackground(bg).setRanges([range(name)]).build());
  const RED = '#FDE2E7', BLUE = '#DCEBFF', GREEN = '#DFF5E3', YELLOW = '#FFF4D6', GREY = '#ECEFF3';
  sh.setConditionalFormatRules([].concat(
    color('Status', [['REJECTED', RED], ['WITHDRAWN', GREY], ['UNDER REVIEW', YELLOW], ['WAITLISTED', YELLOW],
      ['ACCEPTED', BLUE], ['CONFIRMED', GREEN]]),
    color('Requirements', [['RETURNED', RED], ['SUBMITTED', YELLOW], ['PARTIAL', YELLOW], ['APPROVED', GREEN]]),
    color('Payment', [['REJECTED', RED], ['SUBMITTED', YELLOW], ['VERIFIED', GREEN]])
  ));

  // Activity tab (incl. its CHANGE rows, the record of every status/track change): warn anyone who types in it.
  // Warning-only (not locked) because the LEADS menu and the hand-edit check run AS the core team member.
  const act = activitySheet_();
  act.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  act.protect().setDescription('Written by the script. Please don\'t edit.').setWarningOnly(true);

  // the portal can only see who is signed in if the owner is in the applicants' Google Workspace
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const allowed = allowedDomains_();
  if (!allowed.some(d => owner.endsWith('@' + d))) {
    console.warn('HEADS UP: this script is owned by ' + owner + '. Deploy the web app from an account in ' +
      allowed.join(' or ') + ', or the portal will not be able to see who is signed in.');
  }

  SpreadsheetApp.flush();
  // getUi() only works when run from the Sheet's menu, not from the editor, so log instead
  console.log('Validation applied. Try typing a bad ID number in the Applicants tab to test it.');
  try { ss.toast('Validation applied.', 'LEADS setup', 5); } catch (e) { /* editor run: no toast */ }
}

/**
 * Installs the daily clean-up (maintenance_daily in Utils.gs): old drafts blanked after 30 days, routine Activity
 * rows deleted after 60 days. Run once from the editor as the owner. Safe to run again (it replaces the old trigger).
 */
function setup_dailyMaintenance() {
  ownerOnly_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'maintenance_daily').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('maintenance_daily').timeBased().everyDays(1).atHour(3).inTimezone('Asia/Manila').create();
  return 'Daily clean-up installed (3 AM Manila).';
}

/**
 * Tidies the Sheet so the core team can read it (safe to run again; it only changes formatting and ADDS missing
 * Settings rows, never edits values or deletes anything). Run from the editor as the owner.
 *  - Applicants: header row wraps and is frozen; ApplicantID..FullName stay frozen while scrolling right; sensible
 *    column widths; long answers stay on one line (click a cell to read it) so rows don't balloon.
 *  - Settings: everything top-aligned, keys bold, dates shown left-aligned like text, and rows added (blank) for
 *    newer settings with a description, so people can find them.
 *  - Activity / Drafts / PreLeads: frozen header, readable widths, one-line rows.
 */
function setup_formatSheets() {
  ownerOnly_();
  const ss = ss_(), out = [];
  const head = (sh, n) => sh.getRange(1, 1, 1, n).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  const oneLine = (sh, rows, cols) => { if (rows > 0) sh.getRange(2, 1, rows, cols).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top'); };

  // Applicants: the columns the core team works in sit right after the name (frozen), so a decision is one click away
  const ap = sheet_(SHEET.APPLICANTS);
  ensureApplicantHeaders_();
  out.push(setup_reviewLayout_(ap));
  cols_.memo = null;
  const cols = cols_(), n = cols.length;
  head(ap, n); ap.setRowHeight(1, 40); ap.setFrozenRows(1);
  const nameCol = cols.indexOf('FullName');
  ap.setFrozenColumns(nameCol >= 0 && nameCol < 6 ? nameCol + 1 : 1);
  // wide enough that each header fits next to its filter button without breaking mid-word
  const W = { ApplicantID: 120, Timestamp: 140, Email: 210, FullName: 170, Nickname: 115, IDNumber: 115, Course: 100, YearLevel: 110,
    Mobile: 115, Status: 135, Requirements: 145, Payment: 115, ReviewedBy: 170, LastUpdated: 140, Notes: 200, Block: 85, MBTI: 85,
    PastOrgs: 220, FirstOvernight: 140, OffsiteAvailability: 170, DataConsent: 130, GameAnswers: 160, PaymentProof: 160,
    ReferralCode: 130, ReferredBy: 125, ReferrerID: 120, MessageToApplicant: 260 };
  cols.forEach((c, i) => ap.setColumnWidth(i + 1, W[c] || 240));   // the essays (not listed) get 240
  oneLine(ap, Math.max(ap.getMaxRows() - 1, 1), n);
  out.push('Applicants formatted');

  // Settings
  const st = sheet_(SHEET.SETTINGS);
  // a row for every setting the code reads (SETTINGS_SCHEMA in Utils.gs), with its help text; existing rows are kept
  const keys = st.getRange(1, 1, Math.max(st.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  const add = SETTINGS_SCHEMA.filter(s => keys.indexOf(s.key) < 0).map(s => [s.key, '', s.help]);
  if (add.length) { st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add); out.push('Settings: added ' + add.map(r => r[0]).join(', ')); }
  const sr = st.getLastRow();
  st.getRange(1, 1, sr, 3).setVerticalAlignment('top').setWrap(true);
  st.getRange(2, 1, Math.max(sr - 1, 1), 1).setFontWeight('bold');
  st.getRange(2, 2, Math.max(sr - 1, 1), 1).setHorizontalAlignment('left');
  st.setFrozenRows(1); st.setColumnWidth(1, 190); st.setColumnWidth(2, 260); st.setColumnWidth(3, 460);
  clearConfigCache_();
  out.push('Settings formatted');

  // Activity, Drafts, PreLeads
  [[SHEET.ACTIVITY, [150, 70, 210, 80, 150, 520, 60]], [SHEET.DRAFTS, [220, 150, 520]], [SHEET.PRELEADS, null]].forEach(([name, widths]) => {
    const sh = ss.getSheetByName(name);
    if (!sh || !sh.getLastColumn()) return;
    const c = sh.getLastColumn();
    head(sh, c); sh.setFrozenRows(1);
    if (widths) widths.forEach((w, i) => { if (i < c) sh.setColumnWidth(i + 1, w); });
    else for (let i = 1; i <= c; i++) sh.setColumnWidth(i, i <= 4 ? 170 : 220);
    oneLine(sh, Math.max(sh.getMaxRows() - 1, 1), c);
    out.push(name + ' formatted');
  });
  SpreadsheetApp.flush();
  console.log(out.join('\n'));
  return out;
}

/**
 * Moves Status, Requirements, Payment and MessageToApplicant to just after FullName (the frozen columns), in that
 * order, and widens the filter to every column. Safe: the code finds columns by header name, and dropdowns, colors
 * and values move with their columns. Does nothing if they're already there.
 */
function setup_reviewLayout_(sh) {
  const want = ['Status', 'Requirements', 'Payment', 'MessageToApplicant'];
  let moved = 0;
  want.forEach((name, i) => {
    cols_.memo = null;
    const head = cols_(), at = head.indexOf(name), dest = head.indexOf('FullName') + 2 + i;   // 1-based target
    if (at < 0 || at + 1 === dest) return;
    sh.moveColumns(sh.getRange(1, at + 1, sh.getMaxRows(), 1), at + 1 < dest ? dest + 1 : dest);
    moved++;
  });
  cols_.memo = null;
  const f = sh.getFilter();
  if (f) { const r = f.getRange(); if (r.getLastColumn() < cols_().length) { f.remove(); sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), cols_().length).createFilter(); } }
  SpreadsheetApp.flush();
  return moved ? 'Applicants: moved ' + moved + ' review column(s) next to FullName' : 'Applicants: review columns already next to FullName';
}

/**
 * Everything the owner sets up by hand, in one run (safe to run again). Run from the editor as the owner: Google asks
 * once for every permission the portal needs (Sheets, Drive for proofs, Mail for issue reports, triggers).
 */
function setup_all() {
  ownerOnly_();
  const out = [];
  const step = (name, fn) => { try { const r = fn(); out.push('OK   ' + name + (typeof r === 'string' ? ': ' + r : '')); } catch (e) { out.push('FAIL ' + name + ': ' + (e && e.message)); } };
  step('validation', setup_applyValidation);
  step('formatting', setup_formatSheets);
  step('daily clean-up', setup_dailyMaintenance);
  step('Drive (proof uploads)', steps_authorizeDrive);
  step('issue report emails', report_authorize);
  console.log(out.join('\n'));
  return out;
}
