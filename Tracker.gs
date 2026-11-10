/**
 * Tracker.gs  (integrator owns this file)
 * The core team's "[LEADS 2627] Participant Application Tracker" (Settings › TrackerSheet) decides three things the
 * portal used to keep only in the Applicants tab:
 *   Status        [02.1] Accepted: the ID Number list = ACCEPTED. [02.2] Rejected & Waitlisted: the first ID Number
 *                 list = REJECTED, the second = WAITLISTED. In no list: a decision on the portal goes back to SUBMITTED.
 *                 ACCEPTED + Payment VERIFIED + Requirements APPROVED = CONFIRMED (the same rule as shouldConfirm_).
 *   Payment       [05] Payment Tracker › Verification Status: No Payment = NONE, For Verification = SUBMITTED,
 *                 Payment Verified = VERIFIED. A proof upload writes the Drive link, For Verification, and the Rate if blank.
 *   Requirements  [04] PNF & DNU Tracker: PNF Verified + DNU Verified = APPROVED, both handed in = SUBMITTED, one = PARTIAL.
 *                 The applicant's "I dropped this off onsite" tick writes that person's PNF / DNU checkbox.
 * People are matched by ID Number only (never by row, name or position). Columns are found by their header text, so the
 * core team can move them, but never rename "ID Number", "Verification Status", "Proof of Payment", "Rate", "PNF",
 * "PNF Verified", "DNU", "DNU Verified".
 * Pages see a tracker change within a minute (TRACKER_TTL; a portal write clears it at once). tracker_sync_ copies the
 * tracker into the Applicants columns so the Sheet, the review panel and the 8 AM report agree: every 5 minutes once
 * setup_trackerTrigger has been run from the editor, or LEADS › Sync from the tracker now.
 * Settings › TrackerSheet = off: everything goes back to the Applicants columns and the review panel.
 * If the tracker can't be read, nothing is overridden (the portal shows the Applicants columns) and Activity gets a WARN.
 */

const TRACKER_TTL = 60;       // seconds a copy counts as fresh
const TRACKER_KEEP = 21600;   // the last good copy is kept 6 h: when it's stale, ONE request refreshes it while the rest use it
const TRACKER_TABS_ = {
  accepted: '[02.1] Accepted Participant Information',
  decided: '[02.2] Rejected & Waitlisted',
  reqs: '[04] PNF & DNU Tracker',
  pay: '[05] Payment Tracker'
};
const TRACKER_PAY_ = { 'no payment': 'NONE', 'for verification': 'SUBMITTED', 'payment verified': 'VERIFIED' };
const TRACKER_DECIDED_ = ['ACCEPTED', 'CONFIRMED', 'REJECTED', 'WAITLISTED'];
const TRACKER_MSG_ = 'Accept / waitlist / reject, Payment and Requirements now come from the Participant Application Tracker. ' +
  'Change them there; the portal follows within a minute.';

/** The tracker's spreadsheet ID from Settings › TrackerSheet (a link or an ID), or '' when it's off. */
function trackerId_() {
  const v = String(setting_('TrackerSheet') || '').trim();
  if (/^off$/i.test(v)) return '';
  return (v.match(/\/d\/([\w-]{25,})/) || v.match(/^([\w-]{25,})$/) || [])[1] || '';
}
function trackerOn_() { return !!trackerId_(); }

/** The tracker spreadsheet (once per run), or null if it's off or can't be opened. */
function tracker_() {
  if (tracker_.memo !== undefined) return tracker_.memo;
  const id = trackerId_();
  let ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); }
    catch (e) { activity_('tracker_open', 'Could not open the tracker: ' + (e && e.message), { level: 'WARN' }); }
  }
  return (tracker_.memo = ss);
}

/** An ID number cell (263756, "263756", " 263756 ") as "263756"; '' if blank. */
function trackerIdNo_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\.0+$/, '').replace(/\D/g, '');
}

/** Requirement title (Requirements tab) to its tracker column key: "PNF (Parental ...)" = pnf, "DNU" = dnu, else ''. */
function trackerReqKey_(title) {
  const t = String(title || '').trim();
  return /^pnf\b/i.test(t) ? 'pnf' : /^dnu\b/i.test(t) ? 'dnu' : '';
}

/**
 * The header row of a tracker tab: the first of the top 15 rows that has an "ID Number" cell.
 * { row: 0-based index, cols: { 'header text, lower case': [0-based columns in order] } }, or null.
 */
function trackerHead_(values) {
  for (let r = 0; r < Math.min(values.length, 15); r++) {
    const h = values[r].map(x => String(x === null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase());
    if (h.indexOf('id number') < 0) continue;
    const cols = {};
    h.forEach((name, i) => { if (name) (cols[name] = cols[name] || []).push(i); });
    return { row: r, cols: cols };
  }
  return null;
}

function trackerTrue_(v) { return v === true || String(v).trim().toUpperCase() === 'TRUE'; }

/**
 * Everything the portal needs from the tracker, by ID number. fresh = read it now (the sync trigger, after a write).
 * { at, ok: { status, pay, reqs }, ids: { '263756': { s: 'ACCEPTED', p: 'SUBMITTED', r: { pnf, pnfOk, dnu, dnuOk } } } }
 * ok.x is false when that tab or its headers are missing: that part then falls back to the Applicants columns.
 * null when the tracker is off or can't be opened (and there's no earlier copy).
 * Load: 90 people loading at once must not all open the tracker. A copy younger than TRACKER_TTL is used as is; an
 * older one is refreshed by the first request (a 30 s claim in the cache) while everyone else keeps using it; the
 * 5-minute trigger refreshes it too, so pages almost never wait on the tracker.
 */
function trackerRead_(fresh) {
  const id = trackerId_();
  if (!id) return null;
  const cache = CacheService.getScriptCache(), key = 'trk:' + id.slice(0, 16);
  let old = null;
  if (!fresh) {
    try { const hit = cache.get(key); if (hit) old = JSON.parse(hit); } catch (e) { old = null; }
    if (old && old.at && Date.now() - old.at < TRACKER_TTL * 1000) return old;
    if (old) {
      try { if (cache.get(key + ':busy')) return old; cache.put(key + ':busy', '1', 30); } catch (e) { return old; }
    }
  }
  const ss = tracker_();
  if (!ss) return old;

  const out = { at: Date.now(), ok: { status: false, pay: false, reqs: false }, ids: {} };
  const entry = idNo => (out.ids[idNo] = out.ids[idNo] || {});
  const tab = name => { const sh = ss.getSheetByName(name); return sh ? sh.getDataRange().getValues() : null; };
  const missing = [];
  // every ID in one column below the header row
  const idsIn = (values, head, col) => values.slice(head.row + 1).map(r => trackerIdNo_(r[col])).filter(Boolean);
  try {
    const acc = tab(TRACKER_TABS_.accepted), dec = tab(TRACKER_TABS_.decided);
    const ha = acc && trackerHead_(acc), hd = dec && trackerHead_(dec);
    if (ha && hd && hd.cols['id number'].length >= 2) {
      // a person in two lists: ACCEPTED beats WAITLISTED beats REJECTED
      idsIn(dec, hd, hd.cols['id number'][0]).forEach(n => { entry(n).s = 'REJECTED'; });
      idsIn(dec, hd, hd.cols['id number'][1]).forEach(n => { entry(n).s = 'WAITLISTED'; });
      idsIn(acc, ha, ha.cols['id number'][0]).forEach(n => { entry(n).s = 'ACCEPTED'; });
      out.ok.status = true;
    } else missing.push('the accepted / rejected / waitlisted lists');

    const pay = tab(TRACKER_TABS_.pay), hp = pay && trackerHead_(pay);
    const vs = hp && hp.cols['verification status'];
    if (vs) {
      const ic = hp.cols['id number'][0];
      pay.slice(hp.row + 1).forEach(r => {
        const n = trackerIdNo_(r[ic]);
        if (n) entry(n).p = TRACKER_PAY_[String(r[vs[0]] || '').trim().toLowerCase()] || 'NONE';
      });
      out.ok.pay = true;
    } else missing.push(TRACKER_TABS_.pay + ' › Verification Status');

    const req = tab(TRACKER_TABS_.reqs), hr = req && trackerHead_(req);
    const c = hr ? { pnf: hr.cols['pnf'], pnfOk: hr.cols['pnf verified'], dnu: hr.cols['dnu'], dnuOk: hr.cols['dnu verified'] } : null;
    if (c && c.pnf && c.pnfOk && c.dnu && c.dnuOk) {
      const ic = hr.cols['id number'][0];
      req.slice(hr.row + 1).forEach(r => {
        const n = trackerIdNo_(r[ic]);
        if (n) entry(n).r = { pnf: trackerTrue_(r[c.pnf[0]]), pnfOk: trackerTrue_(r[c.pnfOk[0]]),
          dnu: trackerTrue_(r[c.dnu[0]]), dnuOk: trackerTrue_(r[c.dnuOk[0]]) };
      });
      out.ok.reqs = true;
    } else missing.push(TRACKER_TABS_.reqs + ' › PNF / PNF Verified / DNU / DNU Verified');
  } catch (e) {
    activity_('tracker_read', 'Could not read the tracker: ' + (e && e.message), { level: 'WARN' });
    try { cache.remove(key + ':busy'); } catch (err) { /* expires on its own */ }
    return old;   // the last good copy beats nothing
  }
  if (missing.length) {   // once an hour, not on every page load
    try {
      if (!cache.get(key + ':warned')) {
        cache.put(key + ':warned', '1', 3600);
        activity_('tracker_read', 'Tracker is missing ' + missing.join('; ') + ' (renamed tab or header?). Using the Applicants columns for that part.', { level: 'WARN' });
      }
    } catch (e) { /* skip the warning */ }
  }
  try { cache.put(key, JSON.stringify(out), TRACKER_KEEP); cache.remove(key + ':busy'); } catch (e) { /* too big or cache down: read again next time */ }
  return out;
}

/** Clears the cached tracker, so the next page load reads it fresh (after the portal writes to it). */
function trackerForget_() {
  const id = trackerId_();
  if (id) { try { CacheService.getScriptCache().remove('trk:' + id.slice(0, 16)); } catch (e) { /* expires on its own */ } }
}

/** [04] flags to a Requirements value. */
function trackerReq_(r) {
  if (r.pnfOk && r.dnuOk) return 'APPROVED';
  const have = (r.pnf || r.pnfOk ? 1 : 0) + (r.dnu || r.dnuOk ? 1 : 0);
  return have === 2 ? 'SUBMITTED' : have === 1 ? 'PARTIAL' : 'NONE';
}

/**
 * An applicant row (d = Applicants data) with Status / Payment / Requirements as the tracker says. t = trackerRead_()
 * (read here when not given). Returns d itself when the tracker is off or unreadable.
 */
function trackerApply_(d, t) {
  t = t === undefined ? trackerRead_() : t;
  if (!d || !t) return d;
  const e = t.ids[trackerIdNo_(d.IDNumber)] || {};
  const out = Object.assign({}, d);
  if (t.ok.pay && e.p) out.Payment = e.p;
  if (t.ok.reqs && e.r) out.Requirements = trackerReq_(e.r);
  if (t.ok.status) {
    if (e.s === 'ACCEPTED') out.Status = out.Payment === 'VERIFIED' && out.Requirements === 'APPROVED' ? 'CONFIRMED' : 'ACCEPTED';
    else if (e.s) out.Status = e.s;
    else if (TRACKER_DECIDED_.indexOf(String(d.Status || '')) >= 0) out.Status = 'SUBMITTED';   // taken off every list
  }
  return out;
}

/** True when this change now belongs to the tracker (the LEADS menu, review panel and hand edits refuse it). */
function trackerOwns_(field, to, from) {
  if (!trackerOn_()) return false;
  if (field === 'Payment' || field === 'Requirements') return true;
  return field === 'Status' && (TRACKER_DECIDED_.indexOf(String(to || '')) >= 0 || TRACKER_DECIDED_.indexOf(String(from || '')) >= 0);
}

/** This person's row in a tracker tab: { sh, row (1-based), col: { header: 1-based column }, values }, or null. */
function trackerRow_(tabName, idNo) {
  const ss = tracker_();
  if (!ss || !idNo) return null;
  const sh = ss.getSheetByName(tabName);
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  const head = trackerHead_(values);
  if (!head) return null;
  const ic = head.cols['id number'][0];
  for (let r = head.row + 1; r < values.length; r++) {
    if (trackerIdNo_(values[r][ic]) !== idNo) continue;
    const col = {};
    Object.keys(head.cols).forEach(k => { col[k] = head.cols[k][0] + 1; });
    return { sh: sh, row: r + 1, col: col, values: values[r] };
  }
  return null;
}

/**
 * After a proof upload (StepsApi.gs): that person's [05] row gets the Drive link and "For Verification" (never undoing
 * "Payment Verified"), and Rate = Scholar / Regular if it's blank (Scholar = ticked FinAid on Apply; the core team verifies).
 * Never throws: the proof is already saved in the portal; a missing row is logged for the core team.
 */
function trackerProofUploaded_(a, url) {
  if (!trackerOn_()) return;
  try {
    const hit = trackerRow_(TRACKER_TABS_.pay, trackerIdNo_(a.IDNumber));
    if (!hit) {
      activity_('tracker_write', a.ApplicantID + ' uploaded proof, but ' + TRACKER_TABS_.pay + ' has no row for ID ' + a.IDNumber +
        '. The link is in Applicants › PaymentProof.', { level: 'WARN', page: 'pay' });
      return;
    }
    const c = hit.col, cell = k => hit.sh.getRange(hit.row, c[k]);
    if (c['proof of payment']) cell('proof of payment').setValue(url);
    if (c['verification status'] && String(hit.values[c['verification status'] - 1]).trim().toLowerCase() !== 'payment verified') {
      cell('verification status').setValue('For Verification');
    }
    if (c['rate'] && !String(hit.values[c['rate'] - 1]).trim()) cell('rate').setValue(String(a.FinAidScholar || '').trim() === 'Yes' ? 'Scholar' : 'Regular');
  } catch (e) {
    activity_('tracker_write', a.ApplicantID + ': could not write the proof to the tracker: ' + (e && e.message), { level: 'WARN', page: 'pay' });
  }
  trackerForget_();
}

/** The applicant ticked / unticked "I dropped this off onsite" (StepsApi.gs): set that person's PNF or DNU box in [04]. */
function trackerOnsite_(a, title, done) {
  const key = trackerReqKey_(title);
  if (!trackerOn_() || !key) return;
  try {
    const hit = trackerRow_(TRACKER_TABS_.reqs, trackerIdNo_(a.IDNumber));
    if (!hit || !hit.col[key]) {
      activity_('tracker_write', a.ApplicantID + ' marked ' + title + (done ? '' : ' (untick)') + ', but ' + TRACKER_TABS_.reqs +
        ' has no row for ID ' + a.IDNumber + '. It is saved in Applicants › OnsiteSubmitted.', { level: 'WARN', page: 'reqs' });
      return;
    }
    hit.sh.getRange(hit.row, hit.col[key]).setValue(!!done);
  } catch (e) {
    activity_('tracker_write', a.ApplicantID + ': could not write ' + title + ' to the tracker: ' + (e && e.message), { level: 'WARN', page: 'reqs' });
  }
  trackerForget_();
}

/** The emergency contact form (StepsApi.gs) also fills [02.1] › Emergency Contact for this person: "Name (Relation) 09…". */
function trackerEmergency_(a, c) {
  if (!trackerOn_() || !c) return;
  try {
    const hit = trackerRow_(TRACKER_TABS_.accepted, trackerIdNo_(a.IDNumber));
    if (!hit || !hit.col['emergency contact']) return;   // not on the accepted list: the portal's EmergencyContacts tab has it
    hit.sh.getRange(hit.row, hit.col['emergency contact']).setValue(c.name + ' (' + c.relation + ') ' + c.mobile);
  } catch (e) {
    activity_('tracker_write', a.ApplicantID + ': could not write the emergency contact to the tracker: ' + (e && e.message), { level: 'WARN', page: 'pay' });
  }
}

/**
 * The requirement titles this person has handed in, per the tracker's [04] row (PNF / DNU boxes or their Verified
 * boxes); titles the tracker doesn't cover come from own (Applicants › OnsiteSubmitted). null = no [04] row: use own.
 */
function trackerOnsiteDone_(a, titles, own) {
  const t = trackerRead_();
  const e = t && t.ok.reqs ? t.ids[trackerIdNo_(a.IDNumber)] : null;
  if (!e || !e.r) return null;
  return titles.filter(title => {
    const k = trackerReqKey_(title);
    return k ? !!(e.r[k] || e.r[k + 'Ok']) : own.indexOf(title) >= 0;
  });
}

/**
 * Copies the tracker into the Applicants tab: only the Status / Payment / Requirements cells that differ, each logged
 * as a CHANGE (by "tracker"). Returns { ok, changed }.
 */
function tracker_sync_() {
  const t = trackerRead_(true);
  if (!t) return { ok: false, changed: 0 };
  const changes = [];   // [ApplicantID, column, from, to], logged after the lock
  let changed = 0;
  // Load: everything is worked out in memory and each changed column is written in ONE call, so even 90 people
  // accepted at once hold the script lock (which submits and uploads wait on) for about a second.
  withScriptLock_(30000, () => {
    const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow();
    if (last < 2) return;
    const head = cols_(), ci = name => head.indexOf(name);
    const need = TRACK_COLS.concat(['ApplicantID', 'IDNumber', 'Email', 'LastUpdated']);
    const gone = need.filter(k => ci(k) < 0);
    if (gone.length) throw new Error('Applicants is missing ' + gone.join(', '));
    const values = sh.getRange(2, 1, last - 1, head.length).getValues();
    const write = ['LastUpdated'].concat(TRACK_COLS);
    const col = {}, dirty = {};
    write.forEach(k => { col[k] = values.map(r => [r[ci(k)]]); });
    const stamp = new Date(), forget = [];
    values.forEach((r, i) => {
      const d = {};
      ['ApplicantID', 'IDNumber', 'Status', 'Payment', 'Requirements', 'Email'].forEach(k => { d[k] = String(r[ci(k)] === null ? '' : r[ci(k)]).trim(); });
      if (!/^APP-\d{4,}$/.test(d.ApplicantID)) return;
      const now = trackerApply_(d, t);
      const diff = TRACK_COLS.filter(k => now[k] !== d[k]);
      if (!diff.length) return;
      diff.forEach(k => { col[k][i][0] = now[k]; dirty[k] = true; changes.push([d.ApplicantID, k, d[k], now[k]]); });
      col.LastUpdated[i][0] = stamp; dirty.LastUpdated = true;
      forget.push(d.Email);
      changed++;
    });
    write.filter(k => dirty[k]).forEach(k => sh.getRange(2, ci(k) + 1, values.length, 1).setValues(col[k]));
    forget.forEach(forgetApplicant_);
  });
  changes.forEach(c => logChange_(c[0], c[1].toLowerCase() + ' (tracker)', c[2], c[3], 'tracker'));
  return { ok: true, changed: changed };
}

/** The 5-minute trigger (setup_trackerTrigger). Public because triggers need that: from the web app only admins get through. */
function tracker_syncTrigger() {
  const active = currentEmail_(), owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (active && active !== owner && !isAdmin_(active)) return;
  try {
    const r = tracker_sync_();
    if (r.changed) activity_('tracker_sync', r.changed + ' applicant(s) updated from the tracker');
  } catch (e) {
    activity_('tracker_sync', 'Sync from the tracker failed: ' + (e && e.message), { level: 'WARN' });
  }
  // then the "payment verified" emails anyone is now due (PaymentMail.gs); runs even with the tracker off
  try { payMail_sendPending_(); } catch (e) { activity_('payment_mail', 'Verified emails failed: ' + (e && e.message), { level: 'WARN' }); }
}

/** LEADS › Sync from the tracker now. */
function menu_trackerSync() {
  const ui = SpreadsheetApp.getUi();
  try { requireAdmin_(); } catch (e) { ui.alert('Only core team members listed in the Admins tab can do this.'); return; }
  if (!trackerOn_()) { ui.alert('Settings › TrackerSheet is off, so there is nothing to sync.'); return; }
  const r = tracker_sync_();
  const mails = r.ok ? payMail_sendPending_() : 0;   // "payment verified" emails now due (PaymentMail.gs)
  ui.alert(r.ok ? 'Synced. ' + r.changed + ' applicant(s) changed.' + (mails ? ' ' + mails + ' "payment verified" email(s) sent.' : '')
    : 'Could not read the tracker. Check Settings › TrackerSheet and that this account can open it.');
}

/**
 * Run from the Apps Script editor after changing the tracker's sharing: can the portal's account (the one that deploys
 * it) still read the tracker AND write to [04] / [05]? Changes nothing. The result is in the execution log.
 */
function tracker_check() {
  ownerOnly_();
  const me = String(Session.getEffectiveUser().getEmail() || '');
  const say = m => { console.log(m); return m; };
  const id = trackerId_();
  if (!id) return say('Settings › TrackerSheet is off.');
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return say('CANNOT OPEN the tracker as ' + me + ': ' + (e && e.message) + '. Share it with ' + me + ' as Editor.'); }
  tracker_.memo = ss;
  const t = trackerRead_(true);
  const out = ['Opened "' + ss.getName() + '" as ' + me,
    'Accepted / rejected / waitlisted lists read: ' + !!(t && t.ok.status),
    'Payment Tracker read: ' + !!(t && t.ok.pay),
    'PNF & DNU Tracker read: ' + !!(t && t.ok.reqs),
    'People with an ID in the tracker: ' + (t ? Object.keys(t.ids).length : 0)];
  try { out.push('Drive access: ' + DriveApp.getFileById(id).getAccess(me)); } catch (e) { out.push('Drive access: could not check (' + (e && e.message) + ')'); }
  [TRACKER_TABS_.pay, TRACKER_TABS_.reqs, TRACKER_TABS_.accepted].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) { out.push(name + ': TAB MISSING'); return; }
    const locked = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).concat(sh.getProtections(SpreadsheetApp.ProtectionType.RANGE))
      .filter(p => !p.isWarningOnly() && !p.canEdit());
    out.push(name + ': ' + (locked.length ? 'PROTECTED against this account (' + locked.length + ' protection(s)): the portal cannot write here' : 'writable'));
  });
  return say(out.join('\n'));
}

/** Run once from the Apps Script editor: syncs the tracker into the Applicants tab every 5 minutes. */
function setup_trackerTrigger() {
  ownerOnly_();
  ScriptApp.getProjectTriggers().filter(tr => tr.getHandlerFunction() === 'tracker_syncTrigger').forEach(tr => ScriptApp.deleteTrigger(tr));
  ScriptApp.newTrigger('tracker_syncTrigger').timeBased().everyMinutes(5).create();
  tracker_syncTrigger();
  return 'Tracker sync runs every 5 minutes.';
}
