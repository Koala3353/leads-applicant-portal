/**
 * ReportApi.gs  (integrator owns this file; split out of Utils.gs)
 * "Report an issue": the case-file email to the core team. Public entry: report_issue (Styles.html calls it).
 */

/* ---------------- "Report an issue" (Styles.html opens the form on every page) ----------------
 * Emails a detailed, Eyes on LEADS-themed case file to Settings > IssueEmail (or BRAND.report.to).
 * Adds what the reporter can't see: their signed-in account, applicant ID/status/tracks, their last
 * Activity rows and the time on the server. Rate-limited to 3 reports per 10 minutes per person.
 * Needs the "send email as you" permission: the owner runs report_authorize once from the editor.
 */
function report_issue(r) {
  return traced_('report_issue', String((r && r.page) || '').slice(0, 30),() => report_issue_(r || {}), x => x.ok ? 'sent ' + x.id : 'not sent: ' + x.reason);
}
function report_issue_(r) {
  const R = BRAND.report || {};
  const to = String(getSetting_('IssueEmail') || R.to || '').trim();
  const email = currentEmail_();
  const contact = String(r.contact || '').trim().slice(0, 120) || email;
  // Signed-out reporters share one bucket: keying on the page-supplied contact let anyone dodge the limit
  // by changing it each call. 10 leaves room for real sign-in trouble without flooding the inbox.
  if (!String(r.what || '').trim()) return { ok: false, reason: 'empty' };
  // Limits are reserved BEFORE the (slow) email, under a lock, so firing many at once can't slip past them.
  // Signed-out reporters get their own small daily pool, so they can't use up the signed-in budget (and vice versa).
  const day = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd');
  if (!bump_(email ? 'rep:' + email : 'rep:anon', email ? 3 : 10, 600)) return { ok: false, reason: 'rate' };
  if (!bump_((email ? 'rep:day:' : 'rep:dayanon:') + day, email ? 150 : 30, 90000)) return { ok: false, reason: 'rate' };
  if (!email) r.shot = null;   // no attachments from people we can't identify

  const id = 'R-' + Utilities.formatDate(new Date(), 'Asia/Manila', 'MMdd-HHmm') + '-' + Math.floor(Math.random() * 900 + 100);
  const clip = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 2000);
  const found = email ? getApplicantByEmail_(email) : null;
  const a = found ? found.data : null;

  // this person's recent activity (newest last), so we can see what they did right before reporting
  let recent = [];
  try {
    const sh = ss_().getSheetByName(SHEET.ACTIVITY);
    // only the signed-in account's own activity: a typed-in contact address could be anyone's
    if (sh && sh.getLastRow() > 1 && email) {
      const n = Math.min(400, sh.getLastRow() - 1);
      const rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, 7).getValues();
      const who = email.toLowerCase();
      recent = rows.filter(x => String(x[2]).toLowerCase() === who).slice(-10).map(x => [
        Utilities.formatDate(new Date(x[0]), 'Asia/Manila', 'MMM d, HH:mm:ss'), x[1], x[3], x[4], clip(x[5], 300), x[6]]);
    }
  } catch (e) { /* no activity: fine */ }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = s => esc(s).replace(/\n/g, '<br>');
  const sev = clip(r.blocking, 80);
  const sevColor = /can't continue/i.test(sev) ? '#FF2A2A' : (/small/i.test(sev) ? '#8C8C8C' : '#FFFF00');
  const row = (k, v) => '<tr><td style="padding:6px 12px 6px 0;color:#8C8C8C;font:12px/1.5 Menlo,Consolas,monospace;text-transform:uppercase;letter-spacing:.08em;vertical-align:top;white-space:nowrap">' + esc(k) +
    '</td><td style="padding:6px 0;color:#EAEAEA;font:14px/1.5 Arial,sans-serif;vertical-align:top">' + (v === '' || v === null || v === undefined ? '<span style="color:#555">—</span>' : v) + '</td></tr>';
  const section = (title, inner) => '<tr><td style="padding:22px 28px 0"><div style="font:700 11px/1 Menlo,Consolas,monospace;letter-spacing:.18em;color:#FFFF00;text-transform:uppercase;border-bottom:1px solid #2E2E2E;padding-bottom:8px;margin-bottom:8px">' + esc(title) + '</div>' + inner + '</td></tr>';
  const table = rows => '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">' + rows.join('') + '</table>';
  const block = text => '<div style="background:#141414;border-left:3px solid #FFFF00;padding:12px 14px;color:#EAEAEA;font:14px/1.6 Arial,sans-serif">' + (text ? nl(text) : '<span style="color:#555">Not given</span>') + '</div>';
  const c = r.client || {};
  const errs = (c.errors || []).slice(-5).map(e => '<div style="font:12px/1.5 Menlo,Consolas,monospace;color:#FF8A8A;margin:4px 0">' + esc(clip(e, 400)) + '</div>').join('') || '<span style="color:#555;font:13px Arial">None caught on this page</span>';
  const act = recent.length ? '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font:12px/1.45 Menlo,Consolas,monospace">' +
    recent.map(x => '<tr><td style="padding:3px 8px 3px 0;color:#8C8C8C;white-space:nowrap">' + esc(x[0]) + '</td><td style="padding:3px 8px 3px 0;color:' + (x[1] === 'ERROR' ? '#FF2A2A' : x[1] === 'WARN' ? '#FFFF00' : '#EAEAEA') + '">' + esc(x[1]) + '</td><td style="padding:3px 8px 3px 0;color:#7A86FF">' + esc(x[2]) + '</td><td style="padding:3px 8px 3px 0;color:#EAEAEA">' + esc(x[3]) + '</td><td style="padding:3px 0;color:#8C8C8C">' + esc(x[4]) + (x[5] !== '' ? ' (' + esc(x[5]) + 'ms)' : '') + '</td></tr>').join('') + '</table>'
    : '<span style="color:#555;font:13px Arial">No recent activity under this account</span>';

  const html =
    '<div style="background:#0A0A0A;padding:24px 0;margin:0">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:0 auto;background:#0A0A0A;border:2px solid #FFFF00;border-collapse:collapse">' +
    '<tr><td style="height:12px;background:repeating-linear-gradient(-45deg,#FFFF00 0 14px,#0A0A0A 14px 28px);background-color:#FFFF00"></td></tr>' +
    '<tr><td style="padding:22px 28px 0">' +
      '<div style="font:700 11px/1 Menlo,Consolas,monospace;letter-spacing:.2em;color:#FF2A2A">&#9679; REC // INCIDENT REPORT</div>' +
      '<div style="font:800 28px/1.05 \'JetBrains Mono\',Menlo,Consolas,monospace;color:#EAEAEA;text-transform:uppercase;margin:10px 0 4px">Eyes on <span style="color:#FFFF00">LEADS</span></div>' +
      '<div style="font:13px/1.5 Menlo,Consolas,monospace;color:#8C8C8C">Case ' + esc(id) + ' &middot; filed ' + esc(Utilities.formatDate(new Date(), 'Asia/Manila', "EEE, MMM d yyyy 'at' h:mm a")) + ' (Manila)</div>' +
      '<div style="display:inline-block;margin-top:14px;padding:5px 10px;border:1.5px solid ' + sevColor + ';color:' + sevColor + ';font:700 12px/1 Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase">' + esc(sev || 'Severity not given') + '</div>' +
    '</td></tr>' +
    section('01 // The problem', table([row('Category', esc(clip(r.category, 120))), row('When', esc(clip(r.when, 80)))]) + block(clip(r.what, 4000))) +
    section('02 // What they were doing', block(clip(r.doing, 1500))) +
    section('03 // Steps to reproduce', block(clip(r.steps, 2000))) +
    section('04 // Subject', table([
      row('Reply to', contact ? '<a style="color:#7A86FF" href="mailto:' + esc(contact) + '">' + esc(contact) + '</a>' +
        (contact.toLowerCase() !== email ? ' <span style="color:#FFFF00">(typed by the reporter, not verified)</span>' : '') : ''),
      row('Signed in as', email ? esc(email) : '<span style="color:#FF2A2A">Not signed in / account hidden</span>'),
      row('Applicant ID', a ? esc(a.ApplicantID) : 'No application on file'),
      row('Name', a ? esc(a.FullName || '') : ''),
      row('Status', a ? esc(a.Status + ' / Req ' + (a.Requirements || 'NONE') + ' / Pay ' + (a.Payment || 'NONE')) : ''),
      row('Ateneo account', email ? (isAllowedDomain_(email) ? 'Yes' : '<span style="color:#FF2A2A">No (wrong domain)</span>') : '')])) +
    section('05 // Where it happened', table([
      row('Page', esc(clip(c.page || r.page, 40))),
      row('URL', esc(clip(c.url, 300))),
      row('Page title', esc(clip(c.title, 120))),
      row('Local time', esc(clip(c.localTime, 80))),
      row('Browser', esc(clip(c.ua, 300))),
      row('Screen', esc(clip(c.screen, 60))),
      row('Language', esc(clip(c.lang, 30))),
      row('Online', c.online === false ? '<span style="color:#FF2A2A">Offline</span>' : 'Yes'),
      row('In-app browser', c.inApp ? '<span style="color:#FFFF00">' + esc(c.inApp) + '</span>' : 'No'),
      row('CRT effects', c.calm ? 'Off' : 'On')])) +
    section('06 // Errors caught on the page', errs) +
    section('07 // Their last activity (Activity tab)', act) +
    '<tr><td style="padding:24px 28px 26px;font:12px/1.6 Menlo,Consolas,monospace;color:#555">Reply to this email to reach the reporter. ' +
      (r.shot ? 'Screenshot attached. ' : '') + 'Full log: the Sheet\'s Activity tab, filter Who = ' + esc(email || contact || 'their email') + '.</td></tr>' +
    '<tr><td style="height:6px;background:#FFFF00"></td></tr>' +
    '</table></div>';

  const plain = ['Eyes on LEADS // Incident report ' + id, '',
    'Category: ' + clip(r.category, 120), 'Severity: ' + sev, 'When: ' + clip(r.when, 80), '',
    'What happened:', clip(r.what, 4000), '', 'What they were doing:', clip(r.doing, 1500), '', 'Steps:', clip(r.steps, 2000), '',
    'Reply to: ' + contact, 'Signed in as: ' + (email || '(not signed in)'), 'Applicant: ' + (a ? a.ApplicantID + ' ' + a.Status : 'none'),
    'Page: ' + clip(c.page || r.page, 40) + '  URL: ' + clip(c.url, 300), 'Browser: ' + clip(c.ua, 300), 'Screen: ' + clip(c.screen, 60),
    'Errors: ' + (c.errors || []).slice(-5).join(' | ')].join('\n');

  const opts = { to: to, subject: '[Eyes on LEADS] Case ' + id + ' // ' + clip(r.category, 60) + (sev ? ' // ' + sev : ''), htmlBody: html, body: plain, name: 'Eyes on LEADS portal' };
  if (contact && /@/.test(contact)) opts.replyTo = contact;
  if (r.shot && r.shot.data && String(r.shot.data).length < 4.2e6) {
    try {
      const type = /^image\/(png|jpe?g|gif|webp)$/.test(r.shot.type) ? r.shot.type : 'image/png';
      opts.attachments = [Utilities.newBlob(Utilities.base64Decode(r.shot.data), type, clip(r.shot.name, 80) || 'screenshot.png')];
    } catch (e) { /* bad image: send without it */ }
  }
  MailApp.sendEmail(opts);
  noteIssue_('user_report', id + ' ' + clip(r.category, 60) + ': ' + clip(r.what, 300));   // 3 reports in a day = an alert (StatusReport.gs)
  return { ok: true, id: id, email: contact };
}

/** Run once from the editor (as the owner) so Google asks for the "send email" permission. Sends a test to the report inbox. */
function report_authorize() {
  ownerOnly_();
  const to = String(getSetting_('IssueEmail') || (BRAND.report || {}).to || '');
  MailApp.sendEmail(to, '[Eyes on LEADS] Issue reports are switched on', 'Reports from the portal will arrive at this address.');
  return 'Test email sent to ' + to;
}
