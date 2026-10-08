const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
// Reuse the website calculator's existing test dependency; no extra install.
const { JSDOM, VirtualConsole } = require('../../Cylinder/node_modules/jsdom');
const root = path.join(__dirname, '..');

function page(file, storageMode) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.com/dev/Tech%20Tools/' + file, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.IntersectionObserver = class { observe() {} disconnect() {} };
  if (storageMode === 'blocked') Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  else if (storageMode) {
    const key = html.match(/const progressKey = "([^"]+)"/)[1];
    w.localStorage.setItem(key, storageMode);
  }
  for (const script of w.document.querySelectorAll('script:not([src])')) {
    if (!script.type || script.type === 'text/javascript') w.eval(script.textContent);
  }
  return dom;
}

for (const file of ['helm.html', 'containers.html', 'mac-commands.html']) {
  for (const saved of ['{broken', 'null', '[]', 'blocked']) {
    test(`${file}: usable with ${saved} checklist storage`, () => {
      const dom = page(file, saved);
      try {
        const first = dom.window.document.querySelector('[data-checkpoint]');
        first.checked = true;
        first.dispatchEvent(new dom.window.Event('change'));
        const copy = dom.window.document.getElementById('progressCopy').textContent;
        assert.match(copy, /^1 \/ \d+ complete/);
        if (saved === 'blocked') assert.match(copy, /this visit only/);
      } finally { dom.window.close(); }
    });
  }
}

test('Mac terminal displays typed HTML as text and keeps one active command input', () => {
  const dom = page('mac-commands.html');
  try {
    const w = dom.window;
    const input = w.document.getElementById('cmdInput');
    input.value = 'say <img src=x onerror=alert(1)>';
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    assert.equal(w.document.querySelector('#termOutput img'), null);
    assert.match(w.document.getElementById('termOutput').textContent, /<img src=x onerror=alert\(1\)>/);
    assert.equal(w.document.querySelectorAll('#cmdInput').length, 1);
  } finally { dom.window.close(); }
});

test('Linux terminal prints markup literally and parses sudo arguments consistently', () => {
  const dom = page('linux-commands.html');
  try {
    const w = dom.window;
    w.processCommand('cat index.html');
    w.processCommand('<img/src=x/onerror=alert(1)>');
    w.processCommand('sudo whoami');
    w.processCommand('sudo systemctl status nginx');
    const output = w.document.getElementById('termOutput');
    assert.equal(output.querySelector('img, h1'), null);
    assert.match(output.textContent, /<h1>Hello World<\/h1>/);
    assert.match(output.textContent, /root/);
    assert.match(output.textContent, /nginx\.service/);
  } finally { dom.window.close(); }
});

test('Helm release details do not interpret revision values as HTML', () => {
  const dom = page('helm.html');
  try {
    const version = dom.window.document.getElementById('simValVersion');
    version.add(new dom.window.Option('<img src=x>', '<img src=x>'));
    version.value = '<img src=x>';
    dom.window.document.getElementById('simInstallBtn').click();
    const history = dom.window.document.getElementById('historyLog');
    assert.equal(history.querySelector('img, svg'), null);
    assert.match(history.textContent, /<img src=x>/);
  } finally { dom.window.close(); }
});

test('all owned inline scripts parse', () => {
  for (const file of ['First_setup.html', 'helm.html', 'containers.html', 'mac-commands.html', 'linux-commands.html', 'git.html', 'scripts.html', 'labs.html', 'cloudformation.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
    for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
      if (!script.type || script.type === 'text/javascript') new vm.Script(script.textContent, { filename: file });
    }
    dom.window.close();
  }
});

test('downloadable Kubernetes labs use explicit isolated configuration without auto-install', () => {
  for (const file of ['k8s_affinity_lab.sh', 'k8s_service_lab.sh']) {
    const source = fs.readFileSync(path.join(root, 'labs', file), 'utf8');
    assert.match(source, /kind create cluster[^\n]+--kubeconfig "\$LAB_KUBECONFIG"/);
    assert.match(source, /kubectl --kubeconfig "\$LAB_KUBECONFIG" --context "kind-\$CLUSTER_NAME" apply/);
    assert.doesNotMatch(source, /setup_k8s\.sh|sudo |brew install|curl /);
  }
});
