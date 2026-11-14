/**
 * PaymentMail.gs  (integrator owns this file)
 * The two payment emails, built like the core team's results blasts (HTML in PaymentMailHtml.gs since Nov 14 2026):
 *   received  right after a proof upload (steps_uploadProof_, StepsApi.gs): we have it, and their requirements are
 *             open now (the PNF and the D&U, the drop-off). No "wait for verification" (core team, Nov 14 2026: if a
 *             payment has a problem they text the person). Sent on every upload (a re-upload gets a fresh one).
 *   verified  once Payment is VERIFIED: the tracker's [05] "Payment Verified" (copied in by tracker_sync_), or the LEADS
 *             menu when the tracker is off. FILE 03: the PNF and the D&U, the drop-off, confirming on the portal.
 *             Sent once: Applicants › PaymentVerifiedMail is stamped BEFORE sending, so a crash can't send it twice.
 *             "NOT SENT ..." in that cell = it failed (Activity has a WARN); clear the cell to try again.
 *             Only to ACCEPTED / CONFIRMED people and only after Settings › ResultsReleased: an early "Payment
 *             Verified" in the tracker must never tell someone they got in before results are out.
 * Picked up by the 5-minute tracker trigger (tracker_syncTrigger) and LEADS › Sync from the tracker now.
 * Sending never breaks anything: a failed email is a WARN in Activity; the upload / sync goes on.
 * Run payMail_test() from the editor to send both to yourself with your own file's data (or sample data).
 */

const PAYMAIL_DOOR_ = 'https://koala3353.github.io/leads-applicant-portal/go/';   // the door page: gets people out of Gmail's in-app browser
const PAYMAIL_PER_RUN_ = 40;
// Nov 14 2026: ONE payment email only, the proof-received one (sent on upload; it already moves them on to the PNF and
// D&U). The "payment verified / confirmed" email is OFF: if a payment is wrong, the core team messages the person.
// true = send it again (payMail_sendPending_, PaymentVerifiedMail.html); nothing else needs changing.
const PAYMAIL_SEND_VERIFIED_ = false;
// payMail_test / payMail_testDarkAB also send straight to these (a forwarded copy loses its <style> block, so it can't
// show how Gmail dark mode really renders the email)
const PAYMAIL_TEST_ALSO_ = ['kristen.mikayla.chua@student.ateneo.edu', 'lawrence.ng@student.ateneo.edu'];
function payMail_testTo_(me) { return [me].concat(PAYMAIL_TEST_ALSO_.filter(x => x && x.toLowerCase() !== me)); }
// the "payment verified" email's drop-off date when Settings › RequirementsDeadline is blank (the core team's template)
const PAYMAIL_DUE_DEFAULT_ = { short: 'November 27, 5PM', long: 'November 27, 2026 &middot; 5:00 PM' };   // verified emails per run (MailApp is ~1 s each); the rest go out on the next run, 5 minutes later

/** Everything the email (payMail_html_ in PaymentMailHtml.gs) shows. a = an Applicants row (data object). */
function payMail_vars_(a, kind) {
  const s = getSettings_(), fee = fee_(a);
  const php = n => '₱' + Number(n).toLocaleString('en-PH');
  const id = String(a.ApplicantID || '');
  const nick = String(a.Nickname || '').trim() || String(a.FullName || '').split(',').pop().trim() || 'there';
  const when = Utilities.formatDate(new Date(), 'Asia/Manila', 'MMM d, yyyy, h:mm a');
  const fa = BRAND.finAid;
  const finAidNote = fee.off > 0 && fa && kind === 'received'
    ? fa.line.replace('{now}', Number(fee.now).toLocaleString('en-PH')).replace('{was}', Number(fee.now + fee.off).toLocaleString('en-PH'))
      .replace('{off}', Number(fee.off).toLocaleString('en-PH')) + ' ' + fa.verify
    : '';
  const dates = String(s.EventDates || '').trim() || 'January 29 to 31, 2027';
  const venue = String(s.EventVenue || '').trim() || 'Kasile Hills Nature Resort';
  const v = {
    id: id, nick: nick, nickUpper: nick.toUpperCase(), dates: dates, venue: venue,
    contacts: contactsInline_(portalContacts_()),
    finAidNote: finAidNote,
    dateBox: ['Event dates', dates, venue]
  };
  // the requirements (both emails): the forms (Settings › PNFLink / DULink; blank = no link, and reminder 1 says
  // they'll be released instead) and the drop-off deadline (Settings › RequirementsDeadline; blank = no date)
  const link = k => { const u = String(setting_(k) || '').trim(); return /^https:\/\//.test(u) ? u : ''; };
  const docs = [{ n: '01', name: 'Parental Notification Form', abbr: 'PNF', url: link('PNFLink') },
    { n: '02', name: 'Declaration and Undertaking', abbr: 'D&U', url: link('DULink') }];
  const both = docs.every(d => d.url);
  const due = parseDate_(s.RequirementsDeadline);
  const hl = t => pm_hl_(t);   // a yellow marker on the paper (PaymentMailHtml.gs)
  const reminders = [
    both ? 'The ' + hl('PNF') + ' and ' + hl('D&amp;U') + ' PDFs can be downloaded from the links above, or from the applicant portal under ' + hl('FILE 03: REQUIREMENTS') + '. Kindly ' + hl('download and accomplish both documents') + ' before submission.'
      : 'The forms will be made available as PDFs on the applicant portal, under ' + hl('FILE 03: REQUIREMENTS') + '. Kindly ' + hl('wait for their release') + ' before accomplishing them.',
    'Both documents must bear your parent&rsquo;s or guardian&rsquo;s original ' + hl('wet signature') + '.',
    'Once completed, physically submit both documents to the ' + hl('designated drop-off box at the MEA Room (MVP 320)') +
      (due ? ' by ' + hl(Utilities.formatDate(due, 'Asia/Manila', 'MMMM d, h:mm a')) : '') + '.'
  ];
  if (kind === 'verified') {
    return Object.assign(v, {
      subject: 'Your payment is confirmed. What’s next? · ' + id,
      preheader: 'Payment verified. Two documents left before your file is complete: the PNF and the D&U.',
      windowName: 'Payment verified', headline: 'All eyes on you, ' + nick + '. 👁️', stamp: '✅ Payment verified',
      receipt: [], docs: docs, reminders: reminders, due: due,
      dateBox: due ? ['Deadline of submission', Utilities.formatDate(due, 'Asia/Manila', 'MMMM d, yyyy · h:mm a'), 'MEA Room (MVP 320) drop-off box'] : v.dateBox,
      button: ['Open the applicant portal ↗', PAYMAIL_DOOR_ + '?page=reqs'],   // a no-break space keeps the arrow on the text's line
      closing: 'Finish your file.'
    });
  }
  const rows = [['File no.', id], ['Received', when], ['Amount', php(fee.now)]];   // no notarization line (core team, Nov 14)
  return Object.assign(v, {
    subject: 'Proof received: ' + id + ' · Eyes on LEADS',
    preheader: 'We have your proof of payment. Next: your PNF and D&U.',
    windowName: 'Proof received', headline: 'Evidence received, ' + nick + '.', stamp: 'Proof received',
    receipt: rows, docs: docs, reminders: reminders, due: due,
    dateBox: due ? ['Deadline of submission', Utilities.formatDate(due, 'Asia/Manila', 'MMMM d, yyyy · h:mm a'), 'MEA Room (MVP 320) drop-off box'] : v.dateBox,
    button: ['Open the applicant portal ↗', PAYMAIL_DOOR_ + '?page=reqs'],
    closing: 'Finish your file.'
  });
}

/**
 * The "payment verified" email: the core team's own HTML (PaymentVerifiedMail.html, Nov 14 2026), sent as written.
 * Only its placeholders are filled: [NAME] = nickname, [PNF_URL] / [DU_URL] = Settings › PNFLink / DULink (blank = the
 * portal's requirements page, where the PDFs get posted), [PORTAL_URL] = the door page to FILE 03, [DUE_SHORT] /
 * [DUE_LONG] = Settings › RequirementsDeadline, else the template's own November 27, 5 PM.
 */
function payMail_verifiedDue_(v) {
  if (!v.due) return PAYMAIL_DUE_DEFAULT_;
  const f = p => Utilities.formatDate(v.due, 'Asia/Manila', p);
  return { short: f('MMMM d, h:mm a'), long: f('MMMM d, yyyy') + ' &middot; ' + f('h:mm a') };
}
function payMail_verifiedHtml_(v) {
  const reqs = PAYMAIL_DOOR_ + '?page=reqs', due = payMail_verifiedDue_(v);
  const url = abbr => { const d = (v.docs || []).find(x => x.abbr === abbr); return d && d.url ? d.url : reqs; };
  const fill = { '[NAME]': pm_esc_(v.nick), '[PNF_URL]': pm_esc_(url('PNF')), '[DU_URL]': pm_esc_(url('D&U')),
                 '[PORTAL_URL]': pm_esc_(v.button[1]), '[DUE_SHORT]': due.short, '[DUE_LONG]': due.long };
  let html = HtmlService.createHtmlOutputFromFile('PaymentVerifiedMail').getContent();
  Object.keys(fill).forEach(k => { html = html.split(k).join(fill[k]); });
  return html;
}

/** The same email as plain text, for mail apps that don't show HTML. */
function payMail_text_(kind, v) {
  const lines = ['EYES ON LEADS // ' + v.windowName.toUpperCase(), '', v.headline, ''];
  if (kind === 'verified') {
    const plain = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&rsquo;/g, '\'');
    lines.push('We\'ve been watching, and it looks like you\'ve taken another step toward discovering what lies beyond your comfort zone.',
      'Your payment for EYES ON LEADS 2627 has been successfully received and verified!', '',
      'BUT YOUR FILE ISN\'T COMPLETE JUST YET. Kindly prepare the following documents:');
    v.docs.forEach(d => lines.push('  ' + d.n + '  ' + d.name + ' (' + d.abbr + ')' + (d.url ? ': ' + d.url : '')));
    lines.push('', 'Important reminders:');
    v.reminders.forEach(r => lines.push('  - ' + plain(r)));
    lines.push('', 'Deadline of submission: ' + payMail_verifiedDue_(v).long.replace('&middot;', '·'),
      '', 'After physically submitting your documents, return to the applicant portal and confirm your submission under FILE 03: REQUIREMENTS.');
  } else {
    const plain = h => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&rsquo;/g, '\'');
    lines.push('We saw it. Your proof of payment for EYES ON LEADS 2627 is in your file now.', '');
    if (v.finAidNote) lines.push(v.finAidNote, '');
    lines.push('NEXT: YOUR REQUIREMENTS. Prepare these two documents:');
    v.docs.forEach(d => lines.push('  ' + d.n + '  ' + d.name + ' (' + d.abbr + ')' + (d.url ? ': ' + d.url : '')));
    lines.push('', 'Important reminders:');
    v.reminders.forEach(r => lines.push('  - ' + plain(r)));
    lines.push('', 'After you drop them off, confirm your submission on the applicant portal under FILE 03: REQUIREMENTS.',
      'If anything is off with your payment, the core team will text you.',
      'Sent the wrong file? Upload the right one on the payment page. We check the latest one.');
  }
  lines.push('');
  v.receipt.forEach(r => lines.push(r[0] + ': ' + r[1]));
  lines.push('', v.button[0].replace(/\s*↗$/, '') + ': ' + v.button[1], '', v.dateBox[0] + ': ' + v.dateBox[1] + (v.dateBox[2] ? ' (' + v.dateBox[2] + ')' : ''), '',
    'We have been watching. ' + v.closing, '', 'Questions? Reply to this email, or message ' + v.contacts + '.');
  return lines.join('\n');
}

/** Builds and sends one payment email (kind 'received' | 'verified'). Never throws: true when sent. */
function payMail_send_(a, kind) {
  const to = String(a && a.Email || '').trim().toLowerCase();
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { activity_('payment_mail', (a && a.ApplicantID) + ': no usable email, ' + kind + ' email not sent', { level: 'WARN', page: 'pay' }); return false; }
    if (MailApp.getRemainingDailyQuota() < 1) { activity_('payment_mail', 'daily email quota used up: ' + kind + ' email not sent to ' + a.ApplicantID, { level: 'WARN', page: 'pay' }); return false; }
    const v = payMail_vars_(a, kind);
    const opts = { name: 'I.R.I.S. // LEADS 2627', htmlBody: kind === 'verified' ? payMail_verifiedHtml_(v) : payMail_html_(kind, v) };   // PaymentMailHtml.gs: the results blasts' structure (dark-mode safe on iPhone); the sender name inboxes show
    const reply = String(getSetting_('ContactEmail') || '').trim();
    if (/@/.test(reply)) opts.replyTo = reply;
    MailApp.sendEmail(to, v.subject, payMail_text_(kind, v), opts);
    activity_('payment_mail', kind + ' email sent to ' + a.ApplicantID, { page: 'pay' });
    return true;
  } catch (e) {
    activity_('payment_mail', kind + ' email not sent to ' + (a && a.ApplicantID) + ': ' + (e && e.message), { level: 'WARN', page: 'pay' });
    return false;
  }
}

/**
 * The "payment verified" email for everyone who is due one: Payment VERIFIED, Status ACCEPTED / CONFIRMED, results
 * released, and Applicants › PaymentVerifiedMail still blank. At most PAYMAIL_PER_RUN_ a run. Returns how many went out.
 */
function payMail_sendPending_() {
  if (!PAYMAIL_SEND_VERIFIED_) return 0;   // switched off (see PAYMAIL_SEND_VERIFIED_)
  if (!setting_('ResultsReleased')) return 0;
  const sh = sheet_(SHEET.APPLICANTS), last = sh.getLastRow();
  if (last < 2) return 0;
  if (cols_().indexOf('PaymentVerifiedMail') < 0) withScriptLock_(15000, () => ensureApplicantHeaders_());
  const head = cols_();
  const rows = sh.getRange(2, 1, last - 1, head.length).getValues();
  let sent = 0;
  for (let i = 0; i < rows.length && sent < PAYMAIL_PER_RUN_; i++) {
    const a = {};
    head.forEach((h, j) => { a[h] = rows[i][j]; });
    if (!/^APP-\d{4,}$/.test(String(a.ApplicantID || '').trim())) continue;
    if (String(a.Payment || '').trim() !== 'VERIFIED') continue;
    if (['ACCEPTED', 'CONFIRMED'].indexOf(String(a.Status || '').trim()) < 0) continue;
    if (String(a.PaymentVerifiedMail || '').trim()) continue;
    const id = String(a.ApplicantID).trim();
    // stamp first, so a crash between the two can never send it twice
    withScriptLock_(15000, () => updateApplicant_(i + 2, { PaymentVerifiedMail: new Date() }, id));
    if (payMail_send_(a, 'verified')) { sent++; continue; }
    withScriptLock_(15000, () => updateApplicant_(i + 2, {
      PaymentVerifiedMail: 'NOT SENT ' + Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd HH:mm') + ' (clear to retry)' }, id));
  }
  if (sent) activity_('payment_mail', sent + ' "payment verified" email(s) sent', { page: 'admin' });
  return sent;
}

/**
 * Run from the editor (dark-mode A/B, Nov 14 2026): the "payment verified" email twice, to you only.
 * A = the core team's HTML exactly as designed. B = the same plus ONE line at the top of <style>: the Google Fonts
 * @import that Nathan's blast emails have (the only difference found between his emails, which stay readable in Gmail
 * iPhone dark mode, and ours, whose paper text turned white). Open both in Gmail on an iPhone with dark mode on.
 */
function payMail_testDarkAB() {
  ownerOnly_();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const a = { ApplicantID: 'APP-0000', Nickname: 'Sample', FullName: 'Applicant, Sample', Email: me };
  const v = payMail_vars_(a, 'verified'), html = payMail_verifiedHtml_(v);
  const imp = "@import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;700;800&family=Special+Elite&family=VT323&family=Courier+Prime:wght@400;700&display=swap');\n  ";
  const b = html.replace('<style>\n', '<style>\n  ' + imp);
  if (b === html) throw new Error('No <style> block found to add the @import to.');
  const to = payMail_testTo_(me).join(',');
  MailApp.sendEmail(to, '[A] as designed · dark mode test', 'Open in Gmail on iPhone, dark mode on.', { name: 'I.R.I.S. // LEADS 2627', htmlBody: html });
  MailApp.sendEmail(to, '[B] + @import · dark mode test', 'Open in Gmail on iPhone, dark mode on.', { name: 'I.R.I.S. // LEADS 2627', htmlBody: b });
  return 'A and B sent to ' + to;
}

/** Run from the editor: sends both emails to you (your own file's data if you applied, else a sample). */
function payMail_test() {
  ownerOnly_();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  let found = null;
  try { found = getApplicantByEmail_(me); } catch (e) { Logger.log('Own file not readable (' + e.message + '); using sample data.'); }
  const a = found ? Object.assign({}, found.data, { Email: me })
    : { ApplicantID: 'APP-0000', Nickname: 'Sample', FullName: 'Applicant, Sample', Email: me, FinAidScholar: 'Yes' };
  const out = [];
  payMail_testTo_(me).forEach(to => (PAYMAIL_SEND_VERIFIED_ ? ['received', 'verified'] : ['received']).forEach(k =>
    out.push(k + ': ' + (payMail_send_(Object.assign({}, a, { Email: to }), k) ? 'sent to ' + to : 'NOT sent to ' + to + ' (see Activity)'))));
  return out.join('\n');
}

/**
 * Run from the editor: a one-off "dark mode lab" email to you. Gmail on iPhone darkened the light text in the payment
 * emails; each row here draws light text on the email's dark background a different way. Open it in Gmail on an iPhone
 * with dark mode ON, screenshot it, and the row that still reads light is the technique the template should use.
 */
function payMail_darkLab() {
  ownerOnly_();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const dark = "background-color:#17181c;background-image:url('https://i.imgur.com/ZtlO7pz.png');";
  const sample = (wrap, extra) => ['#e4e4df', '#f2ea00', '#e2c98e'].map(c => wrap('<span style="color:' + c + ';' + extra(c) + '">Case file ' +
    (c === '#e4e4df' ? 'grey' : c === '#f2ea00' ? 'yellow' : 'manila') + ' text</span>')).join('<br>');
  const none = h => h, noExtra = () => '';
  const rows = [
    ['A', 'plain colour (what failed)', dark, sample(none, noExtra)],
    ['B', 'blend fix in a style block (current)', dark, sample(h => '<div class="gs"><div class="gd">' + h + '</div></div>', noExtra)],
    ['C', 'blend fix written inline', dark, sample(h => '<div style="background:#000;mix-blend-mode:screen;"><div style="background:#000;mix-blend-mode:difference;">' + h + '</div></div>', noExtra)],
    ['D', '-webkit-text-fill-color', dark, sample(none, c => '-webkit-text-fill-color:' + c + ';')],
    ['E', 'text painted as a clipped background', dark, sample(none, c => 'background-image:linear-gradient(' + c + ',' + c + ');-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;')],
    ['F', 'mid-grey tone (#9a9a9a)', dark, '<span style="color:#9a9a9a;">Case file mid-grey text</span>'],
    ['G', 'plain dark colour, NO image', 'background-color:#17181c;', sample(none, noExtra)]
  ];
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">' +
    '<style>u + .body .gs { background:#000; mix-blend-mode:screen; } u + .body .gd { background:#000; mix-blend-mode:difference; }</style></head>' +
    '<body class="body" style="margin:0;padding:0;background-color:#0c0c0e;background-image:url(\'https://i.imgur.com/V8jQqbw.png\');">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0c0c0e;background-image:url(\'https://i.imgur.com/V8jQqbw.png\');"><tr><td style="padding:16px;">' +
    '<p style="margin:0 0 14px 0;font-family:Courier New,monospace;font-size:15px;line-height:22px;color:#ff4a50;">DARK MODE LAB: open in Gmail on iPhone with dark mode ON and screenshot every row. The row whose three lines still read light (grey, yellow, manila) wins.</p>' +
    rows.map(r => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;border:2px solid #707070;' + r[2] + '"><tr><td style="padding:12px 14px;font-family:Courier New,monospace;font-size:16px;line-height:24px;">' +
      '<span style="color:#ff4a50;font-weight:bold;">' + r[0] + ' &middot; ' + r[1] + '</span><br>' + r[3] + '</td></tr></table>').join('') +
    '</td></tr></table></body></html>';
  MailApp.sendEmail(me, 'Dark mode lab (Eyes on LEADS payment emails)', 'Open this in Gmail on iPhone with dark mode on.', { name: 'I.R.I.S. // LEADS 2627', htmlBody: html });
  return 'Lab sent to ' + me;
}
