// popup.js - Session Docker v3 fixed
const searchBox = document.getElementById('searchBox');
const addDomain = document.getElementById('addDomain');
const addBtn = document.getElementById('addBtn');
const listViewBtn = document.getElementById('listViewBtn');
const cardViewBtn = document.getElementById('cardViewBtn');
const listView = document.getElementById('listView');
const cardView = document.getElementById('cardView');
const websiteList = document.getElementById('websiteList');
const cardContainer = document.getElementById('cardContainer');

let sessions = {}; // { domain: { cookies: [...], autoApply: true, updatedAt } }

// Storage helpers
function storageGet(key){return new Promise(r=>chrome.storage.local.get(key,res=>r(res[key])));}
function storageSet(obj){return new Promise(r=>chrome.storage.local.set(obj,()=>r()));}

// Fetch all cookies from browser and populate sessions
async function fetchAllCookies(){
    const allCookies = await chrome.cookies.getAll({});
    const temp = {};
    allCookies.forEach(c=>{
        const domain = c.domain.replace(/^\./,''); // normalize domain
        if(!temp[domain]) temp[domain]={cookies:[],autoApply:true,updatedAt:Date.now()};
        // avoid duplicate cookies
        if(!temp[domain].cookies.find(x=>x.name===c.name && x.path===c.path))
            temp[domain].cookies.push({
                name:c.name,value:c.value,domain:c.domain,path:c.path,
                secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite,expirationDate:c.expirationDate
            });
    });
    sessions = temp;
    await storageSet({sessions});
}

// Initialize popup
async function init(){
    await fetchAllCookies();
    renderAll();
}

// View toggle
function toggleView(view){
    if(view==='list'){
        listView.classList.remove('hidden');
        cardView.classList.add('hidden');
        listViewBtn.classList.add('active');
        cardViewBtn.classList.remove('active');
    } else {
        listView.classList.add('hidden');
        cardView.classList.remove('hidden');
        listViewBtn.classList.remove('active');
        cardViewBtn.classList.add('active');
    }
}
listViewBtn.addEventListener('click',()=>toggleView('list'));
cardViewBtn.addEventListener('click',()=>toggleView('card'));

// Search filter
searchBox.addEventListener('input',()=>renderAll());

// Add domain manually
addBtn.addEventListener('click',async()=>{
    const domain=(addDomain.value||'').trim();
    if(!domain) return alert('Enter domain');
    if(!sessions[domain]) sessions[domain]={cookies:[],autoApply:true,updatedAt:Date.now()};
    await storageSet({sessions});
    addDomain.value='';
    renderAll();
});

// Render functions
function renderAll(){renderListView(); renderCardView();}

function renderListView(){
    websiteList.innerHTML='';
    const q = (searchBox.value||'').toLowerCase();
    Object.keys(sessions).sort().forEach(domain=>{
        if(q && !domain.toLowerCase().includes(q)) return;
        const div=document.createElement('div'); div.className='website-item';
        div.innerHTML=`<span>${domain}</span>`;
        const btnGroup=document.createElement('div');
        ['Apply','Export','Import','Delete'].forEach(action=>{
            const btn=document.createElement('button'); btn.textContent=action;
            btn.addEventListener('click',()=>handleListAction(action,domain));
            btnGroup.appendChild(btn);
        });
        div.appendChild(btnGroup);
        websiteList.appendChild(div);
    });
}

function renderCardView(){
    cardContainer.innerHTML='';
    const q=(searchBox.value||'').toLowerCase();
    Object.keys(sessions).sort().forEach(domain=>{
        if(q && !domain.toLowerCase().includes(q)) return;
        const obj=sessions[domain];
        const card=document.createElement('div'); card.className='card';
        const h3=document.createElement('h3'); h3.textContent=domain;
        const ta=document.createElement('textarea'); ta.value=JSON.stringify(obj.cookies||[],null,2);
        card.appendChild(h3); card.appendChild(ta);
        const btnGroup=document.createElement('div'); btnGroup.className='button-group';

        const copyBtn=document.createElement('button'); copyBtn.textContent='Copy';
        copyBtn.addEventListener('click',()=>{ta.select();document.execCommand('copy');alert('Copied JSON');});

        const saveBtn=document.createElement('button'); saveBtn.textContent='Save';
        saveBtn.addEventListener('click',async()=>{try{obj.cookies=JSON.parse(ta.value);obj.updatedAt=Date.now(); await storageSet({sessions});alert('Saved');}catch(e){alert('Invalid JSON');}});

        const applyBtn=document.createElement('button'); applyBtn.textContent='Apply Now';
        applyBtn.addEventListener('click',()=>chrome.runtime.sendMessage({type:'applySessionNow',domain}));

        const exportBtn=document.createElement('button'); exportBtn.textContent='Export';
        exportBtn.addEventListener('click',()=>exportCookies(domain));

        const importBtn=document.createElement('button'); importBtn.textContent='Import';
        importBtn.addEventListener('click',()=>importCookies(domain));

        const delBtn=document.createElement('button'); delBtn.textContent='Delete';
        delBtn.addEventListener('click',async()=>{if(confirm(`Delete ${domain}?`)){delete sessions[domain];await storageSet({sessions});renderAll();}});

        btnGroup.append(copyBtn,saveBtn,applyBtn,exportBtn,importBtn,delBtn);
        card.appendChild(btnGroup);
        cardContainer.appendChild(card);
    });
}

// Export cookies JSON
function exportCookies(domain){
    const obj=sessions[domain];
    if(!obj){alert('No data'); return;}
    const blob=new Blob([JSON.stringify(obj.cookies,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=domain+'_cookies.json'; a.click(); URL.revokeObjectURL(url);
}

// Import cookies JSON
function importCookies(domain){
    const input=document.createElement('input'); input.type='file'; input.accept='.json';
    input.addEventListener('change',async(e)=>{
        const file=e.target.files[0]; if(!file) return;
        const text=await file.text();
        try{
            const cookies=JSON.parse(text);
            sessions[domain]={cookies,autoApply:true,updatedAt:Date.now()};
            await storageSet({sessions});
            renderAll();
            chrome.runtime.sendMessage({type:'applySessionNow',domain});
            alert('Imported and applied cookies!');
        }catch(err){alert('Invalid JSON');}
    });
    input.click();
}

// List action handler
async function handleListAction(action,domain){
    if(action==='Apply'){chrome.runtime.sendMessage({type:'applySessionNow',domain});}
    else if(action==='Export'){exportCookies(domain);}
    else if(action==='Import'){importCookies(domain);}
    else if(action==='Delete'){if(confirm(`Delete ${domain}?`)){delete sessions[domain];await storageSet({sessions});renderAll();}}
}

// Initialize popup
document.addEventListener('DOMContentLoaded',init);
