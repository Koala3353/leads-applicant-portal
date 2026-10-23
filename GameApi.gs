/**
 * GameApi.gs
 * Server implementation for Game.html (Eyes on LEADS "Threat Assessment", step 2 of applying).
 * Handles the updated 16 questions (Fear, Random + Open-ended ghost prompt, Personality + This-or-That).
 */

const GAME_QUESTION_IDS = [
  'Q1', 'Q2', 'Q3', 'Q4',              // Room 1: Fear (MCQ)
  'Q5', 'Q6', 'Q7', 'Q8', 'Q9',        // Room 2: Random (Q5-Q8 MCQ, Q9 open-ended text)
  'Q10', 'Q11', 'Q12', 'Q13',          // Room 3: Personality (MCQ)
  'Q14', 'Q15', 'Q16'                  // Room 3: This or That (A/B)
];

const GAME_CHOICES = ['A', 'B', 'C', 'NONE'];
const THIS_OR_THAT = ['Q14', 'Q15', 'Q16'];   // two options only

function game_getInit() {
  return traced_('game_getInit', 'game', game_getInit_, r =>
    r.alreadyApplied ? 'already applied' : r.hasDraft ? 'ready' : 'no draft');
}

function game_getInit_() {
  const email = currentEmail_();
  const found = email ? getApplicantForPortal_(email) : null;
  const draft = email && !found ? apply_getDraft_(email) : null;
  let saved = {};
  if (draft && draft.data && draft.data.GameAnswers) {
    // only v3 saves (the 16-question game): an older 5-question save used the same ids for different questions
    try { const g = JSON.parse(draft.data.GameAnswers); saved = g && g.v === 3 ? game_cleanAnswers_(g.answers) : {}; } catch (e) { saved = {}; }
  }
  return {
    signedIn: !!email,
    email: email,
    allowedDomain: email ? isAllowedDomain_(email) : false,
    alreadyApplied: found ? { id: found.data.ApplicantID, status: found.data.Status } : null,
    hasDraft: !!(draft && draft.data),
    hasEye: !!(draft && draft.data && draft.data.EyePhoto),   // the eye scan after the passcode is on file
    idNumber: draft && draft.data ? String(draft.data.IDNumber || '').replace(/\D/g, '').slice(0, 6) : '',
    fee: setting_('RegistrationFee'),
    primer: /^https:\/\//.test(setting_('PrimerLink')) ? setting_('PrimerLink') : '',
    isOpen: isOpen_(),   // closed: the page says so instead of letting them play a game they can't file
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
      const allowed = THIS_OR_THAT.indexOf(id) >= 0 ? ['A', 'B', 'NONE'] : GAME_CHOICES;   // Q14-Q16 have no C
      if (allowed.indexOf(choice) >= 0) {
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
    return apply_saveDraft_({ GameAnswers: JSON.stringify({ v: 3, answers: game_cleanAnswers_(answers) }) });
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

    if (!String(draft.data.EyePhoto || '')) return { ok: false, eye: true };   // the eye scan comes before filing

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
  }, r => r.ok ? r.id + ' submitted' : r.eye ? 'no eye scan yet' : 'needs fixing: ' + Object.keys(r.errors || {}).join(', '));
}

/* ---------------- Eye scan (after the passcode) ----------------
 * A close-up photo of one eye, saved in the Drive folder in Settings › EyeFolder (made the first time, owned by the
 * script owner, shared with nobody) as EYE_<IDNumber>.<ext>. The link goes into the applicant's draft (server-side only:
 * apply_saveDraft never accepts it from the page) and from there into Applicants › EyePhoto when they file.
 * A new upload replaces the old file (the old one is trashed). Up to 6 uploads per person per day.
 */
const EYE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const EYE_MAX_BYTES = 5 * 1024 * 1024;

function game_uploadEye(file) {
  return traced_('game_uploadEye', 'game', () => game_uploadEye_(file || {}), r => r.ok ? 'eye scan saved' : 'not saved: ' + r.error);
}
function game_uploadEye_(file) {
  const email = currentEmail_();
  if (!email || !isAllowedDomain_(email)) throw new Error('Sign in with your Ateneo account first.');
  if (getApplicantByEmail_(email)) return { ok: false, error: 'You already applied. Your file is on record.' };
  const draft = apply_getDraft_(email);
  if (!draft || !draft.data) return { ok: false, error: 'Fill in the application form first.' };

  const type = String(file.type || '').toLowerCase();
  if (EYE_TYPES.indexOf(type) < 0) return { ok: false, error: 'Upload a photo (JPG, PNG, WEBP or HEIC).' };
  let bytes;
  try { bytes = Utilities.base64Decode(String(file.data || '')); } catch (e) { return { ok: false, error: 'That photo could not be read. Try again.' }; }
  if (!bytes.length) return { ok: false, error: 'That photo is empty.' };
  if (bytes.length > EYE_MAX_BYTES) return { ok: false, error: 'That photo is over 5 MB. Take a closer, smaller one.' };
  if (!steps_looksLike_(bytes, type)) return { ok: false, error: 'That file does not look like a photo. Try another one.' };
  if (!bump_('eye:' + email + ':' + Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd'), 6, 90000)) {
    return { ok: false, error: 'That is enough uploads for today. If something is wrong, message the core team.' };
  }

  const idNo = String(draft.data.IDNumber || '').replace(/\D/g, '').slice(0, 6) || 'NOID';
  const saved = game_eyeFolder_().createFile(Utilities.newBlob(bytes, type, 'EYE_' + idNo + '.' + PROOF_EXT[type]));
  saved.setDescription('Eye scan uploaded by ' + email + ' through the LEADS portal.');
  const r = apply_saveDraft_({}, { EyePhoto: saved.getUrl() });
  if (!r || !r.ok) {
    try { saved.setTrashed(true); } catch (e) { /* best effort */ }
    return { ok: false, error: r && r.consent ? 'Tick the data-privacy consent on the form first.' : 'Your file is busy. Try again in a moment.' };
  }
  const old = (String(draft.data.EyePhoto || '').match(/\/d\/([\w-]{20,})/) || [])[1];
  if (old && old !== saved.getId()) { try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* gone already */ } }
  return { ok: true };
}

/** Settings › EyeFolder, or a new "<EventName> - Eye Scans" folder owned by the script owner (saved there). */
function game_eyeFolder_() {
  const id = (String(setting_('EyeFolder') || '').match(/folders\/([\w-]{20,})/) || [])[1];
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* gone: make a new one */ } }
  return withScriptLock_(20000, () => {
    clearConfigCache_(); getSettings_.cache = null; cachedTab_.memo = {};
    const again = (String(getSetting_('EyeFolder') || '').match(/folders\/([\w-]{20,})/) || [])[1];
    if (again && again !== id) return DriveApp.getFolderById(again);
    const folder = DriveApp.createFolder((getSetting_('EventName') || 'LEADS') + ' - Eye Scans');
    writeSetting_('EyeFolder', folder.getUrl());
    return folder;
  });
}
/* ---------------- Game sounds ----------------
 * The knock and the jumpscare scream are audio files in Google Drive. A Drive link can't be used as an <audio> src
 * (Drive answers with a redirect / warning page, not the file), so the script reads them as the owner and hands them to
 * the page as data. The owner's account needs view access to the files ("anyone with the link" is enough).
 * Cached for 6 hours in pieces (CacheService allows ~100 KB per value). '' for a sound that can't be read: the page
 * then plays its built-in synthesized version.
 */
const GAME_SOUNDS = {
  knock: '1SPokAz52Y1m4WY_JeBp9HmbAhyZyLhND',
  scare: '19Nz0uFPLIm5Avu7ifXxYdWZHri4vMqE4'
};
const GAME_SOUND_MAX_BYTES = 3 * 1024 * 1024;

function game_getSounds() {
  return traced_('game_getSounds', 'game', () => {
    const out = {};
    Object.keys(GAME_SOUNDS).forEach(k => { out[k] = game_sound_(GAME_SOUNDS[k]); });
    return out;
  }, r => Object.keys(r).map(k => k + (r[k] ? ' ok' : ' missing')).join(', '));
}

function game_sound_(id) {
  const cache = CacheService.getScriptCache(), key = 'snd:' + id, PIECE = 90000;
  try {
    const n = Number(cache.get(key + ':n') || 0);
    if (n) {
      const keys = []; for (let i = 0; i < n; i++) keys.push(key + ':' + i);
      const got = cache.getAll(keys);
      if (keys.every(x => got[x])) return keys.map(x => got[x]).join('');
    }
  } catch (e) { /* cache down: read from Drive */ }
  try {
    const blob = DriveApp.getFileById(id).getBlob();
    const bytes = blob.getBytes();
    if (bytes.length > GAME_SOUND_MAX_BYTES) throw new Error('over 3 MB');
    const type = /^audio\//.test(blob.getContentType()) ? blob.getContentType() : 'audio/mpeg';
    const data = 'data:' + type + ';base64,' + Utilities.base64Encode(bytes);
    try {
      const pieces = {}, count = Math.ceil(data.length / PIECE);
      for (let i = 0; i < count; i++) pieces[key + ':' + i] = data.slice(i * PIECE, (i + 1) * PIECE);
      cache.putAll(pieces, 21600);
      cache.put(key + ':n', String(count), 21600);
    } catch (e) { /* too big for the cache: still return it */ }
    return data;
  } catch (e) {
    activity_('game_sound', 'Could not read sound file ' + id + ': ' + (e && e.message), { level: 'WARN', page: 'game' });
    return '';
  }
}
