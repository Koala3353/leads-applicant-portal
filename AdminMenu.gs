/**
 * AdminMenu.gs  (integrator owns this file) — officers work directly in the Sheet.
 *
 *  1. LEADS menu (top bar of the Sheet): select applicant rows in the Applicants tab, then
 *     LEADS → Decision / Requirements / Payment → pick the new value. Every row is checked
 *     (allowed status moves only), logged, and auto-confirmed when all three tracks are done.
 *  2. Hand edits to Status / Requirements / Payment cells are checked too: an officer's valid
 *     change is logged; anything else (wrong order, not in Admins) is undone with a message.
 *
 * Officers must be in the Admins tab AND be editors of the Sheet, using an account in the same
 * Google Workspace as the owner (otherwise Google hides their email and they count as "not an officer").
 * Menu functions are public (menus need that), so each one checks requireAdmin_() first.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('LEADS')
    .addSubMenu(ui.createMenu('Decision')
      .addItem('Under review', 'menu_underReview')
      .addItem('Accept', 'menu_accept')
      .addItem('Waitlist', 'menu_waitlist')
      .addItem('Reject', 'menu_reject')
      .addItem('Withdraw', 'menu_withdraw'))
    .addSubMenu(ui.createMenu('Requirements (from the form)')
      .addItem('Got some files (PARTIAL)', 'menu_reqPartial')
      .addItem('Got everything (SUBMITTED)', 'menu_reqSubmitted')
      .addItem('Approve (APPROVED)', 'menu_reqApproved')
      .addItem('Needs fixing (RETURNED)', 'menu_reqReturned'))
    .addSubMenu(ui.createMenu('Payment (from the form)')
      .addItem('Got proof (SUBMITTED)', 'menu_paySubmitted')
      .addItem('Verify (VERIFIED)', 'menu_payVerified')
      .addItem('Reject proof (REJECTED)', 'menu_payRejected'))
    .addSeparator()
    .addItem('Show portal link', 'menu_portalLink')
    .addToUi();
}

function menu_underReview() { applyToSelection_('Status', 'UNDER REVIEW'); }
function menu_accept()      { applyToSelection_('Status', 'ACCEPTED'); }
function menu_waitlist()    { applyToSelection_('Status', 'WAITLISTED'); }
function menu_reject()      { applyToSelection_('Status', 'REJECTED'); }
function menu_withdraw()    { applyToSelection_('Status', 'WITHDRAWN'); }
function menu_reqPartial()  { applyToSelection_('Requirements', 'PARTIAL'); }
function menu_reqSubmitted(){ applyToSelection_('Requirements', 'SUBMITTED'); }
function menu_reqApproved() { applyToSelection_('Requirements', 'APPROVED'); }
function menu_reqReturned() { applyToSelection_('Requirements', 'RETURNED'); }
function menu_paySubmitted(){ applyToSelection_('Payment', 'SUBMITTED'); }
function menu_payVerified() { applyToSelection_('Payment', 'VERIFIED'); }
function menu_payRejected() { applyToSelection_('Payment', 'REJECTED'); }

function menu_portalLink() {
  requireAdmin_();
  SpreadsheetApp.getUi().alert('Portal link', (ScriptApp.getService().getUrl() && portalUrl_()) ||
    'Not deployed yet: Extensions → Apps Script → Deploy → New deployment → Web app.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Applies one change to every applicant row the officer has selected (several ranges allowed). */
function applyToSelection_(field, value) {
  const ui = SpreadsheetApp.getUi();
  let by;
  try { by = requireAdmin_(); } catch (e) {
    ui.alert('Only officers listed in the Admins tab can do this. You are signed in as ' + (currentEmail_() || 'an account Google hides from the script') + '.');
    return;
  }
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== SHEET.APPLICANTS) { ui.alert('Go to the Applicants tab and select the applicants\' rows first.'); return; }

  const ids = selectedIds_(sh);
  if (!ids.length) { ui.alert('Select at least one applicant row (any cell in the row works).'); return; }
  const final = (field === 'Status' && (value === 'REJECTED' || value === 'WITHDRAWN')) ? '\n\nThis is final and can\'t be undone.' : '';
  const ok = ui.alert('Set ' + field + ' to ' + value + ' for ' + ids.length + ' applicant(s)?\n\n' +
    ids.slice(0, 15).join(', ') + (ids.length > 15 ? ' …' : '') + final, ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  const done = [], failed = [];
  ids.forEach(id => {
    try {
      if (field === 'Status') setStatus_(id, value, by); else setTrack_(id, field, value, by);
      done.push(id);
    } catch (e) {
      failed.push(id + ': ' + e.message);
    }
  });
  SpreadsheetApp.flush();
  ui.alert('Updated ' + done.length + ' of ' + ids.length + '.' +
    (failed.length ? '\n\nSkipped:\n' + failed.slice(0, 20).join('\n') + (failed.length > 20 ? '\n…' : '') : ''));
}

/** ApplicantIDs (column A) of every selected row, no duplicates, header skipped. */
function selectedIds_(sh) {
  const list = sh.getActiveRangeList();
  const ranges = list ? list.getRanges() : [sh.getActiveRange()];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const colA = sh.getRange(1, 1, lastRow, 1).getValues().map(r => String(r[0]).trim());
  const ids = [];
  ranges.forEach(r => {
    for (let row = Math.max(2, r.getRow()); row <= Math.min(r.getLastRow(), lastRow); row++) {
      const id = colA[row - 1];
      if (/^APP-\d{4,}$/.test(id) && ids.indexOf(id) < 0) ids.push(id);
    }
  });
  return ids;
}

/* ---------------- hand edits ---------------- */

/** Simple trigger: runs on every hand edit. Must never throw. */
function onEdit(e) {
  try { guardTrackEdit_(e); } catch (err) { console.error('onEdit: ' + (err && err.message)); }
}

function guardTrackEdit_(e) {
  if (!e || !e.range) return;
  const r = e.range, sh = r.getSheet();
  if (sh.getName() !== SHEET.APPLICANTS || r.getLastRow() < 2) return;
  const trackCols = TRACK_COLS.map(c => COLS.indexOf(c) + 1);
  if (!trackCols.some(c => c >= r.getColumn() && c <= r.getLastColumn())) return;

  const who = String((e.user && e.user.getEmail && e.user.getEmail()) || currentEmail_() || '').toLowerCase();
  const ss = sh.getParent();

  // Pasting / dragging over many cells: we can't tell the old values, so just log it loudly.
  if (r.getNumRows() !== 1 || r.getNumColumns() !== 1) {
    logChange_('', 'bulk hand edit (not checked)', '', r.getA1Notation(), who || 'unknown');
    ss.toast('Bulk edits to Status/Requirements/Payment are not checked or auto-confirmed. Use the LEADS menu instead.', 'LEADS', 8);
    return;
  }

  const row = r.getRow();
  const field = COLS[r.getColumn() - 1];
  const values = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  const get = name => String(values[COLS.indexOf(name)] || '');
  const id = get('ApplicantID');
  const from = e.oldValue === undefined ? '' : String(e.oldValue);
  const to = e.value === undefined ? '' : String(e.value);
  if (from === to) return;

  let problem = '';
  if (!isAdmin_(who)) problem = 'Only officers in the Admins tab can change ' + field + '.';
  else if (field === 'Status') {
    if (from && (NEXT_STATUS[from] || []).indexOf(to) < 0) problem = 'Can\'t go from ' + from + ' to ' + (to || 'blank') + '.';
    else if (to === 'CONFIRMED' && !(get('Requirements') === 'APPROVED' && get('Payment') === 'VERIFIED')) {
      problem = 'Confirm only after Requirements is APPROVED and Payment is VERIFIED.';
    }
  } else {
    const list = field === 'Requirements' ? REQUIREMENT_STATES : PAYMENT_STATES;
    if (list.indexOf(to) < 0) problem = field + ' can\'t be ' + (to || 'blank') + '.';
    else if (['REJECTED', 'WITHDRAWN'].indexOf(get('Status')) >= 0 && to !== 'NONE') problem = id + ' is ' + get('Status') + '.';
  }
  if (problem) {
    r.setValue(from);
    ss.toast(problem + ' Your edit was undone.', 'LEADS', 8);
    return;
  }

  sh.getRange(row, COLS.indexOf('LastUpdated') + 1).setValue(new Date());
  sh.getRange(row, COLS.indexOf('ReviewedBy') + 1).setValue(who);
  logChange_(id, field.toLowerCase() + ' (by hand)', from, to, who);

  // auto-confirm, same rule as the menu
  const now = { Status: get('Status'), Requirements: get('Requirements'), Payment: get('Payment') };
  now[field] = to;
  if (now.Status === 'ACCEPTED' && now.Requirements === 'APPROVED' && now.Payment === 'VERIFIED') {
    sh.getRange(row, COLS.indexOf('Status') + 1).setValue('CONFIRMED');
    logChange_(id, 'status', 'ACCEPTED', 'CONFIRMED', 'system');
    ss.toast(id + ' is now CONFIRMED.', 'LEADS', 5);
  }
}
