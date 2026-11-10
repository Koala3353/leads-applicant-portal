/**
 * PaymentMail.gs  (integrator owns this file)
 * The two payment emails, in the look of the core team's eol2627-payment-confirmation design (PaymentMail.html):
 *   received  right after a proof upload (steps_uploadProof_, StepsApi.gs): we have it, the core team is checking it,
 *             another email follows once it's verified. Sent on every upload (a re-upload gets a fresh one).
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
const PAYMAIL_PER_RUN_ = 40;   // verified emails per run (MailApp is ~1 s each); the rest go out on the next run, 5 minutes later

/** Everything the template (PaymentMail.html) shows. a = an Applicants row (data object). */
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
  const v = {
    id: id, nickUpper: nick.toUpperCase(),
    dates: String(s.EventDates || '').trim() || 'January 29 to 31, 2027',
    venue: String(s.EventVenue || '').trim() || 'Kasile Hills Nature Resort',
    contacts: contactsInline_(portalContacts_()),
    finAidNote: finAidNote
  };
  if (kind === 'verified') {
    return Object.assign(v, {
      subject: 'Your payment is confirmed. What’s next? · ' + id,
      preheader: 'Payment verified. Two documents left before your file is complete: the PNF and the D&U.',
      windowName: 'Payment verified', headline: 'All eyes on you, ' + nick + '.', stamp: '✓ Payment verified',
      receipt: [['File no.', id], ['Verified', when], ['Status', 'Payment verified']],
      reminders: [
        'Both documents must bear your parent&rsquo;s or guardian&rsquo;s <strong>original wet signature</strong>.',
        'The forms will be released through our core communication channels. <strong>Wait for their release</strong> before you fill them in.',
        'Once done, drop off both documents at the designated box in the <strong>MEA Room (MVP 320)</strong>.'
      ],
      button: ['Open the applicant portal', PAYMAIL_DOOR_ + '?page=reqs'],
      closing: 'Finish your file.'
    });
  }
  const rows = [['File no.', id], ['Received', when], ['Amount due', php(fee.now)]];
  if (fee.later) rows.push(['Later', php(fee.later) + ', only if notarization is needed']);
  rows.push(['Status', 'For verification']);
  return Object.assign(v, {
    subject: 'Proof received: ' + id + ' · Eyes on LEADS',
    preheader: 'We have your proof of payment. The core team is checking it; another email follows once it is verified.',
    windowName: 'Proof received', headline: 'Evidence received, ' + nick + '.', stamp: 'Proof received',
    receipt: rows, reminders: [],
    button: ['Check your file', PAYMAIL_DOOR_ + '?page=pay'],
    closing: 'Your file is moving.'
  });
}

/** The same email as plain text, for mail apps that don't show HTML. */
function payMail_text_(kind, v) {
  const lines = ['EYES ON LEADS // ' + v.windowName.toUpperCase(), '', v.headline, ''];
  if (kind === 'verified') {
    lines.push('Your payment for EYES ON LEADS 2627 has been received and verified.', '',
      'BUT YOUR FILE ISN\'T COMPLETE JUST YET. Prepare these documents:',
      '  01  Parental Notification Form (PNF)', '  02  Declaration and Undertaking (D&U)', '',
      'Important reminders:',
      '  - Both documents need your parent\'s or guardian\'s original wet signature.',
      '  - The forms will be released through our core communication channels. Wait for their release.',
      '  - Drop off both documents at the designated box in the MEA Room (MVP 320).', '',
      'Then confirm on the portal under FILE 03: REQUIREMENTS ("I dropped this off onsite").');
  } else {
    lines.push('We saw it. Your proof of payment for EYES ON LEADS 2627 is in your file now.',
      'The core team checks every receipt by hand. This is not the confirmation yet: we\'ll email you again once your payment is verified.', '');
    if (v.finAidNote) lines.push(v.finAidNote, '');
    lines.push('Sent the wrong file? Upload the right one on the payment page. We check the latest one.');
  }
  lines.push('');
  v.receipt.forEach(r => lines.push(r[0] + ': ' + r[1]));
  lines.push('', v.button[0] + ': ' + v.button[1], '', 'Event dates: ' + v.dates + ' (' + v.venue + ')', '',
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
    const t = HtmlService.createTemplateFromFile('PaymentMail');
    t.kind = kind; t.v = v;
    const opts = { name: 'I.R.I.S. // LEADS 2627', htmlBody: t.evaluate().getContent() };   // the sender name inboxes show
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

/** Run from the editor: sends both emails to you (your own file's data if you applied, else a sample). */
function payMail_test() {
  ownerOnly_();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const found = getApplicantByEmail_(me);
  const a = found ? Object.assign({}, found.data, { Email: me })
    : { ApplicantID: 'APP-0000', Nickname: 'Sample', FullName: 'Applicant, Sample', Email: me, FinAidScholar: 'Yes' };
  return ['received', 'verified'].map(k => k + ': ' + (payMail_send_(a, k) ? 'sent to ' + me : 'NOT sent (see Activity)')).join('\n');
}
