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

  custom('ApplicantID', `=REGEXMATCH(TO_TEXT(${r('ApplicantID')}2),"^APP-\\d{4}$")`, 'Made by the script: APP-0001');
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
