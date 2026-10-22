/**
 * HomeApi.gs  (server code for Home.html — functions start with home_)
 * Named HomeApi, not Home, because Home.html already uses that name.
 */

/** Everything the hub needs in one call. */
function home_getContext() {
  return traced_('home_getContext', 'home', home_getContext_, c =>
    (c.applicant ? c.applicant.id + ' ' + c.applicant.status : (c.signedIn ? 'signed in, no file' : 'guest')) + (c.isAdmin ? ' (admin)' : ''));
}
function home_getContext_() {
  const email = currentEmail_();
  const s = getSettings_();
  const deadline = parseDate_(s.Deadline);
  const payDeadline = parseDate_(s.PaymentDeadline);
  const reqsDeadline = parseDate_(s.RequirementsDeadline);
  const camp = campStart_(s);
  const found = email ? getApplicantForPortal_(email) : null;
  const a = found ? found.data : null;
  const p = progress_(a);

  return {
    email: email,
    signedIn: !!email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    isOpen: isOpen_(),
    deadline: deadline ? deadline.toISOString() : null,
    deadlines: {
      apply: deadline ? deadline.toISOString() : null,
      payment: payDeadline ? payDeadline.toISOString() : null,
      requirements: reqsDeadline ? reqsDeadline.toISOString() : null,
      camp: camp
    },
    campStart: camp,   // ISO or null; Home counts down to it once the applicant is CONFIRMED
    contact: String(s.ContactEmail || ''),
    isAdmin: isAdmin_(email),
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
      message: String(a.MessageToApplicant || '').trim().slice(0, 1000)   // a note from the core team (Applicants › MessageToApplicant)
    } : null,
    progress: p,
    preleads: { date: String(s.PreLeadsDate || ''), time: String(s.PreLeadsTime || ''), venue: String(s.PreLeadsVenue || '') },   // the Home banner
    referral: found ? safeReferral_(found) : null,   // own code + counts (never names); Referrals.gs
    sheetUrl: isAdmin_(email) ? sheetUrl_() : ''   // the core team gets a link to the Sheet
  };
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

/** Referral info for the hub; a failure (busy lock, sheet hiccup) hides the card instead of breaking the whole hub. */
function safeReferral_(found) {
  try { return referralInfo_(found); } catch (e) {
    activity_('referral_info', String(e && e.message), { level: 'WARN', page: 'home' });
    return null;
  }
}
