/**
 * StepsApi.gs  (server code for Steps.html: the steps after acceptance. Public functions start with steps_.)
 *
 *   ?page=pay    02 Proof of payment   Settings > PaymentOpen, PaymentDetails, PaymentQRCodes, PaymentDeadline
 *                                      Upload: saved to the Drive folder in Settings > PaymentFolder (made automatically
 *                                      the first time), linked in the applicant's PaymentProof column, Payment -> SUBMITTED.
 *   ?page=reqs   03 Requirements       Settings > RequirementsOpen, RequirementsNote, RequirementsDeadline
 *                                      + the Requirements tab (Form | Link | What to do | Due), one row per Google Form.
 *   ?page=ga     04 1st GA             Settings > GACalendarLink (locked until it's filled in), GADetails
 *   ?page=room   05 Room booking       Settings > RoomBookingOpen, RoomBookingNote (placeholder page for now)
 *
 * Who can open what is decided ONLY by progress_() in Utils.gs. Content (QR codes, form links) is handed out
 * only once that step is unlocked for this person. Never accept an email or ID from the page.
 */

const STEP_KEYS = { pay: 'payment', reqs: 'requirements', ga: 'ga', room: 'room' };
const PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const PROOF_MAX_BYTES = 8 * 1024 * 1024;
const PROOF_PER_DAY = 5;   // uploads per applicant per day: a fix-up is fine, filling the owner's Drive isn't
const PROOF_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

/** Does the file really start like the type it claims? (the browser's type is only the filename's guess) */
function steps_looksLike_(bytes, type) {
  const b = i => bytes[i] & 255, ascii = (from, len) => String.fromCharCode.apply(null, bytes.slice(from, from + len).map(x => x & 255));
  if (type === 'image/png') return b(0) === 0x89 && ascii(1, 3) === 'PNG';
  if (type === 'image/jpeg') return b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF;
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
  if (type === 'application/pdf') return ascii(0, 5) === '%PDF-';
  if (type === 'image/heic' || type === 'image/heif') return ascii(4, 4) === 'ftyp';
  return false;
}

function steps_get(page) {
  return traced_('steps_get', String(page || ''), () => steps_get_(page), r =>
    r.applicant ? r.applicant.id + ' ' + r.step.state : (r.signedIn ? 'no file' : 'guest'));
}

function steps_get_(page) {
  const key = STEP_KEYS[page] ? page : 'pay';
  const email = currentEmail_();
  const found = email ? getApplicantForPortal_(email) : null;
  const a = found ? found.data : null;
  const p = progress_(a);
  const step = p[STEP_KEYS[key]];
  const s = getSettings_();
  const iso = v => { const d = parseDate_(v); return d ? d.toISOString() : null; };

  const out = {
    page: key,
    signedIn: !!email,
    email: email,
    applicant: a ? { id: a.ApplicantID, firstName: String(a.Nickname || a.FullName || '').trim().split(' ')[0], status: a.Status,
      payment: a.Payment || 'NONE', requirements: a.Requirements || 'NONE',
      message: String(a.MessageToApplicant || '').trim().slice(0, 1000) } : null,
    step: { state: step.state, unlocked: !!step.unlocked, why: step.why || '' },
    progress: { payment: p.payment.state, requirements: p.requirements.state, ga: p.ga.state, room: p.room.state },
    contact: String(s.ContactEmail || ''),
    content: null
  };
  if (!a || !step.unlocked && step.state !== 'done') return out;

  if (key === 'pay') {
    out.content = {
      details: String(s.PaymentDetails || ''),
      deadline: iso(s.PaymentDeadline),
      qrs: step.unlocked ? steps_qrCodes_(String(s.PaymentQRCodes || '')) : [],
      proof: String(a.PaymentProof || '') ? true : false
    };
  } else if (key === 'reqs') {
    out.content = { note: String(s.RequirementsNote || ''), deadline: iso(s.RequirementsDeadline), forms: steps_forms_(a.ApplicantID) };
  } else if (key === 'ga') {
    out.content = { link: gaLink_(), details: String(s.GADetails || '') };
  } else if (key === 'room') {
    out.content = { note: String(s.RoomBookingNote || '') };
  }
  return out;
}

/** The Requirements tab: Form | Link | What to do | Due. Rows without a title are skipped. */
function steps_forms_(applicantId) {
  const sh = ss_().getSheetByName(SHEET.REQUIREMENTS);
  if (!sh) return [];
  const rows = cachedTab_(SHEET.REQUIREMENTS);
  const head = rows[0] || [];
  const c = { title: headerIndex_(head, ['form', 'title', 'requirement']), link: headerIndex_(head, ['link', 'url', 'form link']),
    what: headerIndex_(head, ['what to do', 'instructions']), due: headerIndex_(head, ['due', 'deadline']) };
  return rows.slice(1).filter(r => c.title >= 0 && String(r[c.title]).trim()).map(r => {
    const raw = c.link >= 0 ? String(r[c.link]).trim() : '';
    const link = formLink_(raw, applicantId) || (/^https:\/\//.test(raw) ? raw : '');
    const due = c.due >= 0 ? parseDate_(r[c.due]) : null;
    return {
      title: String(r[c.title]).trim(),
      link: link,
      embed: steps_embedUrl_(link),
      what: c.what >= 0 ? String(r[c.what]).trim() : '',
      due: due ? due.toISOString() : (c.due >= 0 ? String(r[c.due]).trim() : '')
    };
  });
}

/** A Google Form link made embeddable for the preview ('' for anything else). */
function steps_embedUrl_(link) {
  if (!/^https:\/\/docs\.google\.com\/forms\//.test(link)) return '';
  return link + (link.indexOf('?') >= 0 ? '&' : '?') + 'embedded=true';
}

/**
 * Settings > PaymentQRCodes: one QR per line, "Label | link". The link can be a Drive file (shared or not: the
 * script reads it as the owner) or a plain image link. Drive images are sent to the page as data so applicants
 * never need access to the file. Cached for 6 hours.
 */
function steps_qrCodes_(text) {
  return String(text).split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, 6).map(line => {
    const parts = line.split('|');
    const label = parts.length > 1 ? parts[0].trim() : '';
    const link = (parts.length > 1 ? parts.slice(1).join('|') : parts[0]).trim();
    const id = (link.match(/\/d\/([\w-]{20,})/) || link.match(/[?&]id=([\w-]{20,})/) || [])[1];
    if (!id) return { label: label, src: /^https:\/\//.test(link) ? link : '' };
    const cache = CacheService.getScriptCache(), key = 'qr:' + id;
    let src = cache.get(key);
    if (!src) {
      try {
        const blob = DriveApp.getFileById(id).getBlob();
        src = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        if (src.length < 95000) cache.put(key, src, 21600);
      } catch (e) {
        activity_('steps_qr', 'Could not read a QR file: ' + (e && e.message), { level: 'WARN', page: 'pay' });
        src = '';   // the page shows "QR unavailable"; never hand out the raw Drive file ID
      }
    }
    return { label: label, src: src };
  }).filter(q => q.src);
}

/**
 * Upload proof of payment. file = { name, type, data (base64, no data: prefix) }.
 * Saves it in the PaymentFolder, links it in PaymentProof, and sets Payment to SUBMITTED.
 */
function steps_uploadProof(file) {
  return traced_('steps_uploadProof', 'pay', () => steps_uploadProof_(file || {}), r => r.ok ? r.id + ' proof uploaded' : 'not uploaded: ' + r.error);
}

function steps_uploadProof_(file) {
  const found = requireApplicant_();
  const a = found.data;
  const p = progress_(a);
  if (!p.payment.unlocked) return { ok: false, error: p.payment.state === 'done' ? 'Your payment is already verified.' : 'Proof of payment is not open for you yet.' };

  const type = String(file.type || '').toLowerCase();
  if (PROOF_TYPES.indexOf(type) < 0) return { ok: false, error: 'Upload a photo (PNG, JPG, WEBP, HEIC) or a PDF.' };
  let bytes;
  try { bytes = Utilities.base64Decode(String(file.data || '')); } catch (e) { return { ok: false, error: 'That file could not be read. Try again.' }; }
  if (!bytes.length) return { ok: false, error: 'That file is empty.' };
  if (bytes.length > PROOF_MAX_BYTES) return { ok: false, error: 'That file is over 8 MB. Send a smaller photo or a screenshot.' };
  if (!steps_looksLike_(bytes, type)) return { ok: false, error: 'That file does not look like a photo or a PDF. Send a screenshot of the receipt.' };
  const dayKey = 'proof:' + String(a.Email || '').toLowerCase() + ':' + Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd');
  if (!bump_(dayKey, PROOF_PER_DAY, 90000)) return { ok: false, error: 'That is enough uploads for today. If the wrong file went in, message the core team.' };

  const ext = PROOF_EXT[type];   // from the checked type, never from the uploaded filename
  const stamp = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyy-MM-dd HHmm');
  const name = a.ApplicantID + ' ' + String(a.FullName || '').replace(/[^\w .'-]/g, '').slice(0, 60) + ' - proof of payment ' + stamp + '.' + ext;
  const saved = steps_proofFolder_().createFile(Utilities.newBlob(bytes, type, name));
  saved.setDescription('Uploaded by ' + a.Email + ' through the LEADS portal.');

  try {
    withScriptLock_(20000, () => {
      // find the row again: rows may have been sorted or deleted during the (slow) Drive upload
      const now = getApplicantById_(a.ApplicantID);
      if (!now) throw new Error('Your file could not be found. Message the core team.');
      updateApplicant_(now.row, { PaymentProof: saved.getUrl() }, a.ApplicantID);
    });
  } catch (err) {
    // never leave a receipt (personal data) in Drive that no row points to
    try { saved.setTrashed(true); } catch (e) { /* best effort */ }
    throw err;
  }
  const before = String(a.Payment || 'NONE');
  if (before !== 'SUBMITTED') setTrack_(a.ApplicantID, 'Payment', 'SUBMITTED', 'system');
  else logChange_(a.ApplicantID, 'payment proof', 'replaced', 'new file', 'system');
  return { ok: true, id: a.ApplicantID };
}

/** The Drive folder for proofs: Settings > PaymentFolder (a folder link), or a new "LEADS Proof of Payment" folder saved there. */
function steps_proofFolder_() {
  const link = String(getSetting_('PaymentFolder') || '');
  const id = (link.match(/folders\/([\w-]{20,})/) || link.match(/^([\w-]{25,})$/) || [])[1];
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* gone or no access: make a new one */ } }
  return withScriptLock_(20000, () => {
    clearConfigCache_(); getSettings_.cache = null; cachedTab_.memo = {};   // re-read Settings for real
    const again = (String(getSetting_('PaymentFolder') || '').match(/folders\/([\w-]{20,})/) || [])[1];
    if (again && again !== id) return DriveApp.getFolderById(again);
    // reuse a folder made by an earlier run (e.g. one whose link couldn't be saved) instead of making a second one
    const name = (getSetting_('EventName') || 'LEADS') + ' - Proof of Payment';
    const same = DriveApp.getFoldersByName(name);
    let folder = null;
    // only a folder this script's owner owns: a same-named folder someone shared with us must never receive receipts
    const me = Session.getEffectiveUser().getEmail().toLowerCase();
    while (!folder && same.hasNext()) {
      const f = same.next();
      try { if (!f.isTrashed() && f.getOwner() && f.getOwner().getEmail().toLowerCase() === me) folder = f; } catch (e) { /* skip */ }
    }
    folder = folder || DriveApp.createFolder(name);
    writeSetting_('PaymentFolder', folder.getUrl());
    return folder;
  });
}

/** Run once from the editor (as the owner) so Google asks for the Drive permission the upload needs. */
function steps_authorizeDrive() {
  ownerOnly_();
  const folder = steps_proofFolder_();
  return 'Drive is connected. Proofs of payment go to ' + folder.getUrl();
}
