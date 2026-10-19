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
  const found = email ? getApplicantByEmail_(email) : null;
  const a = found ? found.data : null;
  const p = progress_(a);

  return {
    email: email,
    signedIn: !!email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    isOpen: isOpen_(),
    deadline: deadline ? deadline.toISOString() : null,
    campStart: campStart_(s),   // ISO or null; Home counts down to it once the applicant is CONFIRMED
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
      payment: a.Payment || 'NONE'
    } : null,
    progress: p,
    referral: found ? referralInfo_(found) : null,   // own code + counts (never names); Referrals.gs
    sheetUrl: isAdmin_(email) ? ss_().getUrl() : ''   // officers get a link to the Sheet
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
