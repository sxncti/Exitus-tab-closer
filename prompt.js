// prompt.js – v4.0 (domain groups, search, sort, keyboard shortcuts)

document.addEventListener('DOMContentLoaded', () => {

  /* ---- apply saved theme ---- */
  chrome.storage.local.get('theme', res => {
    if ((res.theme ?? 'light') === 'dark')
      document.documentElement.classList.add('dark');
  });

  const listEl = document.getElementById('tabsList');
  const form = document.getElementById('tabsForm');
  const selectAllBtn = document.getElementById('selectAll');
  const selectNoneBtn = document.getElementById('selectNone');
  const confirmBt = document.getElementById('confirmButton');
  const cancelBt = document.getElementById('cancelButton');
  const status = document.getElementById('promptStatusMessage');
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const tabCountEl = document.getElementById('tabCount');
  const selectedInfoEl = document.getElementById('selectedInfo');

  let tabs = []; // all tab objects
  let dismissed = false;

  /* ---- helpers ---- */
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'other'; }
  }

  function formatTime(ms) {
    const min = Math.floor(ms / 60_000);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  /* ---- add / deduplicate ---- */
  function addTab(tab) {
    if (!tab || tabs.some(t => t.id === tab.id)) return;
    tab.domain = getDomain(tab.url || '');
    tabs.push(tab);
  }

  /* ---- render ---- */
  function render() {
    const query = searchInput.value.toLowerCase().trim();
    const sort = sortSelect.value;

    // filter
    let filtered = tabs;
    if (query) {
      filtered = tabs.filter(t =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.url || '').toLowerCase().includes(query) ||
        t.domain.includes(query)
      );
    }

    // sort
    if (sort === 'time') {
      filtered.sort((a, b) => (b.inactiveMs || 0) - (a.inactiveMs || 0));
    } else if (sort === 'title') {
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      filtered.sort((a, b) => a.domain.localeCompare(b.domain) || (a.title || '').localeCompare(b.title || ''));
    }

    // preserve checked state
    const checkedIds = new Set(
      [...listEl.querySelectorAll('input[type=checkbox]:checked')].map(c => +c.value)
    );
    // on first render, check all
    const isFirstRender = listEl.children.length === 0;

    listEl.innerHTML = '';
    tabCountEl.textContent = tabs.length;

    if (sort === 'domain') {
      // group by domain
      const groups = new Map();
      for (const t of filtered) {
        if (!groups.has(t.domain)) groups.set(t.domain, []);
        groups.get(t.domain).push(t);
      }
      for (const [domain, domTabs] of groups) {
        const group = document.createElement('div');
        group.className = 'domain-group';
        group.innerHTML = `
          <div class="domain-header">
            <span class="domain-name">${escapeHtml(domain)}</span>
            <span class="domain-count">${domTabs.length} tab${domTabs.length > 1 ? 's' : ''}</span>
            <button type="button" class="domain-select-all secondary tiny">All</button>
            <button type="button" class="domain-select-none secondary tiny">None</button>
          </div>
          <ul class="domain-tabs"></ul>`;
        const ul = group.querySelector('.domain-tabs');
        for (const t of domTabs) {
          ul.append(createTabItem(t, isFirstRender ? true : checkedIds.has(t.id)));
        }
        // domain bulk actions
        group.querySelector('.domain-select-all').onclick = () => {
          group.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true);
          updateCount();
        };
        group.querySelector('.domain-select-none').onclick = () => {
          group.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false);
          updateCount();
        };
        listEl.append(group);
      }
    } else {
      // flat list
      const ul = document.createElement('ul');
      ul.className = 'flat-tabs';
      for (const t of filtered) {
        ul.append(createTabItem(t, isFirstRender ? true : checkedIds.has(t.id)));
      }
      listEl.append(ul);
    }

    updateCount();
  }

  function createTabItem(tab, checked) {
    const li = document.createElement('li');
    li.className = 'tab-item';
    const faviconSrc = tab.favIconUrl || 'icons/icon16.png';
    const timeStr = tab.inactiveMs ? formatTime(tab.inactiveMs) : '';
    li.innerHTML = `
      <input type="checkbox" class="tab-checkbox" id="t${tab.id}" value="${tab.id}" ${checked ? 'checked' : ''}>
      <label for="t${tab.id}" class="tab-label">
        <img src="${escapeHtml(faviconSrc)}" class="tab-favicon" onerror="this.src='icons/icon16.png'">
        <div class="tab-text">
          <span class="tab-title">${escapeHtml((tab.title || 'Untitled').slice(0, 100))}</span>
          <span class="tab-url">${escapeHtml((tab.url || '').slice(0, 150))}</span>
        </div>
        ${timeStr ? `<span class="tab-time">${timeStr}</span>` : ''}
      </label>`;
    return li;
  }

  function updateCount() {
    const all = listEl.querySelectorAll('input[type=checkbox]');
    const checked = listEl.querySelectorAll('input[type=checkbox]:checked');
    const n = checked.length;
    confirmBt.textContent = n ? `Close Selected (${n})` : 'Close Selected';
    confirmBt.disabled = n === 0;
    selectedInfoEl.textContent = `${n} of ${all.length} selected`;
  }

  /* ---- initial load ---- */
  try {
    const p = new URLSearchParams(location.search).get('tabs');
    if (p) JSON.parse(decodeURIComponent(p)).forEach(addTab);
  } catch (e) { console.error(e); }

  if (!tabs.length) {
    status.textContent = 'No candidate tabs.';
    confirmBt.disabled = true;
    cancelBt.textContent = 'Close';
  }
  render();

  /* ---- events ---- */
  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  listEl.addEventListener('change', updateCount);

  selectAllBtn.onclick = () => { listEl.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true); updateCount(); };
  selectNoneBtn.onclick = () => { listEl.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false); updateCount(); };

  /* close selected */
  form.addEventListener('submit', e => {
    e.preventDefault();
    dismissed = true;
    const toClose = [...listEl.querySelectorAll('input[type=checkbox]:checked')].map(c => +c.value);
    const allIds = tabs.map(t => t.id);
    chrome.runtime.sendMessage({ action: 'closeTabs', tabIdsToClose: toClose, allCandidateIds: allIds }, () => window.close());
  });
  cancelBt.addEventListener('click', () => {
    dismissed = true;
    const allIds = tabs.map(t => t.id);
    chrome.runtime.sendMessage({ action: 'promptCancelled', allCandidateIds: allIds }, () => window.close());
  });

  /* receive new candidates from background */
  chrome.runtime.onMessage.addListener((msg, _, send) => {
    if (msg.action === 'addCandidates') {
      msg.tabs.forEach(addTab);
      render();
      send({ ok: true });
    }
  });

  /* keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelBt.click();
    }
    if (e.key === 'Enter' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      form.requestSubmit();
    }
    // Ctrl+A to select all (when not in search)
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && e.target !== searchInput) {
      e.preventDefault();
      selectAllBtn.click();
    }
    // Ctrl+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  /* interaction ping */
  const ping = () => chrome.runtime.sendMessage({ action: 'promptInteracted' });
  window.addEventListener('focus', ping);
  document.addEventListener('mousedown', ping, true);
  document.addEventListener('wheel', ping, true);

  /* beforeunload guard */
  window.addEventListener('beforeunload', () => {
    if (!dismissed) {
      const allIds = tabs.map(t => t.id);
      chrome.runtime.sendMessage({ action: 'promptCancelled', allCandidateIds: allIds });
    }
  });
});
