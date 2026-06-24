var TOKEN = document.querySelector('meta[name="aipost-session-token"]').content;
var BIZ = [
  ["name", "Име на бизнеса / страницата"],
  ["description", "С какво се занимавате"],
  ["audience", "Аудитория"],
  ["tone", "Тон и стил"],
  ["topics", "Теми за публикуване"],
  ["avoid", "Какво да се избягва"],
  ["cta", "Подкана за действие"],
  ["links", "Връзки / профили"],
  ["notes", "Друго, което AI трябва да знае"]
];
var currentJob = null;
var jobStream = null;
var logStream = null;

function $(id) { return document.getElementById(id); }
function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char];
  });
}
function safeClass(value) { return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_"); }
function tokenUrl(path) {
  var url = new URL(path, window.location.href);
  url.searchParams.set("token", TOKEN);
  return url.pathname + url.search;
}
function toast(message) {
  var element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  setTimeout(function () { element.classList.remove("show"); }, 2600);
}
function apiFetch(path, options) {
  var settings = options || {};
  settings.headers = Object.assign({}, settings.headers || {}, {"X-AIPost-Token": TOKEN});
  return fetch(path, settings).then(function (response) {
    return response.json().then(function (data) {
      data.httpStatus = response.status;
      return data;
    });
  });
}
function getJSON(path) { return apiFetch(path); }
function postJSON(path, body) {
  return apiFetch(path, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body || {})
  });
}

function openTab(name) {
  document.querySelectorAll("nav button").forEach(function (button) {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  document.querySelectorAll("main section, .wrap > section").forEach(function (section) {
    section.classList.add("hide");
  });
  $("tab-" + name).classList.remove("hide");
  if (name === "posts") loadPosts();
  if (name === "logs") startLogStream();
  if (name === "business") loadMemory();
}
document.querySelectorAll("nav button").forEach(function (button) {
  button.addEventListener("click", function () { openTab(button.dataset.tab); });
});

(function buildBusinessFields() {
  var container = $("business-fields");
  BIZ.forEach(function (field) {
    var label = document.createElement("label");
    label.htmlFor = "biz_" + field[0];
    label.textContent = field[1];
    var textarea = document.createElement("textarea");
    textarea.id = "biz_" + field[0];
    textarea.rows = 2;
    container.appendChild(label);
    container.appendChild(textarea);
  });
})();

function pill(label, ok) {
  return '<span class="pill ' + (ok ? "ok" : "bad") + '">' +
    (ok ? "✓ " : "✕ ") + esc(label) + "</span>";
}
function stat(number, label) {
  return '<div class="stat"><div class="n">' + esc(number) +
    '</div><div class="l">' + esc(label) + "</div></div>";
}
function jobLogText(job) {
  var lines = (job && job.log) || [];
  return lines.map(function (line) {
    return "[" + (line.elapsed || 0) + "s] " + (line.message || "");
  }).join("\n");
}
function setExclusiveBusy(active) {
  document.querySelectorAll(".exclusive-action").forEach(function (button) {
    button.disabled = !!active;
  });
}
function renderReadiness(items) {
  $("readiness").innerHTML = (items || []).map(function (item) {
    return '<button type="button" class="readiness-item ' + (item.ready ? "ready" : "") +
      '" data-open-tab="' + esc(item.tab) + '"><span>' + (item.ready ? "✓" : "○") +
      '</span><span>' + esc(item.label) + "</span></button>";
  }).join("");
  $("readiness").querySelectorAll("[data-open-tab]").forEach(function (button) {
    button.addEventListener("click", function () { openTab(button.dataset.openTab); });
  });
}
function renderActiveJob(job) {
  currentJob = job && job.status === "running" ? job.id : null;
  setExclusiveBusy(!!currentJob);
  var box = $("active-job");
  if (!currentJob) {
    box.classList.add("hide");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hide");
  box.innerHTML = '<div><strong>Работи: ' + esc(job.kind || "операция") +
    '</strong><div class="muted">' + esc((job.log || []).slice(-1)[0]?.message || "Стартира…") +
    '</div></div><button type="button" class="btn bad compact" id="cancel-job-btn">Отмени</button>';
  $("cancel-job-btn").addEventListener("click", function () {
    postJSON("/api/job/cancel", {job: currentJob}).then(function (result) {
      toast(result.ok ? "Поискано е отменяне" : "Операцията вече е приключила");
    });
  });
}
function renderAutopilot(status) {
  var autopilot = status.autopilot;
  var box = $("autopilot-box");
  var button = document.createElement("button");
  button.type = "button";
  button.className = "btn " + (autopilot.running ? "bad" : "ok");
  button.textContent = autopilot.running ? "Спри автопилота" : "Старт на автопилота";
  button.disabled = !autopilot.running && !!status.pending_publication;
  button.addEventListener("click", function () { autopilotAction(autopilot.running ? "stop" : "start"); });
  var detail = document.createElement("span");
  detail.className = "muted";
  detail.textContent = autopilot.running
    ? "Следващо: " + (autopilot.next_run_at || "скоро")
    : (status.configured ? "Готов за стартиране" : "Завършете настройката");
  box.innerHTML = "";
  box.appendChild(button);
  box.appendChild(detail);
}
function renderStatus(status) {
  $("pills").innerHTML = pill("AI", status.ai_ready) + pill("Facebook", status.facebook_connected) +
    '<span class="pill">' + esc(status.schedule) + "</span>" +
    '<span class="pill ' + (status.dry_run ? "warn" : "ok") + '">' +
    (status.dry_run ? "Тестов режим" : "На живо") + "</span>";
  var stats = status.stats || {};
  $("stats").innerHTML = stat(stats.total || 0, "Общо") +
    stat(stats.published || 0, "Публикувани") +
    stat(stats.dry_run || 0, "Тестови") +
    stat(stats.failed || 0, "Неуспешни") +
    stat(status.post_language || "-", "Език");
  renderReadiness(status.readiness);
  renderAutopilot(status);
  renderActiveJob(status.active_job);

  var pending = $("pending-publication");
  if (status.pending_publication) {
    pending.classList.remove("hide");
    pending.dataset.executionId = status.pending_publication.id;
    $("publish-btn").disabled = true;
  } else {
    pending.classList.add("hide");
    delete pending.dataset.executionId;
    if (!currentJob) $("publish-btn").disabled = false;
  }
}
function loadStatus() {
  getJSON("/api/status").then(renderStatus).catch(function () {
    toast("Не мога да заредя състоянието");
  });
}
function startStateStream() {
  var stream = new EventSource(tokenUrl("/api/events"));
  stream.addEventListener("state", function (event) {
    var payload = JSON.parse(event.data);
    renderStatus(payload.status);
  });
  stream.onerror = function () {
    stream.close();
    setTimeout(startStateStream, 2000);
  };
}

function loadConfig() {
  getJSON("/api/config").then(function (config) {
    $("ai_provider").value = config.ai_provider;
    $("gemini_model").value = config.gemini_model;
    $("openai_model").value = config.openai_model;
    $("openai-have").textContent = config.has_openai_key ? "(зададен)" : "";
    $("fb_app_id").value = config.fb_app_id || "";
    $("fb-have-secret").textContent = config.has_fb_app_secret ? "(зададен)" : "";
    $("schedule_mode").value = config.schedule_mode;
    $("schedule_interval_minutes").value = config.schedule_interval_minutes;
    $("schedule_times").value = config.schedule_times;
    setLang(config.post_language);
    $("post_max_chars").value = config.post_max_chars;
    $("run_on_start").checked = config.run_on_start;
    $("dry_run").checked = config.dry_run;
    $("fb-status").textContent = config.has_fb_token
      ? "свързана страница: " + (config.fb_page_id || "")
      : "не е свързана";
    toggleProvider();
    toggleSchedule();
  });
}
var CLI_HINTS = {
  gemini: "Gemini CLI за поддържани акаунти. Вход с Google, без API ключ.",
  antigravity: "Препоръчаният Google CLI. Вход с Google, без API ключ.",
  codex: "Вход с ChatGPT. Генерирането работи в изолирана временна папка, без доверяване на проекта."
};
function toggleProvider() {
  var provider = $("ai_provider").value;
  var openai = provider === "openai";
  $("openai-box").classList.toggle("hide", !openai);
  $("cli-box").classList.toggle("hide", openai);
  $("gemini-model-row").classList.toggle("hide", provider !== "gemini");
  $("cli-hint").textContent = CLI_HINTS[provider] || "";
}
function toggleSchedule() {
  var daily = $("schedule_mode").value === "daily";
  $("times-box").classList.toggle("hide", !daily);
  $("interval-box").classList.toggle("hide", daily);
}
function toggleLang() {
  $("post_language_custom").classList.toggle("hide", $("post_language").value !== "__custom__");
}
function getLang() {
  return $("post_language").value === "__custom__"
    ? ($("post_language_custom").value.trim() || "English")
    : $("post_language").value;
}
function setLang(value) {
  var select = $("post_language");
  var values = Array.prototype.map.call(select.options, function (option) { return option.value; });
  if (value && value !== "__custom__" && values.indexOf(value) >= 0) {
    select.value = value;
  } else if (value) {
    select.value = "__custom__";
    $("post_language_custom").value = value;
  } else {
    select.value = "Bulgarian";
  }
  toggleLang();
}
$("ai_provider").addEventListener("change", toggleProvider);
$("schedule_mode").addEventListener("change", toggleSchedule);
$("post_language").addEventListener("change", toggleLang);

function saveConfig() {
  var status = $("config-status");
  status.textContent = "Запазвам…";
  postJSON("/api/config", {
    ai_provider: $("ai_provider").value,
    gemini_model: $("gemini_model").value,
    openai_model: $("openai_model").value,
    openai_api_key: $("openai_api_key").value,
    schedule_mode: $("schedule_mode").value,
    schedule_interval_minutes: parseInt($("schedule_interval_minutes").value || "120", 10),
    schedule_times: $("schedule_times").value,
    post_language: getLang(),
    post_max_chars: parseInt($("post_max_chars").value || "600", 10),
    run_on_start: $("run_on_start").checked,
    dry_run: $("dry_run").checked
  }).then(function (result) {
    status.textContent = result.ok ? "✓ Настройките са запазени." : "✕ " + (result.error || "Грешка");
    $("openai_api_key").value = "";
    if (result.ok) {
      loadConfig();
      loadStatus();
    }
  });
}
function checkLogin() {
  $("ai-login-status").textContent = "проверявам…";
  postJSON("/api/check-login", {}).then(function (result) {
    $("ai-login-status").textContent = result.logged_in ? "✓ влязъл" : "✕ още не сте влезли";
    loadStatus();
  });
}
function loginAI() {
  $("ai-login-status").textContent = "влизане…";
  postJSON("/api/login-gemini", {provider: $("ai_provider").value}).then(function (result) {
    if (result.already) $("ai-login-status").textContent = "✓ вече сте влезли";
    else if (result.message) {
      $("ai-login-status").textContent = result.message;
      toast("Завършете входа в терминала");
    } else $("ai-login-status").textContent = result.error ? "✕ " + result.error : "проверявам…";
    loadStatus();
  });
}
function testProvider() {
  var output = $("provider-test");
  output.style.display = "block";
  startJob("/api/test-provider", {}, output, function (result, job) {
    return jobLogText(job) + "\n\n--- Резултат ---\n" +
      "exit: " + (result.returncode !== undefined ? result.returncode : "-") +
      "\n\n=== STDOUT ===\n" + (result.stdout || "(празно)") +
      "\n\n=== STDERR ===\n" + (result.stderr || "(празно)") +
      (result.error ? "\n\nгрешка: " + result.error : "");
  });
}

function clearFbPicker() {
  $("fb-page-picker").innerHTML = "";
  $("fb-page-picker").classList.add("hide");
}
function showFbPagePicker(result) {
  var box = $("fb-page-picker");
  box.innerHTML = "";
  box.classList.remove("hide");
  var label = document.createElement("label");
  label.htmlFor = "fb-page-select";
  label.textContent = "Изберете Facebook страница";
  var select = document.createElement("select");
  select.id = "fb-page-select";
  (result.pages || []).forEach(function (page) {
    var option = document.createElement("option");
    option.value = page.id;
    option.textContent = (page.name || "(без име)") + " (id " + page.id + ")";
    select.appendChild(option);
  });
  var button = document.createElement("button");
  button.className = "btn ok";
  button.type = "button";
  button.textContent = "Запази тази страница";
  button.addEventListener("click", function () { selectFbPage(result.pending, select.value); });
  box.appendChild(label);
  box.appendChild(select);
  box.appendChild(button);
}
function selectFbPage(pending, pageId) {
  $("fb-status").textContent = "запазвам избраната страница…";
  postJSON("/api/facebook/select-page", {pending: pending, page_id: pageId}).then(function (result) {
    $("fb-status").textContent = result.ok
      ? "✓ " + result.page_name + " (" + result.page_id + ")"
      : "✕ " + (result.error || "неуспех");
    if (result.ok) clearFbPicker();
    loadConfig();
    loadStatus();
  });
}
function fbConnect() {
  toast("Отваря се браузър за Facebook…");
  $("fb-status").textContent = "свързване…";
  clearFbPicker();
  postJSON("/api/facebook/connect", {
    fb_app_id: $("fb_app_id").value,
    fb_app_secret: $("fb_app_secret").value
  }).then(function (result) {
    if (result.choose_page) {
      $("fb-status").textContent = "изберете страница от списъка";
      $("fb_app_secret").value = "";
      showFbPagePicker(result);
      return;
    }
    $("fb-status").textContent = result.ok
      ? "✓ " + result.page_name + " (" + result.page_id + ")"
      : "✕ " + (result.error || "неуспех");
    $("fb_app_secret").value = "";
    loadStatus();
  });
}

function showActionResult(result, output, job) {
  var body;
  if (result && result.ok) {
    body = result.text !== undefined ? result.text : "Готово · обновени: " + (result.updated || 0);
    if (result.published) body += "\n\n✓ Публикувано (id " + result.post_id + ")";
    else if (result.published === false) body += "\n\n(безопасен преглед — не е публикувано)";
  } else {
    body = "✕ " + ((result && result.error) || "Грешка");
  }
  output.textContent = (jobLogText(job) ? jobLogText(job) + "\n\n--- Резултат ---\n" : "") + body;
}
function watchJob(jobId, output, formatter) {
  if (jobStream) jobStream.close();
  jobStream = new EventSource(tokenUrl("/api/job-events?id=" + encodeURIComponent(jobId)));
  jobStream.addEventListener("job", function (event) {
    var job = JSON.parse(event.data);
    renderActiveJob(job.status === "running" ? job : null);
    output.textContent = jobLogText(job) || "Работи…";
    if (job.status === "done") {
      jobStream.close();
      jobStream = null;
      currentJob = null;
      var result = job.result || {};
      output.textContent = formatter ? formatter(result, job) : "";
      if (!formatter) showActionResult(result, output, job);
      loadStatus();
      loadPosts();
    }
  });
}
function startJob(path, body, output, formatter) {
  output.classList.remove("hide");
  output.textContent = "Стартиране…";
  postJSON(path, body).then(function (result) {
    if (result.httpStatus === 409 || !result.job) {
      output.textContent = "✕ " + (result.error || "Друга операция вече работи.");
      renderActiveJob(result.active_job || null);
      return;
    }
    watchJob(result.job, output, formatter);
  }).catch(function () { output.textContent = "✕ Грешка при заявката"; });
}
function act(path, message) {
  toast(message);
  startJob(path, {}, $("action-out"));
}
function autopilotAction(action) {
  if (action === "start" && !window.confirm("Да стартирам ли автоматичното генериране по графика?")) return;
  postJSON("/api/autopilot", {action: action, confirmed: true}).then(function (result) {
    if (!result.ok) toast(result.error || "Грешка");
    loadStatus();
  });
}
function resolvePublication(outcome) {
  var executionId = parseInt($("pending-publication").dataset.executionId || "0", 10);
  if (!executionId) return;
  postJSON("/api/publication/resolve", {
    execution_id: executionId,
    outcome: outcome
  }).then(function (result) {
    toast(result.ok ? "Проверката е записана" : (result.error || "Резултатът вече е обработен"));
    loadStatus();
    loadPosts();
  });
}

function loadPosts() {
  getJSON("/api/posts").then(function (data) {
    var posts = data.posts || [];
    $("posts-body").innerHTML = posts.map(function (post) {
      var text = esc(post.content || "");
      if (text.length > 140) text = text.slice(0, 140) + "…";
      return "<tr><td>" + esc(post.created_at || "") + '</td><td><span class="tag ' +
        safeClass(post.status) + '">' + esc(post.status || "") + "</span></td><td>" +
        text + "</td><td>" + esc(post.likes || 0) + "</td><td>" + esc(post.comments || 0) +
        "</td><td>" + esc(post.shares || 0) + "</td></tr>";
    }).join("");
    $("posts-empty-action").classList.toggle("hide", posts.length !== 0);
  });
}
function startLogStream() {
  if (logStream) return;
  logStream = new EventSource(tokenUrl("/api/log-events"));
  logStream.addEventListener("logs", function (event) {
    var data = JSON.parse(event.data);
    var view = $("log-view");
    view.textContent = data.log || "(няма лог файл още)";
    view.scrollTop = view.scrollHeight;
  });
  logStream.onerror = function () {
    logStream.close();
    logStream = null;
    setTimeout(function () {
      if (!$("tab-logs").classList.contains("hide")) startLogStream();
    }, 2000);
  };
}
function loadMemory() {
  getJSON("/api/memory").then(function (memory) {
    $("steering-view").textContent = memory.steering || "(още няма)";
    var fields = memory.business_fields || {};
    BIZ.forEach(function (field) {
      var control = $("biz_" + field[0]);
      if (!control.value) control.value = fields[field[0]] || "";
    });
  });
}
function saveBusiness() {
  var body = {};
  BIZ.forEach(function (field) { body[field[0]] = $("biz_" + field[0]).value; });
  postJSON("/api/business", body).then(function (result) {
    toast(result.ok ? "Профилът е запазен" : (result.error || "Грешка"));
    if (result.ok) loadStatus();
  });
}
function sendFeedback() {
  var text = $("feedback").value.trim();
  if (!text) {
    toast("Напишете какво да променим");
    return;
  }
  $("feedback-status").textContent = "Записвам…";
  postJSON("/api/feedback", {feedback: text}).then(function (result) {
    if (!result.ok) {
      $("feedback-status").textContent = "✕ " + (result.error || "Грешка");
      return;
    }
    $("feedback").value = "";
    $("feedback-status").textContent = "Записано. AI подрежда правилата…";
    watchJob(result.job, $("feedback-status"), function (jobResult, job) {
      if (jobResult.steering) $("steering-view").textContent = jobResult.steering;
      return jobLogText(job);
    });
  });
}

$("generate-btn").addEventListener("click", function () { act("/api/generate", "Генерирам преглед…"); });
$("empty-generate-btn").addEventListener("click", function () {
  openTab("overview");
  act("/api/generate", "Генерирам преглед…");
});
$("publish-btn").addEventListener("click", function () {
  if (window.confirm("Публикацията ще бъде изпратена веднага към свързаната Facebook страница. Продължаваме?")) {
    act("/api/post-now", "Публикувам…");
  }
});
$("learn-btn").addEventListener("click", function () { act("/api/learn", "Опреснявам наученото…"); });
$("test-provider-btn").addEventListener("click", testProvider);
$("login-ai-btn").addEventListener("click", loginAI);
$("check-login-btn").addEventListener("click", checkLogin);
$("facebook-connect-btn").addEventListener("click", fbConnect);
$("save-config-btn").addEventListener("click", saveConfig);
$("save-business-btn").addEventListener("click", saveBusiness);
$("feedback-btn").addEventListener("click", sendFeedback);
$("resolve-published-btn").addEventListener("click", function () {
  resolvePublication("published");
});
$("resolve-missing-btn").addEventListener("click", function () {
  resolvePublication("not_published");
});

loadConfig();
loadStatus();
startStateStream();

// Guided tour, available on demand and once on the first visit.
(function () {
  var key = "aipost247_tour_v2";
  var steps = [
    {title: "Добре дошли", text: "Настройвате, преглеждате и наблюдавате AIPost247 от едно място."},
    {tab: "setup", sel: "#cli-box", title: "AI доставчик", text: "Изберете доставчик и завършете входа."},
    {tab: "setup", sel: "#fb_app_id", title: "Facebook", text: "Свържете Meta приложението и изберете страницата."},
    {tab: "business", sel: "#business-fields", title: "Бизнес профил", text: "Опишете аудиторията, тона и темите."},
    {tab: "overview", sel: "#generate-btn", title: "Първи преглед", text: "Генерирайте безопасен преглед, преди да публикувате."}
  ];
  var index = 0, dim, spot, card;
  function finish() {
    try { localStorage.setItem(key, "1"); } catch (error) {}
    [dim, spot, card].forEach(function (node) { if (node && node.parentNode) node.remove(); });
    dim = spot = card = null;
  }
  function place(rect) {
    var width = Math.min(330, window.innerWidth - 32);
    var height = card.offsetHeight || 160;
    if (!rect) {
      card.style.left = Math.round((window.innerWidth - width) / 2) + "px";
      card.style.top = Math.round((window.innerHeight - height) / 2) + "px";
      return;
    }
    card.style.left = Math.min(Math.max(10, rect.left), window.innerWidth - width - 10) + "px";
    card.style.top = Math.min(rect.bottom + 12, window.innerHeight - height - 10) + "px";
  }
  function show() {
    var step = steps[index];
    if (step.tab) openTab(step.tab);
    setTimeout(function () {
      card.innerHTML = "<h4>" + esc(step.title) + "</h4><p>" + esc(step.text) +
        '</p><div class="tnav"><span class="step-n">' + (index + 1) + " / " + steps.length +
        '</span><span><button class="skip">Прескочи</button><button class="next">' +
        (index === steps.length - 1 ? "Готово" : "Напред") + "</button></span></div>";
      card.querySelector(".skip").addEventListener("click", finish);
      card.querySelector(".next").addEventListener("click", function () {
        if (index === steps.length - 1) finish();
        else { index += 1; show(); }
      });
      var target = step.sel ? document.querySelector(step.sel) : null;
      if (target) {
        target.scrollIntoView({block: "center"});
        var rect = target.getBoundingClientRect();
        spot.style.display = "block";
        spot.style.left = rect.left - 8 + "px";
        spot.style.top = rect.top - 8 + "px";
        spot.style.width = rect.width + 16 + "px";
        spot.style.height = rect.height + 16 + "px";
        place(rect);
      } else {
        spot.style.display = "none";
        place(null);
      }
    }, 80);
  }
  window.startTour = function () {
    if (dim) finish();
    dim = document.createElement("div");
    dim.className = "tour-dim";
    spot = document.createElement("div");
    spot.className = "tour-spot";
    card = document.createElement("div");
    card.className = "tour-card";
    document.body.append(dim, spot, card);
    index = 0;
    show();
  };
  $("help-btn").addEventListener("click", window.startTour);
  var seen = false;
  try { seen = !!localStorage.getItem(key); } catch (error) {}
  if (!seen) setTimeout(window.startTour, 700);
})();
