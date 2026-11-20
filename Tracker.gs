/**
 * Tracker.gs  (integrator owns this file)
 * The core team's "[LEADS 2627] Participant Application Tracker" (Settings › TrackerSheet) decides three things the
 * portal used to keep only in the Applicants tab:
 *   Status        [02.1] Accepted: the ID Number list = ACCEPTED. [02.2] Rejected & Waitlisted: the first ID Number
 *                 list = REJECTED, the second = WAITLISTED. In no list: a decision on the portal goes back to SUBMITTED.
 *                 ACCEPTED + Payment VERIFIED + Requirements APPROVED = CONFIRMED (the same rule as shouldConfirm_).
 *   Payment       [05] Payment Tracker › Verification Status: No Payment = NONE, For Verification = SUBMITTED,
 *                 Payment Verified = VERIFIED. A proof upload writes the Drive link, For Verification, and (when blank)
 *                 the Rate, the Amount Paid (what the portal asked them to pay) and the Date Paid (the upload time).
 *   Requirements  [04] PNF & DNU Tracker: PNF Verified + DNU Verified = APPROVED, both handed in = SUBMITTED, one = PARTIAL.
 *                 The applicant's "I dropped this off onsite" tick writes that person's PNF / DNU checkbox and, when
 *                 blank, its Date Received.
 *   Blanks        trackerFill_ (after every 5-minute sync) fills only EMPTY cells, one cell at a time, so it never
 *                 overwrites the core team: [05] Verification Status = No Payment, Rate = Regular / Scholar (FinAid tick
 *                 on Apply), and for a proof that is in, Amount Paid + Date Paid; [04] a Verified tick also ticks the
 *                 handed-in box, and a ticked box gets its Date Received (the day the sync first sees it).
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
    if (c['amount paid'] && !String(hit.values[c['amount paid'] - 1]).trim()) cell('amount paid').setValue(fee_(a).now);   // what the portal asked them to pay
    if (c['date paid'] && !String(hit.values[c['date paid'] - 1]).trim()) cell('date paid').setValue(new Date());
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
    const dc = hit.col['date received (' + key + ')'], vc = hit.col[key + ' verified'];
    if (dc) {   // the date: set on a tick when blank; cleared on an untick unless the core team already verified it
      const had = String(hit.values[dc - 1] === null ? '' : hit.values[dc - 1]).trim();
      if (done && !had) hit.sh.getRange(hit.row, dc).setValue(new Date());
      if (!done && had && !(vc && trackerTrue_(hit.values[vc - 1]))) hit.sh.getRange(hit.row, dc).clearContent();
    }
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
    // only as far right as the last column it needs (not the essays and game answers further along)
    const width = Math.max.apply(null, need.map(ci)) + 1;
    const values = sh.getRange(2, 1, last - 1, width).getValues();
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
  try { const n = trackerFill_(); if (n) activity_('tracker_fill', n + ' blank tracker cell(s) filled'); }
  catch (e) { activity_('tracker_fill', 'Filling tracker blanks failed: ' + (e && e.message), { level: 'WARN' }); }
  // payment closes by itself once Settings › PaymentDeadline passes (StepsApi.gs); runs even with the tracker off
  try { steps_autoClosePayment_(); } catch (e) { activity_('payment_autoclose', 'Auto-close failed: ' + (e && e.message), { level: 'WARN' }); }
  // then the "payment verified" emails anyone is now due (PaymentMail.gs); runs even with the tracker off
  try { payMail_sendPending_(); } catch (e) { activity_('payment_mail', 'Verified emails failed: ' + (e && e.message), { level: 'WARN' }); }
}

/**
 * Fills the tracker's EMPTY cells that the portal can work out (see the header). One cell at a time and only where the
 * cell is blank, so a core-team edit made a second ago is never overwritten. At most TRACKER_FILL_MAX writes a run;
 * the rest go on the next 5-minute run. Returns how many cells were written.
 */
const TRACKER_FILL_MAX = 250;
function trackerFill_() {
  const ss = tracker_();
  if (!ss) return 0;
  let n = 0;
  const put = (sh, row, col, v) => { if (n >= TRACKER_FILL_MAX) return; sh.getRange(row, col).setValue(v); n++; };
  const blank = v => String(v === null || v === undefined ? '' : v).trim() === '';
  const today = new Date();

  // FinAid ticks from Apply, by ID number (Applicants › IDNumber + FinAidScholar)
  const scholar = {};
  try {
    const ap = sheet_(SHEET.APPLICANTS), last = ap.getLastRow(), head = cols_();
    const ii = head.indexOf('IDNumber'), fi = head.indexOf('FinAidScholar');
    if (last > 1 && ii >= 0 && fi >= 0) {
      const w = Math.max(ii, fi) + 1;
      ap.getRange(2, 1, last - 1, w).getValues().forEach(r => { const k = trackerIdNo_(r[ii]); if (k) scholar[k] = String(r[fi] || '').trim() === 'Yes'; });
    }
  } catch (e) { /* no Rate fill this run */ }

  // [05] Payment Tracker
  const pay = ss.getSheetByName(TRACKER_TABS_.pay);
  if (pay) {
    const v = pay.getDataRange().getValues(), h = trackerHead_(v);
    const c = k => h && h.cols[k] ? h.cols[k][0] : -1;
    const ic = c('id number'), sc = c('verification status'), rc = c('rate'), ac = c('amount paid'), dc = c('date paid');
    if (h && ic >= 0 && sc >= 0) for (let r = h.row + 1; r < v.length && n < TRACKER_FILL_MAX; r++) {
      const id = trackerIdNo_(v[r][ic]);
      if (!id) continue;
      if (blank(v[r][sc])) { put(pay, r + 1, sc + 1, 'No Payment'); v[r][sc] = 'No Payment'; }
      if (rc >= 0 && blank(v[r][rc]) && id in scholar) { v[r][rc] = scholar[id] ? 'Scholar' : 'Regular'; put(pay, r + 1, rc + 1, v[r][rc]); }
      const proofIn = /^(for verification|payment verified)$/i.test(String(v[r][sc]).trim());
      if (proofIn && ac >= 0 && blank(v[r][ac]) && !blank(v[r][rc])) put(pay, r + 1, ac + 1, fee_({ FinAidScholar: String(v[r][rc]).trim() === 'Scholar' ? 'Yes' : '' }).now);
      if (proofIn && dc >= 0 && blank(v[r][dc])) put(pay, r + 1, dc + 1, today);
    }
  }

  // [04] PNF & DNU Tracker
  const req = ss.getSheetByName(TRACKER_TABS_.reqs);
  if (req) {
    const v = req.getDataRange().getValues(), h = trackerHead_(v);
    const c = k => h && h.cols[k] ? h.cols[k][0] : -1;
    const ic = c('id number');
    if (h && ic >= 0) for (let r = h.row + 1; r < v.length && n < TRACKER_FILL_MAX; r++) {
      if (!trackerIdNo_(v[r][ic])) continue;
      ['pnf', 'dnu'].forEach(k => {
        const bc = c(k), vc = c(k + ' verified'), dc = c('date received (' + k + ')');
        if (bc < 0) return;
        if (vc >= 0 && trackerTrue_(v[r][vc]) && !trackerTrue_(v[r][bc])) { put(req, r + 1, bc + 1, true); v[r][bc] = true; }   // verified = handed in
        if (dc >= 0 && trackerTrue_(v[r][bc]) && blank(v[r][dc])) put(req, r + 1, dc + 1, today);
      });
    }
  }
  if (n) trackerForget_();
  return n;
}

/** LEADS › Sync from the tracker now. */
function menu_trackerSync() {
  const ui = SpreadsheetApp.getUi();
  try { requireAdmin_(); } catch (e) { ui.alert('Only core team members listed in the Admins tab can do this.'); return; }
  if (!trackerOn_()) { ui.alert('Settings › TrackerSheet is off, so there is nothing to sync.'); return; }
  const r = tracker_sync_();
  let filled = 0; try { filled = r.ok ? trackerFill_() : 0; } catch (e) { /* the 5-minute run tries again */ }
  const mails = r.ok ? payMail_sendPending_() : 0;   // "payment verified" emails now due (PaymentMail.gs)
  ui.alert(r.ok ? 'Synced. ' + r.changed + ' applicant(s) changed.' + (filled ? ' ' + filled + ' blank tracker cell(s) filled.' : '') + (mails ? ' ' + mails + ' "payment verified" email(s) sent.' : '')
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

/* ---------------- one-off: unpaid out, waitlist dibs in (Nov 21 2026) ----------------
 * Rejects every ACCEPTED person whose [05] Verification Status is No Payment (or blank) with no proof in the portal,
 * and accepts the same number from the "Waitlist Dibs" tab, earliest submission first (only people still Waitlist).
 * The tracker's lists are built by POSITION from [02.0] Deliberations, so changing a decision slides the names while the
 * typed columns next to them stay put. This saves every typed column BY ID NUMBER first ([05] Rate..Remarks + Payment
 * Blast Status, [02.1] Emergency contact / Sent? / FB Group? / AI?, [02.2] Sent? / Replied / Accepted, [04] PNF + DNU
 * boxes, dates, Forfeit?, Notes), changes the decisions, then writes each saved value back next to the same ID.
 * Run tracker_swapPreview first (logs the plan, changes nothing), then tracker_swapApply. The portal's tracker sync is
 * paused (Settings › TrackerSheet = off) while it runs and switched back on at the end.
 */
function tracker_swapPreview() { return tracker_swap_(true); }
function tracker_swapApply() { return tracker_swap_(false); }

function tracker_swap_(dry) {
  ownerOnly_();
  const ss = tracker_();
  if (!ss) throw new Error('The tracker is off or cannot be opened.');
  const tab = n => { const s = ss.getSheetByName(n); if (!s) throw new Error('No tab "' + n + '" in the tracker.'); return s; };
  const del = tab('[02.0] Deliberations'), pay = tab(TRACKER_TABS_.pay), acc = tab(TRACKER_TABS_.accepted),
        dec = tab(TRACKER_TABS_.decided), req = tab(TRACKER_TABS_.reqs), dibs = tab('Waitlist Dibs');
  const idn = v => trackerIdNo_(v);
  const log = [];

  // decisions (C Applicant ID, D ID Number, E Name, F Decision; rows 13..202)
  const dv = del.getRange(13, 3, 190, 4).getValues();
  const decOf = {};
  dv.forEach((r, i) => { const k = idn(r[1]); if (k) decOf[k] = { row: 13 + i, dec: String(r[3]).trim(), name: String(r[2]) }; });

  // [05] snapshot: B name, C ID, D..I (Rate, Amount, Date, Proof, Status, Remarks), N Payment Blast Status
  const P0 = 10, PN = 130;
  const pv = pay.getRange(P0, 2, PN, 13).getValues();
  const payBy = {};
  pv.forEach(r => { const k = idn(r[1]); if (k) payBy[k] = { di: r.slice(2, 8), n: r[12] }; });

  // portal proofs by ID number (a late upload counts as paid)
  const ap = sheet_(SHEET.APPLICANTS), head = cols_();
  const av = ap.getRange(2, 1, Math.max(ap.getLastRow() - 1, 1), head.length).getValues();
  const proofBy = {};
  av.forEach(r => { const k = idn(r[head.indexOf('IDNumber')]); if (k && String(r[head.indexOf('PaymentProof')] || '').trim()) proofBy[k] = true; });

  const unpaid = Object.keys(payBy).filter(k => decOf[k] && decOf[k].dec === 'Accept' &&
    (!String(payBy[k].di[4] || '').trim() || /^no payment$/i.test(String(payBy[k].di[4]).trim())) && !proofBy[k]);

  // Waitlist Dibs: A Timestamp, C Student ID Number; earliest first, still Waitlist, no repeats
  const wv = dibs.getRange(2, 1, Math.max(dibs.getLastRow() - 1, 1), 3).getValues()
    .filter(r => r[0] && idn(r[2]))
    .sort((a, b) => new Date(a[0]) - new Date(b[0]));
  const promote = [], seen = {};
  wv.forEach(r => {
    const k = idn(r[2]);
    if (seen[k] || promote.length >= unpaid.length) return;
    seen[k] = true;
    if (decOf[k] && decOf[k].dec === 'Waitlist') promote.push(k);
    else log.push('dibs skipped ' + k + ' (' + (decOf[k] ? decOf[k].dec : 'not in Deliberations') + ')');
  });

  log.push('REJECT (unpaid, ' + unpaid.length + '): ' + unpaid.map(k => decOf[k].name + ' ' + k).join(' | '));
  log.push('ACCEPT (waitlist dibs, ' + promote.length + '): ' + promote.map(k => decOf[k].name + ' ' + k).join(' | '));
  if (promote.length < unpaid.length) log.push('WARNING: only ' + promote.length + ' waitlisted dibs for ' + unpaid.length + ' slots.');
  if (dry) { log.forEach(x => Logger.log(x)); Logger.log('PREVIEW only: nothing changed. Run tracker_swapApply to do it.'); return log; }

  // snapshots of every typed column, by ID number
  const AN = 132;
  const accV = acc.getRange(6, 3, AN, 15).getValues();            // C..Q
  const accBy = {};
  accV.forEach(r => { const k = idn(r[0]); if (k) accBy[k] = { H: r[5], I: r[6], K: r[8], L: r[9], Q: r[14] }; });
  const decV = dec.getRange(6, 3, AN, 16).getValues();            // C..R
  const rejBy = {}, wlBy = {};
  decV.forEach(r => {
    const a = idn(r[0]); if (a) rejBy[a] = { G: r[4] };
    const b = idn(r[8]); if (b) wlBy[b] = { O: r[12], P: r[13], R: r[15] };
  });
  const RN = 239;
  const reqV = req.getRange(8, 2, RN, 14).getValues();             // B..O
  const reqBy = {};
  reqV.forEach(r => { const k = idn(r[0]); if (k) reqBy[k] = { F: r[4], G: r[5], H: r[6], J: r[8], K: r[9], L: r[10], N: r[12], O: r[13] }; });

  const prevSheet = String(getSetting_('TrackerSheet') || '');
  let report = [];
  withScriptLock_(60000, () => {
    writeSetting_('TrackerSheet', 'off');   // pause the 5-minute sync while the lists move
    try {
      unpaid.forEach(k => del.getRange(decOf[k].row, 6).setValue('Reject'));
      promote.forEach(k => del.getRange(decOf[k].row, 6).setValue('Accept'));
      SpreadsheetApp.flush();
      Utilities.sleep(1500);
      SpreadsheetApp.flush();

      // [05]: D..I and N back next to each ID
      const ids5 = pay.getRange(P0, 3, PN, 1).getValues().map(r => idn(r[0]));
      const n5 = ids5.filter(Boolean).length;
      const di = [], nn = [];
      for (let i = 0; i < n5; i++) {
        const k = ids5[i], s = payBy[k];
        di.push(s ? s.di : ['', '', '', '', 'No Payment', '']);
        nn.push([s ? s.n : '']);
      }
      if (n5) { pay.getRange(P0, 4, n5, 6).setValues(di); pay.getRange(P0, 14, n5, 1).setValues(nn); }

      // [02.1]: H, I, K, L, Q
      const ids1 = acc.getRange(6, 3, AN, 1).getValues().map(r => idn(r[0]));
      const n1 = ids1.filter(Boolean).length;
      const hi = [], kl = [], q = [];
      for (let i = 0; i < n1; i++) {
        const s = accBy[ids1[i]] || { H: '', I: '', K: '', L: false, Q: '' };
        hi.push([s.H, s.I]); kl.push([s.K, s.L]); q.push([s.Q]);
      }
      if (n1) { acc.getRange(6, 8, n1, 2).setValues(hi); acc.getRange(6, 11, n1, 2).setValues(kl); acc.getRange(6, 17, n1, 1).setValues(q); }

      // [02.2]: rejected G; waitlisted O, P, R
      const after = dec.getRange(6, 3, AN, 9).getValues();
      const rejIds = after.map(r => idn(r[0])), wlIds = after.map(r => idn(r[8]));
      const nr = rejIds.filter(Boolean).length, nw = wlIds.filter(Boolean).length;
      const g = [], op = [], r = [];
      for (let i = 0; i < nr; i++) g.push([(rejBy[rejIds[i]] || { G: '' }).G]);
      for (let i = 0; i < nw; i++) { const s = wlBy[wlIds[i]] || { O: '', P: false, R: false }; op.push([s.O, s.P]); r.push([s.R]); }
      if (nr) dec.getRange(6, 7, nr, 1).setValues(g);
      if (nw) { dec.getRange(6, 15, nw, 2).setValues(op); dec.getRange(6, 18, nw, 1).setValues(r); }
      // the waitlist got shorter: clear Sent? / Replied / Accepted on the rows that emptied at its bottom (Q is a formula: left alone)
      const wlOld = Object.keys(wlBy).length;
      if (wlOld > nw) { dec.getRange(6 + nw, 15, wlOld - nw, 2).clearContent(); dec.getRange(6 + nw, 18, wlOld - nw, 1).clearContent(); }

      // [04]: F G H, J K L, N O
      const ids4 = req.getRange(8, 2, RN, 1).getValues().map(r2 => idn(r2[0]));
      const n4 = ids4.filter(Boolean).length;
      const fgh = [], jkl = [], no = [];
      for (let i = 0; i < n4; i++) {
        const s = reqBy[ids4[i]] || { F: false, G: false, H: '', J: false, K: false, L: '', N: false, O: '' };
        fgh.push([s.F, s.G, s.H]); jkl.push([s.J, s.K, s.L]); no.push([s.N, s.O]);
      }
      if (n4) { req.getRange(8, 6, n4, 3).setValues(fgh); req.getRange(8, 10, n4, 3).setValues(jkl); req.getRange(8, 14, n4, 2).setValues(no); }
      SpreadsheetApp.flush();

      // check: every person still in [05] has exactly the values they had before
      const chk = pay.getRange(P0, 3, n5, 7).getValues();
      let ok = 0, bad = [];
      chk.forEach(row => {
        const k = idn(row[0]), s = payBy[k];
        if (!s) return;
        const same = s.di.every((v, j) => String(v instanceof Date ? v.getTime() : v) === String(row[j + 1] instanceof Date ? row[j + 1].getTime() : row[j + 1]));
        if (same) ok++; else bad.push(k);
      });
      report = ['[05] kept for ' + ok + ' people; mismatches: ' + (bad.length ? bad.join(', ') : 'none'),
        '[05] rows: ' + n5 + ' | [02.1]: ' + n1 + ' | rejected: ' + nr + ' | waitlisted: ' + nw + ' | [04]: ' + n4];
    } finally {
      writeSetting_('TrackerSheet', prevSheet);   // the sync back on
      trackerForget_();
    }
  });
  log.concat(report).forEach(x => Logger.log(x));
  activity_('tracker_swap', log.concat(report).join(' // ').slice(0, 1500));
  return log.concat(report);
}
