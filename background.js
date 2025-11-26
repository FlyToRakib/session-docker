async function storageGet(key){return new Promise(r=>chrome.storage.local.get(key,res=>r(res[key])));}
async function storageSet(obj){return new Promise(r=>chrome.storage.local.set(obj,()=>r()));}

async function setCookies(domain,cookies){
  if(!cookies||!cookies.length) return;
  const urls=[`https://${domain}/`,`http://${domain}/`];
  for(const c of cookies){
    for(const url of urls){
      try{await new Promise((res,rej)=>chrome.cookies.set({...c,url},cookie=>chrome.runtime.lastError?rej(chrome.runtime.lastError):res(cookie)));break;}catch(e){}
    }
  }
}

// Apply cookies to tab
async function tryApply(tabId,url){
  if(!url||!url.startsWith('http')) return;
  let domain; try{domain=new URL(url).hostname.replace(/^\./,'');}catch(e){return;}
  const sessions=await storageGet('sessions')||{};
  const globalAuto=await storageGet('globalAutoApply');
  const entry=sessions[domain]; if(!entry) return;
  if(!globalAuto && entry.autoApply===false) return;
  await setCookies(domain,entry.cookies);
}

// Tab update / activate
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab)=>{if(changeInfo.status==='complete') tryApply(tabId,tab.url);});
chrome.tabs.onActivated.addListener(async(activeInfo)=>{const tab=await chrome.tabs.get(activeInfo.tabId); tryApply(activeInfo.tabId,tab.url);});

// Messages from popup
chrome.runtime.onMessage.addListener((msg)=>{
  if(msg.type==='applySessionNow' && msg.domain){storageGet('sessions').then(async s=>{const entry=(s||{})[msg.domain]; if(entry) await setCookies(msg.domain,entry.cookies);});}
});
