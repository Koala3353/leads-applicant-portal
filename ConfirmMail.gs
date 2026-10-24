/**
 * ConfirmMail.gs  (integrator owns this file)
 * The confirmation emails: one when someone files their LEADS application (apply_submit_, ApplyApi.gs), one when someone
 * registers for THE LEADS UP (preleads_submit_, PreLeadsServer.gs). Each shows their answers (not the Game), in two
 * looks from the LEADS 2627 brand book's layouts (see "the two looks" below), deliberately unlike the email blast,
 * plus a plain-text version for clients without HTML.
 *
 * Sending never breaks a submit: it runs after the lock, any failure is logged (WARN) and the application stands.
 * MailApp quota (school account): about 1,500 recipients a day; one email per submit.
 * Run confirm_testEmails() from the editor (owner only) to send both to yourself with sample answers.
 */

const MAIL_MONO_ = "'JetBrains Mono', Menlo, Consolas, 'SF Mono', 'Courier New', monospace";
// The LEADS Facebook group, where the additional requirements are posted (reminder in the LEADS confirmation)
const LEADS_FB_GROUP_ = 'https://www.facebook.com/groups/1617514465872930';

/** LEADS application filed. a = the saved row (RULES fields + ApplicantID, Email, ReferralCode, ReferredBy). */
function confirmMail_apply_(a) {
  const s = getSettings_();
  const nick = String(a.Nickname || '').trim() || 'there';
  const sections = [
    ['PAGE 01 // IDENTITY', [
      ['Name (Last name, First name)', a.FullName], ['Nickname', a.Nickname], ['ID number', a.IDNumber],
      ['Year and course', [a.YearLevel ? 'Year ' + a.YearLevel : '', a.Course].filter(Boolean).join(' · ')],
      ['Block', a.Block || '—'], ['Mobile number', a.Mobile], ['MBTI', a.MBTI || '—'],
      ['Referral code you used', a.ReferredBy || 'None'],
      ['Student or community organizations you have actively participated in', a.PastOrgs || '—'],
      ['Free to go offsite ' + (String(s.EventDates || '').trim() || 'on the camp dates') + '?', a.OffsiteAvailability]
    ]],
    ['PAGE 02 // LEADS', [
      ['Why did you choose to apply for LEADS as a participant?', a.WhyParticipant]
    ]],
    ['PAGE 03 // LEADERSHIP', [
      ['Would you consider yourself someone who often takes up a leadership role in your day-to-day life?', a.TakesLeadership],
      ['What scares you the most about being a leader?', a.FearLeadership],
      ['What kind of environment helps you feel most comfortable participating and sharing your thoughts with others?', a.Environment]
    ]]
  ];
  const total = Number(setting_('RegistrationFee')) || 0, later = Math.max(0, Math.min(total, Number(setting_('FeeLater')) || 0));
  const php = n => '₱' + n.toLocaleString('en-PH');
  // "₱4,000 of the ₱4,200 fee; the last ₱200 comes later, for possible notarization."
  const feeLine = php(total - later) + ' of the ' + php(total) + ' fee' + (later ? '; the last ' + php(later) + ' comes later, for possible notarization.' : '.');
  const facts = [['FILE NO.', a.ApplicantID], ['STATUS', 'SUBMITTED'], ['CAMP', String(s.EventDates || 'January 29 to 31, 2027')],
    ['FEE', php(total) + ' (' + php(total - later) + ' once accepted, ' + php(later) + ' later)'], ['YOUR CODE', a.ReferralCode || '—', true]];
  const next = [
    ['01', 'Review', 'The core team reads every file. Results come out on the portal; we will email you when they do.', true],
    ['02', 'Proof of payment', 'Once accepted: pay ' + feeLine + ' Nothing is due before that.', false],
    ['03', 'Requirements', 'After payment is verified: the forms to fill in.', false],
    ['04', '1st GA', 'Your first general assembly. Date to be set.', false],
    ['05', 'Room booking', 'Where you sleep at camp. Earlier picks for more referral points.', false]
  ];
  return confirmSend_(a.Email, {
    subject: 'File received: ' + a.ApplicantID + ' · Eyes on LEADS',
    preheader: 'Your LEADS application is on record. Your answers are inside.',
    style: 'intake', subjectNo: a.ApplicantID, struck: 'NOT ON FILE',
    nick: nick, tag: 'CASE FILE 26//27 · ' + a.ApplicantID, headline: 'File<br>received.',
    tagline: 'ON RECORD', finding: 'subject wrote it down. That is the hard part. Observation continues.',
    intro: 'Hi ' + nick + ', your application to LEADS is filed. This is what you sent us. Keep it: you can\'t change it anymore, and you don\'t need to.',
    facts: facts, sections: sections,
    referral: a.ReferralCode ? 'Your referral code is <b>' + confirmEsc_(a.ReferralCode) + '</b>. Each person who applies with it earns you a point toward room booking and other advantages at camp.' : '',
    notice: { title: 'ONE MORE THING // OPTIONAL REQUIREMENTS',
      text: 'The LEADS Facebook group has optional requirements. Your application is complete without them, but doing them boosts your chances of being accepted. Open the group, read the latest post, and send them before the deadline.',
      link: ['Open the LEADS Facebook group', LEADS_FB_GROUP_] },
    next: next, button: ['Check your file on the portal', portalUrl_()],
    closing: 'We have been watching.<br><span style="color:#e50000;">Now we are reading.</span>'
  }, 'apply');
}

/** THE LEADS UP registration. r = the saved values (FullName, Nickname, IDNumber, YearLevel, Course, Block, Mobile, ...). */
function confirmMail_preleads_(r, email) {
  const nick = String(r.Nickname || '').trim() || 'there';
  const when = setting_('PreLeadsDate'), time = setting_('PreLeadsTime'), where = setting_('PreLeadsVenue');
  const sections = [
    ['PAGE 01 // IDENTITY', [
      ['Full name', r.FullName], ['Nickname', r.Nickname], ['ID number', r.IDNumber],
      ['Year and course', [r.YearLevel ? 'Year ' + r.YearLevel : '', r.Course].filter(Boolean).join(' · ')],
      ['Block', r.Block || '—'], ['Mobile number', r.Mobile || '—']
    ]],
    ['PAGE 02 // THE LEADS UP', [
      ['What do you hope to gain from your experience at THE LEADS UP?', r.HopeToGainPreLEADS],
      ['When taking on a leadership role, which of the following do you find most challenging or daunting?', r.DauntingAspects]
    ]]
  ];
  return confirmSend_(email, {
    subject: 'Registered: THE LEADS UP · ' + (when || 'November 5'),
    preheader: 'Your seat at THE LEADS UP is on record. Your answers are inside.',
    style: 'broadcast', nick: nick, tag: 'THE LEADS UP · ' + [when, time].filter(Boolean).join(' · '), headline: 'Seat<br>reserved',
    tagline: 'I.R.I.S. is expecting you.',
    intro: 'Hi ' + nick + ', you are registered for THE LEADS UP, a one-day, onsite preview of LEADS. This is what you sent us.',
    facts: [['WHEN', [when, time].filter(Boolean).join(' · ')], ['WHERE', where || 'Onsite'], ['WHAT', 'A preview of LEADS']],
    sections: sections, referral: '',
    next: [['01', 'Show up', 'Come on time. Bring yourself; the rest is provided.', true],
      ['02', 'Apply to LEADS', 'Applications for the camp itself are open on the portal.', false]],
    button: ['Open the portal', portalUrl_()],
    closing: 'We have been watching.<br><span style="color:#000ff0;">See you on the inside.</span>'
  }, 'preleads');
}

/** Builds and sends one confirmation. Never throws: returns true when sent. */
function confirmSend_(to, o, page) {
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) return false;
    if (MailApp.getRemainingDailyQuota() < 1) { activity_('confirm_mail', 'daily email quota used up: not sent to ' + to, { level: 'WARN', page: page }); return false; }
    const opts = { name: String(getSetting_('EventName') || 'LEADS').trim() || 'LEADS', htmlBody: confirmHtml_(o) };
    const reply = String(getSetting_('ContactEmail') || '').trim();
    if (/@/.test(reply)) opts.replyTo = reply;
    MailApp.sendEmail(to, o.subject, confirmText_(o), opts);
    return true;
  } catch (e) {
    activity_('confirm_mail', 'not sent to ' + to + ': ' + (e && e.message), { level: 'WARN', page: page });
    return false;
  }
}

function confirmEsc_(v) {
  return String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================== the two looks (LEADS 2627 brand book, "Layouts") ==============================
 * Both use only the brand palette and JetBrains Mono, and both differ on purpose from the email blast (dark CRT, Win95
 * windows, GIFs): they are documents you keep, not an announcement.
 *   intake     (LEADS application)   the CASE FILE template: a printed intake record on white paper, dotted frames like
 *              the brand book's own headers, a ruled answer grid, red stamps, a crossed-out status, a typed finding.
 *   broadcast  (THE LEADS UP)        the BROADCAST CARD template: a solid #000ff0 field with bold centered caps
 *              ("THIS IS NOT A TEST"), then a white transcript of the answers.
 * Light designs: color-scheme is pinned to light, and the same colors are re-declared for dark mode (and Outlook's
 * data-ogsc / data-ogsb) so mail apps don't invert them. No images at all: nothing to load or block.
 */
const BRAND_C_ = { yellow: '#fffc04', blue: '#000ff0', black: '#050505', white: '#fefffe', grey: '#808080', red: '#e50000',
  paper: '#fefffe', desk: '#e8e6e0', rule: '#c9c6bd', ink: '#050505', soft: '#f3f1ea' };

function confirmHtml_(o) { return o.style === 'broadcast' ? confirmBroadcastHtml_(o) : confirmIntakeHtml_(o); }

/** <head> shared by both: fonts, light-only color scheme, the same colors again for dark mode, phone tweaks. */
function confirmHead_(o, extra) {
  const C = BRAND_C_;
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
  <title>${confirmEsc_(o.subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,700;0,800;1,400&display=swap');
    :root { color-scheme: light only; supported-color-schemes: light only; }
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    table { border-collapse:separate; border-spacing:0; }
    a { text-decoration:none; }
    @media (prefers-color-scheme: dark) {
      .bg-desk { background-color:${C.desk} !important; } .bg-paper { background-color:${C.paper} !important; } .bg-soft { background-color:${C.soft} !important; }
      .bg-blue { background-color:${C.blue} !important; } .bg-black { background-color:${C.black} !important; } .bg-yellow { background-color:${C.yellow} !important; }
      .t-ink { color:${C.ink} !important; } .t-grey { color:${C.grey} !important; } .t-red { color:${C.red} !important; } .t-white { color:${C.white} !important; } .t-blue { color:${C.blue} !important; }
    }
    [data-ogsc] .t-ink { color:${C.ink} !important; } [data-ogsc] .t-grey { color:${C.grey} !important; } [data-ogsc] .t-red { color:${C.red} !important; }
    [data-ogsc] .t-white { color:${C.white} !important; } [data-ogsc] .t-blue { color:${C.blue} !important; }
    [data-ogsb] .bg-desk { background-color:${C.desk} !important; } [data-ogsb] .bg-paper { background-color:${C.paper} !important; } [data-ogsb] .bg-soft { background-color:${C.soft} !important; }
    [data-ogsb] .bg-blue { background-color:${C.blue} !important; } [data-ogsb] .bg-black { background-color:${C.black} !important; } [data-ogsb] .bg-yellow { background-color:${C.yellow} !important; }
    @media only screen and (max-width:480px) {
      .container { width:100% !important; } .pad { padding-left:16px !important; padding-right:16px !important; }
      .big { font-size:40px !important; line-height:42px !important; } .mega { font-size:46px !important; line-height:46px !important; }
      .qnum { width:30px !important; } .hide-sm { display:none !important; }
    }
    ${extra || ''}
  </style>
</head>`;
}

function confirmIntakeHtml_(o) {
  const C = BRAND_C_, M = MAIL_MONO_, E = confirmEsc_;
  const now = new Date(), stampDate = Utilities.formatDate(now, 'Asia/Manila', 'MMM dd yyyy').toUpperCase();
  const clock = Utilities.formatDate(now, 'Asia/Manila', 'HH:mm:ss');
  const dotted = 'border:2px dotted ' + C.ink + ';';
  const stamp = (t, rot) => `<span class="t-red" style="display:inline-block;transform:rotate(${rot || -6}deg);border:3px solid ${C.red};padding:3px 10px;font-family:${M};font-size:13px;line-height:17px;font-weight:800;letter-spacing:3px;color:${C.red};">${t}</span>`;
  const redact = w => `<span class="bg-black" style="display:inline-block;width:${w}px;height:12px;background-color:${C.black};vertical-align:middle;"></span>`;
  // a section: dotted header frame (like the brand book's page titles), then numbered questions on a ruled grid
  let qn = 0;
  const section = (title, items) => `
      <tr><td class="pad" style="padding:26px 30px 0 30px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${dotted}"><tr>
          <td class="t-ink" style="padding:8px 12px;font-family:${M};font-size:15px;line-height:20px;font-weight:800;color:${C.ink};border-right:2px dotted ${C.ink};white-space:nowrap;">${E(title.split('//')[0].trim())}</td>
          <td class="t-ink" style="padding:8px 12px;font-family:${M};font-size:15px;line-height:20px;font-style:italic;color:${C.ink};">${E((title.split('//')[1] || '').trim())}</td>
        </tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:1px solid ${C.rule};border-right:1px solid ${C.rule};">
          ${items.map(x => { qn++; const ans = x[1] === undefined || x[1] === null || x[1] === '' ? '—' : x[1]; return `
          <tr>
            <td valign="top" class="qnum t-grey" style="width:38px;padding:10px 0 10px 12px;border-bottom:1px solid ${C.rule};font-family:${M};font-size:11px;line-height:18px;color:${C.grey};">${String(qn).padStart(2, '0')}</td>
            <td valign="top" style="padding:10px 12px 10px 6px;border-bottom:1px solid ${C.rule};">
              <div class="t-grey" style="font-family:${M};font-size:11px;line-height:16px;letter-spacing:.5px;text-transform:uppercase;color:${C.grey};">${E(x[0])}</div>
              <div class="t-ink" style="padding-top:4px;font-family:${M};font-size:14px;line-height:22px;color:${C.ink};word-break:break-word;overflow-wrap:anywhere;">${E(ans).replace(/\r?\n/g, '<br>')}</div>
            </td>
          </tr>`; }).join('')}
        </table>
      </td></tr>`;
  const factRow = (k, v, hl) => `<tr>
      <td class="t-grey" style="padding:8px 12px;border-bottom:1px solid ${C.ink};border-right:1px solid ${C.ink};font-family:${M};font-size:11px;line-height:16px;letter-spacing:2px;color:${C.grey};white-space:nowrap;">${E(k)}</td>
      <td class="t-ink" style="padding:8px 12px;border-bottom:1px solid ${C.ink};font-family:${M};font-size:14px;line-height:20px;font-weight:700;color:${C.ink};">${hl ? `<span class="bg-yellow" style="background-color:${C.yellow};padding:1px 5px;">${E(v)}</span>` : E(v)}</td></tr>`;
  const steps = o.next.map((x, i) => `<tr>
      <td valign="top" class="t-ink" style="width:34px;padding:7px 0;font-family:${M};font-size:14px;line-height:20px;color:${C.ink};">${x[3] ? '[&#10003;]' : '[&nbsp;&nbsp;]'}</td>
      <td valign="top" style="padding:7px 0;${i < o.next.length - 1 ? 'border-bottom:1px dashed ' + C.rule + ';' : ''}">
        <div class="t-ink" style="font-family:${M};font-size:13px;line-height:19px;font-weight:700;color:${C.ink};text-transform:uppercase;">${x[0]} &nbsp;${E(x[1])}</div>
        <div class="t-grey" style="font-family:${M};font-size:12px;line-height:18px;color:${C.grey};">${E(x[2])}</div></td></tr>`).join('');

  return confirmHead_(o) + `
<body class="bg-desk" bgcolor="${C.desk}" style="margin:0;padding:0;background-color:${C.desk};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.desk};">${E(o.preheader)} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-desk" bgcolor="${C.desk}" style="background-color:${C.desk};">
    <tr><td align="center" style="padding:22px 10px 32px 10px;">
      <table role="presentation" class="container bg-paper" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="width:600px;max-width:600px;background-color:${C.paper};border:1px solid ${C.rule};box-shadow:0 2px 0 ${C.rule},0 14px 30px rgba(5,5,5,.12);">
        <!-- header frame: LEADS | Intake Record (the brand book's dotted page header) -->
        <tr><td class="pad" style="padding:26px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${dotted}"><tr>
            <td class="t-ink" style="padding:10px 14px;font-family:${M};font-size:24px;line-height:28px;font-weight:800;letter-spacing:-.5px;color:${C.ink};border-right:2px dotted ${C.ink};white-space:nowrap;">LEADS</td>
            <td class="t-ink" style="padding:10px 14px;font-family:${M};font-size:18px;line-height:24px;font-style:italic;color:${C.ink};">Intake Record</td>
            <td align="right" class="hide-sm t-grey" style="padding:10px 14px;font-family:${M};font-size:11px;line-height:16px;color:${C.grey};white-space:nowrap;">26 / 27</td>
          </tr></table>
        </td></tr>
        <!-- micro-details: REC, timestamp, subject number -->
        <tr><td class="pad t-grey" style="padding:10px 30px 0 30px;font-family:${M};font-size:11px;line-height:16px;letter-spacing:2px;color:${C.grey};text-transform:uppercase;">
          <span class="t-red" style="color:${C.red};">&#9679; REC</span> &nbsp;${clock} &nbsp;/&nbsp; SUBJECT ${E(o.subjectNo || '')} &nbsp;/&nbsp; ${E(o.nick)}</td></tr>
        <!-- title + stamp -->
        <tr><td class="pad" style="padding:22px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="bottom">
              <div class="big t-ink" style="font-family:${M};font-size:48px;line-height:48px;font-weight:800;letter-spacing:-2px;color:${C.ink};text-transform:uppercase;">${o.headline}</div>
              <div class="t-grey" style="padding-top:12px;font-family:${M};font-size:13px;line-height:18px;letter-spacing:2px;color:${C.grey};text-transform:uppercase;"><s>${E(o.struck || 'NOT ON FILE')}</s> &nbsp;<span class="t-ink" style="color:${C.ink};font-weight:700;">${E(o.tagline)}</span></div>
            </td>
            <td valign="top" align="right" class="hide-sm" style="padding-left:10px;">${stamp('RECEIVED<br>' + stampDate, 8)}</td>
          </tr></table>
        </td></tr>
        <tr><td class="pad t-ink" style="padding:18px 30px 0 30px;font-family:${M};font-size:14px;line-height:23px;color:${C.ink};">${E(o.intro)}</td></tr>
        <!-- the file's facts, as a ruled form -->
        <tr><td class="pad" style="padding:20px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.ink};border-left:1px solid ${C.ink};border-right:1px solid ${C.ink};">
            ${o.facts.map(f => factRow(f[0], f[1], f[2])).join('')}
          </table>
          ${o.referral ? `<div class="t-ink" style="padding-top:10px;font-family:${M};font-size:12px;line-height:19px;color:${C.ink};">${o.referral}</div>` : ''}
        </td></tr>
        ${o.notice ? `<tr><td class="pad" style="padding:24px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-soft" bgcolor="${C.soft}" style="background-color:${C.soft};border:2px solid ${C.red};">
            <tr><td class="t-red" style="padding:10px 14px 0 14px;font-family:${M};font-size:12px;line-height:17px;font-weight:800;letter-spacing:2px;color:${C.red};text-transform:uppercase;">+ ${E(o.notice.title)}</td></tr>
            <tr><td class="t-ink" style="padding:8px 14px 0 14px;font-family:${M};font-size:14px;line-height:22px;color:${C.ink};">${E(o.notice.text)}</td></tr>
            <tr><td style="padding:12px 14px 14px 14px;"><a href="${E(o.notice.link[1])}" target="_blank" class="t-red" style="font-family:${M};font-size:13px;line-height:18px;font-weight:800;letter-spacing:1px;color:${C.red};text-decoration:underline;text-transform:uppercase;">${E(o.notice.link[0])} &rarr;</a></td></tr>
          </table></td></tr>` : ''}
        ${o.sections.map(s => section(s[0], s[1])).join('')}
        <!-- the finding: a typed note under the answers -->
        <tr><td class="pad" style="padding:20px 30px 0 30px;">
          <div class="t-red" style="font-family:${M};font-size:14px;line-height:22px;font-style:italic;color:${C.red};border-left:3px solid ${C.red};padding-left:12px;">Finding: ${E(o.finding || 'answers on record. Observation continues.')}</div></td></tr>
        <!-- next steps, as a checklist -->
        <tr><td class="pad" style="padding:26px 30px 0 30px;">
          <div class="t-ink" style="font-family:${M};font-size:12px;line-height:17px;font-weight:800;letter-spacing:3px;color:${C.ink};text-transform:uppercase;padding-bottom:6px;border-bottom:2px dotted ${C.ink};">Next steps</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table></td></tr>
        <tr><td class="pad" style="padding:22px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="center" class="bg-black" bgcolor="${C.black}" style="background-color:${C.black};">
              <a href="${E(o.button[1])}" target="_blank" class="t-white" style="display:block;padding:16px 14px;font-family:${M};font-size:15px;line-height:20px;font-weight:800;letter-spacing:2px;color:${C.white};text-transform:uppercase;text-decoration:none;">${E(o.button[0])} &rarr;</a></td>
          </tr></table></td></tr>
        <tr><td class="pad t-ink" style="padding:26px 30px 0 30px;font-family:${M};font-size:18px;line-height:26px;font-weight:800;color:${C.ink};text-transform:uppercase;">${o.closing}</td></tr>
        <tr><td class="pad t-grey" style="padding:24px 30px 24px 30px;font-family:${M};font-size:10px;line-height:16px;letter-spacing:1px;color:${C.grey};">
          <div style="border-top:2px dotted ${C.rule};padding-top:12px;">CASE FILE 26/27 &middot; EYES ON LEADS &middot; A LEADERSHIP DEVELOPMENT PROJECT OF MEA &middot; LOCATION ${redact(56)}<br>THIS IS AN AUTOMATIC CONFIRMATION. REPLY IF SOMETHING LOOKS WRONG.</div></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function confirmBroadcastHtml_(o) {
  const C = BRAND_C_, M = MAIL_MONO_, E = confirmEsc_;
  const fact = (k, v) => `<tr>
      <td class="t-blue" style="padding:9px 0;border-bottom:2px solid ${C.blue};font-family:${M};font-size:11px;line-height:18px;font-weight:800;letter-spacing:3px;color:${C.blue};white-space:nowrap;width:90px;">${E(k)}</td>
      <td class="t-ink" style="padding:9px 0 9px 10px;border-bottom:2px solid ${C.blue};font-family:${M};font-size:15px;line-height:20px;font-weight:700;color:${C.ink};">${E(v)}</td></tr>`;
  const answers = o.sections.map(s => `
      <div class="t-blue" style="padding-top:18px;font-family:${M};font-size:11px;line-height:16px;font-weight:800;letter-spacing:3px;color:${C.blue};text-transform:uppercase;">${E(s[0].split('//')[1] || s[0])}</div>
      ${s[1].map(x => `<div style="padding-top:10px;">
        <div class="t-grey" style="font-family:${M};font-size:11px;line-height:16px;color:${C.grey};">&gt; ${E(x[0])}</div>
        <div class="t-ink" style="padding:3px 0 0 14px;font-family:${M};font-size:14px;line-height:22px;color:${C.ink};word-break:break-word;overflow-wrap:anywhere;">${E(x[1] === undefined || x[1] === '' ? '—' : x[1]).replace(/\r?\n/g, '<br>')}</div></div>`).join('')}`).join('');
  return confirmHead_(o) + `
<body class="bg-black" bgcolor="${C.black}" style="margin:0;padding:0;background-color:${C.black};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.black};">${E(o.preheader)} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-black" bgcolor="${C.black}" style="background-color:${C.black};">
    <tr><td align="center" style="padding:22px 10px 32px 10px;">
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <!-- the broadcast card: solid blue, bold centered caps -->
        <tr><td align="center" class="bg-blue pad" bgcolor="${C.blue}" style="background-color:${C.blue};padding:34px 30px 32px 30px;">
          <div class="t-white" style="font-family:${M};font-size:13px;line-height:18px;font-weight:800;letter-spacing:4px;color:${C.white};text-transform:uppercase;">This is not a test</div>
          <div class="mega t-white" style="padding-top:14px;font-family:${M};font-size:58px;line-height:56px;font-weight:800;letter-spacing:-2px;color:${C.white};text-transform:uppercase;">${o.headline}</div>
          <div class="t-white" style="padding-top:14px;font-family:${M};font-size:15px;line-height:21px;color:${C.white};">${E(o.tag)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
            <td class="t-white" style="font-family:${M};font-size:30px;line-height:30px;color:${C.white};padding-right:12px;">&#9673;</td>
            <td class="t-white" align="left" style="font-family:${M};font-size:14px;line-height:18px;font-weight:800;letter-spacing:2px;color:${C.white};text-transform:uppercase;">${E(o.tagline)}</td>
          </tr></table>
        </td></tr>
        <tr><td class="bg-yellow" bgcolor="${C.yellow}" style="background-color:${C.yellow};height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
        <!-- the transcript: details + answers on white -->
        <tr><td class="bg-paper pad" bgcolor="${C.white}" style="background-color:${C.white};padding:26px 30px 8px 30px;">
          <div class="t-ink" style="font-family:${M};font-size:14px;line-height:23px;color:${C.ink};">${E(o.intro)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-top:2px solid ${C.blue};">${o.facts.map(f => fact(f[0], f[1])).join('')}</table>
          ${answers}
          <div style="padding-top:22px;">
            <div class="t-blue" style="font-family:${M};font-size:11px;line-height:16px;font-weight:800;letter-spacing:3px;color:${C.blue};text-transform:uppercase;padding-bottom:6px;">Next</div>
            ${o.next.map(x => `<div class="t-ink" style="padding:5px 0;font-family:${M};font-size:13px;line-height:20px;color:${C.ink};"><b>${x[0]} ${E(x[1])}.</b> <span class="t-grey" style="color:${C.grey};">${E(x[2])}</span></div>`).join('')}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
            <td align="center" class="bg-yellow" bgcolor="${C.yellow}" style="background-color:${C.yellow};border:2px solid ${C.black};">
              <a href="${E(o.button[1])}" target="_blank" class="t-ink" style="display:block;padding:15px 14px;font-family:${M};font-size:15px;line-height:20px;font-weight:800;letter-spacing:2px;color:${C.black};text-transform:uppercase;text-decoration:none;">${E(o.button[0])} &rarr;</a></td>
          </tr></table>
          <div class="t-ink" style="padding-top:22px;font-family:${M};font-size:17px;line-height:25px;font-weight:800;color:${C.ink};text-transform:uppercase;">${o.closing}</div>
        </td></tr>
        <tr><td class="bg-blue pad t-white" bgcolor="${C.blue}" style="background-color:${C.blue};padding:12px 30px;font-family:${M};font-size:10px;line-height:16px;letter-spacing:1px;color:${C.white};">
          EMERGENCY BROADCAST // THE LEADS UP &middot; EYES ON LEADS &middot; MEA &middot; AUTOMATIC CONFIRMATION, REPLY IF SOMETHING LOOKS WRONG.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** The plain-text version (mail apps without HTML, and previews). */
function confirmText_(o) {
  const strip = s => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
  const out = ['EYES ON LEADS  |  ' + o.tag, strip(o.headline).toUpperCase(), '', o.intro, ''];
  o.facts.forEach(f => out.push(f[0] + ': ' + f[1]));
  if (o.referral) out.push('', strip(o.referral));
  if (o.notice) out.push('', o.notice.title, o.notice.text, o.notice.link[0] + ': ' + o.notice.link[1]);
  o.sections.forEach(sec => { out.push('', '== ' + sec[0] + ' =='); sec[1].forEach(x => out.push('', x[0], String(x[1] === undefined || x[1] === '' ? '—' : x[1]))); });
  out.push('', 'NEXT STEPS');
  o.next.forEach(x => out.push(x[0] + ' ' + x[1] + ': ' + x[2]));
  out.push('', o.button[0] + ': ' + o.button[1], '', strip(o.closing));
  return out.join('\n');
}

/** Run from the editor (owner only): sends both confirmations to you, with sample answers, to check the look. */
function confirm_testEmails() {
  ownerOnly_();
  const me = currentEmail_();
  confirmMail_apply_({
    ApplicantID: 'APP-2399', Email: me, FullName: 'Dela Cruz, Juan P.', Nickname: 'Juan', IDNumber: '241234', YearLevel: 2,
    Course: 'BS Management Engineering', Block: '', Mobile: '09171234567', MBTI: 'INTJ',
    PastOrgs: 'MEA (LEADS2526 FACI): kept the small groups talking\nAteneo Debate Society: member',
    OffsiteAvailability: 'Yes', ReferredBy: 'BEA', ReferralCode: 'JUAN',
    WhyParticipant: 'I want to find out what kind of leader I am when nobody is giving me a title.',
    TakesLeadership: 'Sometimes. I usually end up organizing the group chat and the deadlines, but I rarely call myself a leader.',
    FearLeadership: 'Making the wrong call in front of people who trusted me.',
    Environment: 'Small-group discussions; Individual reflection'
  });
  confirmMail_preleads_({ FullName: 'Juan Dela Cruz', Nickname: 'Juan', IDNumber: '241234', YearLevel: 2, Course: 'BS ME', Block: '',
    Mobile: '09171234567', HopeToGainPreLEADS: 'To see if LEADS is for me.', DauntingAspects: 'being judged; Other: speaking first' }, me);
  return 'Sent both test confirmations to ' + me;
}
