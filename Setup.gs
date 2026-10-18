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
  const col = name => {
    const c = COLS.indexOf(name) + 1;
    if (!c) throw new Error('COLS has no ' + name);
    return c;
  };
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
  custom('WhyLEADS', `=AND(LEN(${r('WhyLEADS')}2)>=50,LEN(${r('WhyLEADS')}2)<=1000)`, '50 to 1000 characters');
  custom('FearEssay', `=AND(LEN(${r('FearEssay')}2)>=50,LEN(${r('FearEssay')}2)<=1000)`, '50 to 1000 characters');

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
  dropdown('Course', 'Courses');
  dropdown('MEAInvolvement', 'MEAInvolvement');
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

  // Log tab: warn anyone who types in it. Warning-only (not locked) because the LEADS menu and the
  // hand-edit check run AS the officer, and they must still be able to add log rows.
  ss.getSheetByName(SHEET.LOG).getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => p.remove());
  sheet_(SHEET.LOG).protect().setDescription('Written by the script. Please don\'t edit.').setWarningOnly(true);

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
