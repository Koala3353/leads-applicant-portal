/**
 * AdminMenu.gs  (integrator owns this file) — the core team works directly in the Sheet.
 *
 *  1. Review panel (LEADS → Open review panel): a sidebar that follows your selection in the Applicants tab.
 *     Click any cell in one or more rows, tick the ones you mean, press a button (Accept, Verify payment…).
 *     Add a message and it shows on those applicants' hubs (MessageToApplicant). The fastest way for bulk changes.
 *  2. The dropdowns in the Status / Requirements / Payment cells: pick a value for one applicant. Checked like
 *     the panel: a core team member's valid change is logged; anything else (wrong order, not in Admins) is undone.
 *  3. The old LEADS → Decision / Requirements / Payment submenus still work on the selected rows.
 *  Every route uses the same rules (allowed status moves only), logs the change, and auto-confirms when all
 *  three tracks are done.
 *
 * The core team must be in the Admins tab AND be editors of the Sheet, using an account in the same
 * Google Workspace as the owner (otherwise Google hides their email and they count as "not core team").
 * Menu functions are public (menus need that), so each one checks requireAdmin_() first.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('LEADS')
    .addItem('Open review panel', 'menu_reviewPanel')
    .addSeparator()
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
    .addSubMenu(ui.createMenu('Payment (uploaded proof)')
      .addItem('Proof received (SUBMITTED)', 'menu_paySubmitted')
      .addItem('Verify (VERIFIED)', 'menu_payVerified')
      .addItem('Reject proof (REJECTED)', 'menu_payRejected'))
    .addSeparator()
    .addItem('Rebuild Referrals tab', 'menu_referrals')
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

function menu_referrals() {
  try { SpreadsheetApp.getUi().alert(referrals_setupTab()); }
  catch (e) { SpreadsheetApp.getUi().alert(String(e && e.message || e)); }
}

function menu_portalLink() {
  requireAdmin_();
  SpreadsheetApp.getUi().alert('Portal link', (ScriptApp.getService().getUrl() && portalUrl_()) ||
    'Not deployed yet: Extensions → Apps Script → Deploy → New deployment → Web app.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Applies one change to every applicant row selected (several ranges allowed). */
function applyToSelection_(field, value) {
  const ui = SpreadsheetApp.getUi();
  let by;
  try { by = requireAdmin_(); } catch (e) {
    ui.alert('Only core team members listed in the Admins tab can do this. You are signed in as ' + (currentEmail_() || 'an account Google hides from the script') + '.');
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

  const { done, failed } = applyToIds_(ids, field, value, by);
  ui.alert('Updated ' + done.length + ' of ' + ids.length + '.' +
    (failed.length ? '\n\nSkipped:\n' + failed.slice(0, 20).join('\n') + (failed.length > 20 ? '\n…' : '') : ''));
}

/** One change for many applicants (the menu and the review panel). Each row is checked on its own; returns what happened. */
function applyToIds_(ids, field, value, by) {
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
  return { done: done, failed: failed };
}

/* ---------------- review panel (ReviewPanel.html) ---------------- */

function menu_reviewPanel() {
  try { requireAdmin_(); } catch (e) {
    SpreadsheetApp.getUi().alert('Only core team members listed in the Admins tab can use the review panel.');
    return;
  }
  const html = HtmlService.createTemplateFromFile('ReviewPanel');
  html.choices = REVIEW_CHOICES;
  SpreadsheetApp.getUi().showSidebar(html.evaluate().setTitle('LEADS review'));
}

// The panel's buttons, in order: [field, value, label]. Values must be in STATUSES / REQUIREMENT_STATES / PAYMENT_STATES.
const REVIEW_CHOICES = [
  ['Status', 'UNDER REVIEW', 'Under review'], ['Status', 'ACCEPTED', 'Accept'], ['Status', 'WAITLISTED', 'Waitlist'],
  ['Status', 'REJECTED', 'Reject'], ['Status', 'WITHDRAWN', 'Withdraw'],
  ['Payment', 'SUBMITTED', 'Proof received'], ['Payment', 'VERIFIED', 'Verify'], ['Payment', 'REJECTED', 'Reject proof'],
  ['Requirements', 'PARTIAL', 'Some files'], ['Requirements', 'SUBMITTED', 'Everything in'], ['Requirements', 'APPROVED', 'Approve'],
  ['Requirements', 'RETURNED', 'Needs fixing']
];

/** The applicants in the current selection (up to 100), for the panel. Called every couple of seconds while it's open. */
function review_selection() {
  requireAdmin_();
  const sh = ss_().getActiveSheet();
  if (sh.getName() !== SHEET.APPLICANTS) return { sheet: sh.getName(), rows: [] };
  const list = sh.getActiveRangeList(), last = sh.getLastRow();
  const ranges = list ? list.getRanges() : [sh.getActiveRange()];
  const want = [];
  ranges.forEach(r => { for (let row = Math.max(2, r.getRow()); row <= Math.min(r.getLastRow(), last) && want.length < 100; row++) if (want.indexOf(row) < 0) want.push(row); });
  if (!want.length) return { sheet: sh.getName(), rows: [] };
  const lo = Math.min.apply(null, want), hi = Math.max.apply(null, want);
  const values = sh.getRange(lo, 1, hi - lo + 1, cols_().length).getValues();
  const rows = want.sort((a, b) => a - b).map(row => toObject_(values[row - lo])).filter(d => /^APP-\d{4,}$/.test(String(d.ApplicantID).trim()))
    .map(d => ({ id: String(d.ApplicantID).trim(), name: String(d.FullName || ''), nick: String(d.Nickname || ''), status: String(d.Status || ''),
      requirements: String(d.Requirements || 'NONE'), payment: String(d.Payment || 'NONE'), message: String(d.MessageToApplicant || '') }));
  return { sheet: sh.getName(), rows: rows, released: setting_('ResultsReleased') };
}

/** Panel button: one change for the ticked applicants, plus the message for them if one was typed (null = leave it). */
function review_apply(ids, field, value, message) {
  const by = requireAdmin_();
  if (!REVIEW_CHOICES.some(c => c[0] === field && c[1] === value)) throw new Error('Unknown change.');
  ids = (ids || []).map(String).filter(id => /^APP-\d{4,}$/.test(id)).slice(0, 100);
  const out = applyToIds_(ids, field, value, by);
  if (message !== null && message !== undefined && out.done.length) review_setMessage(out.done, message);
  return out;
}

/** Panel: writes (or clears, with '') the note shown on these applicants' hubs. */
function review_setMessage(ids, message) {
  const by = requireAdmin_();
  const text = String(message || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000);
  const done = [], failed = [];
  withScriptLock_(20000, () => {
    (ids || []).map(String).slice(0, 100).forEach(id => {
      const found = getApplicantById_(id);
      if (!found) { failed.push(id + ': not found'); return; }
      updateApplicant_(found.row, { MessageToApplicant: text, ReviewedBy: by }, id);
      done.push(id);
    });
  });
  done.forEach(id => logChange_(id, 'message', '', text ? text.slice(0, 80) : '(cleared)', by));
  return { done: done, failed: failed };
}

/** ApplicantIDs of every selected row, no duplicates, header skipped. */
function selectedIds_(sh) {
  const list = sh.getActiveRangeList();
  const ranges = list ? list.getRanges() : [sh.getActiveRange()];
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const colA = sh.getRange(1, col_('ApplicantID') + 1, lastRow, 1).getValues().map(r => String(r[0]).trim());
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
  try { logMessageEdit_(e); } catch (err) { console.error('onEdit message: ' + (err && err.message)); }
  // the portal caches each person's row for a minute (getApplicantByEmail_): a hand edit clears the edited rows
  try {
    const r = e && e.range, sh = r && r.getSheet();
    if (sh && sh.getName() === SHEET.APPLICANTS && r.getLastRow() >= 2) {
      const top = Math.max(2, r.getRow()), n = Math.min(r.getLastRow() - top + 1, 300);
      sh.getRange(top, col_('Email') + 1, n, 1).getValues().forEach(v => forgetApplicant_(v[0]));
    }
  } catch (err) { /* fine: the cache runs out in a minute anyway */ }
  // config tabs are cached for 2 minutes (Utils.gs cachedTab_): an edit clears the cache right away
  try { const n = e && e.range && e.range.getSheet().getName(); if (CONFIG_TABS.indexOf(n) >= 0) clearConfigCache_(); } catch (err) { /* fine */ }
}

/** A note typed straight into Applicants › MessageToApplicant: it shows on the hub at once, so it's logged like a status change. */
function logMessageEdit_(e) {
  if (!e || !e.range) return;
  const r = e.range, sh = r.getSheet();
  if (sh.getName() !== SHEET.APPLICANTS || r.getRow() < 2 || r.getNumRows() !== 1 || r.getNumColumns() !== 1) return;
  if (cols_()[r.getColumn() - 1] !== 'MessageToApplicant') return;
  const id = String(sh.getRange(r.getRow(), col_('ApplicantID') + 1).getValue()).trim();
  const to = String(r.getValue() || '').trim();
  const who = String((e.user && e.user.getEmail && e.user.getEmail()) || currentEmail_() || 'unknown').toLowerCase();
  logChange_(id, 'message (by hand)', '', to ? to.slice(0, 80) : '(cleared)', who);
}

function guardTrackEdit_(e) {
  if (!e || !e.range) return;
  const r = e.range, sh = r.getSheet();
  if (sh.getName() !== SHEET.APPLICANTS || r.getLastRow() < 2) return;
  const trackCols = TRACK_COLS.map(c => col_(c) + 1);
  if (!trackCols.some(c => c >= r.getColumn() && c <= r.getLastColumn())) return;

  const who = String((e.user && e.user.getEmail && e.user.getEmail()) || currentEmail_() || '').toLowerCase();
  const ss = sh.getParent();

  // Pasting / dragging over many cells: we can't tell the old values, so just log it loudly.
  if (r.getNumRows() !== 1 || r.getNumColumns() !== 1) {
    logChange_('', 'bulk hand edit (not checked)', '', r.getA1Notation(), who || 'unknown');
    ss.toast('Bulk edits to Status/Requirements/Payment are not checked or auto-confirmed. Use LEADS → Open review panel for many rows.', 'LEADS', 8);
    return;
  }

  const row = r.getRow();
  const field = cols_()[r.getColumn() - 1];
  const values = sh.getRange(row, 1, 1, cols_().length).getValues()[0];
  const get = name => String(values[col_(name)] || '');
  const id = get('ApplicantID');
  const from = e.oldValue === undefined ? '' : String(e.oldValue);
  const to = String(r.getValue() === null ? '' : r.getValue()).trim();   // e.value is missing when a cell is cleared or pasted into
  if (from === to) return;

  // the same rules as the LEADS menu (statusMoveError_ / trackChangeError_ in Utils.gs)
  const d = { ApplicantID: id, Status: get('Status'), Requirements: get('Requirements'), Payment: get('Payment') };
  let problem = '';
  if (!isAdmin_(who)) problem = 'Only core team members in the Admins tab can change ' + field + '.';
  else if (field === 'Status') problem = statusMoveError_(from, to, d);
  else problem = trackChangeError_(field, to, d);
  if (problem) {
    r.setValue(from);
    ss.toast(problem + ' Your edit was undone.', 'LEADS', 8);
    return;
  }

  sh.getRange(row, col_('LastUpdated') + 1).setValue(new Date());
  sh.getRange(row, col_('ReviewedBy') + 1).setValue(who);
  logChange_(id, field.toLowerCase() + ' (by hand)', from, to, who);

  // auto-confirm / un-confirm, same rules as the menu (shouldConfirm_ / shouldUnconfirm_ in Utils.gs)
  const now = { Status: get('Status'), Requirements: get('Requirements'), Payment: get('Payment') };
  now[field] = to;
  if (shouldConfirm_(now)) {
    sh.getRange(row, col_('Status') + 1).setValue('CONFIRMED');
    logChange_(id, 'status', 'ACCEPTED', 'CONFIRMED', 'system');
    ss.toast(id + ' is now CONFIRMED.', 'LEADS', 5);
  } else if (field !== 'Status' && shouldUnconfirm_(now)) {
    sh.getRange(row, col_('Status') + 1).setValue('ACCEPTED');
    logChange_(id, 'status', 'CONFIRMED', 'ACCEPTED', 'system (' + field.toLowerCase() + ' moved back)');
    ss.toast(id + ' is back to ACCEPTED: ' + field + ' is no longer done.', 'LEADS', 6);
  }
}
