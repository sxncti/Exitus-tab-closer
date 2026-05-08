/* EXITUS – Tab closer  |  v4.1
 * • Non-invasive: small toast in corner, full prompt only on "View Details"
 * • Tab threshold: only triggers when open tabs >= threshold
 * • Daily limit: max N popups per day (resets at midnight)
 * • Service-worker resilient, badge, whitelist, configurable snooze
 */

const NAME = 'inactiveTabCheck';
const DEF_MIN = 60;
const DEF_SNOOZE_MULT = 3;
const DEF_THRESHOLD = 20;
const DEF_MAX_DAILY = 3;
const DEB_MS = 30_000;
const TOAST = chrome.runtime.getURL('toast.html');
const PROMPT = chrome.runtime.getURL('prompt.html');

let timeoutMin = DEF_MIN, limitMs = DEF_MIN * 60_000, enabled = true;
let snoozeMult = DEF_SNOOZE_MULT;
let tabThreshold = DEF_THRESHOLD;
let maxDaily = DEF_MAX_DAILY;
let whitelist = [];
let lastActive = {}, snoozed = {}, pending = [];
let pWin = null, pTab = null;
let popupsToday = 0, lastPopupDate = '';
let scanTimer = null;

/* ---------- persist helpers ---------- */
function saveState() {
  chrome.storage.local.set({
    snoozedUntil: snoozed,
    lastActiveTimes: lastActive,
    pendingTabs: pending,
    popupsToday, lastPopupDate
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function checkDailyReset() {
  const today = todayStr();
  if (lastPopupDate !== today) {
    popupsToday = 0;
    lastPopupDate = today;
  }
}

const skip = u => !u || u.startsWith('chrome://') || u.startsWith('brave://') ||
                  u.startsWith('edge://') || u.startsWith('about:') ||
                  u.startsWith(TOAST) || u.startsWith(PROMPT);

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function isWhitelisted(url) {
  const domain = getDomain(url);
  if (!domain) return false;
  return whitelist.some(w => domain === w || domain.endsWith('.' + w));
}

/* ---------- badge ---------- */
async function updateBadge() {
  if (!enabled) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const now = Date.now();
  let count = 0;
  const act = await chrome.tabs.query({ active: true, currentWindow: true });
  const actId = act.length ? act[0].id : -1;

  for (const t of await chrome.tabs.query({ windowType: 'normal' })) {
    const u = t.url || '';
    if (t.id === actId || t.pinned || t.audible || skip(u) || isWhitelisted(u)) continue;
    if (snoozed[t.id] && now < snoozed[t.id]) continue;
    const last = lastActive[t.id] ?? t.lastAccessed ?? now;
    if (now - last > limitMs) count++;
  }
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#ef4444' : '#666' });
}

/* ---------- init ---------- */
async function init() {
  const s = await chrome.storage.local.get([
    'timeoutMinutes', 'enabled', 'snoozedUntil', 'lastActiveTimes',
    'pendingTabs', 'whitelist', 'snoozeMult', 'tabThreshold',
    'maxDaily', 'popupsToday', 'lastPopupDate'
  ]);
  timeoutMin = parseInt(s.timeoutMinutes ?? DEF_MIN, 10);
  limitMs = timeoutMin * 60_000;
  enabled = s.enabled ?? true;
  snoozeMult = parseInt(s.snoozeMult ?? DEF_SNOOZE_MULT, 10);
  tabThreshold = parseInt(s.tabThreshold ?? DEF_THRESHOLD, 10);
  maxDaily = parseInt(s.maxDaily ?? DEF_MAX_DAILY, 10);
  whitelist = s.whitelist ?? [];
  snoozed = s.snoozedUntil ?? {};
  lastActive = s.lastActiveTimes ?? {};
  pending = s.pendingTabs ?? [];
  popupsToday = parseInt(s.popupsToday || 0, 10);
  lastPopupDate = s.lastPopupDate || '';

  checkDailyReset();
  await seedNewTabs();
  await purgeClosedIds();
  await rediscoverToast();

  chrome.alarms.create(NAME, { delayInMinutes: 1, periodInMinutes: 1 });
  debouncedScan();
}

/* ---------- house-keeping ---------- */
async function seedNewTabs() {
  const now = Date.now();
  let dirty = false;
  for (const t of await chrome.tabs.query({ windowType: 'normal' })) {
    if (lastActive[t.id] !== undefined) continue;
    if (snoozed[t.id] && now < snoozed[t.id]) continue;
    lastActive[t.id] = t.lastAccessed ?? now;
    dirty = true;
  }
  if (dirty) saveState();
}

async function purgeClosedIds() {
  const open = new Set((await chrome.tabs.query({})).map(t => t.id));
  let dirty = false;
  for (const id in lastActive) if (!open.has(+id)) { delete lastActive[id]; dirty = true; }
  for (const id in snoozed)    if (!open.has(+id)) { delete snoozed[id];    dirty = true; }
  const before = pending.length;
  pending = pending.filter(p => open.has(p.id));
  if (pending.length !== before) dirty = true;
  if (dirty) saveState();
}

async function rediscoverToast() {
  if (pWin) return;
  try {
    // check for toast or prompt windows
    let opens = await chrome.tabs.query({ url: TOAST + '*' });
    if (!opens.length) opens = await chrome.tabs.query({ url: PROMPT + '*' });
    if (opens.length) {
      pWin = opens[0].windowId;
      pTab = opens[0].id;
      for (const tab of opens.slice(1)) try { await chrome.windows.remove(tab.windowId); } catch {}
    }
  } catch {}
}

/* ---------- tab count (excluding pinned) ---------- */
async function getOpenTabCount() {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  return tabs.filter(t => !t.pinned).length;
}

/* ---------- tab events ---------- */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!enabled) return;
  delete snoozed[tabId];
  lastActive[tabId] = Date.now();
  saveState();
  debouncedScan();
});
chrome.tabs.onUpdated.addListener((id, info) => {
  if (!enabled || !info.url) return;
  const n = Date.now();
  if (n - (lastActive[id] || 0) > DEB_MS) {
    delete snoozed[id];
    lastActive[id] = n;
    saveState();
    debouncedScan();
  }
});
chrome.tabs.onRemoved.addListener(id => {
  delete snoozed[id];
  delete lastActive[id];
  saveState();
  updateBadge();
});

chrome.windows.onRemoved.addListener(w => { if (w === pWin) { pWin = pTab = null; } });

/* ---------- debounced scanner ---------- */
function debouncedScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 3000);
}

async function scan() {
  scanTimer = null;
  if (!enabled) { updateBadge(); return; }
  await purgeClosedIds();
  await rediscoverToast();
  checkDailyReset();

  const now = Date.now();
  const act = await chrome.tabs.query({ active: true, currentWindow: true });
  const actId = act.length ? act[0].id : -1;

  const seen = new Set(pending.map(p => p.id));
  const cand = [...pending];
  pending = [];

  for (const t of await chrome.tabs.query({ windowType: 'normal' })) {
    const id = t.id, u = t.url || '';
    if (id === actId || t.pinned || t.audible || skip(u) || isWhitelisted(u)) continue;
    if (seen.has(id)) continue;

    if (snoozed[id] && now < snoozed[id]) continue;
    if (snoozed[id] && now >= snoozed[id]) delete snoozed[id];

    const last = lastActive[id] ?? t.lastAccessed ?? now;
    if (now - last > limitMs) {
      const inactiveMs = now - last;
      cand.push({ id, title: t.title || u, url: u, favIconUrl: t.favIconUrl, inactiveMs });
      seen.add(id);
    }
  }

  if (cand.length) await handleNotification(cand);
  saveState();
  updateBadge();
}

/* ---------- notification logic ---------- */
async function handleNotification(tabs) {
  /* Already showing a toast/prompt? Inject silently */
  if (pWin) {
    try { await sendToWindow(tabs); }
    catch { pWin = pTab = null; pending.push(...tabs); saveState(); }
    return;
  }

  /* Check tab threshold */
  const openCount = await getOpenTabCount();
  if (openCount < tabThreshold) {
    pending.push(...tabs);
    saveState();
    return;
  }

  /* Check daily limit */
  if (popupsToday >= maxDaily) {
    pending.push(...tabs);
    saveState();
    return;
  }

  /* Show toast */
  await showToast(tabs);
  popupsToday++;
  saveState();
}

function sendToWindow(tabs) {
  return new Promise((ok, fail) => {
    if (!pTab) { fail(); return; }
    chrome.tabs.sendMessage(pTab, { action: 'addCandidates', tabs }, r => {
      if (chrome.runtime.lastError || !r || !r.ok) { fail(); return; }
      ok();
    });
  });
}

/* ---------- toast (small corner window) ---------- */
async function showToast(tabs) {
  // Close any existing toast/prompt
  const existing = [
    ...(await chrome.tabs.query({ url: TOAST + '*' })),
    ...(await chrome.tabs.query({ url: PROMPT + '*' }))
  ];
  for (const t of existing) try { await chrome.windows.remove(t.windowId); } catch {}
  pWin = pTab = null;

  // Store candidates in storage (avoids URL length limits)
  await chrome.storage.local.set({ _candidates: tabs });

  // Position: bottom-right of the screen
  let left = 1560, top = 860;
  try {
    const displays = await chrome.system.display.getInfo();
    const wa = (displays[0] || {}).workArea || { width: 1920, height: 1080, left: 0, top: 0 };
    left = wa.left + wa.width - 360 - 16;
    top = wa.top + wa.height - 180 - 16;
  } catch {}

  const w = await chrome.windows.create({
    url: TOAST,
    type: 'popup',
    width: 360, height: 180,
    left, top,
    focused: false
  });
  if (w?.tabs?.length) { pWin = w.id; pTab = w.tabs[0].id; }
}

/* ---------- full prompt (from "View Details") ---------- */
async function openFullPrompt(tabs) {
  // Close toast
  if (pWin) try { await chrome.windows.remove(pWin); } catch {}
  pWin = pTab = null;

  // Store candidates in storage
  await chrome.storage.local.set({ _candidates: tabs });

  const w = await chrome.windows.create({
    url: PROMPT,
    type: 'popup', width: 700, height: 550
  });
  if (w?.tabs?.length) { pWin = w.id; pTab = w.tabs[0].id; }
}

/* ---------- bridge ---------- */
chrome.runtime.onMessage.addListener((m, _, res) => {
  if (m.action === 'updateSettings') {
    timeoutMin = m.settings.timeoutMinutes;
    limitMs = timeoutMin * 60_000;
    enabled = m.settings.enabled;
    snoozeMult = m.settings.snoozeMult ?? snoozeMult;
    tabThreshold = m.settings.tabThreshold ?? tabThreshold;
    maxDaily = m.settings.maxDaily ?? maxDaily;
    whitelist = m.settings.whitelist ?? whitelist;
    debouncedScan();
    res({ success: true });
    return true;
  }
  if (m.action === 'getSettings') {
    res({ timeoutMin, enabled, snoozeMult, tabThreshold, maxDaily, whitelist, popupsToday });
    return true;
  }
  if (m.action === 'promptInteracted') { res({ ok: true }); return; }

  if (m.action === 'openDetailedPrompt') {
    openFullPrompt(m.tabs || pending);
    res({ ok: true });
    return true;
  }

  if (m.action === 'closeTabs' || m.action === 'promptCancelled') {
    const now = Date.now();
    (m.allCandidateIds || []).forEach(id => {
      if (m.action === 'closeTabs' && (m.tabIdsToClose || []).includes(id)) {
        delete snoozed[id];
        delete lastActive[id];
      } else {
        snoozed[id] = now + limitMs * snoozeMult;
        delete lastActive[id];
      }
    });
    if (m.action === 'closeTabs') {
      chrome.tabs.remove(m.tabIdsToClose || []).then(saveState).catch(saveState);
    } else {
      saveState();
    }
    pending = [];
    pWin = pTab = null;
    updateBadge();
    res({ success: true });
    return true;
  }
});

/* ---------- alarm ---------- */
chrome.alarms.onAlarm.addListener(a => { if (a.name === NAME) scan(); });

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);
init();
