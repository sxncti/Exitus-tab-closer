// toast.js – v4.1 (minimal corner notification)

document.addEventListener('DOMContentLoaded', () => {

  /* ---- apply saved theme ---- */
  chrome.storage.local.get('theme', res => {
    if ((res.theme ?? 'light') === 'dark')
      document.documentElement.classList.add('dark');
  });

  const dismissBtn = document.getElementById('dismissBtn');
  const closeAllBtn = document.getElementById('closeAllBtn');
  const viewMoreBtn = document.getElementById('viewMoreBtn');
  const countText = document.getElementById('countText');
  const hoursText = document.getElementById('hoursText');
  const inactiveCount = document.getElementById('inactiveCount');

  let candidates = [];

  /* ---- load candidates from URL params ---- */
  try {
    const p = new URLSearchParams(location.search).get('tabs');
    if (p) candidates = JSON.parse(decodeURIComponent(p));
  } catch (e) { console.error(e); }

  /* ---- load timeout for display ---- */
  chrome.storage.local.get('timeoutMinutes', res => {
    const min = res.timeoutMinutes ?? 15;
    if (min < 60) hoursText.textContent = `${min}m`;
    else if (min % 60 === 0) hoursText.textContent = `${min / 60}h`;
    else hoursText.textContent = `${Math.floor(min / 60)}h ${min % 60}m`;
  });

  function updateDisplay() {
    const n = candidates.length;
    countText.textContent = `${n} tab${n !== 1 ? 's' : ''}`;
    inactiveCount.textContent = n;
  }
  updateDisplay();

  /* ---- receive more candidates ---- */
  chrome.runtime.onMessage.addListener((msg, _, send) => {
    if (msg.action === 'addCandidates') {
      for (const tab of msg.tabs) {
        if (!candidates.some(c => c.id === tab.id)) candidates.push(tab);
      }
      updateDisplay();
      send({ ok: true });
    }
  });

  /* ---- Close All ---- */
  closeAllBtn.addEventListener('click', () => {
    const allIds = candidates.map(t => t.id);
    chrome.runtime.sendMessage({
      action: 'closeTabs',
      tabIdsToClose: allIds,
      allCandidateIds: allIds
    }, () => window.close());
  });

  /* ---- View Details (open full prompt) ---- */
  viewMoreBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'openDetailedPrompt',
      tabs: candidates
    }, () => window.close());
  });

  /* ---- Dismiss ---- */
  dismissBtn.addEventListener('click', () => {
    const allIds = candidates.map(t => t.id);
    chrome.runtime.sendMessage({
      action: 'promptCancelled',
      allCandidateIds: allIds
    }, () => window.close());
  });

  /* ---- Esc to dismiss ---- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') dismissBtn.click();
  });

  /* ---- interaction ping ---- */
  const ping = () => chrome.runtime.sendMessage({ action: 'promptInteracted' });
  window.addEventListener('focus', ping);

  /* ---- beforeunload guard ---- */
  let dismissed = false;
  dismissBtn.addEventListener('click', () => { dismissed = true; });
  closeAllBtn.addEventListener('click', () => { dismissed = true; });
  viewMoreBtn.addEventListener('click', () => { dismissed = true; });
  window.addEventListener('beforeunload', () => {
    if (!dismissed) {
      const allIds = candidates.map(t => t.id);
      chrome.runtime.sendMessage({ action: 'promptCancelled', allCandidateIds: allIds });
    }
  });
});
