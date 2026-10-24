/**
 * ConfirmMail.gs  (integrator owns this file)
 * The confirmation emails: one when someone files their LEADS application (apply_submit_, ApplyApi.gs), one when someone
 * registers for THE LEADS UP (preleads_submit_, PreLeadsServer.gs). Each shows their answers (not the Game) in the same
 * CRT / surveillance look as the Eyes on LEADS email blast (the standalone "email blast" Apps Script project): a 600px
 * table layout, Win95 title bars, a manila folder of paper pages, JetBrains Mono with system monospace fallbacks, colors
 * re-declared for dark mode so mail apps don't invert them, and a plain-text version for clients without HTML.
 *
 * Sending never breaks a submit: it runs after the lock, any failure is logged (WARN) and the application stands.
 * MailApp quota (school account): about 1,500 recipients a day; one email per submit.
 * Run confirm_testEmails() from the editor (owner only) to send both to yourself with sample answers.
 */

const MAIL_C_ = {
  outer: '#08090b', card: '#0d0e12', panel: '#17181c', panel2: '#101114',
  paper: '#e6dfc9', paperText: '#211f19', tan: '#cdbb8a',
  yellow: '#f2ea00', yellowText: '#111100', red: '#ff3038', blue: '#263fd4',
  text: '#d8d8d3', muted: '#85858a', headline: '#f0efe9', line: '#3a3a3f', windowBar: '#b9b9b5', windowText: '#171717'
};
const MAIL_MONO_ = "'JetBrains Mono', Menlo, Consolas, 'SF Mono', 'Courier New', monospace";

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
  const facts = [['FILE NO.', a.ApplicantID], ['STATUS', 'SUBMITTED'], ['WHEN', String(s.EventDates || 'January 29 to 31, 2027')],
    ['YOUR CODE', a.ReferralCode || '—']];
  const next = [
    ['01', 'Review', 'The core team reads every file. Results come out on the portal; we will email you when they do.', true],
    ['02', 'Proof of payment', 'Once accepted: scan the QR, pay, upload your proof. Nothing is due before that.', false],
    ['03', 'Requirements', 'After payment is verified: the forms to fill in.', false],
    ['04', '1st GA', 'Your first general assembly. Date to be set.', false],
    ['05', 'Room booking', 'Where you sleep at camp. Earlier picks for more referral points.', false]
  ];
  return confirmSend_(a.Email, {
    subject: 'File received: ' + a.ApplicantID + ' · Eyes on LEADS',
    preheader: 'Your LEADS application is on record. Your answers are inside.',
    nick: nick, tag: 'CASE FILE 26//27 · ' + a.ApplicantID, headline: 'FILE<br>RECEIVED',
    tagline: 'YOU ARE NOW ON RECORD.',
    intro: 'Hi ' + nick + ', your application to LEADS is filed. This is what you sent us. Keep it: you can\'t change it anymore, and you don\'t need to.',
    facts: facts, folderTab: 'CASE FILE ' + a.ApplicantID + ' · YOUR ANSWERS', sections: sections,
    referral: a.ReferralCode ? 'Your referral code is <b>' + confirmEsc_(a.ReferralCode) + '</b>. Each person who applies with it earns you a point toward room booking and other advantages at camp.' : '',
    next: next, button: ['Check your file on the portal', portalUrl_()],
    closing: 'We have been watching.<br><span style="color:' + MAIL_C_.red + ';">Now we are reading.</span>'
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
    nick: nick, tag: 'FILE 02-A // THE LEADS UP', headline: 'SEAT<br>RESERVED',
    tagline: 'SEE YOU THERE. WE WILL SEE YOU FIRST.',
    intro: 'Hi ' + nick + ', you are registered for THE LEADS UP, a one-day, onsite preview of LEADS. This is what you sent us.',
    facts: [['WHEN', [when, time].filter(Boolean).join(' · ')], ['WHERE', where || 'Onsite'], ['WHAT', 'A preview of LEADS']],
    folderTab: 'FILE 02-A · YOUR ANSWERS', sections: sections, referral: '',
    next: [['01', 'Show up', 'Come on time. Bring yourself; the rest is provided.', true],
      ['02', 'Apply to LEADS', 'Applications for the camp itself are open on the portal.', false]],
    button: ['Open the portal', portalUrl_()],
    closing: 'We have been watching.<br><span style="color:' + MAIL_C_.red + ';">See you on the inside.</span>'
  }, 'preleads');
}

/** Builds and sends one confirmation. Never throws: returns true when sent. */
function confirmSend_(to, o, page) {
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) return false;
    if (MailApp.getRemainingDailyQuota() < 1) { activity_('confirm_mail', 'daily email quota used up: not sent to ' + to, { level: 'WARN', page: page }); return false; }
    const opts = { name: String(getSetting_('EventName') || 'LEADS').trim() || 'LEADS', htmlBody: confirmHtml_(o), inlineImages: mailGifs_() };
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

function confirmHtml_(o) {
  const C = MAIL_C_, MONO = MAIL_MONO_, E = confirmEsc_;
  const now = Utilities.formatDate(new Date(), 'Asia/Manila', 'HH:mm:ss');
  const bev = up => up
    ? 'border-top:2px solid #86878f;border-left:2px solid #86878f;border-bottom:2px solid #030304;border-right:2px solid #030304;'
    : 'border-top:2px solid #030304;border-left:2px solid #030304;border-bottom:2px solid #86878f;border-right:2px solid #86878f;';
  const gif = (name, w, h, alt, style) =>
    `<img src="cid:live_${name}" width="${w}" height="${h}" alt="${alt || ''}" style="display:block;border:0;outline:none;width:${w}px;max-width:100%;height:auto;${style || ''}">`;
  const winBtns = () => ['_', '&#9633;', '&times;'].map(b =>
    `<span style="display:inline-block;background-color:#b9b9b5;border-top:2px solid #e4e4e0;border-left:2px solid #e4e4e0;border-bottom:2px solid #030304;border-right:2px solid #030304;padding:0 5px;margin-left:3px;font-family:${MONO};font-size:10px;line-height:12px;font-weight:bold;color:#171717;">${b}</span>`).join('');
  const row = (html, top) => `<tr><td class="pad" style="padding:${top}px 30px 0 30px;">${html}</td></tr>`;
  const stamp = t => `<span style="display:inline-block;transform:rotate(-4deg);border:2px solid #a32620;padding:1px 6px;font-family:${MONO};font-size:10px;line-height:14px;font-weight:bold;letter-spacing:2px;color:#a32620;">${t}</span>`;
  const monitor = (label, kind) => {
    const dark = kind === 'nosig', frame = dark ? '#1d1e22' : '#cfc8b4', hi = dark ? '#55565c' : '#f1ecde', lo = dark ? '#050506' : '#8d8670';
    const screen = kind === 'eye_g' ? '#5f6064' : kind === 'eye_r' ? '#8f5b53' : '#4d4e52', lab = dark ? '#d8d8d3' : '#211f19';
    return `<td width="33%" valign="top" style="padding:0 5px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${frame}" style="background-color:${frame};border-top:2px solid ${hi};border-left:2px solid ${hi};border-bottom:3px solid ${lo};border-right:3px solid ${lo};border-radius:12px;box-shadow:4px 5px 0 #020203;">
        <tr><td style="padding:7px 7px 2px 7px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="${screen}" style="padding:0;background-color:${screen};border-top:3px solid #0a0a0b;border-left:3px solid #0a0a0b;border-bottom:2px solid #9a9ba0;border-right:2px solid #9a9ba0;border-radius:10px;font-size:0;line-height:0;">${gif(kind, 150, 76, dark ? 'NO SIGNAL' : 'Watching eye', 'width:100%;')}</td>
        </tr></table></td></tr>
        <tr><td style="padding:1px 10px 7px 10px;font-family:${MONO};font-size:9px;line-height:12px;font-weight:bold;letter-spacing:2px;color:${lab};"><span style="color:#d6262d;">&#9679;</span> ${label}</td></tr>
      </table></td>`;
  };
  const fact = (label, value) => `<tr>
      <td width="120" valign="top" class="fact-label t-red" style="width:120px;padding:9px 14px 9px 0;border-bottom:1px dashed ${C.line};font-family:${MONO};font-size:12px;line-height:24px;font-weight:bold;letter-spacing:3px;color:${C.red};">${E(label)}</td>
      <td valign="top" style="padding:9px 0;border-bottom:1px dashed ${C.line};font-family:${MONO};font-size:14px;line-height:24px;font-weight:bold;"><span class="t-head" style="color:${C.headline};border-bottom:3px solid ${C.red};padding-bottom:1px;">${E(value)}</span></td></tr>`;
  const win = (title, inner) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-panel" bgcolor="${C.panel}" style="background-color:${C.panel};${bev(true)}box-shadow:6px 6px 0 ${C.blue};">
        <tr><td bgcolor="#a3141a" style="background-color:#a3141a;background-image:linear-gradient(180deg,#a3141a,#5e0b0f);padding:4px 8px;border-bottom:2px solid #050505;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-family:${MONO};font-size:10px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#f0e8df;text-transform:uppercase;">${title}</td>
            <td align="right" class="mobile-hide" style="white-space:nowrap;">${winBtns()}</td></tr></table></td></tr>
        <tr><td>${inner}</td></tr></table>`;
  // one Q/A on a paper page: the question small and red-brown, the answer as typed (line breaks kept)
  const qa = (q, ans) => `
      <div class="t-paper" style="font-family:${MONO};font-size:10px;line-height:15px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#7a2a20;padding-top:10px;">${E(q)}</div>
      <div class="t-paper" style="font-family:${MONO};font-size:14px;line-height:22px;color:${C.paperText};padding:3px 0 10px 0;border-bottom:1px dashed #b4ab90;word-break:break-word;overflow-wrap:anywhere;">${E(ans === undefined || ans === null || ans === '' ? '—' : ans).replace(/\r?\n/g, '<br>')}</div>`;
  const pg = (label, items, flip) => `
      <tr><td style="padding:0 ${flip ? 0 : 8}px 12px ${flip ? 8 : 0}px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-paper" bgcolor="${C.paper}" style="background-color:${C.paper};border-top:1px solid #f7f2e2;border-bottom:3px solid #b8b096;border-right:2px solid #b8b096;box-shadow:3px 4px 0 rgba(0,0,0,0.28);">
          <tr><td style="padding:6px 14px;border-bottom:1px dashed #8c856f;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td class="t-paper" style="font-family:${MONO};font-size:10px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${C.paperText};">${E(label)}</td>
            <td align="right" style="white-space:nowrap;">${stamp('ON RECORD')}</td></tr></table></td></tr>
          <tr><td class="body-copy" style="padding:4px 18px 12px 18px;">${items.map(x => qa(x[0], x[1])).join('')}</td></tr>
        </table></td></tr>`;
  const folder = (tab, pages) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-tan t-paper" bgcolor="${C.tan}" style="background-color:${C.tan};padding:5px 16px 4px 16px;border-top:2px solid #e8dcb4;border-left:2px solid #e8dcb4;border-right:3px solid #8f8258;border-radius:8px 8px 0 0;font-family:${MONO};font-size:11px;line-height:15px;font-weight:bold;letter-spacing:2px;color:${C.paperText};text-transform:uppercase;">${E(tab)}</td></tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-tan" bgcolor="${C.tan}" style="background-color:${C.tan};background-image:linear-gradient(180deg,#dccb9c,${C.tan});border-top:2px solid #e8dcb4;border-left:2px solid #e8dcb4;border-bottom:5px solid #8f8258;border-right:3px solid #8f8258;box-shadow:6px 6px 0 #020203;">
        <tr><td style="padding:12px 12px 2px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${pages}</table></td></tr></table>`;
  const step = (n, name, desc, open, last) => `<tr>
      <td style="padding:8px 14px;${last ? '' : 'border-bottom:1px dashed ' + C.line + ';'}">
        <div class="t-head" style="font-family:${MONO};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${open ? C.yellow : C.headline};">${n} &nbsp;${E(name)}</div>
        <div class="t-muted" style="font-family:${MONO};font-size:12px;line-height:18px;color:${C.muted};">${E(desc)}</div></td>
      <td align="right" valign="top" style="padding:9px 14px 8px 0;${last ? '' : 'border-bottom:1px dashed ' + C.line + ';'}white-space:nowrap;">${open
        ? `<span style="display:inline-block;background-color:${C.yellow};padding:2px 7px;font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;color:${C.yellowText};">NOW</span>`
        : `<span style="display:inline-block;border:1px solid #6c6c72;padding:2px 7px;font-family:${MONO};font-size:10px;letter-spacing:2px;color:${C.muted};">LOCKED</span>`}</td></tr>`;
  const button = (label, href) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="btn-table" style="width:100%;margin:0 0 10px 0;"><tr>
        <td class="btn-cell" align="center" bgcolor="${C.red}" style="background-color:${C.red};background-image:linear-gradient(180deg,#ff8a8e,${C.red} 40%);border-top:3px solid #ff8a8e;border-left:3px solid #ff8a8e;border-bottom:3px solid #7a0a10;border-right:3px solid #7a0a10;box-shadow:5px 5px 0 #050505;">
          <a href="${E(href)}" target="_blank" class="btn-link" style="display:block;padding:18px 14px;font-family:${MONO};font-size:17px;line-height:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${E(label)}</a></td></tr></table>`;

  const pages = o.sections.map((sec, i) => pg(sec[0], sec[1], i % 2 === 1)).join('');
  const nextRows = o.next.map((x, i) => step(x[0], x[1], x[2], x[3], i === o.next.length - 1)).join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
  <title>${E(o.subject)}</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
    :root { color-scheme: light only; supported-color-schemes: light only; }
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    table { border-collapse:separate; border-spacing:0; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    a { text-decoration:none; }
    @media (prefers-color-scheme: dark) {
      body, .body, .bg-outer { background-color:${C.outer} !important; }
      .bg-card { background-color:${C.card} !important; } .bg-panel { background-color:${C.panel} !important; } .bg-panel2 { background-color:${C.panel2} !important; }
      .bg-paper { background-color:${C.paper} !important; } .bg-tan { background-color:${C.tan} !important; } .bg-yellow { background-color:${C.yellow} !important; }
      .t-text { color:${C.text} !important; } .t-head { color:${C.headline} !important; } .t-muted { color:${C.muted} !important; }
      .t-red { color:${C.red} !important; } .t-paper { color:${C.paperText} !important; } .t-yellow { color:${C.yellowText} !important; }
    }
    [data-ogsc] .t-text { color:${C.text} !important; } [data-ogsc] .t-head { color:${C.headline} !important; } [data-ogsc] .t-muted { color:${C.muted} !important; }
    [data-ogsc] .t-red { color:${C.red} !important; } [data-ogsc] .t-paper { color:${C.paperText} !important; } [data-ogsc] .t-yellow { color:${C.yellowText} !important; }
    [data-ogsb] .bg-outer { background-color:${C.outer} !important; } [data-ogsb] .bg-card { background-color:${C.card} !important; }
    [data-ogsb] .bg-panel { background-color:${C.panel} !important; } [data-ogsb] .bg-panel2 { background-color:${C.panel2} !important; }
    [data-ogsb] .bg-paper { background-color:${C.paper} !important; } [data-ogsb] .bg-tan { background-color:${C.tan} !important; } [data-ogsb] .bg-yellow { background-color:${C.yellow} !important; }
    @media only screen and (max-width:480px) {
      .container { width:100% !important; } .pad { padding-left:16px !important; padding-right:16px !important; }
      .h1 { font-size:44px !important; line-height:42px !important; letter-spacing:-2px !important; }
      .h2 { font-size:18px !important; line-height:24px !important; } .body-copy { font-size:14px !important; line-height:22px !important; }
      .btn-link { font-size:15px !important; } .mobile-hide { display:none !important; } .fact-label { width:92px !important; } .peek-pad { padding-right:40px !important; }
    }
  </style>
</head>
<body class="body bg-outer" bgcolor="${C.outer}" style="margin:0;padding:0;background-color:${C.outer};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.outer};">${E(o.preheader)} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-outer" bgcolor="${C.outer}" style="background-color:${C.outer};background-image:linear-gradient(180deg,#0a0c1a,${C.outer} 420px);">
    <tr><td align="center" style="padding:16px 10px 30px 10px;">
      <table role="presentation" class="container bg-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="width:600px;max-width:600px;background-color:${C.card};${bev(true)}box-shadow:10px 10px 0 #020203, 0 0 40px rgba(38,63,212,0.25);">
        <tr><td bgcolor="${C.windowBar}" style="background-color:${C.windowBar};background-image:linear-gradient(180deg,#d2d2ce,#9d9d99);padding:0;border-bottom:3px solid #080808;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td class="pad" style="padding:6px 12px;font-family:${MONO};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:1px;color:${C.windowText};text-transform:uppercase;">&#9673;&nbsp; EYES ON LEADS</td>
            <td align="right" class="mobile-hide" style="padding:4px 9px;white-space:nowrap;">${winBtns()}</td></tr></table></td></tr>
        <tr><td class="pad bg-panel2" bgcolor="${C.panel2}" style="padding:8px 26px;background-color:${C.panel2};border-bottom:1px solid ${C.line};font-family:${MONO};font-size:10px;line-height:17px;letter-spacing:2px;text-transform:uppercase;">
          <img src="cid:live_rec" width="14" height="14" alt="&#9679;" style="display:inline-block;vertical-align:middle;border:0;width:14px;height:14px;">
          <span class="t-red" style="color:${C.red};font-weight:bold;">REC</span>
          <span class="t-muted" style="color:${C.muted};">&nbsp;&nbsp; CAM 01 &nbsp;&nbsp;<strong style="color:${C.headline};">${now}</strong>&nbsp;&nbsp;//&nbsp;&nbsp;SUBJECT: ${E(o.nick)}</span></td></tr>
        <tr><td class="pad" style="padding:22px 30px 0 30px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="transform:rotate(-2deg);"><tr>
            <td class="bg-yellow" bgcolor="${C.yellow}" style="background-color:${C.yellow};padding:4px 10px;border-top:2px solid #fffc9a;border-left:2px solid #fffc9a;border-bottom:2px solid #9b9700;border-right:2px solid #9b9700;box-shadow:4px 4px 0 ${C.blue};font-family:${MONO};font-size:12px;line-height:15px;font-weight:bold;letter-spacing:2px;color:${C.yellowText};text-transform:uppercase;"><span class="t-yellow" style="color:${C.yellowText};">${E(o.tag)}</span></td></tr></table>
          <div class="h1 t-head" style="padding-top:10px;font-family:${MONO};font-size:56px;line-height:54px;font-weight:800;text-transform:uppercase;color:${C.headline};letter-spacing:-2px;text-shadow:1px 1px 0 ${C.blue},2px 2px 0 ${C.blue},3px 3px 0 ${C.blue},4px 4px 0 #1a2a9a,-2px -2px 0 ${C.red};">${o.headline}</div>
          <div class="t-red" style="padding-top:16px;font-family:${MONO};font-size:14px;line-height:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${C.red};">${E(o.tagline)}</div>
          <div class="t-text body-copy" style="padding-top:14px;font-family:${MONO};font-size:14px;line-height:23px;color:${C.text};">${E(o.intro)}</div></td></tr>
        <tr><td class="pad" style="padding:20px 25px 0 25px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          ${monitor('CH 03', 'eye_g')}${monitor('CH 04', 'nosig')}${monitor('CH 07', 'eye_r')}</tr></table></td></tr>
        ${row(win('FILE_RECEIVED.EXE', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:6px 14px 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${o.facts.map(f => fact(f[0], f[1])).join('')}</table></td></tr>
            ${o.referral ? `<tr><td class="t-text" style="padding:12px 14px 0 14px;font-family:${MONO};font-size:13px;line-height:21px;color:${C.text};">${o.referral}</td></tr>` : ''}
            <tr><td style="padding:16px 14px 8px 14px;">${button(o.button[0], o.button[1])}</td></tr></table>`), 24)}
        <tr><td style="padding:24px 0 0 0;"></td></tr>
        <tr><td bgcolor="${C.yellow}" class="bg-yellow t-yellow" style="background-color:${C.yellow};padding:7px 30px;font-family:${MONO};font-size:13px;line-height:18px;font-weight:bold;letter-spacing:2px;color:${C.yellowText};text-transform:uppercase;white-space:nowrap;overflow:hidden;">I.R.I.S. IS WATCHING /// YOUR ANSWERS ARE ON RECORD /// I.R.I.S. IS WATCHING</td></tr>
        ${row(folder(o.folderTab, pages), 24)}
        <tr><td class="pad" style="padding:26px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2a2b30" style="background-color:#2a2b30;background-image:linear-gradient(180deg,#3a3b41,#222328);${bev(true)}box-shadow:6px 6px 0 #050505;">
            <tr><td align="center" style="padding:12px 16px 10px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-paper t-paper" bgcolor="${C.paper}" style="background-color:${C.paper};border:2px solid #8c856f;padding:5px 16px;font-family:${MONO};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:3px;color:${C.paperText};text-transform:uppercase;">NEXT STEPS</td></tr></table></td></tr>
            <tr><td style="padding:0 12px 12px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel2}" class="bg-panel2" style="background-color:${C.panel2};${bev(false)}">${nextRows}</table></td></tr>
          </table></td></tr>
        <tr><td class="pad" style="padding:28px 30px 0 30px;">
          <div class="h2 t-head" style="font-family:${MONO};font-size:22px;line-height:29px;font-weight:800;text-transform:uppercase;color:${C.headline};border-left:5px solid ${C.red};padding-left:15px;">${o.closing}</div></td></tr>
        <tr><td align="right" class="peek-pad" style="padding:6px 60px 0 30px;font-size:0;line-height:0;">${gif('peek', 90, 48, 'One last eye', 'margin:0 0 -22px auto;')}</td></tr>
        <tr><td class="pad bg-panel" bgcolor="${C.panel}" style="padding:12px 30px;background-color:${C.panel};border-top:2px solid #55565c;font-family:${MONO};font-size:9px;line-height:16px;letter-spacing:1px;color:${C.muted};">
          <span class="t-muted" style="color:${C.muted};">EYES ON LEADS &middot; A LEADERSHIP DEVELOPMENT PROJECT OF MEA &middot; CASE FILE 26//27 &middot; THIS IS AN AUTOMATIC CONFIRMATION. REPLY IF SOMETHING LOOKS WRONG.</span></td></tr>
      </table>
      <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;"><tr>
        <td align="center" style="padding:10px 10px 0 10px;font-family:${MONO};font-size:8px;line-height:13px;letter-spacing:2px;color:#515156;text-transform:uppercase;">CAM 01 // RECORDING ACTIVE // ${now} // CASE 26/27</td></tr></table>
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
