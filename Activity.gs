/**
 * Activity.gs  (integrator owns this file; split out of Utils.gs)
 * The Activity tab (every page view, server call, error and status change), the daily clean-up, rate limits
 * (bump_) and the browser error log (log_client). Everyone CALLS these; nobody rewrites them.
 */

/* ---------------- Activity tab: what the portal is doing (debugging + tracking) ----------------
 * One row per event: applications, uploads, referrals, status changes, validation failures, slow calls, server
 * errors with their stack, and errors from people's browsers. Routine successful reads (page views, page loads)
 * go to Executions only, unless Settings › ActivityVerbose is ticked (ROUTINE_EVENTS below).
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
  sh = ensureTab_(SHEET.ACTIVITY, ACTIVITY_HEAD, { widths: [160, 60, 220, 70, 170, 520, 60], dateCol: 1 });
  const rules = [['ERROR', '#F4CCCC'], ['WARN', '#FFF2CC'], ['CHANGE', '#D9EAD3']].map(([lvl, color]) =>
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="' + lvl + '"')
      .setBackground(color).setRanges([sh.getRange('A:G')]).build());
  sh.setConditionalFormatRules(rules);
  return sh;
}

/** Settings › ActivityVerbose: ticked = write routine reads to the tab too (for debugging; turn it off before a rush). */
function verboseActivity_() {
  try { return setting_('ActivityVerbose'); } catch (e) { return false; }
}

/**
 * activity_('apply_submit', 'APP-0012 submitted', { level: 'INFO', page: 'apply', ms: 840 })
 * level: 'INFO' (default) | 'WARN' | 'ERROR' | 'CHANGE' (status/track changes). details can be a string or any object (stored as JSON).
 */
/** True once 40 routine (INFO) rows have been written this minute: during a rush they're skipped to keep calls fast.
 *  WARN and ERROR rows are always written. */
function activityBusy_() {
  try {
    const c = CacheService.getScriptCache(), k = 'act:' + Math.floor(Date.now() / 60000);
    const n = Number(c.get(k) || 0) + 1;
    c.put(k, String(n), 120);
    return n > 40;
  } catch (e) { return false; }
}

// Routine reads (page views, loading a page's data). On a launch-day rush, writing a Sheet row for every one of these
// made the spreadsheet itself the bottleneck: in a load test, 30 visitors at once left several page loads waiting
// 5 minutes behind the Activity appends. So when they succeed they only go to the Apps Script execution log
// (Extensions › Apps Script › Executions), unless Settings › ActivityVerbose is ticked. Failures and slow calls
// (over SLOW_MS) still get a row. Submits, uploads, referrals and every CHANGE are always written.
const ROUTINE_EVENTS = ['page_view', 'apply_getForm', 'apply_lookupMember', 'game_getInit', 'game_saveProgress', 'game_getSounds',
  'home_getContext', 'preleads_getForm', 'steps_get', 'client_info'];
const SLOW_MS = 8000;

function activity_(event, details, opts) {
  opts = opts || {};
  const level = opts.level || 'INFO';
  if (level === 'INFO' && ROUTINE_EVENTS.indexOf(event) >= 0 && !verboseActivity_()) {
    console.log(event + ' ' + (opts.page || '') + (opts.ms !== undefined ? ' ' + opts.ms + 'ms' : '') + ' ' +
      (typeof details === 'string' ? details : JSON.stringify(details === undefined ? '' : details)).slice(0, 300));
    return;
  }
  if (level === 'INFO' && activityBusy_()) return;   // WARN, ERROR and CHANGE are always written
  try {
    let who = '';
    if (opts.anon) who = 'visitor';   // page views: we don't need to know who looked, only that the page works
    else { try { who = currentEmail_() || 'guest'; } catch (e) { who = 'unknown'; } }
    const text = typeof details === 'string' ? details : JSON.stringify(details === undefined ? '' : details);
    const sh = activitySheet_();
    sh.appendRow([new Date(), opts.level || 'INFO', who, opts.page || '', event,
      String(text).slice(0, 5000), opts.ms === undefined ? '' : opts.ms].map(safeCell_));
    if (sh.getLastRow() > ACTIVITY_MAX_ROWS) trimActivity_(sh);
    if (level === 'ERROR') noteIssue_(event, text);   // the same error 3x today = an email right away (StatusReport.gs)
  } catch (err) {
    console.error('activity_ could not write: ' + err + ' | ' + event);
  }
}

/**
 * Daily clean-up (time trigger, installed once with setup_dailyMaintenance in Setup.gs). RA 10173: don't keep
 * personal data longer than needed.
 *  - Drafts: blanks any draft not touched for DRAFT_KEEP_DAYS (the row stays so row numbers never move).
 *  - Activity: deletes routine rows older than ACTIVITY_KEEP_DAYS. CHANGE rows (the status/track record) are kept.
 */
const DRAFT_KEEP_DAYS = 30, ACTIVITY_KEEP_DAYS = 60;
function maintenance_daily(e) {
  // public only because triggers need that: from a browser (no trigger event) it refuses
  if (!(e && e.triggerUid)) ownerOnly_();
  const now = Date.now(), day = 864e5;
  try {
    const sh = ss_().getSheetByName(SHEET.DRAFTS);
    if (sh && sh.getLastRow() > 1) {
      const r = sh.getRange(2, 1, sh.getLastRow() - 1, 3), v = r.getValues();
      let n = 0;
      // the email goes too (RA 10173); the row itself stays so no row number moves, and the next save makes a new one
      // (a row whose draft was already cleared, by submitting or "Discard draft", loses its email the same night)
      v.forEach(x => {
        const t = x[1] instanceof Date ? x[1].getTime() : Date.parse(x[1]);
        if (x[0] && (!String(x[2]).trim() || (t && now - t > DRAFT_KEEP_DAYS * day))) { x[0] = ''; x[1] = ''; x[2] = ''; n++; }
      });
      if (n) r.setValues(v);
      activity_('maintenance', n + ' old drafts cleared', { page: 'admin' });
    }
  } catch (e) { activity_('maintenance', 'drafts: ' + (e && e.message), { level: 'WARN', page: 'admin' }); }
  const lock = LockService.getDocumentLock();   // same lock as trimActivity_, so the two never run together
  if (!lock.tryLock(30000)) return;
  try {
    const sh = activitySheet_(), last = sh.getLastRow();
    if (last < 2) return;
    const v = sh.getRange(2, 1, last - 1, ACTIVITY_HEAD.length).getValues();
    const cut = now - ACTIVITY_KEEP_DAYS * day;
    let k = 0;   // rows are in time order: count the old ones at the top
    while (k < v.length && v[k][0] instanceof Date && v[k][0].getTime() < cut) k++;
    if (!k) return;
    const keep = v.slice(0, k).filter(r => r[1] === 'CHANGE');
    sh.deleteRows(2, k);
    if (keep.length) { sh.insertRowsBefore(2, keep.length); sh.getRange(2, 1, keep.length, ACTIVITY_HEAD.length).setValues(keep); }
  } finally { lock.releaseLock(); }
}

/** Drops the oldest 5000 rows, but keeps the CHANGE rows among them (the record of every status/track change). */
function trimActivity_(sh) {
  // one trim at a time; if another run holds the lock, the next write past the limit trims instead
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(0)) return;
  try { if (sh.getLastRow() > ACTIVITY_MAX_ROWS) trimActivityLocked_(sh); } finally { lock.releaseLock(); }
}
function trimActivityLocked_(sh) {
  const old = sh.getRange(2, 1, 5000, ACTIVITY_HEAD.length).getValues();
  const keep = old.filter(r => r[1] === 'CHANGE');
  sh.deleteRows(2, 5000);
  if (keep.length) { sh.insertRowsBefore(2, keep.length); sh.getRange(2, 1, keep.length, ACTIVITY_HEAD.length).setValues(keep); }
}

/**
 * Runs a public server function and logs it: OK with timing, or ERROR with the message and stack
 * (then rethrows, so the page still gets the error). summarize(result) picks what to log on success.
 */
function traced_(event, page, fn, summarize) {
  const t0 = Date.now();
  page = String(page || '').slice(0, 30);   // some callers pass a page name the browser sent
  try {
    const out = fn();
    const ok = !(out && out.ok === false);
    const ms = Date.now() - t0;
    activity_(event + (ok && ms > SLOW_MS ? ' (slow)' : ''), summarize ? summarize(out) : (ok ? 'ok' : out),
      { level: ok ? (ms > SLOW_MS ? 'WARN' : 'INFO') : 'WARN', page: page, ms: ms });
    return out;
  } catch (err) {
    activity_(event, (err && err.message) + (err && err.stack ? '\n' + err.stack : ''), { level: 'ERROR', page: page, ms: Date.now() - t0 });
    throw err;
  }
}

/**
 * Rate limits that can't be raced: adds 1 to `key` (kept `ttl` seconds) and returns true if the new count is
 * within `max`, false if it's over (the caller refuses). The read + write happen under a short lock, so 50
 * calls fired at once can't all read 0. If the lock is busy we refuse rather than risk going over.
 * peek: true only checks (no +1), for "has this person failed too often?" style checks.
 * A key with an email in it belongs to one person, so the per-person user lock is enough (and never queues behind
 * submits). A shared key (rep:day:..., clog:anon) is bumped by many people at once, so it takes the script lock.
 */
function bump_(key, max, ttl, peek) {
  const cache = CacheService.getScriptCache();
  if (peek) return Number(cache.get(key) || 0) < max;
  const lock = key.indexOf('@') >= 0 ? LockService.getUserLock() : LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;
  try {
    const n = Number(cache.get(key) || 0) + 1;
    if (n > max) return false;
    cache.put(key, String(n), ttl);
    return true;
  } finally { lock.releaseLock(); }
}

/** The "too many ID / referral misses" counter. One per person for Apply AND Pre-LEADS, so each form can't add 6 more. */
function probeKey_(email) { return 'probefail:' + email; }

/** Called by every page (Styles.html) when something breaks in the visitor's browser. Public on purpose. */
function log_client(evt) {
  evt = evt || {};
  // anyone can call this: at most 20 events per person (or 60 for all signed-out visitors together) per 10 minutes
  try {
    const email = currentEmail_();
    if (!bump_('clog:' + (email || 'anon'), email ? 20 : 60, 600)) return false;
  } catch (e) { /* cache down: still log */ }
  const page = String(evt.page || '').slice(0, 30);
  const details = {
    kind: String(evt.kind || 'error').slice(0, 40),
    message: String(evt.message || '').slice(0, 500),   // browser text: kept short (it's free text anyone can send)
    where: String(evt.where || '').slice(0, 300),
    ua: String(evt.ua || '').slice(0, 200)
  };
  activity_('client_' + details.kind, details, { level: details.kind === 'info' ? 'INFO' : 'ERROR', page: page });
  return true;
}
