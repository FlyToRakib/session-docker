// popup.js - Session Docker (UI + logic)

// Storage schema:
// chrome.storage.local.get('sessions') => { domain1: { session: "...", autoApply: true, updatedAt: timestamp }, domain2: {...} }
// chrome.storage.local.get('globalAutoApply') => boolean

const searchBox = document.getElementById('searchBox');
const globalAutoToggle = document.getElementById('globalAutoToggle');
const addDomain = document.getElementById('addDomain');
const addSession = document.getElementById('addSession');
const addBtn = document.getElementById('addBtn');
const listViewBtn = document.getElementById('listViewBtn');
const cardViewBtn = document.getElementById('cardViewBtn');
const listView = document.getElementById('listView');
const cardView = document.getElementById('cardView');
const websiteList = document.getElementById('websiteList');
const cardContainer = document.getElementById('cardContainer');

let sessions = {}; // in-memory cache

// Helpers - promise wrapper for chrome.storage
function storageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, res => resolve(res[key])));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, () => resolve()));
}

// Initialize
async function init() {
  // load sessions & settings
  const storedSessions = await storageGet('sessions') || {};
  sessions = storedSessions;
  const globalAuto = await storageGet('globalAutoApply');
  globalAutoToggle.checked = !!globalAuto;

  // auto-detect from cookies if sessions empty (first run)
  if(Object.keys(sessions).length === 0) {
    autoDetectSitesFromCookies().then(() => {
      loadAndRender();
    });
  } else {
    loadAndRender();
  }
}

// UI: toggle views
listViewBtn.addEventListener('click', () => toggleView('list'));
cardViewBtn.addEventListener('click', () => toggleView('card'));
function toggleView(view) {
  if (view === 'list') {
    document.getElementById('listView').classList.remove('hidden');
    document.getElementById('cardView').classList.add('hidden');
    listViewBtn.classList.add('active');
    cardViewBtn.classList.remove('active');
  } else {
    document.getElementById('listView').classList.add('hidden');
    document.getElementById('cardView').classList.remove('hidden');
    listViewBtn.classList.remove('active');
    cardViewBtn.classList.add('active');
  }
}

// Search filter
searchBox.addEventListener('input', () => renderAll());

// Add / Update domain manually
addBtn.addEventListener('click', async () => {
  const domain = (addDomain.value || '').trim();
  const sessionStr = (addSession.value || '').trim();
  if (!domain || !sessionStr) {
    alert('Provide both domain and session cookie string.');
    return;
  }
  const confirmMsg = sessions[domain] ? `Overwrite saved session for ${domain}?` : `Add session for ${domain}?`;
  if (!confirm(confirmMsg)) return;
  sessions[domain] = { session: sessionStr, autoApply: true, updatedAt: Date.now() };
  await storageSet({ sessions });
  alert(`Saved session for ${domain}`);
  addDomain.value = '';
  addSession.value = '';
  renderAll();
});

// Global auto toggle
globalAutoToggle.addEventListener('change', async () => {
  await storageSet({ globalAutoApply: globalAutoToggle.checked });
  // inform background to refresh settings
  chrome.runtime.sendMessage({ type: 'refreshSettings' });
});

// Render both list and card
function renderAll() {
  renderListView();
  renderCardView();
}

// Render list view
function renderListView() {
  websiteList.innerHTML = '';
  const q = (searchBox.value || '').toLowerCase();
  const keys = Object.keys(sessions).sort();
  for (const domain of keys) {
    if (q && !domain.toLowerCase().includes(q)) continue;
    const obj = sessions[domain];
    const item = document.createElement('div');
    item.className = 'website-item';

    // row: domain + auto toggle + delete
    const row = document.createElement('div');
    row.className = 'row';
    const domainSpan = document.createElement('div');
    domainSpan.className = 'domain';
    domainSpan.textContent = domain;

    const autoLabel = document.createElement('label');
    autoLabel.style.fontSize = '12px';
    autoLabel.style.color = '#444';
    const autoInput = document.createElement('input');
    autoInput.type = 'checkbox';
    autoInput.checked = !!obj.autoApply;
    autoInput.addEventListener('change', async () => {
      sessions[domain].autoApply = autoInput.checked;
      await storageSet({ sessions });
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });
    autoLabel.appendChild(autoInput);
    autoLabel.appendChild(document.createTextNode(' Auto'));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete saved session for ${domain}?`)) return;
      delete sessions[domain];
      await storageSet({ sessions });
      renderAll();
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });

    row.appendChild(domainSpan);
    row.appendChild(autoLabel);
    row.appendChild(delBtn);

    // textarea with session
    const ta = document.createElement('textarea');
    ta.value = obj.session || '';

    // buttons
    const buttons = document.createElement('div');
    buttons.className = 'button-group';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      ta.select();
      document.execCommand('copy');
      alert(`Copied session for ${domain}`);
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      sessions[domain].session = ta.value;
      sessions[domain].updatedAt = Date.now();
      await storageSet({ sessions });
      alert(`Saved session for ${domain}`);
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });

    const syncBtn = document.createElement('button');
    syncBtn.className = 'btn';
    syncBtn.textContent = 'Sync';
    syncBtn.addEventListener('click', async () => {
      // fetch cookies for domain then save
      chrome.cookies.getAll({ domain }, async (cookies) => {
        if (!cookies || cookies.length === 0) {
          alert(`No cookies found for ${domain}`);
          return;
        }
        const sessionData = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        sessions[domain].session = sessionData;
        sessions[domain].updatedAt = Date.now();
        await storageSet({ sessions });
        ta.value = sessionData;
        alert(`Synced cookies for ${domain}`);
        chrome.runtime.sendMessage({ type: 'refreshSettings' });
      });
    });

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.textContent = 'Apply Now';
    applyBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'applySessionNow', domain });
      alert(`Requested apply for ${domain}. Switch to site's tab or open it to verify.`);
    });

    buttons.appendChild(copyBtn);
    buttons.appendChild(saveBtn);
    buttons.appendChild(syncBtn);
    buttons.appendChild(applyBtn);

    item.appendChild(row);
    item.appendChild(ta);
    item.appendChild(buttons);

    websiteList.appendChild(item);
  }

  // if no items
  if (websiteList.children.length === 0) {
    websiteList.innerHTML = '<p style="color:#666">No saved sessions. Use "Add / Update" or let the extension auto-detect from your cookies.</p>';
  }
}

// Render card view
function renderCardView() {
  cardContainer.innerHTML = '';
  const q = (searchBox.value || '').toLowerCase();
  const keys = Object.keys(sessions).sort();
  for (const domain of keys) {
    if (q && !domain.toLowerCase().includes(q)) continue;
    const obj = sessions[domain];
    const card = document.createElement('div');
    card.className = 'card';

    const h3 = document.createElement('h3');
    h3.textContent = domain;

    const ta = document.createElement('textarea');
    ta.value = obj.session || '';

    const grp = document.createElement('div');
    grp.className = 'button-group';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      ta.select();
      document.execCommand('copy');
      alert(`Copied session for ${domain}`);
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', async () => {
      sessions[domain].session = ta.value;
      sessions[domain].updatedAt = Date.now();
      await storageSet({ sessions });
      alert(`Saved session for ${domain}`);
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });

    const syncBtn = document.createElement('button');
    syncBtn.className = 'btn';
    syncBtn.textContent = 'Sync';
    syncBtn.addEventListener('click', async () => {
      chrome.cookies.getAll({ domain }, async (cookies) => {
        if (!cookies || cookies.length === 0) {
          alert(`No cookies found for ${domain}`);
          return;
        }
        const sessionData = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        sessions[domain].session = sessionData;
        sessions[domain].updatedAt = Date.now();
        await storageSet({ sessions });
        ta.value = sessionData;
        alert(`Synced cookies for ${domain}`);
        chrome.runtime.sendMessage({ type: 'refreshSettings' });
      });
    });

    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn';
    applyBtn.textContent = 'Apply Now';
    applyBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'applySessionNow', domain });
      alert(`Requested apply for ${domain}. Open the site to verify.`);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete saved session for ${domain}?`)) return;
      delete sessions[domain];
      await storageSet({ sessions });
      renderAll();
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });

    // auto toggle
    const autoLabel = document.createElement('label');
    autoLabel.style.marginLeft = '8px';
    const autoInput = document.createElement('input');
    autoInput.type = 'checkbox';
    autoInput.checked = !!obj.autoApply;
    autoInput.addEventListener('change', async () => {
      sessions[domain].autoApply = autoInput.checked;
      await storageSet({ sessions });
      chrome.runtime.sendMessage({ type: 'refreshSettings' });
    });
    autoLabel.appendChild(autoInput);
    autoLabel.appendChild(document.createTextNode(' Auto'));

    grp.appendChild(copyBtn);
    grp.appendChild(saveBtn);
    grp.appendChild(syncBtn);
    grp.appendChild(applyBtn);
    grp.appendChild(delBtn);
    grp.appendChild(autoLabel);

    card.appendChild(h3);
    card.appendChild(ta);
    card.appendChild(grp);

    cardContainer.appendChild(card);
  }

  if (cardContainer.children.length === 0) {
    cardContainer.innerHTML = '<p style="color:#666">No saved sessions.</p>';
  }
}

// Auto-detect domains from cookies and populate sessions (non-destructive)
function autoDetectSitesFromCookies() {
  return new Promise(resolve => {
    chrome.cookies.getAll({}, async (cookies) => {
      if (!cookies || cookies.length === 0) return resolve();
      // build domain-set
      const domainMap = {};
      for (const c of cookies) {
        // normalize domain: remove leading dots
        const dom = (c.domain || '').replace(/^\./, '');
        if (!dom) continue;
        if (!domainMap[dom]) domainMap[dom] = [];
        domainMap[dom].push(c);
      }
      let changed = false;
      for (const dom of Object.keys(domainMap)) {
        if (!sessions[dom]) {
          const sessionData = domainMap[dom].map(c => `${c.name}=${c.value}`).join('; ');
          sessions[dom] = { session: sessionData, autoApply: true, updatedAt: Date.now() };
          changed = true;
        }
      }
      if (changed) await storageSet({ sessions });
      resolve();
    });
  });
}

// initial render
async function loadAndRender() {
  const stored = await storageGet('sessions') || {};
  sessions = stored;
  renderAll();
}

// Initialize popup
document.addEventListener('DOMContentLoaded', init);
