/**
 * Code.gs  (integrator owns this file)
 * The project's entry point and the ONLY doGet. Opens a page based on ?page= in the link.
 *
 * The portal has two pages:
 *   .../exec               -> Home.html   the hub (Keene). Shows the Dashboard inside it and links to everything.
 *   .../exec?page=apply    -> Apply.html  the application form (Member A)
 * Inside Home: Dashboard.html + DashboardApi.gs (Member B), pulled in with includeOptional_.
 * Requirements + payment: two Google Forms (links in Settings). Officers: the Sheet (AdminMenu.gs).
 *
 * FILE NAMES: Apps Script won't let a .gs and an .html share a name (Home.gs + Home.html = error),
 * so server code is HomeApi.gs, ApplyApi.gs, DashboardApi.gs.
 * Shared: Code.gs (this), Utils.gs, Brand.gs, Setup.gs, AdminMenu.gs, Styles.html, PageTop.html, Loader.html.
 * Any other ?page= value shows Home.
 */
const PAGES = {
  home:  'Home',
  apply: 'Apply'
};

function doGet(e) {
  const key = String((e && e.parameter && e.parameter.page) || 'home').toLowerCase();
  const file = PAGES[key] || 'Home';
  let notice = '';

  let template;
  try {
    template = HtmlService.createTemplateFromFile(file);
  } catch (err) {
    // page not built yet -> show Home with a "coming soon" note
    template = HtmlService.createTemplateFromFile('Home');
    notice = BRAND.messages.comingSoon;
  }
  // Everything a page's scriptlets can use. Pass it in; don't rely on globals inside templates.
  template.BRAND = BRAND;
  template.notice = notice;
  template.page = key;
  template.baseUrl = portalUrl_();
  activity_('page_view', notice ? 'unknown page, showed Home' : '', { page: key });
  return template.evaluate()
    .setTitle(BRAND.portalName)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * The portal's own link, pinned to the school domain:
 *   https://script.google.com/a/macros/student.ateneo.edu/s/<id>/exec
 * With several Google accounts signed in, the plain /macros/s/... link opens with the browser's
 * default (often personal) account and Google shows "file not found". The /a/macros/<domain>/ form
 * makes Google use the school account instead. Domain = first AllowedEmailDomains entry.
 */
function portalUrl_() {
  const url = ScriptApp.getService().getUrl() || '';
  let domain = 'student.ateneo.edu';
  try { domain = String(getSetting_('AllowedEmailDomains') || '').split(',')[0].trim().replace(/^@/, '') || domain; } catch (e) { /* Settings missing: use the default */ }
  const m = url.match(/\/s\/([^/]+)\/(exec|dev)/);
  return m ? 'https://script.google.com/a/macros/' + domain + '/s/' + m[1] + '/' + m[2] : url;
}

/** Lets any page pull in shared files: <?!= include('Styles') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Like include(), but for a shared piece that needs scriptlets (e.g. PageTop).
 * Usage in a page: <?!= includeTemplate('PageTop', { BRAND: BRAND, baseUrl: baseUrl, title: 'Apply' }) ?>
 */
function includeTemplate(name, vars) {
  const t = HtmlService.createTemplateFromFile(name);
  Object.keys(vars || {}).forEach(k => { t[k] = vars[k]; });
  return t.evaluate().getContent();
}

/**
 * For optional pieces inside a page (e.g. the Dashboard inside Home). Returns '' when the file
 * doesn't exist or its template throws, so one broken widget can never take down the hub.
 * Private (trailing _): scriptlets can call it, the browser can't.
 */
function includeOptional_(name, vars) {
  try {
    return includeTemplate(name, vars);
  } catch (err) {
    console.error('includeOptional_(' + name + ') skipped: ' + (err && err.message));
    return '';
  }
}
