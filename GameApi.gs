/**
 * GameApi.gs
 * Server implementation for Game.html (LEADS: Oversight CCTV Surveillance Mini-Game).
 */

function game_getInit() {
  return traced_('game_getInit', 'game', game_getInit_, () => 'game loaded');
}

function game_getInit_() {
  const email = currentEmail_();
  const found = email ? getApplicantByEmail_(email) : null;
  const draft = email ? apply_getDraft_(email) : null;

  return {
    signedIn: !!email,
    email: email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    alreadyApplied: found ? { id: found.data.ApplicantID, status: found.data.Status } : null,
    draft: draft
  };
}

/** Saves game state choices into applicant draft */
function game_saveProgress(answers) {
  return traced_('game_saveProgress', 'game', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) return { ok: false };
    
    // Save choices to server draft under GameAnswers key
    const existing = apply_getDraft_(email) || { data: {} };
    existing.data.GameAnswers = answers;
    return apply_saveDraft_(existing.data);
  });
}

/**
 * Submits the final application combined with game answers.
 */
function game_submitFinal(answers) {
  return traced_('game_submitFinal', 'game', () => {
    const email = currentEmail_();
    if (!email || !isAllowedDomain_(email)) {
      throw new Error('Sign in with your Ateneo account first.');
    }

    // 1. Retrieve saved draft from Apply.html
    const draft = apply_getDraft_(email);
    if (!draft || !draft.data) {
      throw new Error('No draft application found. Please complete Section 1 first.');
    }

    // 2. Combine draft data with Game Answers
    const fullForm = Object.assign({}, draft.data, { GameAnswers: JSON.stringify(answers || {}) });

    // 3. Execute final submission
    return apply_submit_(fullForm);
  });
}