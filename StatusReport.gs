/**
 * StatusReport.gs  (integrator owns this file) — the portal reports on itself by email.
 *
 *  1. Daily status report (status_dailyReport, a time trigger at 8 AM Manila; install with setup_statusReport):
 *     new applications, Pre-LEADS registrations, decisions so far, flagged applications (IntegrityFlags), errors,
 *     slow calls, issues people reported, and errors in people's browsers, for the last 24 hours.
 *     Once Settings › ResultsReleased is ticked (Nov 14 2026) it reports the next stages instead of applications:
 *     payment (proofs in the last 24 h, who still has to pay, the deadline), PNF + D&U, the payment emails, the
 *     results film, the waitlist; errors and issue reports stay.
 *  2. Alert as soon as the same problem happens 3 times in one day (noteIssue_, called from activity_ for every
 *     ERROR, even when the Activity tab can't be written, and from report_issue for every user report): one email
 *     per problem per day, at most ALERT_CAP a day, so a crash loop or fake browser errors can't flood the inbox.
 * Recipients: Settings › StatusReportEmail, comma-separated (default brigadokeene@gmail.com, lawrence.ng@student.ateneo.edu). Send a report right now from the editor
 * with status_sendNow. The email lists IDs and counts only: no essays, ID numbers or phone numbers.
 */

const ISSUE_ALERT_AT = 3;   // the same problem this many times in a day = an email right away

// one or more addresses (comma-separated); bad ones are skipped. MailApp takes the comma list as-is.
function statusTo_() {
  return String(setting_('StatusReportEmail') || '').split(/[,;\s]+/)
    .filter(a => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a)).join(',');
}
const manilaDay_ = d => Utilities.formatDate(d || new Date(), 'Asia/Manila', 'yyyyMMdd');

/**
 * Counts one occurrence of a problem today; on the 3rd, emails an alert (once per problem per day, and at most
 * ALERT_CAP alerts a day so nobody can burn the email quota by sending fake browser errors).
 * `kind` groups it (an event name, or 'user_report'); `detail` is what happened. Digits are folded so
 * "row 12" and "row 40" count as the same problem. Counters live in CacheService (6 hours, no lock: this runs on
 * every ERROR and must never make a submit wait). Never throws: logging must never break the portal.
 */
const ALERT_CAP = 8;
function noteIssue_(kind, detail) {
  try {
    const first = String(detail || '').split('\n')[0].replace(/\d+/g, '#').slice(0, 120);
    const sig = kind === 'user_report' ? 'user_report' : kind + ' | ' + first;
    const hash = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig)).slice(0, 12);
    const day = manilaDay_(), cache = CacheService.getScriptCache(), key = 'iss:' + day + ':' + hash;
    const n = Number(cache.get(key) || 0) + 1;
    cache.put(key, String(n), 21600);
    if (n !== ISSUE_ALERT_AT) return;
    const sentKey = 'iss:sent:' + day, sent = Number(cache.get(sentKey) || 0);
    if (sent >= ALERT_CAP) return;
    cache.put(sentKey, String(sent + 1), 21600);
    const to = statusTo_();
    if (!to) return;
    const what = kind === 'user_report' ? ISSUE_ALERT_AT + ' issue reports from people today' : 'The same error happened ' + ISSUE_ALERT_AT + ' times today';
    const body = [what + '.', '', 'Problem: ' + sig, 'Latest: ' + String(detail || '').slice(0, 1500), '',
      'Open the Activity tab and filter Level = ERROR (or Event = report_issue) to see each one: ' + sheetUrl_(),
      '', 'You get this once per problem per day (at most ' + ALERT_CAP + ' alerts a day). The daily report has everything else.'].join('\n');
    MailApp.sendEmail({ to: to, subject: '[Eyes on LEADS] ALERT: ' + (kind === 'user_report' ? 'issue reports piling up' : 'repeated error in ' + kind), body: body, name: 'Eyes on LEADS portal' });
  } catch (e) { console.error('noteIssue_: ' + (e && e.message)); }
}

/** The trigger's job (8 AM Manila). From a browser it refuses; the owner can run status_sendNow instead. */
function status_dailyReport(e) {
  // public only because triggers need that; a made-up {triggerUid} from a browser must not pass, so check it's ours
  const ours = e && e.triggerUid && ScriptApp.getProjectTriggers().some(t => t.getUniqueId() === String(e.triggerUid));
  if (!ours) ownerOnly_();
  return statusSend_();
}
/** Run from the editor to get the report now (checks the email works too). */
function status_sendNow() {
  ownerOnly_();
  return statusSend_();
}

function statusSend_() {
  const to = statusTo_();
  if (!to) return 'No StatusReportEmail in Settings.';
  const r = statusData_(new Date(Date.now() - 864e5), new Date());
  const html = statusHtml_(r), text = statusText_(r);
  const quiet = !r.errors.total && !r.reports.length && !r.flagged.length;
  const ph = r.phase, pl = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const lead = ph.released
    ? pl(ph.proofsNew, 'new proof') + ', ' + ph.paid + ' of ' + ph.accepted + ' paid' + (ph.reqsDone ? ', ' + ph.reqsDone + ' PNF/D&U done' : '')
    : pl(r.apps.newCount, 'new application') + (r.flagged.length ? ', ' + r.flagged.length + ' flagged' : '');
  MailApp.sendEmail({ to: to, subject: '[Eyes on LEADS] Daily report ' + Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d') + ': ' +
    lead + (r.errors.total ? ', ' + pl(r.errors.total, 'error') : '') + (quiet ? ', all quiet' : ''),
    htmlBody: html, body: text, name: 'Eyes on LEADS portal' });
  statusCleanProps_();
  activity_('status_report', 'sent to ' + to, { page: 'admin' });
  return 'Daily report sent to ' + to + '.';
}

/** Everything the report says, for the window [from, to). */
function statusData_(from, to) {
  const inWin = d => d instanceof Date && d >= from && d < to;
  const asDate = v => v instanceof Date ? v : (v ? new Date(v) : null);
  const out = { from: from, to: to, apps: { total: 0, newCount: 0, newIds: [], byStatus: {} }, flagged: [], flaggedTotal: 0, preleads: { newCount: 0, total: 0 },
    errors: { total: 0, groups: [] }, client: { total: 0, groups: [] }, slow: 0, reports: [], alertsToday: 0 };
  // the results phase (after Settings › ResultsReleased): payment, PNF + D&U, emails, the film, the waitlist
  const ph = out.phase = { released: !!setting_('ResultsReleased'), accepted: 0, confirmed: 0, waitlisted: 0, rejected: 0,
    pay: { NONE: 0, SUBMITTED: 0, VERIFIED: 0, REJECTED: 0 }, reqs: { NONE: 0, PARTIAL: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0 },
    paid: 0, reqsDone: 0, revealSeen: 0, proofsNew: 0, verifiedMailsNew: 0, mailFails: 0, filmPlays: 0, stuck: [] };
  const due = k => { const d = setting_(k); return d instanceof Date ? d : null; };
  ph.payDue = due('PaymentDeadline'); ph.reqsDue = due('RequirementsDeadline'); ph.waitReply = due('WaitlistReplyBy');

  // Applicants: new rows, decisions so far, flags
  const ap = ss_().getSheetByName(SHEET.APPLICANTS);
  if (ap && ap.getLastRow() > 1) {
    const rows = ap.getRange(2, 1, ap.getLastRow() - 1, cols_().length).getValues();
    rows.forEach(v => {
      const d = toObject_(v);
      if (!String(d.ApplicantID || '').trim()) return;
      out.apps.total++;
      const st = String(d.Status || 'SUBMITTED'); out.apps.byStatus[st] = (out.apps.byStatus[st] || 0) + 1;
      if (st === 'WAITLISTED') ph.waitlisted++;
      if (st === 'REJECTED') ph.rejected++;
      if (st === 'ACCEPTED' || st === 'CONFIRMED') {
        ph.accepted++; if (st === 'CONFIRMED') ph.confirmed++;
        const pay = String(d.Payment || 'NONE'), req = String(d.Requirements || 'NONE');
        if (pay in ph.pay) ph.pay[pay]++;
        if (req in ph.reqs) ph.reqs[req]++;
        if (pay === 'VERIFIED') ph.paid++;
        if (req === 'SUBMITTED' || req === 'APPROVED') ph.reqsDone++;
        if (String(d.RevealSeen || '').trim()) ph.revealSeen++;
        if (/^NOT SENT/.test(String(d.PaymentVerifiedMail || ''))) ph.stuck.push(d.ApplicantID);   // the verified email failed; clear the cell to retry
      }
      const isNew = inWin(asDate(d.Timestamp));
      if (isNew) { out.apps.newCount++; out.apps.newIds.push(d.ApplicantID); }
      if (String(d.IntegrityFlags || '').trim()) {
        out.flaggedTotal++;
        if (isNew) out.flagged.push({ id: d.ApplicantID, flags: String(d.IntegrityFlags).replace(/^FLAG: /, '') });
      }
    });
  }
  // Pre-LEADS registrations
  const pl = ss_().getSheetByName(SHEET.PRELEADS);
  if (pl && pl.getLastRow() > 1) {
    const ts = pl.getRange(2, 1, pl.getLastRow() - 1, 1).getValues();
    ts.forEach(r => { if (r[0]) { out.preleads.total++; if (inWin(asDate(r[0]))) out.preleads.newCount++; } });
  }
  // Activity: errors, browser errors, slow calls, user reports
  const act = ss_().getSheetByName(SHEET.ACTIVITY);
  if (act && act.getLastRow() > 1) {
    const n = Math.min(act.getLastRow() - 1, 6000);   // the newest rows are at the bottom
    const rows = act.getRange(act.getLastRow() - n + 1, 1, n, ACTIVITY_HEAD.length).getValues();
    const err = {}, cli = {};
    rows.forEach(([when, level, who, page, event, details]) => {
      if (!inWin(asDate(when))) return;
      const first = String(details || '').split('\n')[0].slice(0, 140);
      if (level === 'ERROR') {
        const bucket = /^client_/.test(event) ? cli : err, k = event + ' | ' + first.replace(/\d+/g, '#');
        (bucket === cli ? out.client : out.errors).total++;
        bucket[k] = bucket[k] || { event: event, sample: first, page: page, count: 0, people: {} };
        bucket[k].count++; if (who) bucket[k].people[who] = 1;
      } else if (level === 'WARN' && / \(slow\)$/.test(event)) out.slow++;
      if (/^report_issue( \(slow\))?$/.test(event) && /^sent /.test(String(details))) out.reports.push({ when: when, who: who, page: page, id: String(details).slice(5) });
      if (/^payment_mail/.test(event)) {   // PaymentMail.gs: one row per email (and a WARN when one could not go out)
        if (/^received email sent/.test(String(details))) ph.proofsNew++;   // one per proof upload
        else if (/^verified email sent/.test(String(details))) ph.verifiedMailsNew++;
        else if (level === 'WARN') ph.mailFails++;
      }
      if (/^reveal_(finished|skipped|replayed)/.test(event)) ph.filmPlays++;
    });
    const top = o => Object.keys(o).map(k => Object.assign(o[k], { people: Object.keys(o[k].people).length })).sort((a, b) => b.count - a.count).slice(0, 12);
    out.errors.groups = top(err); out.client.groups = top(cli);
  }
  try { out.alertsToday = Number(CacheService.getScriptCache().get('iss:sent:' + manilaDay_()) || 0); } catch (e) { /* fine */ }
  return out;
}

function statusHtml_(r) {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const mono = 'font-family:Menlo,Consolas,monospace';
  const h = t => '<h3 style="' + mono + ';font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#0010E0;margin:22px 0 6px">' + t + '</h3>';
  const big = (n, label, warn) => '<td style="padding:10px 14px;border:1px solid #ddd;text-align:center"><div style="font:700 26px Arial;color:' + (warn && n ? '#c00000' : '#111') + '">' + n +
    '</div><div style="' + mono + ';font-size:11px;color:#666;text-transform:uppercase">' + label + '</div></td>';
  const list = (items, empty) => items.length ? '<ul style="margin:0;padding-left:18px">' + items.join('') + '</ul>' : '<p style="margin:0;color:#666">' + empty + '</p>';
  const when = Utilities.formatDate(r.from, 'Asia/Manila', 'MMM d, h:mm a') + ' to ' + Utilities.formatDate(r.to, 'Asia/Manila', 'MMM d, h:mm a');
  return '<div style="max-width:640px;font:14px/1.5 Arial,sans-serif;color:#111">' +
    '<div style="background:#0A0A0A;color:#EAEAEA;padding:16px 18px;border-bottom:5px solid #FFFF00">' +
    '<div style="' + mono + ';font-size:11px;letter-spacing:.2em;color:#FF2A2A">&#9679; REC // DAILY REPORT</div>' +
    '<div style="' + mono + ';font-size:24px;font-weight:800;margin-top:6px">EYES ON <span style="color:#FFFF00">LEADS</span></div>' +
    '<div style="' + mono + ';font-size:12px;color:#8C8C8C">' + esc(when) + ' (Manila)</div></div>' +
    (r.phase.released ? statusPhaseHtml_(r, esc, h, big) :
    '<table style="border-collapse:collapse;margin-top:14px"><tr>' + big(r.apps.newCount, 'new applications') + big(r.preleads.newCount, 'pre-leads sign-ups') +
    big(r.flagged.length, 'flagged', true) + big(r.errors.total, 'errors', true) + big(r.reports.length, 'issue reports', true) + '</tr></table>' +
    h('Applications') + '<p style="margin:0">' + r.apps.total + ' on file. ' + Object.keys(r.apps.byStatus).map(k => esc(k) + ' ' + r.apps.byStatus[k]).join(' · ') +
    (r.apps.newIds.length ? '<br>New: ' + esc(r.apps.newIds.slice(0, 40).join(', ')) + (r.apps.newIds.length > 40 ? ' …' : '') : '') + '</p>' +
    h('Flagged applications (new)') + list(r.flagged.map(f => '<li><b>' + esc(f.id) + '</b>: ' + esc(f.flags) + '</li>'), 'None flagged.') +
    (r.flaggedTotal ? '<p style="margin:6px 0 0;color:#666;font-size:12px">' + r.flaggedTotal + ' flagged in total. Applicants › IntegrityFlags; a flag means read it closely, not proof.</p>' : '')) +
    h('Errors on the server') + list(r.errors.groups.map(g => '<li><b>' + g.count + '×</b> ' + esc(g.event) + ' <span style="color:#666">(' + g.people + ' people)</span><br><span style="' + mono + ';font-size:12px;color:#555">' + esc(g.sample) + '</span></li>'), 'No errors.') +
    h('Errors in people\'s browsers') + list(r.client.groups.map(g => '<li><b>' + g.count + '×</b> ' + esc(g.page) + ' <span style="color:#666">(' + g.people + ' people)</span><br><span style="' + mono + ';font-size:12px;color:#555">' + esc(g.sample) + '</span></li>'), 'None.') +
    h('Issues people reported') + list(r.reports.map(x => '<li>' + esc(x.id) + ' from ' + esc(x.who) + ' on ' + esc(x.page) + ' <span style="color:#666">(the full report is in the issue inbox)</span></li>'), 'None reported.') +
    h('Speed') + '<p style="margin:0">' + (r.slow ? r.slow + ' call(s) took over 8 seconds.' : 'No slow calls.') + (r.alertsToday ? ' ' + r.alertsToday + ' repeat-problem alert(s) went out today.' : '') + '</p>' +
    '<p style="margin:22px 0 0;font-size:12px;color:#666">Details: the Activity tab (filter Level = ERROR or WARN). <a href="' + esc(sheetUrl_()) + '">Open the Sheet</a>. ' +
    'Sent by the portal every morning (StatusReport.gs). Change the address in Settings › StatusReportEmail.</p></div>';
}

/** "Fri, Nov 20, 11:59 PM (6 days left)" / "passed" / "not set". */
function statusDue_(d) {
  if (!d) return 'not set';
  const days = Math.ceil((d.getTime() - Date.now()) / 864e5);
  return Utilities.formatDate(d, 'Asia/Manila', 'EEE, MMM d, h:mm a') + (days < 0 ? ' (passed)' : days === 0 ? ' (today)' : ' (' + days + ' day' + (days === 1 ? '' : 's') + ' left)');
}

/** The report's top half once results are out: payment, PNF + D&U, the emails, the film, the waitlist. */
function statusPhaseHtml_(r, esc, h, big) {
  const ph = r.phase, left = ph.accepted - ph.paid - ph.pay.SUBMITTED;
  const row = items => '<p style="margin:0">' + items.filter(Boolean).join(' &middot; ') + '</p>';
  const note = t => '<p style="margin:4px 0 0;color:#666;font-size:12px">' + t + '</p>';
  return '<table style="border-collapse:collapse;margin-top:14px"><tr>' + big(ph.proofsNew, 'proofs in (24h)') + big(ph.paid + '/' + ph.accepted, 'paid (verified)') +
    big(ph.reqsDone + '/' + ph.accepted, 'PNF + D&amp;U in') + big(r.errors.total, 'errors', true) + big(r.reports.length, 'issue reports', true) + '</tr></table>' +
    h('Results') + row([ph.accepted + ' accepted' + (ph.confirmed ? ' (' + ph.confirmed + ' confirmed)' : ''), ph.waitlisted + ' waitlisted', ph.rejected + ' not selected']) +
    h('Payment') + row(['Deadline ' + esc(statusDue_(ph.payDue))]) +
    row([ph.pay.VERIFIED + ' verified', ph.pay.SUBMITTED + ' proof in, to verify', ph.pay.REJECTED ? '<b style="color:#c00000">' + ph.pay.REJECTED + ' proof rejected</b>' : '', left + ' not sent yet']) +
    note('Verify in the tracker ([05] Payment Tracker); the portal follows it within 5 minutes.') +
    h('PNF + D&amp;U') + row(['Deadline ' + esc(statusDue_(ph.reqsDue))]) +
    row([ph.reqs.APPROVED + ' approved', ph.reqs.SUBMITTED + ' dropped off', ph.reqs.PARTIAL + ' one of two', ph.reqs.RETURNED ? '<b style="color:#c00000">' + ph.reqs.RETURNED + ' returned</b>' : '', ph.reqs.NONE + ' nothing yet']) +
    note('They open once a proof of payment is in. Tick them in the tracker ([04] PNF &amp; DNU Tracker).') +
    h('Payment emails (24h)') + row([ph.proofsNew + ' proof-received', ph.verifiedMailsNew + ' payment-verified', ph.mailFails ? '<b style="color:#c00000">' + ph.mailFails + ' failed</b>' : '0 failed']) +
    (ph.stuck.length ? note('Payment-verified email NOT SENT for ' + esc(ph.stuck.slice(0, 20).join(', ')) + ': clear Applicants › PaymentVerifiedMail to retry.') : '') +
    h('Results film') + row([ph.revealSeen + ' of ' + ph.accepted + ' accepted have watched it', ph.filmPlays + ' plays in 24h']) +
    h('Waitlist') + row([ph.waitlisted + ' waitlisted', 'Reply by ' + esc(statusDue_(ph.waitReply))]) +
    note('Replies go to the inbox in the results email, not the portal.');
}

function statusText_(r) {
  const ph = r.phase;
  const head = ph.released ? [
    'Proofs in (24h): ' + ph.proofsNew,
    'Paid (verified): ' + ph.paid + ' of ' + ph.accepted + ' · proof in, to verify: ' + ph.pay.SUBMITTED + ' · rejected: ' + ph.pay.REJECTED + ' · payment deadline ' + statusDue_(ph.payDue),
    'PNF + D&U in: ' + ph.reqsDone + ' of ' + ph.accepted + ' (approved ' + ph.reqs.APPROVED + ') · deadline ' + statusDue_(ph.reqsDue),
    'Payment emails (24h): ' + ph.proofsNew + ' received, ' + ph.verifiedMailsNew + ' verified, ' + ph.mailFails + ' failed',
    'Results film watched: ' + ph.revealSeen + ' of ' + ph.accepted,
    'Waitlisted: ' + ph.waitlisted + ' · reply by ' + statusDue_(ph.waitReply)
  ] : [
    'New applications: ' + r.apps.newCount + ' (' + r.apps.total + ' on file)',
    'Pre-LEADS sign-ups: ' + r.preleads.newCount + ' (' + r.preleads.total + ' total)',
    'Flagged (new): ' + (r.flagged.map(f => f.id + ' ' + f.flags).join('; ') || 'none')
  ];
  return ['Eyes on LEADS daily report', ''].concat(head, [
    'Server errors: ' + r.errors.total + (r.errors.groups.length ? ' — ' + r.errors.groups.map(g => g.count + 'x ' + g.event).join(', ') : ''),
    'Browser errors: ' + r.client.total,
    'Issue reports: ' + r.reports.length,
    'Slow calls: ' + r.slow, '', 'Open the Sheet: ' + sheetUrl_()]).join('\n');
}

/** Drops alert counters an older version kept in Script Properties (they now live in CacheService). */
function statusCleanProps_() {
  try {
    const props = PropertiesService.getScriptProperties();
    props.getKeys().forEach(k => { if (k.indexOf('iss:') === 0) props.deleteProperty(k); });
  } catch (e) { /* fine */ }
}

/** Installs the 8 AM daily report (run once from the editor as the owner; safe to run again). */
function setup_statusReport() {
  ownerOnly_();
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'status_dailyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('status_dailyReport').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Manila').create();
  return 'Daily status report installed (8 AM Manila) to ' + (statusTo_() || '(set Settings › StatusReportEmail)') + '.';
}
