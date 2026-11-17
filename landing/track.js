// Page-view and store-button tracking for the static site (home page and guides).
// Writes product_events rows that the admin dashboard reads (web_intro_viewed / web_intro_clicked).
(function () {
  // The build fills these in; left as placeholders, tracking is off.
  var SUPABASE_URL = '__SUPABASE_URL__';
  var SUPABASE_KEY = '__SUPABASE_KEY__';
  if (SUPABASE_URL.indexOf('__') === 0 || SUPABASE_KEY.indexOf('__') === 0) return;

  // Not from local previews, so testing doesn't skew the numbers.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  function post(path, body) {
    return fetch(SUPABASE_URL + path, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
  }

  // Shared with the web app's AsyncStorage, so a visitor keeps one guest id.
  var INSTALL_KEY = 'pinch:install-id';
  function installId() {
    try {
      var id = localStorage.getItem(INSTALL_KEY);
      if (id && id.length >= 8) return id;
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : 'guest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(INSTALL_KEY, id);
      return id;
    } catch (e) {
      return 'guest-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
    }
  }
  function country() {
    var match = /-([A-Za-z]{2})$/.exec(navigator.language || '');
    return match ? match[1].toUpperCase() : null;
  }
  function capture(name, properties) {
    try {
      post('/rest/v1/product_events', {
        user_id: null,
        guest_install_id: installId(),
        name: name,
        properties: properties,
        country: country(),
      }).catch(function () {});
    } catch (e) {}
  }

  // "/guides/save-tiktok-recipes/" or "/he/guides/…" is a guide; anything else is the home page.
  function pageProperties() {
    var match = /\/guides\/([^/]+)/.exec(location.pathname);
    return match ? { page: 'guide', guide: match[1].slice(0, 64) } : { page: 'intro' };
  }

  // Where the visit came from: campaign tags (ChatGPT adds utm_source=chatgpt.com, the app's
  // "Share Pinch" adds pinch_app) and the referring site. Only the referrer's hostname is kept.
  function visitProperties() {
    var properties = pageProperties();
    try {
      var params = new URLSearchParams(window.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (key) {
        var value = params.get(key);
        if (value) properties[key] = value.slice(0, 64);
      });
    } catch (e) {}
    try {
      if (document.referrer) {
        var host = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (host && host !== location.hostname.replace(/^www\./, '')) properties.ref = host.slice(0, 64);
      }
    } catch (e) {}
    return properties;
  }

  capture('web_intro_viewed', visitProperties());
  var page = pageProperties();
  var links = document.querySelectorAll('[data-track]');
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function (event) {
      var properties = { action: event.currentTarget.getAttribute('data-track'), page: page.page };
      if (page.guide) properties.guide = page.guide;
      capture('web_intro_clicked', properties);
    });
  }
})();
