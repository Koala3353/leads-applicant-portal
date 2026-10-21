/**
 * Setup.gs  (run from the editor; safe to run again any time, it replaces old rules)
 * Select setup_applyValidation in the dropdown → Run → Allow.
 *
 * It (re)applies Google-Sheets-native data validation, including regex checks
 * that an .xlsx file can't carry, plus status colors and Log protection.
 * Remember: these rules guard hand edits. The code guards itself in Utils.gs.
 */
function setup_applyValidation() {
  ownerOnly_();
  const ss = ss_();
  const sh = sheet_(SHEET.APPLICANTS);
  const lists = sheet_(SHEET.LISTS);
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
  const domains = String(getSetting_('AllowedEmailDomains') || '').split(',')
    .map(d => d.trim().toLowerCase().replace(/[.]/g, '\\.')).filter(String);
  const domainRe = domains.length ? '(' + domains.join('|') + ')' : '[a-z0-9.-]+\\.[a-z]+';
  custom('Email', `=AND(REGEXMATCH(LOWER(${r('Email')}2),"^[a-z0-9._%+-]+@${domainRe}$"),COUNTIF($${r('Email')}:$${r('Email')},${r('Email')}2)=1)`,
    'Allowed email domain only, and only once in this column');
  custom('FullName', `=REGEXMATCH(${r('FullName')}2,"^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{1,79}$")`, 'Letters, spaces, . \' - only');
  custom('Nickname', `=REGEXMATCH(${r('Nickname')}2,"^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ .'-]{0,29}$")`, 'Up to 30 letters');
  custom('IDNumber', `=AND(REGEXMATCH(TO_TEXT(${r('IDNumber')}2),"^\\d{6}$"),COUNTIF($${r('IDNumber')}:$${r('IDNumber')},${r('IDNumber')}2)=1)`,
    '6 digits, and only once in this column');
  custom('Mobile', `=REGEXMATCH(TO_TEXT(${r('Mobile')}2),"^09\\d{9}$")`, '11 digits starting with 09');
  ['WhyParticipant', 'FirstImpression', 'TakesLeadership', 'FearLeadership'].forEach(name =>
    custom(name, `=AND(LEN(${r(name)}2)>=50,LEN(${r(name)}2)<=1000)`, '50 to 1000 characters'));

  // keep leading zeros (09...) and stop Sheets turning IDs into numbers
  ['IDNumber', 'Mobile'].forEach(name => range(name).setNumberFormat('@'));

  range('YearLevel').setDataValidation(B().requireNumberBetween(1, 5).setAllowInvalid(false)
    .setHelpText('Whole number 1 to 5').build());
  range('Timestamp').setDataValidation(B().requireDate().setAllowInvalid(false).build());
  range('LastUpdated').setDataValidation(B().requireDate().setAllowInvalid(false).build());

  const listHeaders = lists.getRange(1, 1, 1, lists.getLastColumn()).getValues()[0].map(String);
  const listCol = header => {
    const c = listHeaders.indexOf(header) + 1;
    if (!c) throw new Error('Lists tab has no column called ' + header);
    return lists.getRange(2, c, lists.getMaxRows() - 1, 1);
  };
  const dropdown = (name, header) => range(name).setDataValidation(
    B().requireValueInRange(listCol(header), true).setAllowInvalid(false).build());
  ['Course', 'MEAInvolvement'].forEach(name => { if (cols_().indexOf(name) >= 0) range(name).clearDataValidations(); });   // Course is free text now; MEAInvolvement was removed
  dropdown('Status', 'Statuses');
  dropdown('Requirements', 'RequirementStates');
  dropdown('Payment', 'PaymentStates');

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
  const allowed = String(getSetting_('AllowedEmailDomains') || '').split(',').map(d => d.trim().toLowerCase()).filter(String);
  if (allowed.length && !allowed.some(d => owner.endsWith('@' + d))) {
    console.warn('HEADS UP: this script is owned by ' + owner + '. Deploy the web app from an account in ' +
      allowed.join(' or ') + ', or the portal will not be able to see who is signed in.');
  }

  SpreadsheetApp.flush();
  // getUi() only works when run from the Sheet's menu, not from the editor, so log instead
  console.log('Validation applied. Try typing a bad ID number in the Applicants tab to test it.');
  try { ss.toast('Validation applied.', 'LEADS setup', 5); } catch (e) { /* editor run: no toast */ }
}

/** 1 -> A, 27 -> AA */
function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * One-time sheet clean-up (Oct 2026). Run from the editor AFTER the new version is deployed (the old version
 * reads columns by position and writes to the Log tab, so it must be gone first). Safe to run twice.
 *  1. Deletes the retired Applicants columns WhyLEADS and FearEssay (replaced by the five essays).
 *  2. Adds any missing columns (PaymentProof) at the end.
 *  3. Copies every Log row into Activity as a CHANGE row, then deletes the Log tab.
 *  4. Re-applies validation.
 */
function setup_cleanupAfterDeploy() {
  ownerOnly_();
  const ss = ss_(), sh = sheet_(SHEET.APPLICANTS), out = [];
  ['WhyLEADS', 'FearEssay'].forEach(name => {
    cols_.memo = null;
    const i = cols_().indexOf(name);
    if (i >= 0) { sh.deleteColumn(i + 1); out.push('deleted column ' + name); }
  });
  cols_.memo = null;
  ensureApplicantHeaders_();

  const log = ss.getSheetByName('Log');
  if (log) {
    const rows = log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, 6).getValues() : [];
    const act = activitySheet_();
    if (rows.length) {
      const moved = rows.map(r => [r[0], 'CHANGE', r[1], '', 'change_' + r[3],
        r[2] + ': ' + (r[4] || '(none)') + ' → ' + (r[5] || '(none)') + ' by ' + r[1] + ' (from the old Log tab)', ''].map(safeCell_));
      act.getRange(act.getLastRow() + 1, 1, moved.length, moved[0].length).setValues(moved);
    }
    ss.deleteSheet(log);
    out.push('moved ' + rows.length + ' Log rows into Activity and deleted the Log tab');
  }
  setup_applyValidation();
  console.log(out.join('\n') || 'Nothing to clean up.');
  return out;
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

  // Applicants
  const ap = sheet_(SHEET.APPLICANTS), cols = cols_(), n = cols.length;
  head(ap, n); ap.setRowHeight(1, 40); ap.setFrozenRows(1);
  const nameCol = cols.indexOf('FullName');
  ap.setFrozenColumns(nameCol >= 0 && nameCol < 6 ? nameCol + 1 : 1);
  // wide enough that each header fits next to its filter button without breaking mid-word
  const W = { ApplicantID: 120, Timestamp: 140, Email: 210, FullName: 170, Nickname: 115, IDNumber: 115, Course: 100, YearLevel: 110,
    Mobile: 115, Status: 135, Requirements: 145, Payment: 115, ReviewedBy: 170, LastUpdated: 140, Notes: 200, Block: 85, MBTI: 85,
    PastOrgs: 220, FirstOvernight: 140, OffsiteAvailability: 170, DataConsent: 130, GameAnswers: 160, PaymentProof: 160,
    ReferralCode: 130, ReferredBy: 125, ReferrerID: 120 };
  cols.forEach((c, i) => ap.setColumnWidth(i + 1, W[c] || 240));   // the essays (not listed) get 240
  oneLine(ap, Math.max(ap.getMaxRows() - 1, 1), n);
  out.push('Applicants formatted');

  // Settings
  const st = sheet_(SHEET.SETTINGS);
  const NEW = [
    ['ApplicantIdStart', '', 'Applicant IDs start above this number (default 2300) and skip ahead randomly, so IDs never show how many applied.'],
    ['CampStart', '', 'Optional. When camp starts (for the countdown), e.g. 2027-01-29 08:00. Blank = the first date in EventDates.'],
    ['IssueEmail', '', 'Optional. Where "Report an issue" emails go. Blank = the default in Brand.gs.'],
    ['PreLeadsOpen', '', 'Untick / FALSE to close Pre-LEADS registration right away. Blank = open.'],
    ['PreLeadsDeadline', '', 'When Pre-LEADS registration closes, e.g. 2026-11-05 17:00. Blank = Nov 5, 2026, 5 PM.'],
    ['PreLeadsDate', '', 'Shown on the Pre-LEADS page. Blank = November 5, 2026.'],
    ['PreLeadsTime', '', 'Shown on the Pre-LEADS page. Blank = 5:00 PM – 7:30 PM.'],
    ['PreLeadsVenue', '', 'Shown on the Pre-LEADS page. Blank = Onsite (Ateneo de Manila University).']
  ];
  const keys = st.getRange(1, 1, Math.max(st.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  const add = NEW.filter(r => keys.indexOf(r[0]) < 0);
  if (add.length) { st.getRange(st.getLastRow() + 1, 1, add.length, 3).setValues(add); out.push('Settings: added ' + add.map(r => r[0]).join(', ')); }
  const sr = st.getLastRow();
  st.getRange(1, 1, sr, 3).setVerticalAlignment('top').setWrap(true);
  st.getRange(2, 1, Math.max(sr - 1, 1), 1).setFontWeight('bold');
  st.getRange(2, 2, Math.max(sr - 1, 1), 1).setHorizontalAlignment('left');
  st.setFrozenRows(1); st.setColumnWidth(1, 190); st.setColumnWidth(2, 260); st.setColumnWidth(3, 460);
  clearConfigCache_();
  out.push('Settings formatted');

  // Activity, Drafts, PreLeads
  [[SHEET.ACTIVITY, [150, 70, 210, 80, 150, 520, 60]], ['Drafts', [220, 150, 520]], ['PreLeads', null]].forEach(([name, widths]) => {
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

