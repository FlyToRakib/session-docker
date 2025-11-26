// background.js - Session Docker service worker
// Listens for tab updates/activations and will auto-apply saved sessions (cookies) for saved domains when allowed.

// Storage: 'sessions' object and 'globalAutoApply' boolean

// Utility: promise wrappers
function storageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, res => resolve(res[key])));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, () => resolve()));
}

// Parse cookie string "name=value; name2=val2; Path=/; ..." -> returns array of {name, value}
function parseCookieString(cookieStr) {
  if (!cookieStr) return [];
  // split by ; but ignore potential ; in values (rare). We'll trim each part and take first '=' as separator.
  return cookieStr.split(';').map(p => p.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return null;
    const name = part.substring(0, idx).trim();
    const value = part.substring(idx + 1).trim();
    return name ? { name, value } : null;
  }).filter(Boolean);
}

// Attempt to set cookies for a domain using cookies API
async function setCookiesForDomain(domain, cookieStr) {
  const cookies = parseCookieString(cookieStr);
  if (!cookies.length) return { success: false, reason: 'No cookie pairs parsed' };

  // Build URL for secure attempt and non-secure fallback
  const httpsUrl = `https://${domain}/`;
  const httpUrl = `http://${domain}/`;

  let results = [];
  for (const c of cookies) {
    // Attempt to set cookie with https url first (many sites require secure)
    const details = {
      url: httpsUrl,
      name: c.name,
      value: c.value,
      domain: domain,
      path: '/',
      // don't force httpOnly/secure; these flags cannot be set to true for HttpOnly cookies via extension.
      secure: true
    };
    try {
      await new Promise((res, rej) => chrome.cookies.set(details, (created) => {
        if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
        res(created);
      }));
      results.push({ name: c.name, ok: true, used: 'https' });
      continue;
    } catch (errHttps) {
      // try http fallback
    }
    try {
      const details2 = { url: httpUrl, name: c.name, value: c.value, domain: domain, path: '/', secure: false };
      await new Promise((res, rej) => chrome.cookies.set(details2, (created) => {
        if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
        res(created);
      }));
      results.push({ name: c.name, ok: true, used: 'http' });
    } catch (errHttp) {
      results.push({ name: c.name, ok: false, error: errHttp.message });
    }
  }
  return { success: results.every(r => r.ok), details: results };
}

// When a tab loads / is activated, try apply session for its domain
async function tryApplyForTab(tabId, url) {
  if (!url || !url.startsWith('http')) return;
  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^\./, '');
  } catch (e) { return; }

  const sessions = await storageGet('sessions') || {};
  const globalAuto = await storageGet('globalAutoApply');
  const entry = sessions[hostname];
  if (!entry) return;

  // check global toggle and per-site toggle
  if (!globalAuto && !entry.autoApply) return;
  if (!globalAuto && entry.autoApply === false) return;
  // if globalAuto is true, apply for all with entry present (unless explicitly false)
  if (globalAuto === false && entry.autoApply === false) return;

  // set cookies
  const result = await setCookiesForDomain(hostname, entry.session || '');
  // optional: log results for debugging
  console.debug('Session Docker apply result', hostname, result);
}

// Listen to tab updates (completed)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    tryApplyForTab(tabId, tab.url);
  }
});

// Listen to active tab change
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  tryApplyForTab(activeInfo.tabId, tab.url);
});

// Listen to messages from popup (apply now, refresh settings)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'applySessionNow' && msg.domain) {
    // apply for specific domain now
    storageGet('sessions').then(async (sessions) => {
      const entry = (sessions || {})[msg.domain];
      if (!entry) return;
      const res = await setCookiesForDomain(msg.domain, entry.session || '');
      console.debug('Manual apply result', msg.domain, res);
    });
  } else if (msg && msg.type === 'refreshSettings') {
    // no-op here; settings are read on demand
  }
});
