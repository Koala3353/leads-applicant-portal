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
    requirements: [],   // no checklist: the requirements Google Form says what to send
    // pre-filled Google Form links, only once that step is unlocked ('' otherwise or if not set up)
    forms: {
      requirements: p.requirements.unlocked ? formLink_('RequirementsFormURL', a.ApplicantID) : '',
      payment: p.payment.unlocked ? formLink_('PaymentFormURL', a.ApplicantID) : ''
    },
    payment: {
      fee: s.CampFee === '' || s.CampFee === undefined ? null : Number(s.CampFee),
      instructions: String(s.PaymentInstructions || '')
    },
    deadlines: { requirements: iso(s.RequirementsDeadline), payment: iso(s.PaymentDeadline) },
    event: { name: String(s.EventName || ''), dates: String(s.EventDates || ''), venue: String(s.EventVenue || '') }
  };
}
