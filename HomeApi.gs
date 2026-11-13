/**
 * HomeApi.gs  (server code for Home.html — functions start with home_)
 * Named HomeApi, not Home, because Home.html already uses that name.
 */

/** Everything the hub needs in one call. */
function home_getContext() {
  return traced_('home_getContext', 'home', () => home_getContext_(), c =>
    (c.applicant ? c.applicant.id + ' ' + c.applicant.status : (c.signedIn ? 'signed in, no file' : 'guest')) + (c.isAdmin ? ' (admin)' : ''));
}

/**
 * view: null for the real visitor, or the core team's preview (home_viewAs): { email, id }. In a preview the page is
 * built for that applicant's email (or a made-up one with no file, or no email = a guest), never as the core team:
 * no admin chips, no unlocked-for-preview cards, no reveal film, no referral (it can write).
 */
function home_getContext_(view) {
  const email = view ? view.email : currentEmail_();
  const s = getSettings_();
  const iso = v => { const d = parseDate_(v); return d ? d.toISOString() : null; };
  const released = !!setting_('ResultsReleased');
  const camp = campStart_(s);
  const found = email ? getApplicantForPortal_(email) : null;
  const a = found ? found.data : null;
  const admin = !view && isAdmin_(email);
  const p = view ? progress_(a) : progressFor_(a, email);   // the core team: every card unlocked (Utils.gs)

  return {
    email: email,
    signedIn: !!email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    isOpen: isOpen_(),
    resultsReleased: released,   // Settings › ResultsReleased: Home switches to the results phase (hero, countdown, cards)
    deadline: iso(s.Deadline),
    deadlines: {
      apply: iso(s.Deadline),
      payment: iso(s.PaymentDeadline),
      requirements: iso(s.RequirementsDeadline),
      ga: iso(setting_('GADate')),                    // the rest: Home's results-phase countdown (blank = skipped)
      room: iso(setting_('RoomBookingOpens')),
      waitlistReply: iso(setting_('WaitlistReplyBy')),
      waitlistPay: iso(setting_('WaitlistPaymentBy')),
      camp: camp
    },
    campStart: camp,   // ISO or null
    contact: String(s.ContactEmail || ''),
    isAdmin: admin,
    preview: view ? { id: view.id } : null,
    event: {
      name: String(s.EventName || ''),
      dates: String(s.EventDates || ''),
      venue: String(s.EventVenue || '')
    },
    applicant: a ? {
      id: a.ApplicantID,
      firstName: String(a.Nickname || a.FullName || '').trim().split(' ')[0],
      status: a.Status,
      requirements: a.Requirements || 'NONE',
      payment: a.Payment || 'NONE',
      message: String(a.MessageToApplicant || '').trim().slice(0, 1000),   // a note from the core team (Applicants › MessageToApplicant)
      reveal: view ? null : revealFor_(a)   // the results film: { url, play } once the decision is visible, else null
    } : null,
    revealUrl: admin ? revealUrl_() : '',   // the core team can preview it with ?reveal=1
    progress: p,
    preleads: { date: String(s.PreLeadsDate || ''), time: String(s.PreLeadsTime || ''), venue: String(s.PreLeadsVenue || '') },   // the Home banner
    referral: found && !released && !view ? safeReferral_(found) : null,   // own code + counts (never names); hidden once results are out
    sheetUrl: admin ? sheetUrl_() : ''   // the core team gets a link to the Sheet
  };
}

/** Settings › ResultsReleased for Home's first paint (hero tagline, poster); false if Settings can't be read. */
function homeReleased_() {
  try { return !!setting_('ResultsReleased'); } catch (e) { return false; }
}

/**
 * The core team's preview of Home after results are out (...exec?viewas=APP-2447): the page exactly as that applicant
 * will see it once Settings › ResultsReleased and PaymentOpen are ticked, whatever they say now. viewas= also takes their
 * login email (...?viewas=juan.dela.cruz@student.ateneo.edu, as the tracker lists people). viewas=NOFILE shows a
 * signed-in Ateneo account with no file, viewas=GUEST someone not signed in. Admins only. Read-only: the switches are
 * flipped for this one call in memory (never in the Sheet), and nothing is written for the applicant (no RevealSeen,
 * no referral, no events; the trace row is the core team's own).
 */
function home_viewAs(applicantId) {
  return traced_('home_viewAs', 'home', () => {
    if (!isAdmin_(currentEmail_())) throw new Error('Only the core team can preview as an applicant.');
    const id = String(applicantId || '').trim().toUpperCase();
    getSettings_.cache = Object.assign({}, getSettings_(), { ResultsReleased: true, PaymentOpen: true });   // this call only
    if (id === 'GUEST') return home_getContext_({ email: '', id: id });
    if (id === 'NOFILE') return home_getContext_({ email: 'preview.nofile@student.ateneo.edu', id: id });
    const found = id.indexOf('@') > 0 ? getApplicantByEmail_(id.toLowerCase()) : getApplicantById_(id);   // an APP ID or their email
    if (!found || !String(found.data.Email || '').trim()) throw new Error('No applicant with the ID or email ' + id + '.');
    return home_getContext_({ email: String(found.data.Email).trim(), id: found.data.ApplicantID });
  }, c => 'preview ' + (c && c.preview ? c.preview.id : '') + (c && c.applicant ? ' ' + c.applicant.status : ''));
}

/**
 * When camp starts: Settings › CampStart if it's filled in, otherwise the first date in EventDates
 * ("January 29 to 31, 2027" → Jan 29, 2027, 8:00 AM Manila). null if neither works.
 */
function campStart_(s) {
  const direct = parseDate_(s.CampStart);
  if (direct) return direct.toISOString();
  const m = String(s.EventDates || '').match(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:\s*(?:-|–|to)\s*(?:[A-Za-z]{3,}\.?\s+)?\d{1,2})?,?\s+(\d{4})/);
  if (!m) return null;
  const d = new Date(m[1] + ' ' + m[2] + ', ' + m[3] + ' 08:00:00 GMT+0800');
  return isNaN(d) ? null : d.toISOString();
}

/**
 * The results reveal (docs/reveal on GitHub Pages): only for someone whose decision the portal shows as ACCEPTED or
 * CONFIRMED, which already means Settings › ResultsReleased is ticked (getApplicantForPortal_ masks it otherwise).
 * play = they haven't seen it yet (Applicants › RevealSeen is blank). ?reveal=1 replays it.
 */
function revealUrl_() {
  const u = String(setting_('RevealUrl') || '').trim();
  return /^off$/i.test(u) || !/^https:\/\//.test(u) ? '' : u;
}
function revealFor_(a) {
  if (['ACCEPTED', 'CONFIRMED'].indexOf(String(a.Status)) < 0) return null;
  const url = revealUrl_();
  return url ? { url: url, play: !String(a.RevealSeen || '').trim() } : null;
}

/** Called once the reveal starts playing, so it never plays on its own again (any device). */
function home_revealSeen() {
  return traced_('home_revealSeen', 'home', () => {
    const found = requireApplicant_();
    if (!revealFor_(found.data)) return { ok: false };
    if (String(found.data.RevealSeen || '').trim()) return { ok: true };
    withScriptLock_(15000, () => {
      const now = getApplicantById_(found.data.ApplicantID);
      if (now && !String(now.data.RevealSeen || '').trim()) updateApplicant_(now.row, { RevealSeen: new Date() }, found.data.ApplicantID);
    });
    return { ok: true };
  });
}

/** An applicant's eye-scan photo (Applicants › EyePhoto) as a small data URL (Drive's thumbnail), or ''. */
function revealEyeSrc_(a) {
  const id = (String((a && a.EyePhoto) || '').match(/\/d\/([\w-]{20,})/) || [])[1];
  if (!id) return '';
  try {
    const f = DriveApp.getFileById(id);
    const blob = f.getThumbnail() || (f.getSize() < 1500000 ? f.getBlob() : null);
    if (!blob) return '';
    const type = String(blob.getContentType() || 'image/png').toLowerCase();
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return '';   // e.g. a HEIC original: browsers can't draw it
    return 'data:' + type + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return ''; }
}

/**
 * Their own eye-scan photo for the reveal's mirror ("That one is you."). Only for someone the reveal plays for;
 * anything missing or unreadable returns '' and the film keeps its drawn mirror.
 */
function home_revealEye() {
  return traced_('home_revealEye', 'home', () => {
    const found = requireApplicant_();
    return { src: revealFor_(found.data) ? revealEyeSrc_(found.data) : '' };
  }, r => (r && r.src ? 'eye sent' : 'no eye'));
}

/**
 * The core team's preview of the film exactly as one applicant will see it (...exec?reveal=1&as=APP-2447): their
 * first name, file number and eye photo. Admins only; nothing is recorded (no RevealSeen, no events).
 */
function home_revealPreview(applicantId) {
  return traced_('home_revealPreview', 'home', () => {
    if (!isAdmin_(currentEmail_())) throw new Error('Only the core team can preview as an applicant.');
    const found = getApplicantById_(String(applicantId || '').trim());
    if (!found) return { ok: false };
    const a = found.data;
    return { ok: true, id: a.ApplicantID, nick: String(a.Nickname || a.FullName || '').trim().split(' ')[0], eye: revealEyeSrc_(a) };
  });
}

/** How the film went for this person (finished / skipped / replayed / opened), one Activity row each. */
function home_revealEvent(kind) {
  const k = ['finished', 'skipped', 'replayed', 'opened'].indexOf(String(kind)) >= 0 ? String(kind) : '';
  if (!k) return { ok: false };
  const found = requireApplicant_();
  if (!revealFor_(found.data)) return { ok: false };
  activity_('reveal_' + k, found.data.ApplicantID, { page: 'home' });
  return { ok: true };
}

/** Referral info for the hub; a failure (busy lock, sheet hiccup) hides the card instead of breaking the whole hub. */
function safeReferral_(found) {
  try { return referralInfo_(found); } catch (e) {
    activity_('referral_info', String(e && e.message), { level: 'WARN', page: 'home' });
    return null;
  }
}
