// popup.js – v4.1 (threshold, max daily, whitelist, snooze, dark mode)

document.addEventListener('DOMContentLoaded', () => {

  const enabledCb     = document.getElementById('enabled');
  const timeoutInp    = document.getElementById('timeout');
  const thresholdInp  = document.getElementById('tabThreshold');
  const maxDailyInp   = document.getElementById('maxDaily');
  const themeCb       = document.getElementById('themeSwitch');
  const snoozeMultSel = document.getElementById('snoozeMult');
  const saveBtn       = document.getElementById('saveButton');
  const statusMsg     = document.getElementById('statusMessage');
  const wlInput       = document.getElementById('whitelistInput');
  const wlAddBtn      = document.getElementById('addWhitelist');
  const wlList        = document.getElementById('whitelistItems');

  let whitelist = [];

  /* ----- render whitelist ----- */
  function renderWhitelist() {
    wlList.innerHTML = '';
    whitelist.forEach((domain, i) => {
      const li = document.createElement('li');
      li.className = 'whitelist-item';
      li.innerHTML = `
        <span class="wl-domain">${domain}</span>
        <button type="button" class="wl-remove secondary tiny" data-idx="${i}">✕</button>`;
      wlList.append(li);
    });
    wlList.querySelectorAll('.wl-remove').forEach(btn => {
      btn.onclick = () => {
        whitelist.splice(+btn.dataset.idx, 1);
        renderWhitelist();
      };
    });
  }

  /* ----- load config ----- */
  chrome.storage.local.get(
    ['timeoutMinutes', 'enabled', 'theme', 'whitelist', 'snoozeMult', 'tabThreshold', 'maxDaily'],
    cfg => {
      enabledCb.checked = cfg.enabled ?? true;
      timeoutInp.value = cfg.timeoutMinutes ?? 60;
      thresholdInp.value = cfg.tabThreshold ?? 20;
      maxDailyInp.value = cfg.maxDaily ?? 3;
      snoozeMultSel.value = String(cfg.snoozeMult ?? 3);
      whitelist = cfg.whitelist ?? [];
      renderWhitelist();

      const theme = cfg.theme ?? 'light';
      themeCb.checked = theme === 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  );

  /* ----- Dark Mode toggle (instant) ----- */
  themeCb.addEventListener('change', () => {
    const theme = themeCb.checked ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    chrome.storage.local.set({ theme });
  });

  /* ----- Add whitelist domain ----- */
  function addWhitelistEntry() {
    let domain = wlInput.value.trim().toLowerCase();
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');
    if (!domain) return;
    if (whitelist.includes(domain)) {
      wlInput.value = '';
      return;
    }
    whitelist.push(domain);
    wlInput.value = '';
    renderWhitelist();
  }
  wlAddBtn.addEventListener('click', addWhitelistEntry);
  wlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addWhitelistEntry(); }
  });

  /* ----- Save ----- */
  saveBtn.addEventListener('click', () => {
    const t = parseInt(timeoutInp.value, 10);
    const th = parseInt(thresholdInp.value, 10);
    const md = parseInt(maxDailyInp.value, 10);

    if (isNaN(t) || t < 1) {
      statusMsg.textContent = 'Invalid timeout';
      statusMsg.style.color = '#ef4444';
      return;
    }
    if (isNaN(th) || th < 1) {
      statusMsg.textContent = 'Invalid tab threshold';
      statusMsg.style.color = '#ef4444';
      return;
    }
    if (isNaN(md) || md < 1) {
      statusMsg.textContent = 'Invalid max daily value';
      statusMsg.style.color = '#ef4444';
      return;
    }

    const settings = {
      timeoutMinutes: t,
      enabled: enabledCb.checked,
      snoozeMult: parseInt(snoozeMultSel.value, 10),
      tabThreshold: th,
      maxDaily: md,
      whitelist: whitelist
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    statusMsg.textContent = '';

    chrome.storage.local.set(settings, () => {
      chrome.runtime.sendMessage({ action: 'updateSettings', settings }, resp => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
        if (resp && resp.success) {
          statusMsg.textContent = 'Saved!';
          statusMsg.style.color = '#22c55e';
          setTimeout(() => statusMsg.textContent = '', 2000);
        } else {
          statusMsg.textContent = 'Error saving';
          statusMsg.style.color = '#ef4444';
        }
      });
    });
  });
});
