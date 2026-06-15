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
}

async function refreshList() {
  const list = $('file-list');
  list.innerHTML = '';
  setError($('files-error'), '');
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
    [pw.length >= 12, 'at least 12 characters'],
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
  const status = $('upload-status');
  for (const file of files) {
    status.textContent = `Uploading ${file.name}…`;
    try {
      await uploadFile(file);
    } catch (err) {
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
dropzone.addEventListener('click', () => $('file-input').click());

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
