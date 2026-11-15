// The "Contact support" form on every pinch-app.io page: the landing page, the guides and the
// legal pages. Any element with data-support opens it, and so does a link to /#support.
//
// Messages go to the feedback table through submit_website_feedback (admin → Usage → Feedback).
// That function takes one message and an email, so the title and name are written into the
// message.
//
// Text: the landing and guide pages put their language's strings in
// <script type="application/json" id="support-text"> (landing/strings/<lang>.json, support.*).
// The legal pages are English and use the defaults below.
(function () {
  // The build fills these in (scripts/site-pages.mjs fillSupabaseConfig).
  var SUPABASE_URL = '__SUPABASE_URL__';
  var SUPABASE_KEY = '__SUPABASE_KEY__';
  var configured = SUPABASE_URL.indexOf('__') !== 0 && SUPABASE_KEY.indexOf('__') !== 0;

  var LIMITS = { name: 100, email: 254, subject: 150, message: 3500 };

  var TEXT = {
    title: 'Contact support',
    intro: 'A question, a bug, or an idea. We read every message and reply by email.',
    name: 'Your name',
    email: 'Your email',
    subject: 'Title',
    message: 'Description',
    cancel: 'Cancel',
    send: 'Send',
    required: 'Please fill in every field.',
    badEmail: 'That email doesn’t look right.',
    sending: 'Sending…',
    thanks: 'Thanks! We got your message and will reply by email.',
    failed: 'Couldn’t send. Please try again in a moment.',
  };
  var source = document.getElementById('support-text');
  if (source) {
    try {
      var localized = JSON.parse(source.textContent);
      for (var key in localized) if (localized[key]) TEXT[key] = localized[key];
    } catch (e) {}
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var name in attrs || {}) node.setAttribute(name, attrs[name]);
    if (text) node.textContent = text;
    return node;
  }

  function field(label, control) {
    var wrap = el('label', null, label);
    wrap.appendChild(control);
    return wrap;
  }

  var dialog = el('dialog', { class: 'support', id: 'support', 'aria-labelledby': 'support-title' });
  var form = el('form', { novalidate: '' });
  var nameInput = el('input', { name: 'name', required: '', maxlength: LIMITS.name, autocomplete: 'name' });
  var emailInput = el('input', {
    type: 'email',
    name: 'email',
    required: '',
    maxlength: LIMITS.email,
    autocomplete: 'email',
  });
  var subjectInput = el('input', { name: 'subject', required: '', maxlength: LIMITS.subject });
  var messageInput = el('textarea', { name: 'message', required: '', maxlength: LIMITS.message });
  var status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  var cancel = el('button', { type: 'button', class: 'btn btn-quiet' }, TEXT.cancel);
  var send = el('button', { type: 'submit', class: 'btn btn-web' }, TEXT.send);
  var row = el('div', { class: 'row' });
  row.appendChild(cancel);
  row.appendChild(send);

  form.appendChild(el('h2', { id: 'support-title' }, TEXT.title));
  form.appendChild(el('p', null, TEXT.intro));
  form.appendChild(field(TEXT.name, nameInput));
  form.appendChild(field(TEXT.email, emailInput));
  form.appendChild(field(TEXT.subject, subjectInput));
  form.appendChild(field(TEXT.message, messageInput));
  form.appendChild(status);
  form.appendChild(row);
  dialog.appendChild(form);

  function setStatus(text, isError) {
    status.textContent = text;
    status.className = 'status' + (isError ? ' error' : '');
  }

  function open() {
    if (!dialog.isConnected) document.body.appendChild(dialog);
    setStatus('');
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    nameInput.focus();
  }

  function close() {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-support]');
    if (!trigger) return;
    event.preventDefault();
    open();
  });
  cancel.addEventListener('click', close);
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog) close();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var name = nameInput.value.trim();
    var email = emailInput.value.trim();
    var subject = subjectInput.value.trim();
    var message = messageInput.value.trim();
    if (!name || !email || !subject || !message) return setStatus(TEXT.required, true);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      emailInput.focus();
      return setStatus(TEXT.badEmail, true);
    }
    if (!configured) return setStatus(TEXT.failed, true);

    send.disabled = true;
    setStatus(TEXT.sending);
    fetch(SUPABASE_URL + '/rest/v1/rpc/submit_website_feedback', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        p_message: subject + '\n\nFrom: ' + name + '\nPage: ' + location.pathname + '\n\n' + message,
        p_email: email,
        p_locale: navigator.language || null,
      }),
    })
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        form.reset();
        setStatus(TEXT.thanks);
        setTimeout(close, 2200);
      })
      .catch(function () {
        setStatus(TEXT.failed, true);
      })
      .then(function () {
        send.disabled = false;
      });
  });

  if (location.hash === '#support') open();
})();
