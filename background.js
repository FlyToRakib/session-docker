// background.js - Session Docker v3.1 (respects excludes & google protection)

function storageGet(key){ return new Promise(r => chrome.storage.local.get(key, res => r(res[key]))); }
function storageSet(obj){ return new Promise(r => chrome.storage.local.set(obj, () => r())); }

const GOOGLE_DOMAINS = [
  "google.com","www.google.com","accounts.google.com","mail.google.com",
  "drive.google.com","youtube.com","maps.google.com","apis.google.com"
];

function isGoogleDomain(domain){
  if(!domain) return false;
  return GOOGLE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

async function isExcludedDomain(domain){
  const excludes = (await storageGet('excludes')) || [];
  if(!domain) return false;
  return excludes.some(e => domain === e || domain.endsWith('.' + e));
}

// Parse cookie objects and attempt to set cookies for a domain
async function setCookiesForDomain(domain, cookieObjects){
  if(!cookieObjects || !cookieObjects.length) return { success: false, reason: 'no cookies' };
  const urls = [`https://${domain}/`,`http://${domain}/`];
  const results = [];
  for(const c of cookieObjects){
    // build details; ensure url exists
    const details = {
      url: urls[0],
      name: c.name,
      value: c.value,
      domain: c.domain || domain,
      path: c.path || '/',
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: c.sameSite || 'Lax',
      expirationDate: c.expirationDate
    };
    // try https first then http
    try {
      await new Promise((res, rej) => chrome.cookies.set(details, cookie => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(cookie)));
      results.push({ name: c.name, ok: true, used: 'https' });
      continue;
    } catch (e) {
      // try http fallback
    }
    try {
      details.url = urls[1]; details.secure = false;
      await new Promise((res, rej) => chrome.cookies.set(details, cookie => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(cookie)));
      results.push({ name: c.name, ok: true, used: 'http' });
    } catch (e2) {
      results.push({ name: c.name, ok: false, error: e2 && e2.message });
    }
  }
  return { success: results.every(r => r.ok), details: results };
}

async function tryApplyForTab(tabId, url){
  if(!url || !url.startsWith('http')) return;
  let hostname;
  try { hostname = new URL(url).hostname.replace(/^\./,''); } catch(e){ return; }
  if(isGoogleDomain(hostname)) return;
  if(await isExcludedDomain(hostname)) return;
  const sessions = await storageGet('sessions') || {};
  const globalAuto = await storageGet('globalAutoApply');
  const entry = sessions[hostname];
  if(!entry) return;
  // check auto toggles
  if(globalAuto === false && entry.autoApply === false) return;
  // apply cookies
  const res = await setCookiesForDomain(hostname, entry.cookies);
  console.debug('Session Docker apply', hostname, res);
}

// Tab listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if(changeInfo.status === 'complete') tryApplyForTab(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(async activeInfo => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    tryApplyForTab(activeInfo.tabId, tab.url);
  } catch(e){}
});

// Messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if(msg && msg.type === 'applySessionNow' && msg.domain){
    (async () => {
      const domain = msg.domain;
      if(isGoogleDomain(domain) || await isExcludedDomain(domain)) return;
      const sessions = await storageGet('sessions') || {};
      const entry = sessions[domain];
      if(!entry) return;
      await setCookiesForDomain(domain, entry.cookies);
    })();
  } else if(msg && msg.type === 'refreshSettings'){
    // noop; settings are read on demand
  }
});
