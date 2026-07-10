"use strict";

const state = {
  report: null,
  networkAttempted: false,
  networkContacts: 0,
  busy: false,
};

const landing = document.querySelector("#landing");
const resultsPage = document.querySelector("#results-page");
const resultsTitle = document.querySelector("#results-title");
const resultsContent = document.querySelector("#results-content");
const summaryMetrics = document.querySelector("#summary-metrics");
const permissionPanel = document.querySelector("#permission-panel");
const howDialog = document.querySelector("#how-dialog");
const networkDialog = document.querySelector("#network-dialog");
const toast = document.querySelector("#toast");

const groupMeta = {
  browser: { title: "Browser & system", description: "Identity hints every page can read", icon: "ph-browser" },
  display: { title: "Display & input", description: "Screen and interaction characteristics", icon: "ph-monitor" },
  time: { title: "Language & time", description: "Regional signals that narrow your profile", icon: "ph-clock" },
  hardware: { title: "Device capability", description: "Hardware clues exposed by the browser", icon: "ph-device-mobile" },
  storage: { title: "Storage & features", description: "What this origin can store and use", icon: "ph-database" },
  media: { title: "Media inventory", description: "Device categories without opening a stream", icon: "ph-camera" },
  fingerprint: { title: "Fingerprint surface", description: "Rendering details useful for recognition", icon: "ph-fingerprint" },
  permissions: { title: "Permission snapshot", description: "Current browser permission states—no prompts shown", icon: "ph-hand-palm" },
  performance: { title: "Runtime & performance", description: "Timing and memory hints exposed to the page", icon: "ph-gauge" },
  network: { title: "Network lookup", description: "Results from the three approved outside requests", icon: "ph-globe" },
};

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function icon(name, className = "") {
  const node = createElement("i", `ph ${name}${className ? ` ${className}` : ""}`);
  node.setAttribute("aria-hidden", "true");
  return node;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2800);
}

function openDialog(dialog) {
  if (dialog && typeof dialog.showModal === "function") dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog && dialog.open) dialog.close();
}

function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent.trim();
    button.disabled = true;
    button.classList.add("is-busy");
    const label = button.querySelector("span");
    if (label) label.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.classList.remove("is-busy");
    const label = button.querySelector("span");
    if (label && button.dataset.originalLabel) label.textContent = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }
}

function permissionState(name, options) {
  if (!navigator.permissions?.query) return Promise.resolve("unsupported");
  return navigator.permissions.query(Object.assign({ name }, options || {}))
    .then((result) => result.state)
    .catch(() => "unsupported");
}

function bytes(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function storageWorks(storage) {
  try {
    const key = "__whoami_test__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function fontAvailability() {
  const candidates = ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana", "Helvetica", "Avenir Next"];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return [];
  context.font = "72px monospace";
  const baseline = context.measureText("mmmmmmmmmmlli").width;
  return candidates.filter((font) => {
    context.font = `72px "${font}", monospace`;
    return context.measureText("mmmmmmmmmmlli").width !== baseline;
  });
}

async function digest(value) {
  try {
    const encoded = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hash)).map((part) => part.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } catch {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}

async function collectBrowser() {
  const uaData = navigator.userAgentData?.toJSON?.() || null;
  return {
    "User agent": navigator.userAgent,
    "Platform": uaData?.platform || navigator.platform || "Unavailable",
    "Browser brands": uaData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(", ") || "Unavailable",
    "Mobile hint": uaData?.mobile ?? "Unavailable",
    "Vendor": navigator.vendor || "Unavailable",
    "Product engine": navigator.product || "Unavailable",
    "Online": navigator.onLine,
    "Secure context": window.isSecureContext,
    "Do Not Track": navigator.doNotTrack || "Not set",
  };
}

async function collectDisplay() {
  return {
    "Screen size": `${screen.width} × ${screen.height}`,
    "Available screen": `${screen.availWidth} × ${screen.availHeight}`,
    "Viewport": `${window.innerWidth} × ${window.innerHeight}`,
    "Color depth": `${screen.colorDepth} bit`,
    "Pixel ratio": window.devicePixelRatio || 1,
    "Orientation": screen.orientation?.type || "Unavailable",
    "Touch points": navigator.maxTouchPoints || 0,
    "Touch events": "ontouchstart" in window,
  };
}

async function collectTime() {
  const locale = Intl.DateTimeFormat().resolvedOptions();
  return {
    "Language": navigator.language,
    "Languages": navigator.languages || [],
    "Timezone": locale.timeZone || "Unavailable",
    "Calendar": locale.calendar || "Unavailable",
    "Numbering system": locale.numberingSystem || "Unavailable",
    "System time": new Date().toString(),
  };
}

async function collectHardware() {
  const result = {
    "Logical processors": navigator.hardwareConcurrency || "Unavailable",
    "Device memory": navigator.deviceMemory ? `${navigator.deviceMemory} GB hint` : "Unavailable",
    "PDF viewer": navigator.pdfViewerEnabled ?? "Unavailable",
    "Web Share API": "share" in navigator,
    "Bluetooth API": "bluetooth" in navigator,
    "USB API": "usb" in navigator,
    "MIDI API": "requestMIDIAccess" in navigator,
  };
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      result["Battery level"] = `${Math.round(battery.level * 100)}%`;
      result["Charging"] = battery.charging;
    } catch {
      result["Battery"] = "Restricted";
    }
  }
  return result;
}

async function collectStorage() {
  let estimate = {};
  if (navigator.storage?.estimate) {
    try { estimate = await navigator.storage.estimate(); } catch { estimate = {}; }
  }
  return {
    "Cookies enabled": navigator.cookieEnabled,
    "Local storage": storageWorks(localStorage),
    "Session storage": storageWorks(sessionStorage),
    "IndexedDB": "indexedDB" in window,
    "Cache API": "caches" in window,
    "Service workers": "serviceWorker" in navigator,
    "Origin storage quota": bytes(estimate.quota),
    "Origin storage used": bytes(estimate.usage),
    "Detected fonts": fontAvailability(),
  };
}

async function collectMedia() {
  if (!navigator.mediaDevices?.enumerateDevices) return { "Media devices": "Unavailable" };
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      "Cameras present": devices.filter((device) => device.kind === "videoinput").length,
      "Microphones present": devices.filter((device) => device.kind === "audioinput").length,
      "Audio outputs": devices.filter((device) => device.kind === "audiooutput").length,
      "Labels exposed": devices.filter((device) => Boolean(device.label)).length,
    };
  } catch {
    return { "Media devices": "Restricted" };
  }
}

async function collectFingerprint() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 90;
  const context = canvas.getContext("2d");
  let canvasSignature = "Unavailable";
  if (context) {
    context.textBaseline = "top";
    context.font = "16px Arial";
    context.fillStyle = "#f04f4a";
    context.fillRect(126, 8, 74, 24);
    context.fillStyle = "#0b214a";
    context.fillText("Who am I? • 2026", 8, 36);
    canvasSignature = await digest(canvas.toDataURL());
  }

  let gpuVendor = "Unavailable";
  let gpuRenderer = "Unavailable";
  try {
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && extension) {
      gpuVendor = gl.getParameter(extension.UNMASKED_VENDOR_WEBGL);
      gpuRenderer = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    }
  } catch { /* restricted by the browser */ }

  return {
    "Canvas signature": canvasSignature,
    "GPU vendor": gpuVendor,
    "GPU renderer": gpuRenderer,
    "Installed plugins": Array.from(navigator.plugins || []).map((plugin) => plugin.name),
    "MIME type count": navigator.mimeTypes?.length || 0,
  };
}

async function collectPermissionSnapshot() {
  const checks = [
    ["Geolocation", "geolocation"],
    ["Camera", "camera"],
    ["Microphone", "microphone"],
    ["Notifications", "notifications"],
    ["Clipboard read", "clipboard-read"],
    ["Clipboard write", "clipboard-write"],
    ["Persistent storage", "persistent-storage"],
    ["Accelerometer", "accelerometer"],
    ["Gyroscope", "gyroscope"],
  ];
  const values = await Promise.all(checks.map(([, name]) => permissionState(name)));
  return Object.fromEntries(checks.map(([label], index) => [label, values[index]]));
}

async function collectPerformance() {
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  const memory = performance.memory;
  return {
    "Navigation type": nav?.type || "Unavailable",
    "DOM ready": nav ? `${Math.round(nav.domContentLoadedEventEnd)} ms` : "Unavailable",
    "Transferred page bytes": nav ? bytes(nav.transferSize) : "Unavailable",
    "JavaScript heap used": memory ? bytes(memory.usedJSHeapSize) : "Unavailable",
    "JavaScript heap limit": memory ? bytes(memory.jsHeapSizeLimit) : "Unavailable",
  };
}

const localCollectors = [
  ["browser", collectBrowser],
  ["display", collectDisplay],
  ["time", collectTime],
  ["hardware", collectHardware],
  ["storage", collectStorage],
  ["media", collectMedia],
  ["fingerprint", collectFingerprint],
  ["permissions", collectPermissionSnapshot],
  ["performance", collectPerformance],
];

async function runLocalScan(trigger) {
  if (state.busy) return;
  state.busy = true;
  document.body.classList.add("is-scanning");
  setBusy(trigger, true, "Reading local signals…");

  const settled = await Promise.allSettled(localCollectors.map(([, collector]) => collector()));
  const local = {};
  settled.forEach((result, index) => {
    const key = localCollectors[index][0];
    local[key] = result.status === "fulfilled" ? result.value : { "Collector status": "Unavailable" };
  });

  state.report = {
    meta: {
      collectedAt: new Date().toISOString(),
      mode: "local-only",
      outsideRequests: 0,
      reportUploaded: false,
    },
    local,
    network: null,
    grantedData: {},
  };

  renderReport();
  landing.hidden = true;
  resultsPage.hidden = false;
  resultsPage.scrollIntoView({ block: "start" });
  resultsTitle.focus({ preventScroll: true });
  setBusy(trigger, false);
  document.body.classList.remove("is-scanning");
  state.busy = false;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None detected";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function signalCount(data) {
  if (!data || typeof data !== "object") return 0;
  return Object.values(data).reduce((count, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return count + signalCount(value);
    return count + (value === null || value === undefined ? 0 : 1);
  }, 0);
}

function renderMetrics() {
  summaryMetrics.replaceChildren();
  const metrics = [
    [signalCount(state.report.local) + signalCount(state.report.network) + signalCount(state.report.grantedData), "Signals visible"],
    [Object.keys(state.report.local).length, "Local categories"],
    [state.networkContacts, "Outside contacts"],
    [Object.keys(state.report.grantedData).length, "Permissions used"],
  ];
  metrics.forEach(([value, label]) => {
    const metric = createElement("div", "metric");
    metric.append(createElement("strong", "", value), createElement("span", "", label));
    summaryMetrics.append(metric);
  });
}

function renderGroup(key, data, open = false) {
  const meta = groupMeta[key] || { title: key, description: "Collected signals", icon: "ph-info" };
  const details = createElement("details", "result-group");
  details.open = open;
  const summary = document.createElement("summary");
  const iconWrap = createElement("span", "group-icon");
  iconWrap.append(icon(meta.icon));
  const heading = createElement("span", "group-heading");
  heading.append(createElement("strong", "", meta.title), createElement("small", "", meta.description));
  summary.append(iconWrap, heading);
  const list = createElement("dl", "finding-list");
  Object.entries(data || {}).forEach(([label, value]) => {
    const row = createElement("div", "finding-row");
    const term = createElement("dt", "", label);
    const description = createElement("dd");
    const text = displayValue(value);
    if (typeof value === "object" && value !== null && !Array.isArray(value)) description.append(createElement("code", "", text));
    else description.textContent = text;
    row.append(term, description);
    list.append(row);
  });
  details.append(summary, list);
  return details;
}

function renderPermissionPanel() {
  permissionPanel.replaceChildren();
  const heading = createElement("div", "permission-heading");
  heading.append(createElement("p", "eyebrow", "Permission-gated signals"), createElement("h2", "", "Ask only when the lesson needs it."), createElement("p", "", "Each control triggers one browser permission. Streams are stopped immediately; this demo records only the settings shown below."));

  const grid = createElement("div", "permission-grid");
  const snapshot = state.report?.local?.permissions || {};
  const granted = state.report?.grantedData || {};
  const cards = [
    { key: "location", title: "Precise location", icon: "ph-map-pin", copy: "Reveals coordinates and the accuracy radius reported by your device.", action: "request-location", label: "Request location", status: granted.location?.status || snapshot.Geolocation },
    { key: "camera", title: "Camera", icon: "ph-camera", copy: "Opens a video stream briefly to reveal the selected camera settings, then stops it.", action: "request-camera", label: "Request camera", status: granted.camera?.status || snapshot.Camera },
    { key: "microphone", title: "Microphone", icon: "ph-microphone", copy: "Opens an audio stream briefly to reveal audio settings, then stops it.", action: "request-microphone", label: "Request microphone", status: granted.microphone?.status || snapshot.Microphone },
    { key: "notifications", title: "Notifications", icon: "ph-bell", copy: "Shows whether a site can ask to send notifications beyond the current tab.", action: "request-notifications", label: "Request notifications", status: granted.notifications?.status || snapshot.Notifications },
  ];

  cards.forEach((card) => {
    const item = createElement("article", "permission-card");
    item.append(icon(card.icon, "permission-card-icon"), createElement("h3", "", card.title), createElement("p", "", card.copy));
    const footer = createElement("div", "permission-footer");
    const status = createElement("span", `permission-status is-${card.status || "prompt"}`, card.status || "prompt");
    const button = createElement("button", "button button-secondary", "");
    button.type = "button";
    button.dataset.action = card.action;
    button.append(icon(card.icon), createElement("span", "", card.label));
    footer.append(status, button);
    item.append(footer);
    grid.append(item);
  });
  permissionPanel.append(heading, grid);
}

function renderReport() {
  if (!state.report) return;
  renderMetrics();
  resultsContent.replaceChildren();
  Object.entries(state.report.local).forEach(([key, data], index) => resultsContent.append(renderGroup(key, data, index === 0)));
  if (state.report.network) resultsContent.append(renderGroup("network", state.report.network, true));
  if (Object.keys(state.report.grantedData).length) resultsContent.append(renderGroup("permissions", state.report.grantedData, true));
  renderPermissionPanel();
}

function fetchWithTimeout(url, milliseconds) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), milliseconds);
  return fetch(url, { signal: controller.signal, cache: "no-store", credentials: "omit" })
    .finally(() => window.clearTimeout(timer));
}

async function lookupPublicIp() {
  const response = await fetchWithTimeout("https://ipapi.co/json/", 8000);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return {
    "Public IP": data.ip || "Unavailable",
    "Internet provider": data.org || "Unavailable",
    "Approximate city": data.city || "Unavailable",
    "Approximate region": data.region || "Unavailable",
    "Country": data.country_name || "Unavailable",
    "Approximate coordinates": data.latitude && data.longitude ? `${data.latitude}, ${data.longitude}` : "Unavailable",
  };
}

function testWebSocket(url = "wss://echo.websocket.events") {
  return new Promise((resolve) => {
    let finished = false;
    const done = (value) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try { socket?.close(); } catch { /* already closed */ }
      resolve(value);
    };
    let socket;
    const timer = window.setTimeout(() => done({ "WebSocket": "Timed out" }), 5000);
    try {
      socket = new WebSocket(url);
      socket.addEventListener("open", () => { try { socket.send("whoami-ping"); } catch { done({ "WebSocket": "Connected" }); } });
      socket.addEventListener("message", () => done({ "WebSocket": "Connected and echoed" }));
      socket.addEventListener("error", () => done({ "WebSocket": "Blocked or unavailable" }));
    } catch {
      done({ "WebSocket": "Unsupported" });
    }
  });
}

function discoverWebRtcAddresses() {
  return new Promise((resolve) => {
    if (!("RTCPeerConnection" in window)) { resolve({ "WebRTC addresses": "Unsupported" }); return; }
    const addresses = new Set();
    let peer;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try { peer?.close(); } catch { /* already closed */ }
      resolve({ "WebRTC addresses": addresses.size ? Array.from(addresses) : ["Restricted by browser"] });
    };
    const timer = window.setTimeout(done, 6000);
    try {
      peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peer.createDataChannel("whoami");
      peer.addEventListener("icecandidate", (event) => {
        if (!event.candidate) { done(); return; }
        const host = event.candidate.address || event.candidate.candidate.split(" ")[4];
        if (host) addresses.add(host);
      });
      peer.createOffer().then((offer) => peer.setLocalDescription(offer)).catch(done);
    } catch {
      done();
    }
  });
}

async function runNetworkScan(trigger) {
  if (!state.report || state.busy) return;
  state.busy = true;
  setBusy(trigger, true, "Contacting services…");
  const attempts = await Promise.allSettled([lookupPublicIp(), testWebSocket(), discoverWebRtcAddresses()]);
  const network = {};
  const labels = ["IP lookup", "WebSocket test", "WebRTC discovery"];
  attempts.forEach((result, index) => {
    if (result.status === "fulfilled") Object.assign(network, result.value);
    else network[labels[index]] = "Failed or blocked";
  });
  state.networkAttempted = true;
  state.networkContacts = 3;
  state.report.network = network;
  state.report.meta.outsideRequests = 3;
  state.report.meta.mode = "local-plus-network";
  renderReport();
  setBusy(trigger, false);
  closeDialog(networkDialog);
  state.busy = false;
  showToast("Network lookup complete. Three outside services were contacted.");
  document.querySelector(".result-group:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function refreshPermissionSnapshot() {
  if (!state.report) return;
  state.report.local.permissions = await collectPermissionSnapshot();
}

async function requestLocation(trigger) {
  if (!navigator.geolocation) { showToast("Geolocation is not supported here."); return; }
  setBusy(trigger, true, "Waiting for browser…");
  const result = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      status: "granted",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: `${Math.round(position.coords.accuracy)} metres`,
      altitude: position.coords.altitude,
      speed: position.coords.speed,
      heading: position.coords.heading,
    }),
    (error) => resolve({ status: error.code === 1 ? "denied" : "error", message: error.message || "Location unavailable" }),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  ));
  state.report.grantedData.location = result;
  await refreshPermissionSnapshot();
  setBusy(trigger, false);
  renderReport();
  showToast(result.status === "granted" ? "Precise location added to this tab’s report." : "Location was not added.");
}

async function requestMedia(kind, trigger) {
  if (!navigator.mediaDevices?.getUserMedia) { showToast(`${kind} access is not supported here.`); return; }
  setBusy(trigger, true, "Waiting for browser…");
  let result;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: kind === "camera", audio: kind === "microphone" });
    const track = kind === "camera" ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() || {};
    result = {
      status: "granted",
      label: track?.label || "Label hidden",
      settings,
    };
    stream.getTracks().forEach((item) => item.stop());
  } catch (error) {
    result = { status: error?.name === "NotAllowedError" ? "denied" : "error", message: error?.message || "Access unavailable" };
  }
  state.report.grantedData[kind] = result;
  await refreshPermissionSnapshot();
  setBusy(trigger, false);
  renderReport();
  showToast(result.status === "granted" ? `${kind} settings added; the stream is stopped.` : `${kind} access was not added.`);
}

async function requestNotifications(trigger) {
  if (!("Notification" in window) || !Notification.requestPermission) { showToast("Notifications are not supported here."); return; }
  setBusy(trigger, true, "Waiting for browser…");
  let status = "error";
  try { status = await Notification.requestPermission(); } catch { status = "error"; }
  state.report.grantedData.notifications = { status };
  await refreshPermissionSnapshot();
  setBusy(trigger, false);
  renderReport();
  showToast(`Notification permission: ${status}.`);
}

async function copyReport() {
  if (!state.report) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2));
    showToast("Report copied as JSON.");
  } catch {
    showToast("Clipboard access was blocked. Use Download instead.");
  }
}

function downloadReport() {
  if (!state.report) return;
  const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `who-am-i-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showToast("Report downloaded.");
}

function clearReport() {
  state.report = null;
  state.networkAttempted = false;
  state.networkContacts = 0;
  resultsContent.replaceChildren();
  summaryMetrics.replaceChildren();
  permissionPanel.replaceChildren();
  resultsPage.hidden = true;
  landing.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("[data-action='show-visible']")?.focus({ preventScroll: true });
  showToast("Report cleared from this tab.");
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (action === "show-visible") runLocalScan(trigger);
  if (action === "how-it-works") openDialog(howDialog);
  if (action === "close-dialog") closeDialog(trigger.closest("dialog"));
  if (action === "open-network-consent") openDialog(networkDialog);
  if (action === "run-network") runNetworkScan(trigger);
  if (action === "scroll-permissions") permissionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  if (action === "request-location") requestLocation(trigger);
  if (action === "request-camera") requestMedia("camera", trigger);
  if (action === "request-microphone") requestMedia("microphone", trigger);
  if (action === "request-notifications") requestNotifications(trigger);
  if (action === "copy-report") copyReport();
  if (action === "download-report") downloadReport();
  if (action === "clear-report") clearReport();
});

[howDialog, networkDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  });
});
