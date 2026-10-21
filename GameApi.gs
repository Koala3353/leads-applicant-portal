/**
 * GameApi.gs
 * Server implementation for Game.html (LEADS: Oversight "Threat Assessment", step 2 of applying).
 * Handles the updated 16 questions (Fear, Random + Open-ended ghost prompt, Personality + This-or-That).
 */

const GAME_QUESTION_IDS = [
  'Q1', 'Q2', 'Q3', 'Q4',              // Room 1: Fear (MCQ)
  'Q5', 'Q6', 'Q7', 'Q8', 'Q9',        // Room 2: Random (Q5-Q8 MCQ, Q9 open-ended text)
  'Q10', 'Q11', 'Q12', 'Q13',          // Room 3: Personality (MCQ)
  'Q14', 'Q15', 'Q16'                  // Room 3: This or That (A/B)
];

const GAME_CHOICES = ['A', 'B', 'C', 'NONE'];

function game_getInit() {
  return traced_('game_getInit', 'game', game_getInit_, r =>
    r.alreadyApplied ? 'already applied' : r.hasDraft ? 'ready' : 'no draft');
}

function game_getInit_() {
  const email = currentEmail_();
  const found = email ? getApplicantByEmail_(email) : null;
  const draft = email && !found ? apply_getDraft_(email) : null;
  let saved = {};
  if (draft && draft.data && draft.data.GameAnswers) {
    try { saved = game_cleanAnswers_(JSON.parse(draft.data.GameAnswers)); } catch (e) { saved = {}; }
  }
  return {
    signedIn: !!email,
    email: email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    alreadyApplied: found ? { id: found.data.ApplicantID, status: found.data.Status } : null,
    hasDraft: !!(draft && draft.data),
    nickname: draft && draft.data ? String(draft.data.Nickname || '').slice(0, 30) : '',
    saved: saved
  };
}

/**
 * Sanitizes question responses. Whitelists MCQ choices and caps open-ended text to 250 characters.
 * Shape: { Q1: { a: 'B', ms: 4200 }, ..., Q9: { a: 'Text', ms: 3100 } }
 */
function game_cleanAnswers_(answers) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  GAME_QUESTION_IDS.forEach(id => {
    const x = answers[id];
    if (!x) return;
    const ms = Math.round(Number(x.ms));
    const safeMs = isFinite(ms) ? Math.max(0, Math.min(ms, 600000)) : 0;

    if (id === 'Q9') {
      // Open-ended ghost response (Room 2, Q5)
      const val = String(x.a || '').trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, 250);
      out[id] = { a: val || 'NONE', ms: safeMs };
    } else {
      const choice = String(x.a || '').toUpperCase();
      if (GAME_CHOICES.indexOf(choice) >= 0) {
        out[id] = { a: choice, ms: safeMs };
      }
    }
  });
  return out;
}

/** Saves answers so far into the applicant's draft (called after each room). */
function game_saveProgress(answers) {
  return traced_('game_saveProgress', 'game', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) return { ok: false };
    return apply_saveDraft({ GameAnswers: JSON.stringify(game_cleanAnswers_(answers)) });
  }, r => r.ok ? 'saved' : 'not saved');
}

/** Submits the application: the saved Apply draft + the cleaned game answers. */
function game_submitFinal(answers) {
  return traced_('game_submitFinal', 'game', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) {
      throw new Error('Sign in with your Ateneo account first.');
    }

    const existing = getApplicantByEmail_(email);
    if (existing) {
      apply_deleteDraft_(email);
      return { ok: true, id: existing.data.ApplicantID, referralCode: existing.data.ReferralCode || '', already: true };
    }

    const draft = apply_getDraft_(email);
    if (!draft || !draft.data) {
      throw new Error('No saved application found. Fill in the application form first.');
    }

    const clean = game_cleanAnswers_(answers);
    if (Object.keys(clean).length < GAME_QUESTION_IDS.length) {
      throw new Error('The assessment is not finished yet. Complete all three rooms first.');
    }

    const fullForm = Object.assign({}, draft.data, {
      GameAnswers: JSON.stringify({ v: 3, answers: clean })
    });
    try {
      return apply_submit_(fullForm);
    } catch (err) {
      if (/already applied/i.test(String(err && err.message))) {
        const again = getApplicantByEmail_(email);
        if (again) return { ok: true, id: again.data.ApplicantID, already: true };
      }
      throw err;
    }
  }, r => r.ok ? r.id + ' submitted' : 'needs fixing: ' + Object.keys(r.errors || {}).join(', '));
}