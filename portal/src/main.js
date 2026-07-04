import './styles.css';
import {
  signIn,
  completeNewPassword,
  getSession,
  signOut,
  idToken,
} from './cognito.js';
import {
  initStorage,
  listFiles,
  uploadFile,
  downloadUrl,
  deleteFile,
  listInbox,
  readInbox,
  archiveInbox,
} from './storage.js';

const $ = (id) => document.getElementById(id);

const views = {
  login: $('login-view'),
  newpass: $('newpass-view'),
  files: $('files-view'),
};

// The pending user during a FORCE_CHANGE_PASSWORD challenge.
let challenge = null;

function show(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function setError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
}

// --- show/hide password toggles --------------------------------------------
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

document.querySelectorAll('.pw-toggle').forEach((btn) => {
  const input = btn.parentElement.querySelector('input');
  btn.innerHTML = EYE_ICON;
  btn.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.innerHTML = reveal ? EYE_OFF_ICON : EYE_ICON;
    btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    input.focus();
  });
});

function fmtBytes(n) {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString();
}

// --- enter the authenticated app -------------------------------------------
async function enterApp(session, email) {
  await initStorage(idToken(session));
  $('user-email').textContent = email || '';
  show('files');
  await refreshList();
  await refreshInbox();
}

async function refreshList() {
  const list = $('file-list');
  list.innerHTML = '';
  try {
    const files = await listFiles();
    $('files-empty').hidden = files.length > 0;
    for (const f of files) {
      const li = document.createElement('li');
      li.className = 'file-row';

      const meta = document.createElement('div');
      meta.className = 'file-meta';
      meta.innerHTML =
        `<span class="file-name"></span>` +
        `<span class="file-sub">${fmtBytes(f.size)} · ${fmtDate(f.lastModified)}</span>`;
      meta.querySelector('.file-name').textContent = f.name;

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const dl = document.createElement('button');
      dl.className = 'btn-ghost';
      dl.textContent = 'Download';
      dl.addEventListener('click', async () => {
        const url = await downloadUrl(f.key);
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
      });

      const del = document.createElement('button');
      del.className = 'btn-ghost danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete "${f.name}"?`)) return;
        del.disabled = true;
        try {
          await deleteFile(f.key);
          await refreshList();
        } catch (err) {
          setError($('files-error'), err.message || String(err));
          del.disabled = false;
        }
      });

      actions.append(dl, del);
      li.append(meta, actions);
      list.append(li);
    }
  } catch (err) {
    setError($('files-error'), err.message || String(err));
  }
}

// --- contact-form notifications (admin only) --------------------------------
function inboxField(label, value) {
  if (!value) return null;
  const row = document.createElement('div');
  row.className = 'inbox-field';
  const l = document.createElement('span');
  l.className = 'inbox-field-label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'inbox-field-value';
  v.textContent = value; // textContent — briefs are untrusted user input
  row.append(l, v);
  return row;
}

async function refreshInbox() {
  const section = $('inbox-view');
  if (!section) return;
  const list = $('inbox-list');
  const badge = $('inbox-count');
  const empty = $('inbox-empty');

  let items;
  try {
    items = await listInbox();
  } catch {
    // Not the admin (AccessDenied) or inbox unreadable — hide the panel entirely.
    section.hidden = true;
    return;
  }

  section.hidden = false;
  list.innerHTML = '';
  badge.hidden = items.length === 0;
  badge.textContent = items.length ? String(items.length) : '';
  empty.hidden = items.length > 0;

  for (const it of items.slice(0, 50)) {
    let brief = {};
    try {
      brief = await readInbox(it.key);
    } catch {
      brief = {};
    }

    const li = document.createElement('li');
    li.className = 'inbox-row';

    const head = document.createElement('div');
    head.className = 'inbox-head';
    const who = document.createElement('span');
    who.className = 'inbox-who';
    who.textContent = brief.name || 'Anonymous';
    const when = document.createElement('span');
    when.className = 'inbox-when';
    when.textContent = fmtDate(brief.submittedAt || it.lastModified);
    head.append(who, when);

    const sub = document.createElement('div');
    sub.className = 'inbox-sub';
    sub.textContent =
      [brief.requestType, brief.serviceName].filter(Boolean).join(' · ') ||
      'Contact brief';

    const details = document.createElement('div');
    details.className = 'inbox-details';
    [
      ['Email', brief.email],
      ['Phone', brief.phone],
      ['Budget', brief.budget],
      ['Timeline', brief.timeline],
      ['Message', brief.details],
      ['From page', brief.page],
    ].forEach(([label, value]) => {
      const row = inboxField(label, value);
      if (row) details.append(row);
    });

    const actions = document.createElement('div');
    actions.className = 'inbox-actions';
    if (brief.email) {
      const reply = document.createElement('a');
      reply.className = 'btn-ghost';
      reply.textContent = 'Reply';
      reply.href = `mailto:${brief.email}?subject=${encodeURIComponent(
        'Re: your inquiry — ThePrivilegedCompany'
      )}`;
      actions.append(reply);
    }
    const done = document.createElement('button');
    done.className = 'btn-ghost danger';
    done.textContent = 'Mark done';
    done.addEventListener('click', async () => {
      done.disabled = true;
      try {
        await archiveInbox(it.key);
        li.remove();
        const remaining = list.querySelectorAll('.inbox-row').length;
        badge.hidden = remaining === 0;
        badge.textContent = remaining ? String(remaining) : '';
        empty.hidden = remaining > 0;
      } catch (err) {
        setError($('files-error'), err.message || String(err));
        done.disabled = false;
      }
    });
    actions.append(done);

    li.append(head, sub, details, actions);
    list.append(li);
  }
}

$('inbox-refresh')?.addEventListener('click', refreshInbox);

// --- login ------------------------------------------------------------------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError($('login-error'), '');
  const btn = $('login-btn');
  btn.disabled = true;
  const email = $('email').value.trim();
  try {
    const res = await signIn(email, $('password').value);
    if (res.status === 'NEW_PASSWORD_REQUIRED') {
      challenge = { user: res.user, attrs: res.userAttributes, email };
      show('newpass');
    } else {
      await enterApp(res.session, email);
    }
  } catch (err) {
    setError($('login-error'), err.message || String(err));
  } finally {
    btn.disabled = false;
  }
});

// Mirrors the Cognito password policy in backend/cognito.tf so the user gets a
// friendly message instead of a raw InvalidPasswordException.
function passwordIssues(pw) {
  const rules = [
    [pw.length >= 8, 'at least 8 characters'],
    [/[a-z]/.test(pw), 'a lowercase letter'],
    [/[A-Z]/.test(pw), 'an uppercase letter'],
    [/[0-9]/.test(pw), 'a number'],
    [/[^A-Za-z0-9]/.test(pw), 'a symbol'],
  ];
  return rules.filter(([ok]) => !ok).map(([, label]) => label);
}

// --- first-login: set a permanent password ----------------------------------
$('newpass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError($('newpass-error'), '');
  const pw = $('new-password').value;
  const confirmPw = $('new-password-confirm').value;
  if (pw !== confirmPw) {
    setError($('newpass-error'), 'Passwords do not match.');
    return;
  }
  const missing = passwordIssues(pw);
  if (missing.length) {
    setError($('newpass-error'), `Password needs ${missing.join(', ')}.`);
    return;
  }
  const btn = $('newpass-btn');
  btn.disabled = true;
  try {
    const res = await completeNewPassword(challenge.user, pw, challenge.attrs);
    await enterApp(res.session, challenge.email);
    challenge = null;
  } catch (err) {
    setError($('newpass-error'), err.message || String(err));
  } finally {
    btn.disabled = false;
  }
});

// --- upload -----------------------------------------------------------------
async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  setError($('files-error'), '');
  const status = $('upload-status');
  for (const file of files) {
    status.textContent = `Uploading ${file.name}…`;
    try {
      await uploadFile(file);
    } catch (err) {
      console.error('[portal] upload failed', err);
      setError($('files-error'), `Upload failed for ${file.name}: ${err.message || err}`);
    }
  }
  status.textContent = '';
  $('file-input').value = '';
  await refreshList();
}

$('file-input').addEventListener('change', (e) => handleFiles(e.target.files));

const dropzone = $('dropzone');
['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  })
);
dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
// Guard against the programmatic input.click() bubbling back to the dropzone
// (input is a child), which would re-enter this handler and stop the OS file
// picker from opening.
const fileInput = $('file-input');
dropzone.addEventListener('click', (e) => {
  if (e.target === fileInput) return;
  fileInput.click();
});

// --- logout -----------------------------------------------------------------
$('logout-btn').addEventListener('click', () => {
  signOut();
  show('login');
  $('password').value = '';
});

// --- boot -------------------------------------------------------------------
(async function boot() {
  if (!window.__PORTAL_CONFIG__ || !window.__PORTAL_CONFIG__.userPoolId) {
    setError(
      $('login-error'),
      'Backend not configured yet. Run `terraform apply` in /backend to generate config.js.'
    );
    show('login');
    return;
  }
  try {
    const existing = await getSession();
    if (existing) {
      const email =
        existing.session.getIdToken().decodePayload().email || '';
      await enterApp(existing.session, email);
      return;
    }
  } catch {
    /* fall through to login */
  }
  show('login');
})();
