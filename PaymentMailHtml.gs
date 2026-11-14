/**
 * PaymentMailHtml.gs  (integrator owns this file)
 * The two payment emails' HTML ('received' | 'verified'), built on the SAME structure as the core team's results blasts
 * (the "[LEADS 2627] EMAIL BLAST SHEET" script, Accepted.js / Nathan's design as edited by Keene), which render right in
 * Gmail on iPhone in dark mode. Replaces PaymentMailTemplate.html (Nov 14 2026).
 * Why it holds up in dark mode: every surface is a hosted image tile (background-image, never background-color),
 * text colours are classes re-declared in a dark-mode media query and for Outlook, color-scheme "light only", the
 * Gmail iOS fix div at the end. The message sits on cream paper in a manila folder, so the copy is dark ink on paper.
 * v = payMail_vars_(a, kind) (PaymentMail.gs). Reminders in v are trusted HTML (they use pm_hl_()).
 */
const PM_IMG_ = {
  title: 'https://i.imgur.com/cpAjLSQ.png', grain: 'https://i.imgur.com/02P7pBN.png', rec: 'https://i.imgur.com/n5qzW3m.gif',
  peek: 'https://i.imgur.com/uhoxnzE.gif', bar_blue: 'https://i.imgur.com/ZplW8Fl.png', bar_red: 'https://i.imgur.com/HVlgs0R.png',
  bg_edge: 'https://i.imgur.com/64X5i55.png', bg_grey: 'https://i.imgur.com/BkStD1h.png', bg_manila: 'https://i.imgur.com/5nzgKEm.png',
  bg_outer: 'https://i.imgur.com/V8jQqbw.png', bg_panel: 'https://i.imgur.com/ZtlO7pz.png', bg_paper: 'https://i.imgur.com/LZ8xRXB.png',
  bg_red: 'https://i.imgur.com/oFCz3I1.png', bg_yellow: 'https://i.imgur.com/uZqf0CR.png'
};

function pm_esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
/** a yellow marker highlight on the paper (dark text on a yellow tile), for the reminders */
function pm_hl_(t) { return '<span class="bg-yellow t-yellow" style="background-image:url(\'' + PM_IMG_.bg_yellow + '\');background-repeat:repeat;color:#111100;font-weight:bold;padding:1px 3px;">' + t + '</span>'; }

function payMail_html_(kind, v) {
  const verified = kind === 'verified';
  const C = { outer: '#0c0c0e', panel: '#17181c', panel2: '#101114', paper: '#e6dfc9', paperText: '#211f19', yellow: '#f2ea00', yellowText: '#111100',
              red: '#ff3038', text: '#d8d8d3', muted: '#85858a', headline: '#f0efe9', line: '#3a3a3f', manila: '#d3bc86', manilaDk: '#a8925a' };
  const SW = { '#0c0c0e': 'bg_outer', '#101114': 'bg_outer', '#17181c': 'bg_panel', '#e6dfc9': 'bg_paper', '#d3bc86': 'bg_manila',
               '#f1ecda': 'bg_edge', '#f2ea00': 'bg_yellow', '#ff3038': 'bg_red', '#c0c0c0': 'bg_grey' };
  const sw = c => { const k = SW[String(c).toLowerCase()]; return k ? "background-image:url('" + PM_IMG_[k] + "');background-repeat:repeat;" : ''; };
  const barBg = () => "background-image:url('" + PM_IMG_.bar_blue + "');background-repeat:no-repeat;background-size:100% 100%;";
  const MONO = "'JetBrains Mono', Menlo, Consolas, 'SF Mono', monospace", TYPE = "'Special Elite', 'Courier New', Courier, monospace",
        CLOSE = "'Courier Prime', 'Courier New', Courier, monospace", OS = "'VT323', 'Lucida Console', Monaco, Consolas, monospace";
  const nowClock = Utilities.formatDate(new Date(), 'Asia/Manila', 'HH:mm:ss');
  const NICK = pm_esc_(v.nickUpper), ID = pm_esc_(v.id), name = pm_esc_(v.nickUpper.charAt(0) + v.nickUpper.slice(1).toLowerCase());

  const gif = (key, w, h, alt, style) => '<img src="' + PM_IMG_[key] + '" width="' + w + '" height="' + h + '" alt="' + (alt || '') + '" style="display:block;border:0;outline:none;width:' + w + 'px;max-width:100%;height:auto;' + (style || '') + '">';
  const row = (html, top) => '<tr><td class="pad" style="padding:' + top + 'px 30px 0 30px;">' + html + '</td></tr>';
  const winBtns = () => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>' + ['_', '&#9633;', '&times;'].map(g =>
    '<td width="18" height="16" align="center" valign="middle" style="width:18px;height:16px;' + sw('#c0c0c0') + 'border-top:2px solid #ffffff;border-left:2px solid #ffffff;border-bottom:2px solid #5a5a5a;border-right:2px solid #5a5a5a;font-family:' + MONO + ';font-size:11px;line-height:12px;font-weight:bold;color:#000000;">' + g + '</td>').join('<td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>') + '</tr></table>';
  const strong = t => '<strong class="t-paper" style="color:' + C.paperText + ';">' + t + '</strong>';
  const ru = t => '<strong class="t-paper" style="color:' + C.paperText + ';border-bottom:2px solid #a32620;">' + t + '</strong>';
  const p = (html, last, mb) => '<p class="t-paper" style="margin:0 0 ' + (last ? 0 : (mb === undefined ? 16 : mb)) + 'px 0;font-family:' + TYPE + ';font-size:16px;line-height:25px;color:' + C.paperText + ';">' + html + '</p>';
  const callout = t => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td class="t-rust" style="border-left:4px solid #a32620;padding:2px 0 2px 14px;font-family:' + TYPE + ';font-size:18px;line-height:27px;font-weight:bold;color:#a32620;">' + t + '</td></tr></table>';
  const meta = (label, valueHtml) => '<div style="font-family:' + MONO + ';font-size:11px;line-height:18px;letter-spacing:1px;text-transform:uppercase;"><span class="t-muted" style="color:' + C.muted + ';">' + label + ':</span> <span class="t-text" style="color:' + C.text + ';">' + valueHtml + '</span></div>';
  // MAIN BUTTON: a red rubber stamp (the same as the results emails, Nov 14 2026). Solid #a32620 is the one
  // background-color tested safe in Gmail iOS dark mode; square corners, a dashed cream inner line, label + arrow.
  const button = (href, labelHtml) =>
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 12px 0;">' +
    '<a href="' + pm_esc_(href) + '" target="_blank" class="btn-link" style="display:block;text-decoration:none;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="btn-fill" style="width:100%;background-color:#a32620;border:2px solid #571210;border-radius:3px;box-shadow:0 4px 0 #571210;"><tr><td style="padding:4px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px dashed #f0c9b6;border-radius:2px;"><tr>' +
    '<td align="center" class="btn-t" style="padding:13px 14px;font-family:' + MONO + ';font-size:15px;line-height:21px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#fff4e0;"><span class="t-btn" style="color:#fff4e0;">' + labelHtml + '&nbsp;&nbsp;&#8594;</span></td>' +
    '</tr></table></td></tr></table></a></td></tr></table>';
  // SECOND BUTTON: an outlined ink stamp on the paper (no fill, so dark mode has nothing to flip)
  const button2 = (href, labelHtml) =>
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 0 8px 0;">' +
    '<a href="' + pm_esc_(href) + '" target="_blank" class="btn2-link" style="display:block;text-decoration:none;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #a32620;border-radius:3px;"><tr>' +
    '<td class="t-rust btn2-t" style="padding:9px 16px 8px 16px;font-family:' + MONO + ';font-size:13px;line-height:18px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#a32620;">' + labelHtml + '&nbsp;&nbsp;&#8594;</td>' +
    '</tr></table></a></td></tr></table>';
  const folder = (tab, inner) =>
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-manila t-paper" style="' + sw(C.manila) + 'padding:5px 18px 4px 18px;border-top:2px solid #e7d6a6;border-left:2px solid #e7d6a6;border-right:3px solid ' + C.manilaDk + ';border-radius:7px 7px 0 0;font-family:' + TYPE + ';font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#2b2415;">' + tab + '</td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-manila" style="' + sw(C.manila) + 'border-top:2px solid #e7d6a6;border-left:2px solid #e7d6a6;border-bottom:5px solid ' + C.manilaDk + ';border-right:3px solid ' + C.manilaDk + ';box-shadow:4px 5px 0 rgba(0,0,0,0.5);"><tr><td class="folder-pad" style="padding:12px 12px 16px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="' + sw('#f1ecda') + 'height:7px;font-size:0;line-height:0;border-top:1px solid #c9bf9f;border-left:1px solid #c9bf9f;border-right:1px solid #c9bf9f;">&nbsp;</td></tr></table></td></tr>' +
    '<tr><td>' + inner + '</td></tr></table></td></tr></table>';
  const paper = inner => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-paper" style="' + sw(C.paper) + 'box-shadow:2px 3px 0 rgba(0,0,0,0.3);"><tr><td class="memo-pad body-copy" style="padding:24px 24px 26px 24px;">' + inner + '</td></tr></table>';
  const spacer = h => '<div style="height:' + h + 'px;font-size:0;line-height:0;">&nbsp;</div>';
  const kv = rows => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-top:1px dashed #a8925a;">' + rows.map(r =>
    '<tr><td class="t-paper" valign="top" style="padding:8px 8px 6px 0;width:38%;font-family:' + MONO + ';font-size:11px;line-height:18px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + C.paperText + ';border-bottom:1px dashed #a8925a;">' + pm_esc_(r[0]) + '</td>' +
    '<td class="t-paper" valign="top" style="padding:6px 0;font-family:' + TYPE + ';font-size:16px;line-height:22px;color:' + C.paperText + ';border-bottom:1px dashed #a8925a;">' + pm_esc_(r[1]) + '</td></tr>').join('') + '</table>';
  const btnLabel = () => pm_esc_(String(v.button[0]).replace(/\s*↗$/, ''));
  // the PNF + D&U list and the reminders (both emails: the requirements open once proof is in)
  const reqsBlock = intro => p(intro, false, 10) +
    v.docs.map(d => p(strong(pm_esc_(d.n) + '&nbsp; ' + pm_esc_(d.name) + ' (' + pm_esc_(d.abbr) + ')'), false, d.url ? 0 : 12) +
      (d.url ? button2(d.url, 'Open the ' + pm_esc_(d.abbr) + ' form') + spacer(4) : '')).join('') +
    spacer(8) + callout('IMPORTANT REMINDERS') +
    v.reminders.map((r, i) => p(strong((i + 1) + '.') + ' ' + r, false, 12)).join('') +
    // (the deadline is already in reminder 3, so no separate deadline line)
    p('After you drop them off, come back to the applicant portal and ' + strong('confirm your submission') + ' under ' + pm_hl_('FILE 03: REQUIREMENTS') + '.', false, 4);

  // ---------- the memo ----------
  let memo, tagline, data;
  if (verified) {
    tagline = 'PAYMENT VERIFIED. YOUR FILE IS NOT COMPLETE YET.';
    data = meta('ID NO', ID) + meta('STATUS', '<strong class="t-red" style="color:' + C.red + ';">PAYMENT VERIFIED</strong>') + meta('NEXT', 'PNF + D&amp;U, DROPPED OFF IN PERSON');
    memo = p(strong('All eyes on you, ' + name + '.')) +
      p('We&rsquo;ve been watching, and it looks like you&rsquo;ve taken another step toward discovering what lies beyond your comfort zone.') +
      p('Your payment for ' + strong('EYES ON LEADS 2627') + ' has been ' + ru('received and verified') + '.') +
      callout('BUT YOUR FILE ISN&rsquo;T COMPLETE JUST YET.') +
      reqsBlock('Before you take the leap, there are a few more things we need from you. Prepare these two documents:') +
      button(v.button[1], btnLabel()) +
      spacer(10) + p('Please remain attentive for further instructions.', true);
  } else {
    tagline = 'EVIDENCE RECEIVED. NEXT: YOUR REQUIREMENTS.';
    data = meta('ID NO', ID) + meta('STATUS', '<strong class="t-red" style="color:' + C.red + ';">PROOF RECEIVED</strong>') + meta('NEXT', 'PNF + D&amp;U, DROPPED OFF IN PERSON');
    // no "this is not the confirmation yet" (core team, Nov 14 2026): they move straight on to the requirements,
    // and the core team texts anyone whose payment has a problem
    memo = p(strong('We saw it, ' + name + '.')) +
      p('Your proof of payment for ' + strong('EYES ON LEADS 2627') + ' is in your file now.') +
      kv(v.receipt) +
      (v.finAidNote ? p(pm_hl_(pm_esc_(v.finAidNote))) : '') +
      callout('NEXT: YOUR REQUIREMENTS') +
      reqsBlock('Your requirements are open now. Prepare these two documents:') +
      button(v.button[1], btnLabel()) +
      spacer(10) + p('If anything is off with your payment, the core team will text you. Sent the wrong file? Upload the right one on the payment page; we check the latest one.', true);
  }

  return '<!DOCTYPE html>\n<html lang="en" xmlns="http://www.w3.org/1999/xhtml">\n<head>\n' +
'  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta http-equiv="X-UA-Compatible" content="IE=edge">\n' +
'  <meta name="x-apple-disable-message-reformatting">\n  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">\n' +
'  <meta name="color-scheme" content="light only">\n  <meta name="supported-color-schemes" content="light">\n' +
'  <title>' + pm_esc_(v.subject) + '</title>\n' +
'  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Special+Elite&family=VT323&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">\n' +
'  <style>\n' +
'    :root { color-scheme: light only; supported-color-schemes: light; }\n' +
"    html, body { background-image:url('" + PM_IMG_.bg_outer + "'); }\n" +
'    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }\n    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }\n' +
'    table { border-collapse:separate; border-spacing:0; }\n    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }\n    a { text-decoration:none; }\n' +
'    u + .body .gmail-fix { display:none; }\n' +
'    a.btn-link:hover table.btn-fill { background-color:#b83029 !important; }\n    a.btn-link:active table.btn-fill { box-shadow:0 1px 0 #571210 !important; }\n' +
'    a.btn2-link:hover td.btn2-t { color:#7d1b16 !important; }\n' +
'    @media (prefers-color-scheme: dark) {\n' +
'      .t-text { color:' + C.text + ' !important; } .t-head { color:' + C.headline + ' !important; } .t-muted { color:' + C.muted + ' !important; }\n' +
'      .t-red { color:' + C.red + ' !important; } .t-paper { color:' + C.paperText + ' !important; } .t-yellow { color:' + C.yellowText + ' !important; } .t-rust { color:#a32620 !important; } .t-btn { color:#fff4e0 !important; }\n' +
'    }\n' +
'    [data-ogsc] .t-text { color:' + C.text + ' !important; } [data-ogsc] .t-head { color:' + C.headline + ' !important; } [data-ogsc] .t-muted { color:' + C.muted + ' !important; }\n' +
'    [data-ogsc] .t-red { color:' + C.red + ' !important; } [data-ogsc] .t-paper { color:' + C.paperText + ' !important; } [data-ogsc] .t-yellow { color:' + C.yellowText + ' !important; } [data-ogsc] .t-rust { color:#a32620 !important; } [data-ogsc] .t-btn { color:#fff4e0 !important; }\n' +
'    @media only screen and (max-width:480px) {\n' +
'      .stack { display:block !important; width:100% !important; } .peek-cell { padding:12px 0 0 0 !important; text-align:left !important; } .peek-cell img { margin:0 !important; }\n' +
'      .container { width:100% !important; } .pad { padding-left:16px !important; padding-right:16px !important; } .top-pad { padding-left:16px !important; padding-right:16px !important; }\n' +
'      .memo-pad { padding-left:18px !important; padding-right:18px !important; } .h2 { font-size:19px !important; line-height:25px !important; } .tagline { font-size:12px !important; line-height:18px !important; }\n' +
'      .folder-pad { padding-left:8px !important; padding-right:8px !important; }\n' +
'      .btn-t { font-size:13px !important; line-height:19px !important; letter-spacing:1px !important; padding-left:8px !important; padding-right:8px !important; }\n' +
'      .btn2-t { font-size:12px !important; letter-spacing:1px !important; padding-left:12px !important; padding-right:12px !important; }\n' +
'      .frame-pad { padding-left:6px !important; padding-right:6px !important; } .mobile-hide { display:none !important; }\n' +
'      .win-title { font-size:13px !important; letter-spacing:0 !important; } .rec-bar { font-size:9px !important; letter-spacing:1px !important; padding-left:14px !important; padding-right:14px !important; }\n' +
'    }\n' +
'  </style>\n</head>\n' +
'<body class="body bg-outer" style="margin:0;padding:0;' + sw(C.outer) + '">\n' +
'  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:' + C.outer + ';">' + pm_esc_(v.preheader) + ' &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>\n' +
'  <table role="presentation" class="bg-outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="' + sw(C.outer) + '"><tr>\n' +
'  <td align="center" class="bg-outer frame-pad" style="padding:20px 10px 30px 10px;' + sw(C.outer) + '">\n' +
'  <table role="presentation" class="container bg-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-image:url(\'' + PM_IMG_.grain + '\');background-repeat:repeat;border-top:2px solid #707070;border-left:2px solid #707070;border-bottom:2px solid #000000;border-right:2px solid #000000;">\n' +
    // title bar
'    <tr><td style="' + barBg() + 'padding:3px 4px 3px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
'<td class="top-pad win-title" valign="middle" style="font-family:' + OS + ';font-size:13px;line-height:21px;letter-spacing:1px;color:#ffffff;text-transform:uppercase;white-space:nowrap;">&#9673;&nbsp; EYES ON LEADS<span class="mobile-hide"> // ' + pm_esc_(String(v.windowName).toUpperCase()) + '</span></td>' +
'<td align="right" valign="middle" style="width:66px;white-space:nowrap;">' + winBtns() + '</td></tr></table></td></tr>\n' +
    // REC bar
'    <tr><td class="pad rec-bar bg-panel2" style="padding:8px 26px;' + sw(C.panel2) + 'border-bottom:1px solid ' + C.line + ';font-family:' + MONO + ';font-size:10px;line-height:17px;letter-spacing:2px;text-transform:uppercase;">' +
'<img src="' + PM_IMG_.rec + '" width="14" height="14" alt="&#9679;" style="display:inline-block;vertical-align:middle;border:0;width:14px;height:14px;"> <span class="t-red" style="color:' + C.red + ';font-weight:bold;">REC</span> ' +
'<span class="t-muted" style="color:' + C.muted + ';"><span class="mobile-hide">&nbsp;&nbsp; CAM 01 </span>&nbsp;&nbsp;<strong class="t-head" style="color:' + C.headline + ';">' + nowClock + '</strong>&nbsp;&nbsp;//&nbsp;&nbsp;SUBJECT: ' + NICK + '</span></td></tr>\n' +
    // headline
'    <tr><td class="pad" style="padding:24px 30px 0 30px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="bg-yellow" style="' + sw(C.yellow) + 'padding:4px 10px;font-family:' + MONO + ';font-size:12px;line-height:15px;font-weight:bold;letter-spacing:2px;color:' + C.yellowText + ';text-transform:uppercase;"><span class="t-yellow" style="color:' + C.yellowText + ';">CASE FILE // ' + ID + '</span></td></tr></table>' +
'<div style="padding-top:12px;font-size:0;line-height:0;">' + gif('title', 534, 96, 'EYES ON LEADS', 'width:100%;') + '</div>' +
'<div class="tagline t-red" style="padding-top:16px;font-family:' + MONO + ';font-size:14px;line-height:20px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:' + C.red + ';">' + tagline + '</div></td></tr>\n' +
    // data block + the memo in its folder
    row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid ' + C.red + ';padding:1px 0 1px 12px;">' + data + '</td></tr></table>', 24) +
    row(folder(verified ? 'FILE 03 // REQUIREMENTS' : 'FILE 02 // PROOF OF PAYMENT', paper(memo)), 16) +
    // closing line + the eye
'    <tr><td class="pad" style="padding:30px 30px 14px 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
'<td class="stack" valign="middle" style="vertical-align:middle;"><div class="h2 t-head" style="font-family:' + CLOSE + ';font-size:22px;line-height:29px;font-weight:bold;text-transform:uppercase;color:' + C.headline + ';border-left:5px solid ' + C.red + ';padding-left:15px;">We have been watching.<br><span class="t-red" style="color:' + C.red + ';">' + pm_esc_(v.closing) + '</span></div>' +
'<div class="t-muted" style="padding:10px 0 0 20px;font-family:' + MONO + ';font-size:12px;line-height:18px;font-weight:bold;letter-spacing:2px;color:' + C.muted + ';text-transform:uppercase;">Observation continues,<br>I.R.I.S.</div></td>' +
'<td class="stack peek-cell" width="100" align="right" valign="middle" style="width:100px;vertical-align:middle;padding-left:12px;font-size:0;line-height:0;">' + gif('peek', 90, 48, 'One last eye', 'display:block;margin:0 0 0 auto;') + '</td></tr></table></td></tr>\n' +
    // footer
'    <tr><td class="pad bg-panel" style="padding:12px 30px;' + sw(C.panel) + 'border-top:1px solid ' + C.line + ';font-family:' + MONO + ';font-size:10px;line-height:16px;letter-spacing:1px;color:' + C.muted + ';"><span class="t-muted" style="color:' + C.muted + ';">' +
'Questions? Reply to this email, or message ' + v.contacts + '.<br><br>EYES ON LEADS &middot; A LEADERSHIP DEVELOPMENT PROJECT OF MEA &middot; CASE FILE 26/27 &middot; I.R.I.S. IS WATCHING</span></td></tr>\n' +
'  </table>\n' +
'  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;"><tr><td align="center" class="t-muted" style="padding:10px 10px 0 10px;font-family:' + MONO + ';font-size:9px;line-height:13px;letter-spacing:1px;color:' + C.muted + ';text-transform:uppercase;">CAM 01 // RECORDING ACTIVE // ' + nowClock + ' // ' + ID + '</td></tr></table>\n' +
'  </td></tr></table>\n' +
'  <div class="gmail-fix" style="display:none;white-space:nowrap;font:15px courier;line-height:0;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>\n' +
'</body>\n</html>';
}
