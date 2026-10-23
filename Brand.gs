/**
 * Brand.gs  —  EVERYTHING that makes this portal "LEADS" lives here.
 *
 * To port the portal to another org/project:
 *   1. Copy the whole Apps Script project (or every .gs/.html file).
 *   2. Edit ONLY this file: names, copy, colors, fonts, effects.
 *   3. In the Sheet: Settings (event, deadlines, domains, contact, step switches), Requirements (one row per
 *      Google Form), Admins (core team emails). No other code changes needed.
 *
 * Rules:
 *   - Plain text only in copy fields (no HTML). It's escaped before showing.
 *   - Colors are any CSS color. Keep text readable on `bg` and `card`.
 *   - Fonts must exist on Google Fonts; update `googleFontsUrl` to match.
 *   - Keys in `statusCopy` must match STATUSES in Utils.gs. `modules` are the hub's cards (Home.html).
 */
const BRAND = {
  /* ---------- identity ---------- */
  // Title: Eyes on LEADS (was LEADS: Oversight). Theme: oversight = (1) watchful supervision, (2) an inadvertent error.
  // Fears: being watched, feeling boxed in, failing. Mood: a surveillance case file, 1984-style.
  org: 'LEADS',
  parentOrg: 'MEA',
  portalName: 'Eyes on LEADS',            // browser tab title
  logoText: 'Eyes on ',
  logoAccent: 'LEADS',                    // colored part after the logo

  /* ---------- home page copy ---------- */
  hero: {
    eyebrow: 'MEA leadership camp',       // shown as "<event> · <eyebrow> · applications open"
    kicker: 'Case file 26/27',            // yellow tape label above the headline
    headline: 'Eyes on LEADS',
    tagline: 'Someone is already watching. Apply anyway.',
    hint: 'About 15 minutes: the form, then a short assessment. One application per person. We will know if you try twice.',   // under the main button, before applying
    redact: [],                            // words in the lede shown as black bars until hovered or tapped (empty = off)
    // the project description (RecSec, Oct 2026): also shown at the top of the Apply form as "What is LEADS?"
    lede: 'LEADS is a leadership development project built on shared experience, meaningful connection, and honest ' +
          'self-reflection. It encourages members to confront their fears, question what they think leadership is, and to ' +
          'look at the person doing the leading. Because leading well starts with facing what scares you. This year, the study is you.'
  },
  buttons: {
    apply: 'Start your application',
    applySignIn: 'Sign in to apply',          // the main button for guests
    applyWrongAccount: 'Switch to your Ateneo account',   // signed in, but not with an Ateneo account
    applyClosed: 'Applications are closed',
    status: 'Check my status',
    applied: 'You already applied',
    upload: 'Send requirements',
    pay: 'Send proof of payment',
    room: 'Book your room',
    admin: 'Open the Sheet',
    signOut: 'Sign out',                  // signs out of Google in this browser, then back to the portal
    signIn: 'Sign in',
    switchAccount: 'Switch account'
  },
  countdown: {
    title: 'Time left to decide',
    closed: 'Applications are closed',
    closedText: 'The application window has ended.',
    tba: 'Deadline to be announced.',
    campLabel: 'Camp: ',                 // + the date. Camp start = Settings › CampStart, else the first date in EventDates
    campStarted: 'Camp is in session',
    campStartedText: 'You are on site. Look up.',
    // Home's deadline queue (Home.html): the nearest open step gets the big clock, the next one shows under it
    steps: {
      apply: { title: 'Time left to decide', kicker: '01 · APPLICATION' },
      pay:   { title: 'Proof of payment due', kicker: '02 · PAYMENT' },
      reqs:  { title: 'Requirements due', kicker: '03 · REQUIREMENTS' },
      camp:  { title: 'Camp starts in', kicker: '05 · CAMP' }
    },
    deadline: 'Deadline: ',
    due: 'Due ',
    passed: 'Passed',
    stepClosed: ': deadline passed',    // a payment/requirements deadline went by (uploads still work, so not "closed")
    allClear: 'All steps cleared',
    allClearText: 'Your file is complete. Wait for the camp briefing.',
    confirmed: 'confirmed camper',
    reviewTitle: 'File under review',
    reviewText: "No deadline for you right now. We'll tell you when it's your move.",
    actionTitle: 'Your move',            // a step is open for them but has no deadline set
    actionText: 'No deadline set yet. Next: {step}.',
    waitingTitle: 'Proof received',      // they sent something; the core team is checking it
    waitingText: 'Waiting on the core team. Nothing to do yet.',
    applyOpen: 'applications open',
    applyClosedPill: 'applications closed',
    loading: 'loading',
    endedTitle: 'File closed',
    endedText: 'This file is closed. Thank you for applying.',
    // I.R.I.S. as a deadline gets close ({step} = the step's title)
    alarms: {
      t72: ['thinking', '{step}: three days left.'],
      t48: ['thinking', '{step}: two days left. Just saying.'],
      t24: ['scared', '{step}: less than a day left.'],
      t12: ['scared', '{step}: under twelve hours. I am watching the clock with you.'],
      t3:  ['scared', '{step}: under three hours. Now would be good.']
    },
    pills: { t72: 'closing soon', t48: '48h left', t24: 'under 24h', t12: 'final hours', t3: 'under 3h', closed: 'overdue' }
  },

  // Words people see for the Sheet's track values (never show the raw NONE / PARTIAL)
  trackLabels: {
    payment: { NONE: 'not sent yet', SUBMITTED: 'being checked', VERIFIED: 'verified', REJECTED: 'needs a new proof' },
    requirements: { NONE: 'not sent yet', PARTIAL: 'partly sent', SUBMITTED: 'being checked', RETURNED: 'needs fixing', APPROVED: 'approved' }
  },

  // Watchlist rank: a made-up rank picked from the Applicant ID (same on every visit). Decorative only:
  // it never means anything about the application, so don't use it for decisions. {n} = the rank.
  rank: { line: 'Watchlist rank: #{n}', min: 3, max: 97 },

  // SUBJECT_STATUS.EXE signal lights on Home (progress_ states → words)
  signal: { done: 'done', action: 'your move', open: 'open', waiting: 'in review', locked: 'locked', stopped: 'closed' },
  // labels for the progress path + SUBJECT_STATUS.EXE rows (the same words in both places)
  path: { apply: 'Applied', review: 'Accepted', payment: 'Payment', requirements: 'Requirements', confirmed: 'Confirmed',
          waitlisted: 'Waitlisted', rejected: 'Not accepted', withdrawn: 'Withdrawn' },
  door: 'Access granted. Book your room →',   // SUBJECT_STATUS.EXE, once room booking opens for a confirmed camper

  // Home: the "closes today" strip, and the one-time full-screen cards when the status changes. {id} = Applicant ID
  broadcast: {
    closingTop: 'This is a test of your timing',
    closingToday: 'Applications close today, ',   // + the time
    ACCEPTED: { top: 'This is not a test', big: 'Access granted', sub: 'Subject {id}, your file is ready. Next: pay, then send your requirements.', btn: 'Open my file' },
    CONFIRMED: { top: 'Broadcast', big: "You're in", sub: 'Camp confirmed. Please remain seated until then.', btn: 'Continue' }
  },

  // Pre-LEADS banner on Home. Hidden after `until` (Manila time) and for confirmed campers. Set show: false to hide it.
  preleadsBanner: {
    show: true,
    until: '2026-11-05T19:30:00+08:00',
    top: 'SPECIAL TRANSMISSION',
    title: 'Pre-LEADS Preview // Nov 5',
    sub: '5:00–7:30 PM, onsite',          // fallback: Settings › PreLeadsTime + PreLeadsVenue show instead when filled in
    link: 'Open the Pre-LEADS file →',
    popup: 'Registration is open until the file closes. Come see what it is about.',   // the once-a-day pop-up on Home (blank = no pop-up)
    later: 'Later'
  },

  /* ---------- Home extras for people who haven't applied yet (hidden once they have a file) ---------- */
  // FAQ: {dates} {venue} {contact} are filled from Settings. If a value a line needs is blank, `fallback` shows instead.
  // todo: true = the core team still has to write the answer; only admins see it (marked TODO) until then.
  faq: {
    eyebrow: 'FAQ',
    title: 'Classified files',
    note: 'Open a file. We already read it.',
    venueFallback: 'a venue to be announced',
    items: [
      { q: 'When do I pay, and how much?', a: 'Only once you are accepted. The Payment page on this portal then shows the fee and how to pay. You pay first, then upload your proof. Requirements open after your payment is verified.' },
      { q: 'When and where is it?', a: '{dates}, at {venue}.', needs: 'dates', fallback: 'Dates and venue are still being finalized.' },
      { q: 'Who can apply? Can freshmen join?', a: 'TODO: core team, write the eligibility rule here (year levels, courses, MEA membership).', todo: true },
      { q: 'What should I bring?', a: 'TODO: core team, write the packing list here.', todo: true },
      { q: "What's the leadership fear question for?", a: "It's one of four essays. Write about a fear you actually want to work on at camp. It doesn't have to be impressive. It has to be yours." },
      { q: 'Can I edit my application after I submit it?', a: "Not from the portal. It's one application per person. If something's wrong, message the core team." },
      { q: 'What if I close the tab halfway?', a: 'Once you tick the consent box, your draft saves to your Ateneo account as you type, so you can finish later on any device.' },
      { q: 'Who sees my answers?', a: 'Only the LEADS core team. We use your info for LEADS and nothing else (RA 10173).' }
    ]
  },
  // Quotes from past campers. sample: true = a placeholder: only the core team sees it (with a SAMPLE stamp), so
  // made-up quotes never reach applicants. Replace with real ones (with the camper's permission) and delete `sample`.
  // finding = the line under the quote (blank: "Fear of <fear>. Faced it anyway.")
  testimonials: {
    eyebrow: 'Intercepted transcripts',
    title: 'They applied too',
    findingLabel: 'FINDING: ',
    fallbackFinding: 'Came back changed.',
    tape: 'Transcript // ',
    develop: 'Develop the negative',
    items: [   // placeholders written for this portal, not real quotes yet: swap in real ones, then delete `sample`
      { quote: "I volunteered to lead our group's presentation mostly so I'd stop dreading it. My voice shook the whole time. Nobody cared. I'd do it again.", who: 'Camper', meta: 'LEADS 2025', fear: 'Public speaking', sample: true },
      { quote: "I spent the first night trying to say the right thing. By day two I gave up on that, and that's when people actually started talking to me.", who: 'Camper', meta: 'LEADS 2025', fear: 'Being judged', sample: true },
      { quote: 'When it was my turn to decide, the whole group went quiet. I picked wrong, we fixed it together, and honestly that was the best part of camp.', who: 'Camper', meta: 'LEADS 2025', fear: 'Making the call', sample: true }
    ]
  },
  ticker: [                               // warning-tape strip: [BIG WORD, small note]
    ['SOMEONE IS WATCHING', "it's just us"],
    ['SCOPOPHOBIA', 'fear of being stared at'],
    ['ATYCHIPHOBIA', 'fear of failing'],
    ['CLAUSTROPHOBIA', 'fear of being boxed in'],
    ['GLOSSOPHOBIA', 'fear of public speaking'],
    ['OVERSIGHT', '1. watchful supervision 2. an honest mistake'],
    ['DECIDOPHOBIA', 'fear of making the call'],
    ['I.R.I.S. IS WATCHING', 'say hi'],
    ['YOU BLINKED', "we didn't"],
    ['THE THIRD CAMERA', 'is not empty'],
    ['LAST SEEN', 'just now'],
    ['DO NOT TURN AROUND', 'it is fine. probably.']
  ],

  /* ---------- the hub: one card per step, in order ---------- */
  hub: {
    eyebrow: 'Your file // live',
    noteLabel: 'Note from the core team',   // above Applicants › MessageToApplicant on the status card
    title: 'What we have on you.',
    guestNote: 'Sign in with your Ateneo account to see your file.',
    noFileNote: 'No file on you yet. Start one above.',
    checking: 'Checking who you are…',
    signedIn: 'Signed in as ',
    signedOut: 'Not signed in',
    signOutTitle: 'Signs you out of Google in this browser, then back here to sign in with your Ateneo account.',
    applyOpen: 'Open now.',
    applyDone: 'Filed. Your application is on record.',
    wrongAccount: 'Use your Ateneo account.',
    open: 'Open', view: 'View', start: 'Start',
    hi: 'Hi {name}. '
  },
  modules: {
    apply:   { n: '01', title: 'Apply',            fix: 'An intake form, four short essays, then a threat assessment. One essay is about a fear you want to face.' },
    pay:     { n: '02', title: 'Payment',          fix: 'Once accepted: scan the QR, pay, and upload your proof on its page. It says VERIFIED once the core team checks it.' },
    req:     { n: '03', title: 'Requirements',     fix: 'After your payment is verified: the forms to fill in, with what each one needs.' },
    ga:      { n: '04', title: '1st GA',           fix: 'Your first general assembly. Add it to your calendar once the date is set.' },
    room:    { n: '05', title: 'Room booking',     fix: 'Where you sleep at camp. Opens after your requirements are approved.' },
    sheet:   { n: '00', title: 'Core team',        fix: 'Review applicants in the Sheet: LEADS → Open review panel, click their rows, press Accept, Verify or Approve. Add a note and they see it here.' }
  },
  /* ---------- Steps.html: the pages after acceptance (?page=pay | reqs | ga | room) ---------- */
  steps: {
    qrMissing: 'QR unavailable right now. Message the core team for the payment details.',
    pay:  { n: '02', file: 'PAYMENT.EXE', title: 'Proof of payment',
            lead: 'Scan a code, pay the fee, then upload your proof. The core team checks it and marks it VERIFIED.',
            how: 'How to pay', qrTitle: 'Scan to pay', upTitle: 'Upload your proof',
            upHint: 'A screenshot or photo of the receipt that shows the amount, the date and the reference number. PNG, JPG or PDF, up to 8 MB.',
            states: { NONE: 'No proof on file yet.', SUBMITTED: 'Proof received. The core team is checking it. Upload again only if you sent the wrong file.',
                      VERIFIED: 'Verified. Your payment is on record. Requirements are next.', REJECTED: 'Your proof was not accepted. Check the details and upload a new one.' },
            sent: 'Proof received. It is in your file now.' },
    reqs: { n: '03', file: 'REQUIREMENTS.EXE', title: 'Requirements',
            lead: 'Fill in every form below. Each one says what it needs. The core team marks your file APPROVED once everything is in.',
            empty: 'The forms are not posted yet. Check back here.',
            states: { NONE: 'Nothing received yet.', PARTIAL: 'Some of your forms are in. Finish the rest.', SUBMITTED: 'Everything is in. The core team is checking it.',
                      RETURNED: 'Something needs fixing. Check your email, then send it again.', APPROVED: 'Approved. Your requirements are complete.' } },
    ga:   { n: '04', file: 'ASSEMBLY.EXE', title: '1st GA',
            lead: 'Your first general assembly with the other campers. Attendance is noted.',
            button: 'Add to Google Calendar', noLink: 'Calendar link posted soon' },
    room: { n: '05', file: 'ROOMS.EXE', title: 'Room booking',
            lead: 'Where you will sleep at camp.',
            placeholder: 'Room booking is being set up. The core team will post the details here.' },
    locked: 'Access denied',
    guest: 'Sign in with your Ateneo account to open this file.',
    noFile: 'You have not applied yet. Start your application from the hub.',
    stopped: 'This file is closed.'
  },
  stateLabels: {                           // pill text on each hub card
    open: 'open', locked: 'locked', waiting: 'in review', action: 'your move', done: 'done', stopped: 'closed'
  },
  lockedWhy: {                             // shown on locked cards: lockedWhy[card + '_' + reason] first, then lockedWhy[reason]
    apply: 'Applications are closed.',
    accept: "Opens once you're accepted.",
    closed: 'Not open yet. Check back here.',
    pay: 'Opens once your payment is verified.',
    req: 'Opens once your requirements are approved.',
    link: 'Date not set yet. Check back here.',
    gaOpen: 'Date is set. Add it to your calendar.',
    roomOpen: 'Open now.'
  },

  statusCopy: {
    'SUBMITTED':    'We got your application. Someone from the core team will read it soon.',
    'UNDER REVIEW': 'The core team is reading your file. Nothing to do yet. We will tell you when it is your move.',
    'WAITLISTED':   "You're on the waitlist. Slots open up more often than you think.",
    'ACCEPTED':     "You're accepted. Next: pay and upload your proof of payment. Requirements open once your payment is verified.",
    'REJECTED':     'Not this time. Applying still took guts, and we hope you try again next year.',
    'CONFIRMED':    "You're in. See you at camp.",
    'WITHDRAWN':    'You withdrew. Your file is closed. Message the core team if you have questions.'
  },
  // themed pop-up for people stuck on the wrong Google account (Home + Apply). {url} = the portal link pinned to the school account
  signInHelp: {
    title: 'Access denied // wrong account',
    lead: "The portal can't see your Ateneo account. This usually happens when you're signed in to several Google accounts and Google picks the wrong one.",
    linkLabel: 'Open the portal with your school account',
    steps: [
      'Use the link above. It tells Google to use your student.ateneo.edu account.',
      'Still stuck? Open a private or incognito window (Ctrl+Shift+N, or Cmd+Shift+N on a Mac), paste the link, and sign in with only your Ateneo account.',
      'Or sign out of every Google account, then sign in with your Ateneo account first.',
      'On your phone? Open the link in your browser, not inside Messenger or Instagram.'
    ],
    contact: 'Still not working? Message the core team and tell them what you see.',
    close: 'Got it',
    trigger: 'Trouble signing in?'
  },

  // confirmation before "Sign out" / "Switch account" (Google signs you out of EVERY account in that browser)
  signOutConfirm: {
    title: 'Sign out of everything?',
    lead: "Signing out here signs you out of every Google account in this browser: Gmail, Drive, Classroom, all of them. You'll have to sign back in to each one.",
    tip: "Just on the wrong account? You don't need to sign out. The guide shows a link that opens the portal with your Ateneo account.",
    confirm: 'Sign out anyway',
    help: 'Fix my account instead',
    cancel: 'Cancel'
  },

  // "Report an issue" (every page: footer + top bar). Sends a case-file email to Settings > IssueEmail
  // (falls back to `to` below). Everything technical (page, browser, errors, account, status) is collected automatically.
  report: {
    to: 'keene.xander.brigado@student.ateneo.edu',
    button: 'Report an issue',
    title: 'Report an issue',
    lead: "Something broken, stuck or confusing? Tell us what happened. We also attach the technical details (page, browser, account, recent errors) automatically, so you don't have to.",
    categories: [
      "I can't sign in / it says I'm on the wrong account",
      'My details are wrong or the autofill is off',
      "The form won't submit or keeps showing errors",
      'My status or progress looks wrong',
      'A page is broken, blank or looks wrong',
      'A link or button does nothing',
      'Something else'
    ],
    labels: {
      category: 'What kind of problem is it?',
      what: 'What happened?',
      whatHint: 'Describe what you saw. Copy any error message word for word.',
      doing: 'What were you trying to do?',
      doingHint: 'e.g. "Submitting my application", "Opening the payment form".',
      steps: 'Steps to make it happen again (optional)',
      stepsHint: 'e.g. 1. Open Apply  2. Change my ID  3. Click Submit',
      when: 'When did it happen?',
      blocking: 'How bad is it?',
      contact: 'Where can we reach you?',
      contactHint: 'We reply here. Your Ateneo email is fine.',
      shot: 'Screenshot (optional)',
      shotHint: 'Big images are shrunk automatically.'
    },
    whenOptions: ['Just now', 'Earlier today', 'Yesterday or before', 'It happens every time'],
    blockingOptions: ["I can't continue at all", "I can continue but something's wrong", "Just a small thing"],
    send: 'Send report',
    cancel: 'Cancel',
    sending: 'Sending…',
    sent: "Report sent. Case {id}. We'll reply to {email} if we need anything else.",
    failed: "That didn't send. Try again, or email {to} directly.",
    tooMany: "You've sent a few reports already. Give it a few minutes, or email {to} directly.",
    // pop-up when the page hits an error (once per page load): asks before opening the report form
    errorTitle: 'Signal lost // something broke',
    errorLead: "Something went wrong on this page. Want to send a report to the core team? We'll include the error details so you don't have to explain the technical part.",
    errorYes: 'Yes, report it',
    errorNo: 'Not now'
  },

  messages: {
    notSignedIn: "We can't see your Google account. Sign in with your Ateneo email, then reload this page.",
    wrongDomain: "Switch to your Ateneo account to apply. You're signed in as ",
    loadError: "Something went wrong. The portal couldn't load your file. Reload the page. If it happens again, message the core team.",
    comingSoon: 'That page is still being built. Check back soon.'
  },
  /* ---------- referrals (Referrals.gs, Home card, Apply field) ---------- */
  referral: {
    label: 'Referral code',
    tag: '[WHO SENT YOU?]',
    hint: 'Optional. If someone told you to apply, start typing their code (their name, like BEA) and pick it from the list. Using a code earns you both a referral point toward room booking. Nobody? Pick N/A.',
    placeholder: 'Type 2+ letters, e.g. BE',
    none: 'N/A: nobody referred me',
    noneChosen: 'No referral. That is fine.',
    found: 'Code {code} is on file.',
    notFound: "That code isn't on file. Pick one from the list, or choose N/A.",
    pick: 'Pick the code from the list, or choose N/A.',
    typeMore: 'Keep typing: 2 letters or more.',
    noMatch: 'No code starts with that. Check the spelling with whoever sent you.',
    slow: 'Too many searches. Wait a few minutes, or choose N/A.',
    offline: "Couldn't check codes right now. Try again in a moment.",
    prefilled: 'Filled in from the link you opened. Clear it if that\'s wrong.',
    unknown: "We couldn't find that referral code. Check it with whoever sent it, or leave it blank.",
    self: "That's your own code. Leave it blank, or use the code of whoever told you to apply.",
    inactive: "That referral code isn't active anymore. Leave it blank, or use someone else's.",
    cardTitle: 'REFERRALS.EXE',
    cardLead: 'Know someone who should be watched too? Send them your link.',
    pointsLabel: 'Referral points',
    perks: [   // the benefits, for both sides of a referral
      'Each person who applies with your code: 1 point for you.',
      'Applying with someone else\'s code: 1 point for you as well. They get theirs too.',
      'More points means an earlier pick at room booking, and other advantages at the camp itself.'
    ],
    usedTheirs: 'You applied with {code}\'s code: 1 point.',
    namesLabel: 'Used your code',
    noNames: 'Nobody has used your code yet. Send the link to whoever should be watched next.',
    copy: 'Copy my link',
    copied: 'Link copied',
    share: 'Share',
    shareText: 'Apply to LEADS with my code {code}: {link}',
    applied: 'applied with your code',
    closed: "Applications are closed, so your code can't bring anyone new in. Your count is final.",
    gameDone: 'Your referral code is {code}. Every person who applies with it earns you a point toward room booking and other advantages at camp. Send it to whoever should apply next.'
  },

  footer: {
    contact: 'Portal issues? Message the LEADS core team.',   // shown when Settings > ContactEmail is blank
    contactEmail: 'Portal issues? Email {contact}',
    privacy: 'We only use your info for LEADS, and only core team can see it (RA 10173).'
  },

  /* ---------- the mascot (Mascot.html): I.R.I.S., the little CRT with one eye, bottom-right corner ---------- */
  // I.R.I.S. = Inspection, Reconnaissance & Identification System. The portal's watcher (kindly, mostly).
  mascot: {
    show: true,
    name: 'I.R.I.S.',
    fullName: 'Inspection, Reconnaissance & Identification System',
    // I.R.I.S. is a pocket CRT television with an eye on its screen (Mascot.html). Voice = the brand book: deadpan, clinical, observant, intimate.
    // Second person, short declarative sentences, study vocabulary (file, subject, recorded, noted, observe).
    // Quiet and specific; every line ends on an invitation, never a threat. No exclamation marks, no emoji.
    // Errors and instructions stay plain: what happened, what to do.
    // Every line is [face, text]. Faces: 'nervous' 'happy' 'excited' 'sad' 'scared' 'wink' 'love' 'thinking'.
    colors: {                              // the status LED for each face (the on-screen word comes from Mascot.html)
      nervous:  '#FF2A2A',                 // REC: the default, steady watching
      scared:   '#FF2A2A',                 // ALERT (blinks fast)
      happy:    '#3DFF6E',                 // NOTED
      excited:  '#FFFF00',                 // MATCH
      sad:      '#6A6A6A',                 // IDLE (the head droops)
      wink:     '#EAEAEA',                 // SAVED
      love:     '#FFB347',                 // CLEARED: the one warm light (brand book: reveal phase)
      thinking: '#4D7CFF'                  // READING (the focus ring turns)
    },
    pageFace: {                            // resting face on each page (key = ?page= value)
      home: 'nervous',
      apply: 'thinking',
      game: 'nervous',
      pay: 'thinking', reqs: 'thinking', ga: 'happy', room: 'nervous'
    },
    hello: {                               // first line on each page
      home:  ['nervous', 'Camera 01 is on. You are being observed. Please continue as normal.'],
      apply: ['thinking', 'This is your intake file. Answer honestly. I am only taking notes.'],
      game:  ['nervous', 'Three feeds. Something is in one of them. Choose a camera when you are ready.'],
      pay:   ['thinking', 'Scan the code. Pay. Upload the proof. I will keep a copy in your file.'],
      reqs:  ['thinking', 'These are the forms we need from you. Fill in each one. Take your time. I will wait.'],
      ga:    ['happy', 'Your first assembly. Put it on your calendar. We will be counting heads.'],
      room:  ['nervous', 'Rooms are being arranged. You will not be sleeping alone.']
    },
    guest: ['thinking', "I can't see who you are. Sign in with your Ateneo account and I can find your file."],
    admin: ['wink', 'Core team detected. The Sheet is in the top bar.'],
    status: {                              // shown on Home once the applicant's status loads; the face stays after
      'SUBMITTED':    ['happy',    'File received. You are on record now. Please remain seated.'],
      'UNDER REVIEW': ['thinking', "Your file is open on someone's desk. Nothing to do yet. Breathe."],
      'WAITLISTED':   ['thinking', 'Waitlisted. Your file stays open. So does the door.'],
      'ACCEPTED':     ['excited',  'Subject cleared. Next: payment, then requirements. Your file is ready.'],
      'REJECTED':     ['sad',      'Not this time. Your file stays on record. You can open it again next year.'],
      'CONFIRMED':    ['love',     'Confirmed. We have been watching. We will see you at camp.'],
      'WITHDRAWN':    ['sad',      'You withdrew. Your file is closed. Message the core team if you have questions.']
    },
    tips: [                                // a random one each time someone taps I.R.I.S.
      ['nervous',  'When something breaks, my light turns red. Then I go back to watching.'],
      ['thinking', 'Write the fear essay as if no one is reading. Someone will. That is the point.'],
      ['nervous',  'The countdown is real. I watch it so you can stop watching it.'],
      ['thinking', "Use your Ateneo account. Otherwise I can't see you, and neither can your file."],
      ['happy',    'The essays do not need to be impressive. They need to be yours.'],
      ['wink',     'Everyone who applies is nervous. I have the footage.'],
      ['thinking', "Who are you when you're not performing? Take your time with that one."]
    ],
    back: ['nervous', 'You left for a while. Your file waited. Continue when you are ready.'],   // after leaving the tab
    error: ['scared', 'SIGNAL LOST. Something broke on our side. Reload the page. If it happens again, message the core team.'],
    // Apply page: I.R.I.S. records what you write and comments (also in red pen in the margin). One line at a time,
    // at most every ~7s, only after you pause or leave a field. Never blocks anything. {v} = what they typed.
    judge: {
      FullName:       [['thinking', 'Full name recorded. Subject identified.'], ['happy', 'Name on file. This is officially yours now.']],
      Nickname:       [['wink', '{v}. That is what we will call you at camp.'], ['thinking', '{v}. Noted for the name tag.']],
      IDNumber:       [['thinking', 'ID number recorded. Cross-referencing.']],
      IDNumberBad:    ['scared', "That ID doesn't look right. It should be exactly six digits."],
      Course:         [['thinking', '{v}. Added to your file.']],
      YearLevel:      { '1': ['excited', 'First year, applying early. That is worth noting.'], '4': ['thinking', 'Fourth year. One last camp. Noted.'], other: ['thinking', 'Year {v}. Noted.'] },
      Mobile:         [['thinking', 'Number recorded. It is only used for camp.']],
      MobileBad:      ['scared', 'That number looks off. It should be 11 digits starting with 09.'],
      Block:          [['thinking', 'Block {v}. Recorded.']],
      MBTI:           { I: ['thinking', '{v}. You notice more than you say. So do I.'],
                        E: ['happy', '{v}. You fill rooms. Camp has room.'],
                        other: ['thinking', '{v}. Filed under personality.'] },
      PastOrgs:       [['thinking', 'History recorded. Experience is a finding, not a requirement.'], ['happy', 'You have done this before. It shows.']],
      OffsiteAvailability: { Yes: ['happy', 'Available on camp dates. Your spot is held.'], No: ['scared', 'Not available on camp dates. Message the core team before you continue.'] },
      DataConsent:    { Y: ['happy', 'Consent recorded. Your file is used for LEADS and nothing else.'], N: ['scared', 'Without consent there is no file. Saying yes is required to apply.'] },
      // essays: said once each, when the answer reaches a decent length
      WhyParticipant:  [['thinking', 'Reason recorded. It sounds like you.'], ['happy', 'That is a real reason. It is going in your file.']],
      Environment:     [['thinking', 'Preference recorded. We will set the room up accordingly.'], ['happy', 'Noted. We will make space for that.']],
      TakesLeadership: [['thinking', 'Example recorded. You have done this before.'], ['happy', 'Specific. That is rare. Noted.']],
      FearLeadership:  [['sad', 'Thank you for writing that down. It stays in your file, and with us.'], ['thinking', 'Naming it is the hard part. Camp is for the rest.']],
      essayShort:     ['thinking', "At least 50 characters. Take your time. I'll wait."],
      essayOk:        [['thinking', 'Recording. Go on.'], ['happy', 'Noted. That one is going in your file.']],
      essayLong:      ['thinking', 'You are giving us a lot. We are reading all of it.'],
      cliche:         ['wink', 'Everyone writes "leadership". Write the thing only you would say.'],
      deleted:        ['thinking', 'You deleted that. It was a start. Try again.'],
      idle:           ['nervous', 'Still here. Take your time. The file stays open.'],
      errors:         ['scared', 'A few fields need a look. They are marked in red.'],
      // progress check every ~40s. {name} = their nickname/first name (or "you"), {done} = what they've filled in so far
      slow:           [['thinking', '{name}, {done} so far. No rush. I am still here.'], ['nervous', '{name}, {done}, and the camera is still running. Take the time you need.']],
      halfway:        ['happy', 'Halfway, {name}. The file is taking shape.'],
      allDone:        ['excited', 'Every field is filled. Read it once more. Then we observe.'],
      prefilled:      ['thinking', 'I pulled your details from the member list. Check them before you continue.']
    },
    afterError: 'sad',                     // resting face after an error (so I.R.I.S. doesn't stay red forever)
    hideLabel: 'Hide I.R.I.S.'
  },

  /* ---------- look ---------- */
  colors: {
    bg: '#0A0A0A',        // page background (a switched-off CRT)
    bgGlow: '#0010E0',    // CRT blue glow at the top
    card: '#141414',      // case files
    text: '#EAEAEA',
    muted: '#8C8C8C',     // photocopy grey
    primary: '#0010E0',   // button shadows (blue)
    soft: '#7A86FF',      // links on black (a readable blue)
    accent: '#FFFF00',    // warning-tape yellow: main button, labels, countdown
    accent2: '#E00000',   // red accents
    danger: '#FF2A2A',    // alarms, errors, the REC dot
    ok: '#EAEAEA',        // done = white
    fearText: '#FF2A2A',  // "FEAR //" line on cards
    fixText: '#EAEAEA'
  },
  fonts: {
    title: "'JetBrains Mono', ui-monospace, monospace",                 // the brand book's title font: the logo and page titles
    display: "'Anton', 'Archivo Narrow', 'Arial Narrow', sans-serif",   // condensed grotesque headlines
    kicker: "'JetBrains Mono', ui-monospace, monospace",                // the case-file label
    body: "'Inter', 'Arimo', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    os: "'VT323', 'Lucida Console', monospace",                         // 90s OS chrome: buttons, title bars, taskbar
    type: "'Special Elite', 'Courier New', monospace",                  // typewriter: case folders, stamps, scraps
    hand: "'Reenie Beanie', 'Comic Sans MS', cursive",                    // red-pen handwriting: margin notes on Apply
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400;700;800&family=Special+Elite&family=VT323&display=swap'
  },
  effects: {
    eyes: true,           // eyes in the background follow the pointer (Home); they stare harder when you stop moving
    searchlight: true,    // faint yellow light follows the pointer (Home)
    shiver: true,         // the case-file label glitches now and then
    interrupts: true      // Home: rare "signal interrupted" cutaways + the tagline briefly changes (off for reduced motion)
  },

  /* ---------- analog horror (Home): short, unsettling, never threatening or gory ---------- */
  horror: {
    lightsOn: 'CRT on',   // toggle label while the effects are on; clicking turns off grain, VHS band, flicker and cutaways (remembered per browser)
    lightsOff: 'CRT off', // label while the effects are off
    every: [28, 55],      // seconds between disturbances (random in this range)
    // full-screen static cutaway, about a second, so keep each one short. {name} = their first name (lines with it are
    // skipped for guests). The label above it reads "FEED INTERRUPTED // CAM 0X" (a random camera) and the time below.
    interrupts: [
      'YOU HESITATED.',
      'WE SAW THAT.',
      'STILL THERE, {name}?',
      "DON'T WORRY. WE'RE TAKING NOTES.",
      'OBSERVATION ONGOING.',
      'CAM 02 HAS A BETTER ANGLE.',
      'WE KNOW YOU\'RE NERVOUS, {name}.',
      'YOU CAN LOOK AWAY. WE WON\'T.',
      'WHY DID YOU STOP SCROLLING?',
      'THE LIGHTS ARE ON IN CAM 03.',
      'TURN AROUND, {name}. SLOWLY.'
    ],
    whispers: [           // the red tagline swaps to one of these for about 3 seconds
      'Everyone hesitates the first time.',
      'The deadline is watching too.',
      "Go on. Nobody's grading this part.",
      'You read that line twice.',
      "You're not the only one reading this.",
      "Don't scroll too fast. It follows.",
      "You've been on this page longer than you think.",
      'Something moved on CAM 02.'
    ],
    // random creepy moments on Home (every 10-22s, one at a time, off in CRT-off mode). {name} = first name; lines with it
    // are skipped for guests. All decorative: nothing here is real tracking, and nothing is gory.
    creep: {
      every: [10, 22],
      popups: [                // a little 90s alert window in a corner (never the bottom-right, that's I.R.I.S.)
        'CAM 02 has a better angle of you.',
        'A file was opened. It might be yours.',
        'There is someone else on CAM 04.',
        'Do you hear that too?',
        'We saved your spot, {name}.',
        'Movement detected near your door.',
        'Please stay where you are.',
        'You looked away. We noticed.'
      ],
      tabTitles: ['come back.', 'we can still see you', '(1) new message: turn around', 'where did you go, {name}?'],
      back: ['You were gone {s} seconds. We waited.', 'Welcome back. Nothing happened while you were gone. Probably.'],
      poster: ['WE SEE YOU', 'DO NOT LOOK BEHIND YOU', 'HELLO, {name}', 'STAY STILL'],
      hub: ['We have your file.', 'We kept a copy.', 'Your file has been opened.'],
      screens: ['I SEE YOU', 'BEHIND YOU', 'WAKE UP', 'CH 00', 'HELLO']   // static TVs briefly show one of these
    }
  }
};

/** CSS variables built from BRAND.colors / BRAND.fonts. Pages print it with <?!= brand_css_() ?> (private: scriptlets only) */
function brand_css_() {
  const c = BRAND.colors, f = BRAND.fonts;
  const clean = v => String(v).replace(/[<>{};]/g, '');
  const vars = {
    '--night': c.bg, '--night-glow': c.bgGlow, '--night-2': c.card, '--text': c.text, '--muted': c.muted,
    '--blue': c.primary, '--sky': c.soft, '--glow': c.accent, '--pink': c.accent2, '--danger': c.danger,
    '--ok': c.ok, '--fear-text': c.fearText, '--fix-text': c.fixText,
    '--display': f.display, '--title': f.title || f.display, '--kicker': f.kicker, '--body': f.body, '--mono': f.mono,
    '--os': f.os || f.mono, '--type': f.type || f.mono, '--hand': f.hand || f.type || f.mono
  };
  const body = Object.keys(vars).map(k => k + ':' + clean(vars[k])).join(';');
  const boot = typeof PAGE_BOOT_ !== 'undefined' && PAGE_BOOT_ ?   // the page's first data, fetched in doGet (Code.gs pageBoot_)
    '<script>window.__BOOT=' + JSON.stringify(PAGE_BOOT_).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';</script>' : '';
  return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
         '<link rel="stylesheet" href="' + encodeURI(f.googleFontsUrl).replace(/"/g, '') + '">' +
         '<style>:root{' + body + '}</style>' + boot;
}

/** BRAND.mascot as JSON for Mascot.html (safe inside a <script> tag). Private: only scriptlets call it. */
function mascotJson_() {
  return JSON.stringify(BRAND.mascot || {}).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * BRAND as JSON that's safe to drop inside a <script> tag. The report inbox (report.to) stays on the server:
 * pages get the public ContactEmail instead, for the "email us" fallback when a report can't be sent.
 */
function brand_json_() {
  let contact = '';
  try { contact = String(getSetting_('ContactEmail') || '').trim(); } catch (e) { /* Settings missing */ }
  const out = Object.assign({}, BRAND, { report: Object.assign({}, BRAND.report, { to: contact }) });
  return JSON.stringify(out).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}