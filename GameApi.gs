/**
 * GameApi.gs
 * Server implementation for Game.html (LEADS: Oversight "Threat Assessment", step 2 of applying).
 * The questions live in Game.html; the server only needs their ids to whitelist the answers.
 */

const GAME_QUESTION_IDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
const GAME_CHOICES = ['A', 'B', 'C', 'NONE'];   // NONE = the room's timer ran out first

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
    nickname: draft && draft.data ? String(draft.data.Nickname || '').slice(0, 30) : '',   // their own answer, for the mirror
    saved: saved   // answers from an earlier visit, so a reload resumes where they left off
  };
}

/**
 * Keeps only known question ids with a known choice and a sane time. Anything else from the page is dropped.
 * Shape: { Q1: { a: 'B', ms: 4200 }, ... }
 */
function game_cleanAnswers_(answers) {
  const out = {};
  if (!answers || typeof answers !== 'object') return out;
  GAME_QUESTION_IDS.forEach(id => {
    const x = answers[id];
    if (!x || GAME_CHOICES.indexOf(String(x.a)) < 0) return;
    const ms = Math.round(Number(x.ms));
    out[id] = { a: String(x.a), ms: isFinite(ms) ? Math.max(0, Math.min(ms, 600000)) : 0 };
  });
  return out;
}

/** Saves answers so far into the applicant's draft (called after each room). */
function game_saveProgress(answers) {
  return traced_('game_saveProgress', 'game', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) return { ok: false };
    // apply_saveDraft merges onto the stored draft under the lock, so the Apply answers stay intact
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

    // Safe to retry: if this account already has a file (e.g. the first attempt went through but the answer was lost
    // on a bad connection, and the browser retried), report success with the existing ID instead of an error.
    const existing = getApplicantByEmail_(email);
    if (existing) { apply_deleteDraft_(email); return { ok: true, id: existing.data.ApplicantID, referralCode: existing.data.ReferralCode || '', already: true }; }

    const draft = apply_getDraft_(email);
    if (!draft || !draft.data) {
      throw new Error('No saved application found. Fill in the application form first.');
    }

    const clean = game_cleanAnswers_(answers);
    if (Object.keys(clean).length !== GAME_QUESTION_IDS.length) {
      throw new Error('The assessment is not finished yet. Clear all three feeds first.');
    }

    const fullForm = Object.assign({}, draft.data, {
      GameAnswers: JSON.stringify({ v: 2, answers: clean })
    });
    try {
      return apply_submit_(fullForm);
    } catch (err) {
      // two tabs / a retry racing each other: the other one filed it first
      if (/already applied/i.test(String(err && err.message))) {
        const again = getApplicantByEmail_(email);
        if (again) return { ok: true, id: again.data.ApplicantID, already: true };
      }
      throw err;
    }
  }, r => r.ok ? r.id + ' submitted' : 'needs fixing: ' + Object.keys(r.errors || {}).join(', '));
}
