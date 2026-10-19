/**
 * DashboardApi.gs  (server code for Dashboard.html, the applicant dashboard inside the hub.
 * Public functions start with dash_.)
 *
 * STARTER: works as-is and returns only the logged-in applicant's own data.
 * The dashboard owner can extend it (see CONTEXT.md, section 9.2). Never accept an email or ID from the page.
 */

/** Everything the dashboard needs beyond home_getContext(), in one call. */
function dash_get() {
  return traced_('dash_get', 'home', dash_get_, d => d.applicant ? d.applicant.id + ' ' + d.applicant.status : 'no file');
}
function dash_get_() {
  const email = currentEmail_();
  const found = email ? getApplicantByEmail_(email) : null;
  if (!found) return { applicant: null };   // guests / non-applicants: the dashboard shows nothing

  const a = found.data;
  const s = getSettings_();
  const p = progress_(a);
  const iso = v => { const d = parseDate_(v); return d ? d.toISOString() : null; };

  return {
    applicant: {
      id: a.ApplicantID,
      nickname: a.Nickname || String(a.FullName || '').split(' ')[0],
      status: a.Status,
      requirements: a.Requirements || 'NONE',
      payment: a.Payment || 'NONE',
      appliedAt: a.Timestamp || null,
      lastUpdated: a.LastUpdated || null
    },
    progress: p,
    // each step has its own page (Steps.html): ?page=pay, reqs, ga, room. progress says which are open.
    pages: { payment: 'pay', requirements: 'reqs', ga: 'ga', room: 'room' },
    payment: { details: String(s.PaymentDetails || '') },
    deadlines: { requirements: iso(s.RequirementsDeadline), payment: iso(s.PaymentDeadline) },
    event: { name: String(s.EventName || ''), dates: String(s.EventDates || ''), venue: String(s.EventVenue || '') }
  };
}
