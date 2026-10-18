/**
 * Brand.gs  —  EVERYTHING that makes this portal "LEADS" lives here.
 *
 * To port the portal to another org/project:
 *   1. Copy the whole Apps Script project (or every .gs/.html file).
 *   2. Edit ONLY this file: names, copy, colors, fonts, effects.
 *   3. In the Sheet: Settings (event, deadline, fee, domains, contact), Lists (courses,
 *      MEA involvement, shirt sizes), Requirements (the PDFs), Admins (officer emails).
 *      No other code changes needed.
 *
 * Rules:
 *   - Plain text only in copy fields (no HTML). It's escaped before showing.
 *   - Colors are any CSS color. Keep text readable on `bg` and `card`.
 *   - Fonts must exist on Google Fonts; update `googleFontsUrl` to match.
 *   - Keys in `statusCopy` must match STATUSES in Utils.gs. `modules` are the hub's cards (Home.html).
 */
const BRAND = {
  /* ---------- identity ---------- */
  // Theme: LEADS: Oversight. (1) watchful supervision, (2) an inadvertent error.
  // Fears: being watched, feeling boxed in, failing. Mood: a surveillance case file, 1984-style.
  org: 'LEADS',
  parentOrg: 'MEA',
  portalName: 'LEADS: Oversight',         // browser tab title
  logoText: 'LEADS',
  logoAccent: ': Oversight',              // colored part after the logo

  /* ---------- home page copy ---------- */
  hero: {
    eyebrow: 'MEA leadership camp',       // shown as "<event> · <eyebrow> · applications open"
    kicker: 'Case file 26/27',            // yellow tape label above the headline
    headline: 'LEADS: Oversight',
    tagline: 'People will be watching. Apply anyway.',
    hint: 'Takes about 10 minutes. One application per person.',   // under the main button, before applying
    redact: [],                            // words in the lede shown as black bars until hovered or tapped (empty = off)
    lede: 'LEADS is MEA\'s off-site leadership camp. For a few days, people watch you make calls, ' +
          'and sometimes they watch you get them wrong. That\'s how the training works. ' +
          'Most people who apply are scared of exactly that part.'
  },
  buttons: {
    apply: 'Start your application',
    status: 'Check my status',
    applied: 'You already applied',
    upload: 'Send requirements',
    pay: 'Send proof of payment',
    admin: 'Open the Sheet',
    signOut: 'Sign out',                  // signs out of Google in this browser, then back to the portal
    signIn: 'Sign in',
    switchAccount: 'Switch account'
  },
  countdown: {
    title: 'Time remaining',
    soon: 'Less than two days left',            // under 2 days left
    closed: 'Applications are closed',
    tba: 'Deadline to be announced.',
    campTitle: 'Camp starts in',         // once the applicant is CONFIRMED, the clock counts down to camp instead
    campLabel: 'Camp: '                  // + the date. Camp start = Settings › CampStart, else the first date in EventDates
  },

  /* ---------- Home extras for people who haven't applied yet (hidden once they have a file) ---------- */
  // FAQ: {fee} {dates} {venue} {contact} are filled from Settings. If a value a line needs is blank, `fallback` shows instead.
  // todo: true = an officer still has to write the answer; only admins see it (marked TODO) until then.
  faq: {
    eyebrow: 'FAQ',
    title: 'Classified files',
    note: 'Open a file to declassify it.',
    items: [
      { q: 'How much does camp cost?', a: 'The camp fee is ₱{fee}. You pay through the payment form on this page once it unlocks.', needs: 'fee', fallback: "The fee hasn't been announced yet. It'll show up here first." },
      { q: 'When and where is it?', a: '{dates}, at {venue}.', needs: 'dates', fallback: 'Dates and venue are still being finalized.' },
      { q: 'Who can apply? Can freshmen join?', a: 'TODO: core team, write the eligibility rule here (year levels, courses, MEA membership).', todo: true },
      { q: 'What should I bring?', a: 'TODO: core team, write the packing list here.', todo: true },
      { q: "What's the fear essay for?", a: "It's one of two questions on the form. Write about a fear you actually want to work on at camp. It doesn't have to be impressive. It has to be yours." },
      { q: 'Can I edit my application after I submit it?', a: "Not from the portal. It's one application per person. If something's wrong, message the core team." },
      { q: 'What if I close the tab halfway?', a: 'Your draft saves to your Ateneo account as you type, so you can finish later on any device.' },
      { q: 'Who sees my answers?', a: 'Only the LEADS core team. We use your info for LEADS and nothing else (RA 10173).' }
    ]
  },
  // Quotes from past campers. sample: true shows a SAMPLE stamp so placeholders are never mistaken for real quotes.
  // Replace these with real ones (with the camper's permission) and delete `sample`.
  testimonials: {
    eyebrow: 'Intercepted transcripts',
    title: 'From past campers',
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
    ['I.R.I.S. IS WATCHING', 'say hi']
  ],

  /* ---------- the hub: one card per step, in order ---------- */
  hub: {
    eyebrow: 'Your file',
    title: 'Your file so far.',
    guestNote: 'Sign in with your Ateneo account to see your file.'
  },
  modules: {
    apply:   { n: '01', title: 'Apply',            fix: 'A short form and two questions. One of them is about a fear you want to face.' },
    req:     { n: '02', title: 'Requirements',     fix: 'Once accepted, send your signed PDFs and camp info through our form.' },
    pay:     { n: '03', title: 'Proof of payment', fix: 'Send your receipt through our form. This page says VERIFIED once the core team checks it.' },
    sheet:   { n: '00', title: 'Core team',        fix: 'Review applicants in the Sheet. Use the LEADS menu to accept, verify and confirm.' }
  },
  stateLabels: {                           // pill text on each hub card
    open: 'open', locked: 'locked', waiting: 'in review', action: 'your move', done: 'done', stopped: 'closed'
  },
  lockedWhy: {                             // shown on locked cards
    apply: 'Applications are closed.',
    req: "Opens once you're accepted.",
    pay: "Opens once you're accepted.",
    payAnytime: 'Opens once you apply.',
    noForm: 'Link coming soon. Check back here.'
  },

  statusCopy: {
    'SUBMITTED':    'We got your application. Someone from the core team will read it soon.',
    'UNDER REVIEW': 'The core team is reading your file now. Honestly, the waiting is the worst part.',
    'WAITLISTED':   "You're on the waitlist. Slots open up more often than you think.",
    'ACCEPTED':     "You're accepted. Next, send your requirements and payment.",
    'REJECTED':     'Not this time. Applying still took guts, and we hope you try again next year.',
    'CONFIRMED':    "You're in. See you at camp.",
    'WITHDRAWN':    'You withdrew your application. Message the core team if that was a mistake.'
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
    loadError: "Something went wrong. The portal couldn't load your info: ",
    comingSoon: 'That page is still being built. Check back soon.'
  },
  footer: {
    contact: 'Portal issues? Message the LEADS core team.',   // replaced by Settings > ContactEmail if set
    privacy: 'We only use your info for LEADS, and only core team can see it (RA 10173).'
  },

  /* ---------- the mascot (Mascot.html): I.R.I.S., the little CRT with one eye, bottom-right corner ---------- */
  // I.R.I.S. = Inspection, Reconnaissance & Identification System. The portal's watcher (kindly, mostly).
  mascot: {
    show: true,
    name: 'I.R.I.S.',
    fullName: 'Inspection, Reconnaissance & Identification System',
    // Every line is [face, text]. Faces: 'nervous' 'happy' 'excited' 'sad' 'scared' 'wink' 'love' 'thinking'.
    // A plain 'text' (no face) works too and uses 'nervous'.
    colors: {                              // I.R.I.S.'s screen color for each face
      nervous:  '#0010E0',                 // the default CRT blue
      scared:   '#E00000',                 // alarm red (also the random "panic" trick)
      happy:    '#FFFF00',
      excited:  '#FFFF00',
      sad:      '#808080',
      wink:     '#EAEAEA',
      love:     '#E00000',
      thinking: '#0010E0'
    },
    pageFace: {                            // I.R.I.S.'s resting face on each page (key = ?page= value)
      home: 'nervous',
      apply: 'thinking'
    },
    hello: {                               // first line on each page
      home:  ['nervous', "Hi, I'm I.R.I.S. I keep an eye on things around here. Don't mind me."],
      apply: ['thinking', "Take your time. I'll be right here."]
    },
    guest: ['thinking', "I can't see who you are. Sign in with your Ateneo account so I can find your file."],
    admin: ['wink', "Core team on duty. The Sheet button's at the top."],
    status: {                              // shown on Home once the applicant's status loads; the face stays after
      'SUBMITTED':    ['happy',    "Got it. You're officially on file."],
      'UNDER REVIEW': ['scared',   'Someone is reading your file right now. Act natural.'],
      'WAITLISTED':   ['thinking', "Waitlisted isn't a no. I'm keeping an eye on your file."],
      'ACCEPTED':     ['excited',  'ACCESS GRANTED. Next: requirements and payment.'],
      'REJECTED':     ['sad',      'Not this time. Your file stays on record. Try again next year.'],
      'CONFIRMED':    ['love',     "You're in. See you at camp. I'll be watching out for you."],
      'WITHDRAWN':    ['sad',      'You withdrew. Message the core team if that was a mistake.']
    },
    tips: [                                // a random one each time someone taps I.R.I.S.
      ['scared',   'When something breaks, I turn red. Then I go back to blue. Usually.'],
      ['thinking', "Write your fear essay like no one is watching. (Except me.)"],
      ['scared',   'Keep an eye on the countdown. I do.'],
      ['thinking', "Use your Ateneo account, or the portal can't see you. Neither can I."],
      ['happy',    "The essay doesn't have to be impressive. It has to be yours."],
      ['wink',     'Everyone else is nervous too. I can see it.']
    ],
    back: ['scared', "Oh. You're back. I noticed you left."],   // after the visitor leaves the tab for a while
    error: ['scared', 'SIGNAL LOST. Something broke on our side. Try reloading. If it keeps happening, message the core team.'],
    // Apply page: I.R.I.S. reads over your shoulder and comments (the "being judged" bit). One line at a time,
    // at most every ~7s, only after you pause or leave a field. Never blocks anything. {v} = what they typed.
    judge: {
      FullName:       [['thinking', "Full legal name. Very official. I've saved it."], ['wink', "Nice name. I'll be seeing a lot of it."]],
      Nickname:       [['wink', "So we're calling you {v} at camp. Okay, I can work with that."], ['thinking', '{v}, huh? I\'ll make sure everyone uses it.']],
      IDNumber:       [['thinking', 'ID number saved. Not that I checked it twice.']],
      IDNumberBad:    ['scared', "That ID doesn't look right. It should be exactly six digits, and yes, I counted."],
      Course:         [['thinking', '{v}. Interesting. I have a few theories about you now.']],
      YearLevel:      { '1': ['excited', "First year and already applying? That's braver than most."], '4': ['wink', 'Fourth year. Going out with one last camp, I see.'], other: ['thinking', "Year {v}. Right in the thick of it. Noted."] },
      Mobile:         [['wink', "Got your number. Don't worry, I won't call. Probably."]],
      MobileBad:      ['scared', 'That number looks off. It should be 11 digits starting with 09.'],
      MEAInvolvement: [['thinking', "Interesting. I'll keep that in mind while I read the rest."]],
      Block:          [['thinking', 'Block {v}. I know exactly which classroom to watch now.']],
      MBTI:           { I: ['wink', "{v}. An introvert. Don't worry, I do most of the watching for you."],
                        E: ['excited', "{v}. An extrovert. Camp is going to be loud with you around."],
                        other: ['thinking', '{v}. Filed under personality.'] },
      PastOrgs:       [['thinking', "Quite the record. I'll be cross-checking these, of course."], ['wink', "So you've done this before. Good. Less explaining for me."]],
      FirstOvernight: { Yes: ['wink', 'First overnight? Bring a jacket. And maybe a nightlight.'], No: ['thinking', "A veteran. You already know nobody really sleeps."] },
      OffsiteAvailability: { Yes: ['happy', "Free on camp dates. I'll pencil you in."], No: ['scared', "Not free on camp dates? That's going to be hard to explain. Talk to the core team."] },
      DataConsent:    { Y: ['happy', "Consent noted. I'll only use it for LEADS. Promise."], N: ['scared', "Without your consent, I can't keep your file. You'll need to say yes to apply."] },
      // essays: said once each, when the answer reaches a decent length
      WhyParticipant:  [['thinking', "So that's why you want in. I've read worse reasons. Not many, but some."], ['happy', "Okay, that's a real reason. It's going in your file."]],
      FirstImpression: [['wink', "Interesting first impression. Let's see if it survives camp."], ['thinking', "That's what you think it'll be like? Cute. I'll remember you said that."]],
      Rumors:          [['excited', "Ooh, rumors. I've heard that one too. I hear everything."], ['wink', "Where did you hear that? Never mind, I'll find out."]],
      TakesLeadership: [['thinking', "So that's how you lead. I'll be watching to see if it's true."], ['happy', "Noted. Everyone says they step up. You actually gave an example."]],
      FearLeadership:  [['sad', "That's a heavy one. Thanks for being honest. I won't make fun of this one."], ['thinking', "Naming it is the hard part. Camp handles the rest."]],
      essayShort:     ['thinking', "That's all? You need at least 50 characters. I'll wait."],
      essayOk:        [['thinking', "Hm. Go on, I'm reading."], ['happy', "Noted. That one's going in your file."]],
      essayLong:      ['excited', "Okay, you're really going for it. I respect that."],
      cliche:         ['wink', 'Everyone says "leadership". Try saying something only you would say.'],
      deleted:        ['wink', "I saw you delete that. Don't worry, I won't tell anyone."],
      idle:           ['nervous', "Still thinking? Take your time. I'm not going anywhere."],
      errors:         ['scared', "A few fields need a look. They're marked in red."],
      // progress check every ~40s. {name} = their nickname/first name (or "you"), {done} = what they've filled in so far
      slow:           [['wink', "So {name}, {done} so far... Going pretty slow, aren't you?"], ['thinking', "{name}, {done}, and I've been watching the whole time. Need a minute?"]],
      halfway:        ['happy', 'Halfway there, {name}. Not bad. Keep going.'],
      allDone:        ['excited', "Everything's filled in. Read it over once. I already did."],
      prefilled:      ['wink', 'I pulled your details from the member list. Saves time. Check them, though.']
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
    display: "'Anton', 'Archivo Narrow', 'Arial Narrow', sans-serif",   // condensed grotesque headlines
    kicker: "'JetBrains Mono', ui-monospace, monospace",                // the case-file label
    body: "'Inter', 'Arimo', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap'
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
      'YOU CAN LOOK AWAY. WE WON\'T.'
    ],
    whispers: [           // the red tagline swaps to one of these for about 3 seconds
      'Everyone hesitates the first time.',
      'The deadline is watching too.',
      "Go on. Nobody's grading this part.",
      'You read that line twice.',
      "You're not the only one reading this."
    ]
  }
};

/** CSS variables built from BRAND.colors / BRAND.fonts. Pages print it with <?!= brand_css() ?> */
function brand_css() {
  const c = BRAND.colors, f = BRAND.fonts;
  const clean = v => String(v).replace(/[<>{};]/g, '');
  const vars = {
    '--night': c.bg, '--night-glow': c.bgGlow, '--night-2': c.card, '--text': c.text, '--muted': c.muted,
    '--blue': c.primary, '--sky': c.soft, '--glow': c.accent, '--pink': c.accent2, '--danger': c.danger,
    '--ok': c.ok, '--fear-text': c.fearText, '--fix-text': c.fixText,
    '--display': f.display, '--kicker': f.kicker, '--body': f.body, '--mono': f.mono
  };
  const body = Object.keys(vars).map(k => k + ':' + clean(vars[k])).join(';');
  return '<link rel="stylesheet" href="' + encodeURI(f.googleFontsUrl).replace(/"/g, '') + '">' +
         '<style>:root{' + body + '}</style>';
}

/** BRAND.mascot as JSON for Mascot.html (safe inside a <script> tag). Private: only scriptlets call it. */
function mascotJson_() {
  return JSON.stringify(BRAND.mascot || {}).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/** BRAND as JSON that's safe to drop inside a <script> tag. */
function brand_json() {
  return JSON.stringify(BRAND).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}