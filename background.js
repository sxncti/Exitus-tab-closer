/* EXITUS – Tab closer  |  v4.0
 * • Enterprise-grade: whitelist, badge, configurable snooze
 * • Service-worker resilient: all state persisted
 * • Debounced scan, deduplication, domain awareness
 */

const NAME = 'inactiveTabCheck';
const DEF_MIN = 15;
const DEF_SNOOZE_MULT = 3;
const DEB_MS = 30_000;
const PROMPT = chrome.runtime.getURL('prompt.html');
const COOLDOWN = 5 * 60_000;

let timeoutMin = DEF_MIN, limitMs = DEF_MIN * 60_000, enabled = true;
let snoozeMult = DEF_SNOOZE_MULT;
let whitelist = [];
let lastActive = {}, snoozed = {}, pending = [];
let pWin = null, pTab = null;
let lastInteraction = 0;
let scanTimer = null;

/* ---------- persist helpers ---------- */
function saveState() {
  chrome.storage.local.set({
    snoozedUntil: snoozed,
    lastActiveTimes: lastActive,
    lastInteractionTS: lastInteraction,
    pendingTabs: pending
  });
}
function saveInteraction() {
  lastInteraction = Date.now();
  chrome.storage.local.set({ lastInteractionTS: lastInteraction });
}
const skip = u => !u || u.startsWith('chrome://') || u.startsWith('brave://') ||
                  u.startsWith('edge://') || u.startsWith('about:') || u.startsWith(PROMPT);

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
    'lastInteractionTS', 'pendingTabs', 'whitelist', 'snoozeMult'
  ]);
  timeoutMin = parseInt(s.timeoutMinutes ?? DEF_MIN, 10);
  limitMs = timeoutMin * 60_000;
  enabled = s.enabled ?? true;
  snoozeMult = parseInt(s.snoozeMult ?? DEF_SNOOZE_MULT, 10);
  whitelist = s.whitelist ?? [];
  snoozed = s.snoozedUntil ?? {};
  lastActive = s.lastActiveTimes ?? {};
  lastInteraction = parseInt(s.lastInteractionTS || 0, 10);
  pending = s.pendingTabs ?? [];

  await seedNewTabs();
  await purgeClosedIds();
  await rediscoverPrompt();

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

async function rediscoverPrompt() {
  if (pWin) return;
  try {
    const opens = await chrome.tabs.query({ url: PROMPT + '*' });
    if (opens.length) {
      pWin = opens[0].windowId;
      pTab = opens[0].id;
      for (const tab of opens.slice(1)) try { await chrome.windows.remove(tab.windowId); } catch {}
    }
  } catch {}
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
chrome.windows.onFocusChanged.addListener(w => { if (w === pWin) saveInteraction(); });

/* ---------- debounced scanner ---------- */
function debouncedScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 2000);
}

async function scan() {
  scanTimer = null;
  if (!enabled) { updateBadge(); return; }
  await purgeClosedIds();
  await rediscoverPrompt();

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
  if (cand.length) await handlePrompt(cand);
  saveState();
  updateBadge();
}

/* ---------- prompt logic ---------- */
async function handlePrompt(tabs) {
  const now = Date.now();
  const inCooldown = now - lastInteraction < COOLDOWN;

  if (pWin) {
    try { await sendToPrompt(tabs, false); }
    catch { pWin = pTab = null; pending.push(...tabs); saveState(); }
    return;
  }

  if (inCooldown) {
    pending.push(...tabs);
    saveState();
    return;
  }

  await ensureSinglePrompt(tabs, true);
  saveInteraction();
}

function sendToPrompt(tabs, focus) {
  return new Promise((ok, fail) => {
    if (!pTab) { fail(); return; }
    chrome.tabs.sendMessage(pTab, { action: 'addCandidates', tabs }, r => {
      if (chrome.runtime.lastError || !r || !r.ok) { fail(); return; }
      if (focus) chrome.windows.update(pWin, { focused: true }, ok);
      else ok();
    });
  });
}

async function ensureSinglePrompt(tabs, focus) {
  const opens = await chrome.tabs.query({ url: PROMPT + '*' });
  if (opens.length > 1) {
    for (const tab of opens.slice(1)) try { await chrome.windows.remove(tab.windowId); } catch {}
  }
  if (pWin) {
    try { await sendToPrompt(tabs, focus); return; } catch { pWin = pTab = null; }
  }
  if (opens.length) {
    pWin = opens[0].windowId; pTab = opens[0].id;
    try { await sendToPrompt(tabs, focus); return; } catch { pWin = pTab = null; }
  }
  const w = await chrome.windows.create({
    url: `${PROMPT}?tabs=${encodeURIComponent(JSON.stringify(tabs))}`,
    type: 'popup', width: 700, height: 600
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
    whitelist = m.settings.whitelist ?? whitelist;
    debouncedScan();
    res({ success: true });
    return true;
  }
  if (m.action === 'getSettings') {
    res({ timeoutMin, enabled, snoozeMult, whitelist });
    return true;
  }
  if (m.action === 'promptInteracted') { saveInteraction(); res({ ok: true }); return; }

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
    saveInteraction();
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
