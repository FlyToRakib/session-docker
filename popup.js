// popup.js - Session Docker v3.2 (Truncate domains + tooltip + card scroll fix)

// Elements
const searchBox = document.getElementById('searchBox');
const globalAutoToggle = document.getElementById('globalAutoToggle');
const addDomain = document.getElementById('addDomain');
const addBtn = document.getElementById('addBtn');
const excludeDomainInput = document.getElementById('excludeDomain');
const addExcludeBtn = document.getElementById('addExcludeBtn');
const listViewBtn = document.getElementById('listViewBtn');
const cardViewBtn = document.getElementById('cardViewBtn');
const listView = document.getElementById('listView');
const cardView = document.getElementById('cardView');
const websiteList = document.getElementById('websiteList');
const excludeList = document.getElementById('excludeList');
const cardContainer = document.getElementById('cardContainer');

let sessions = {}; // { domain: { cookies: [...], autoApply, updatedAt } }
let excludes = []; // [domain strings]

// --- Google protected domains (always excluded) ---
const GOOGLE_DOMAINS = [
  "google.com","www.google.com","accounts.google.com","mail.google.com",
  "drive.google.com","youtube.com","maps.google.com","apis.google.com"
];

function isGoogleDomain(domain){
  if(!domain) return false;
  return GOOGLE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

// Storage helpers
function storageGet(key){ return new Promise(r=>chrome.storage.local.get(key,res=>r(res[key]))); }
function storageSet(obj){ return new Promise(r=>chrome.storage.local.set(obj,()=>r())); }

// Normalize domain helper
function normalizeDomain(d){
  if(!d) return '';
  return d.trim().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\/.*$/,'').toLowerCase();
}

// --- Truncate domain helper with tooltip ---
function truncateDomain(domain, maxLen=26){
  if(!domain) return '';
  if(domain.length <= maxLen) return domain;
  const parts = domain.split('.');
  const ext = parts.pop();
  let main = parts.join('.');
  if(main.length > maxLen - 5) main = main.slice(0, maxLen - 5) + '...';
  return main + '.' + ext;
}

// --- fetch all cookies and populate sessions, excluding Google & user excludes ---
async function fetchAllCookies(){
  const allCookies = await chrome.cookies.getAll({});
  const temp = {};
  allCookies.forEach(c => {
    const dom = (c.domain || '').replace(/^\./,'');
    if(!dom) return;
    if(isGoogleDomain(dom)) return; // skip google
    if(excludes.some(e => dom === e || dom.endsWith('.' + e))) return; // skip user excludes
    if(!temp[dom]) temp[dom] = { cookies: [], autoApply: true, updatedAt: Date.now() };
    if(!temp[dom].cookies.find(x => x.name === c.name && x.path === c.path)){
      temp[dom].cookies.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate
      });
    }
  });
  const existing = await storageGet('sessions') || {};
  sessions = { ...temp, ...existing };
  await storageSet({ sessions });
}

// Initialize popup
async function init(){
  sessions = await storageGet('sessions') || {};
  excludes = await storageGet('excludes') || [];
  globalAutoToggle.checked = !!(await storageGet('globalAutoApply'));
  await fetchAllCookies();
  renderAll();
}

// UI toggles
function toggleView(view){
  if(view === 'list'){
    listView.classList.remove('hidden'); cardView.classList.add('hidden');
    listViewBtn.classList.add('active'); cardViewBtn.classList.remove('active');
  } else {
    listView.classList.add('hidden'); cardView.classList.remove('hidden');
    listViewBtn.classList.remove('active'); cardViewBtn.classList.add('active');
  }
}
listViewBtn.addEventListener('click', () => toggleView('list'));
cardViewBtn.addEventListener('click', () => toggleView('card'));

// Search filter
searchBox.addEventListener('input', () => renderAll());

// Add domain manually
addBtn.addEventListener('click', async () => {
  const domain = normalizeDomain(addDomain.value);
  if(!domain) return alert('Enter a domain to add.');
  if(isGoogleDomain(domain) || excludes.includes(domain)) {
    return alert('This domain is protected/ excluded and cannot be added.');
  }
  if(!sessions[domain]) sessions[domain] = { cookies: [], autoApply: true, updatedAt: Date.now() };
  await storageSet({ sessions });
  addDomain.value = '';
  renderAll();
});

// Add exclude domain
addExcludeBtn.addEventListener('click', async () => {
  const domain = normalizeDomain(excludeDomainInput.value);
  if(!domain) return alert('Enter a domain to exclude.');
  if(isGoogleDomain(domain)) {
    alert('Google domains are already protected and excluded automatically.');
    excludeDomainInput.value = '';
    return;
  }
  if(!excludes.includes(domain)){
    excludes.push(domain);
    await storageSet({ excludes });
    if(sessions[domain]) { delete sessions[domain]; await storageSet({ sessions }); }
    renderAll();
  }
  excludeDomainInput.value = '';
});

// Render both list and card + exclude list
function renderAll(){
  renderListView();
  renderCardView();
  renderExcludeList();
}

// --- List view ---
function renderListView(){
  websiteList.innerHTML = '';
  const q = (searchBox.value || '').toLowerCase();
  Object.keys(sessions).sort().forEach(domain => {
    if(q && !domain.toLowerCase().includes(q)) return;
    if(isGoogleDomain(domain) || excludes.includes(domain)) return;
    const item = document.createElement('div'); item.className = 'website-item';
    const span = document.createElement('span');
    span.textContent = truncateDomain(domain,26);
    span.title = domain;
    item.appendChild(span);

    const actions = document.createElement('div'); actions.className = 'flat-actions';
    const makeBtn = (text, handler) => {
      const b = document.createElement('button');
      b.className = 'flat-action'; b.textContent = text;
      b.addEventListener('click', handler); return b;
    };
    actions.appendChild(makeBtn('Apply', () => sendApply(domain)));
    actions.appendChild(makeBtn('Export', () => exportCookies(domain)));
    actions.appendChild(makeBtn('Import', () => importCookies(domain)));
    actions.appendChild(makeBtn('Delete', async () => {
      if(!confirm(`Delete saved session for ${domain}?`)) return;
      delete sessions[domain]; await storageSet({ sessions }); renderAll();
    }));
    item.appendChild(actions);
    websiteList.appendChild(item);
  });

  if(websiteList.children.length === 0){
    websiteList.innerHTML = '<p style="color:#666;margin:8px 0;">No saved sessions visible. Try disabling filters or add domains.</p>';
  }
}

// --- Exclude list ---
function renderExcludeList(){
  excludeList.innerHTML = '<h4 style="margin:6px 0 8px 0;color:#444">Excluded domains</h4>';
  if(!excludes.length){ excludeList.innerHTML += '<p style="color:#888;font-size:13px">No excluded domains added yet!</p>'; return; }
  excludes.sort().forEach(domain => {
    const d = document.createElement('div'); d.className = 'exclude-item';
    const left = document.createElement('div'); left.textContent = domain;
    const right = document.createElement('div');
    const note = document.createElement('span'); note.className = 'exclude-note'; note.textContent = 'Excluded domain';
    const del = document.createElement('button'); del.className = 'flat-action'; del.textContent = 'Remove';
    del.addEventListener('click', async () => {
      if(!confirm(`Remove ${domain} from exclude list?`)) return;
      excludes = excludes.filter(e => e !== domain);
      await storageSet({ excludes });
      renderAll();
    });
    right.appendChild(note); right.appendChild(del);
    d.appendChild(left); d.appendChild(right);
    excludeList.appendChild(d);
  });
}

// --- Card view ---
function renderCardView(){
  cardContainer.innerHTML = '';
  const q = (searchBox.value || '').toLowerCase();
  Object.keys(sessions).sort().forEach(domain => {
    if(q && !domain.toLowerCase().includes(q)) return;
    if(isGoogleDomain(domain) || excludes.includes(domain)) return;
    const entry = sessions[domain];
    const card = document.createElement('div'); card.className = 'card';

    // Top-right buttons shifted left 15px
    const topRight = document.createElement('div'); topRight.className = 'top-right';
    const exportBtnTR = document.createElement('button'); exportBtnTR.className='btn'; exportBtnTR.textContent='Export';
    const importBtnTR = document.createElement('button'); importBtnTR.className='btn'; importBtnTR.textContent='Import';
    exportBtnTR.addEventListener('click', ()=>exportCookies(domain));
    importBtnTR.addEventListener('click', ()=>importCookies(domain));
    topRight.appendChild(exportBtnTR); topRight.appendChild(importBtnTR);
    card.appendChild(topRight);

    const h3 = document.createElement('h3'); h3.textContent = truncateDomain(domain,26); h3.title = domain;
    card.appendChild(h3);

    const ta = document.createElement('textarea'); ta.value=JSON.stringify(entry.cookies||[],null,2);
    card.appendChild(ta);

    const smallNote = document.createElement('div'); smallNote.className='small-note';
    smallNote.textContent=`Auto-apply: ${entry.autoApply?'On':'Off'} • Updated: ${entry.updatedAt?new Date(entry.updatedAt).toLocaleString():'N/A'}`;
    card.appendChild(smallNote);

    const btnGroup = document.createElement('div'); btnGroup.className='button-group';
    const copyBtn = document.createElement('button'); copyBtn.className='btn'; copyBtn.textContent='Copy';
    copyBtn.addEventListener('click',()=>{ta.select(); document.execCommand('copy'); alert('Copied JSON');});
    const saveBtn = document.createElement('button'); saveBtn.className='btn'; saveBtn.textContent='Save';
    saveBtn.addEventListener('click', async()=>{try{entry.cookies=JSON.parse(ta.value); entry.updatedAt=Date.now(); await storageSet({sessions}); alert('Saved cookies JSON');}catch(e){alert('Invalid JSON format');}});
    const applyBtn = document.createElement('button'); applyBtn.className='btn'; applyBtn.textContent='Apply Now';
    applyBtn.addEventListener('click',()=>sendApply(domain));
    const syncBtn = document.createElement('button'); syncBtn.className='btn'; syncBtn.textContent='Sync';
    syncBtn.addEventListener('click', async()=>{
      if(isGoogleDomain(domain) || excludes.includes(domain)){ alert('Domain is excluded / protected.'); return; }
      chrome.cookies.getAll({domain}, async(cookies)=>{
        if(!cookies||cookies.length===0){alert('No cookies found for domain'); return;}
        entry.cookies = cookies.map(c=>({name:c.name,value:c.value,domain:c.domain,path:c.path,secure:!!c.secure,httpOnly:!!c.httpOnly,sameSite:c.sameSite,expirationDate:c.expirationDate}));
        entry.updatedAt = Date.now(); await storageSet({sessions});
        ta.value = JSON.stringify(entry.cookies,null,2); alert('Synced cookies for '+domain);
      });
    });

    const delBtn = document.createElement('button'); delBtn.className='btn warn'; delBtn.textContent='Delete';
    delBtn.addEventListener('click',async()=>{if(!confirm(`Delete saved session for ${domain}?`)) return; delete sessions[domain]; await storageSet({sessions}); renderAll();});

    const autoLabel=document.createElement('label'); autoLabel.style.marginLeft='8px';
    const autoInput=document.createElement('input'); autoInput.type='checkbox'; autoInput.checked=!!entry.autoApply;
    autoInput.addEventListener('change',async()=>{entry.autoApply=autoInput.checked; await storageSet({sessions});});
    autoLabel.appendChild(autoInput); autoLabel.appendChild(document.createTextNode(' Auto'));

    btnGroup.appendChild(copyBtn); btnGroup.appendChild(saveBtn); btnGroup.appendChild(applyBtn);
    btnGroup.appendChild(syncBtn); btnGroup.appendChild(delBtn); btnGroup.appendChild(autoLabel);

    card.appendChild(btnGroup);
    cardContainer.appendChild(card);
  });

  if(cardContainer.children.length===0){cardContainer.innerHTML='<p style="color:#666;">No saved sessions to display in card view.</p>';}
}

// --- Export cookies ---
function exportCookies(domain){
  if(isGoogleDomain(domain)||excludes.includes(domain)){ alert('Domain is excluded / protected.'); return; }
  const obj = sessions[domain]; if(!obj||!obj.cookies){alert('No data to export'); return;}
  const blob = new Blob([JSON.stringify(obj.cookies,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=domain+'_cookies.json'; a.click(); URL.revokeObjectURL(url);
}

// --- Import cookies ---
function importCookies(domain){
  if(isGoogleDomain(domain)||excludes.includes(domain)){ alert('Domain is excluded / protected.'); return; }
  const input=document.createElement('input'); input.type='file'; input.accept='.json';
  input.addEventListener('change',async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const text = await file.text();
    try{
      const cookies = JSON.parse(text);
      sessions[domain]={cookies, autoApply:true, updatedAt:Date.now()};
      await storageSet({sessions}); renderAll(); sendApply(domain);
      alert('Imported and applied cookies for '+domain);
    }catch(err){alert('Invalid JSON file');}
  });
  input.click();
}

// --- Apply cookies ---
function sendApply(domain){
  if(isGoogleDomain(domain)||excludes.includes(domain)){alert('Domain is excluded / protected.'); return;}
  chrome.runtime.sendMessage({type:'applySessionNow', domain});
  alert('Apply requested for '+domain+'. Open or refresh the site to verify.');
}

// --- Initial load & events ---
document.addEventListener('DOMContentLoaded', init);
globalAutoToggle.addEventListener('change', async()=>{ await storageSet({globalAutoApply:globalAutoToggle.checked}); chrome.runtime.sendMessage({type:'refreshSettings'}); });
