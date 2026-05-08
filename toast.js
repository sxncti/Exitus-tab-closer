// toast.js – v4.1 (minimal corner notification)

document.addEventListener('DOMContentLoaded', () => {

  /* ---- apply saved theme ---- */
  chrome.storage.local.get(['theme', '_candidates', 'timeoutMinutes'], res => {
    if ((res.theme ?? 'light') === 'dark')
      document.documentElement.classList.add('dark');

    // Load candidates from storage
    candidates = res._candidates || [];
    updateDisplay();

    // Display timeout
    const min = res.timeoutMinutes ?? 60;
    if (min < 60) hoursText.textContent = `${min}m`;
    else if (min % 60 === 0) hoursText.textContent = `${min / 60}h`;
    else hoursText.textContent = `${Math.floor(min / 60)}h ${min % 60}m`;
  });

  const dismissBtn = document.getElementById('dismissBtn');
  const closeAllBtn = document.getElementById('closeAllBtn');
  const viewMoreBtn = document.getElementById('viewMoreBtn');
  const countText = document.getElementById('countText');
  const hoursText = document.getElementById('hoursText');
  const inactiveCount = document.getElementById('inactiveCount');

  let candidates = [];

  function updateDisplay() {
    const n = candidates.length;
    countText.textContent = `${n} tab${n !== 1 ? 's' : ''}`;
    inactiveCount.textContent = n;
  }

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
    dismissed = true;
    const allIds = candidates.map(t => t.id);
    chrome.runtime.sendMessage({
      action: 'closeTabs',
      tabIdsToClose: allIds,
      allCandidateIds: allIds
    }, () => window.close());
  });

  /* ---- View Details (open full prompt) ---- */
  viewMoreBtn.addEventListener('click', () => {
    dismissed = true;
    chrome.runtime.sendMessage({
      action: 'openDetailedPrompt',
      tabs: candidates
    }, () => window.close());
  });

  /* ---- Dismiss ---- */
  dismissBtn.addEventListener('click', () => {
    dismissed = true;
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

  /* ---- beforeunload guard ---- */
  let dismissed = false;
  window.addEventListener('beforeunload', () => {
    if (!dismissed) {
      const allIds = candidates.map(t => t.id);
      chrome.runtime.sendMessage({ action: 'promptCancelled', allCandidateIds: allIds });
    }
  });
});
