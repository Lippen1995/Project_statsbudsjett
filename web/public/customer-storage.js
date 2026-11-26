'use strict';
// The browser cache is an outbox. PostgreSQL versions decide which writes win.
window.FellestallStorage=(api,{request})=>{
  const lists={projects:'svenProjects',conversations:'talks',analyses:'svenAnalyses',watches:'svenWatches',watchEvents:'svenWatchEvents'};
  const preferences=['name','email','municipality','followMunicipality','useFollowAsDefault','phone','job','organization','offices','affiliation','research','interestTopics','theme','units','bookmarks','shortcuts','svenModel','svenEffort'];
  const key=item=>item.kind+':'+item.id;
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const clone=value=>JSON.parse(JSON.stringify(value));
  let server=new Map(),seen=new Map(),pending=new Map(),running,stopped=false,conflict=false,timer;
  const outbox=()=>api.storageKey+':outbox';
  async function readAll() {
    const items=[];let cursor='';
    do {const result=await request('/api/customer/content'+(cursor?'?cursor='+encodeURIComponent(cursor):''));items.push(...result.items);cursor=result.nextCursor}while(cursor);
    return {items};
  }
  function banner(message,error=false) {
    let node=document.getElementById('customer-storage-status');
    if(!node) {
      node=document.createElement('aside');node.id='customer-storage-status';
      node.style.cssText='position:fixed;inset:auto 12px 88px;z-index:1000;padding:12px;background:var(--surface,#fff);color:var(--ink,#172e24);border:1px solid currentColor;border-radius:12px;max-width:38rem;margin-inline:auto;max-height:calc(100dvh - 120px);overflow:auto;box-shadow:0 3px 12px #0002';
      document.body.append(node);
    }
    node.replaceChildren();node.setAttribute('role',error?'alert':'status');node.hidden=!message;
    if(!message)return;
    const text=document.createElement('p');text.textContent=message;node.append(text);
    if(error) {
      const download=document.createElement('button');download.type='button';download.className='btn';download.textContent='Last ned lokale endringer';download.onclick=()=>api.exportLocal();node.append(download);
      const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent=conflict?'Hent lagret versjon':'Prøv lagring igjen';
      retry.onclick=async()=>{
        if(conflict) {
          if(!confirm('Lokale endringer erstattes med det som er lagret på kontoen. Last ned endringene først hvis du vil beholde dem.'))return;
          localStorage.removeItem(outbox());location.reload();
        } else {await api.flush().catch(()=>{})}
      };node.append(retry);
    }
  }
  function keep() {
    localStorage.setItem(outbox(),JSON.stringify([...pending.values()]));
  }
  function collect(value) {
    const result=new Map();
    for(const [kind,field] of Object.entries(lists)) for(const item of value[field]||[]) {
      if(kind==='watches'&&!item.id)item.id=crypto.randomUUID();
      const row={kind,id:item.id,value:clone(item)};result.set(key(row),row);
    }
    for(const id of preferences) if(value[id]!==undefined) {const row={kind:'preferences',id,value:clone(value[id])};result.set(key(row),row)}
    return result;
  }
  function apply(value,items,dirty=new Set()) {
    for(const item of items) {
      if(dirty.has(key(item)))continue;
      if(item.kind==='preferences') {if(item.value!==null)value[item.id]=clone(item.value);continue}
      const field=lists[item.kind];if(!field)continue;
      value[field]??=[];
      const index=value[field].findIndex(row=>row.id===item.id);
      if(item.value===null) {if(index>=0)value[field].splice(index,1)}
      else if(index<0)value[field].unshift(clone(item.value));
      else if(!equal(value[field][index],item.value)) value[field][index]=clone(item.value);
    }
    if(value.activeProject&&!value.svenProjects?.some(project=>project.id===value.activeProject))value.activeProject='';
    if(value.activeTalk&&!value.talks?.some(talk=>talk.id===value.activeTalk))value.activeTalk='';
  }
  api.loadContent=async()=>{
    const result=await readAll();server=new Map(result.items.map(item=>[key(item),item]));
    let local;
    try {local=JSON.parse(localStorage.getItem(api.storageKey)||'{}');pending=new Map(JSON.parse(localStorage.getItem(outbox())||'[]').map(item=>[key(item),item]))}
    catch {throw Error('Lokale endringer kunne ikke leses. Last ned en kopi av nettleserdataene før du tømmer dem.')}
    const value={activeTalk:local.activeTalk||'',activeProject:local.activeProject||''};
    apply(value,result.items);
    for(const item of [...pending.values()]) {
      const current=server.get(key(item));
      if(equal(current?.value,item.value))pending.delete(key(item));
      else if((current?.version??0)!==item.version)conflict=true;
    }
    // Preserve unacknowledged edits, including conflicts, until the user exports
    // them or explicitly chooses the saved copy. Never silently overwrite them.
    apply(value,[...pending.values()]);seen=collect(value);api.initialContent=value;
    keep();
    if(conflict)banner('Det finnes ulike endringer på to enheter. Lokale endringer er bevart, men kan ikke lagres før du henter lagret versjon.',true);
    else if(pending.size)banner('Lokale endringer fra forrige besøk venter på lagring …');
  };
  api.readSaved=()=>api.initialContent||{};
  api.sync=value=>{
    if(!api.user||stopped)return;
    try {
      const current=collect(value);
      for(const [id,item] of current) if(!equal(seen.get(id)?.value,item.value)) pending.set(id,{...item,version:pending.get(id)?.version??server.get(id)?.version??0});
      for(const [id,item] of seen) if(!current.has(id))pending.set(id,{kind:item.kind,id:item.id,value:null,version:pending.get(id)?.version??server.get(id)?.version??0});
      seen=current;keep();clearTimeout(timer);
      if(pending.size&&!conflict)timer=setTimeout(()=>api.flush().catch(()=>{}),300);
    } catch {banner('Det er ikke plass til flere lokale endringer. Behold siden åpen og last ned arbeidet ditt.',true)}
  };
  api.flush=async()=>{
    clearTimeout(timer);
    if(running){await running;if(pending.size)return api.flush();return}
    if(conflict)throw Error('Hent lagret versjon før du fortsetter.');
    if(stopped)throw Error('Lagringen er satt på pause.');
    running=(async()=>{
      while(pending.size) {
        const batch=[];let bytes=0;
        for(const item of pending.values()) {const size=JSON.stringify(item).length*2;if(batch.length&&(batch.length>=100||bytes+size>2_800_000))break;batch.push(clone(item));bytes+=size}
        banner('Lagrer endringer …');
        try {
          const result=await request('/api/customer/content',{changes:batch},{method:'PUT'});
          // A model response may have arrived while the request was in flight.
          if(typeof saved!=='undefined')api.sync(saved);
          for(const item of batch) {
            const id=key(item),next=result.items.find(row=>key(row)===id);
            if(equal(pending.get(id),item))pending.delete(id);
            else if(pending.has(id)&&next)pending.get(id).version=next.version;
          }
          for(const item of result.items)server.set(key(item),item);keep();
          if(typeof saved!=='undefined') {
            apply(saved,result.items,new Set(pending.keys()));seen=collect(saved);
            localStorage.setItem(api.storageKey,JSON.stringify(saved));
          }
        } catch(error) {
          conflict=error.status===409;
          banner(conflict?'Innholdet er endret på en annen enhet. Lokale endringer er bevart. Last ned en kopi før du henter lagret versjon.':'Endringene er bare lagret på denne enheten. '+error.message,true);
          throw error;
        }
      }
      banner('');
    })();
    try {await running}finally{running=null}
  };
  api.refresh=async()=>{
    if(!api.user||stopped||running||conflict||document.hidden)return;
    try {
      if(typeof saved!=='undefined')api.sync(saved);
      if(pending.size){await api.flush();return}
      const result=await readAll();
      if(typeof saved==='undefined'||pending.size||running)return;
      const changed=result.items.some(item=>server.get(key(item))?.version!==item.version);
      if(changed) {
        apply(saved,result.items);server=new Map(result.items.map(item=>[key(item),item]));seen=collect(saved);
        localStorage.setItem(api.storageKey,JSON.stringify(saved));
        if(typeof rerenderMain==='function')rerenderMain();
      }
    } catch{}
  };
  api.pauseSync=()=>{stopped=true;clearTimeout(timer)};
  api.resumeSync=()=>{stopped=false;if(typeof saved!=='undefined')api.sync(saved)};
  api.asset=async id=>{
    const file=await request('/api/customer/files/'+encodeURIComponent(id));
    const bytes=Uint8Array.from(atob(file.data),char=>char.charCodeAt(0));
    return {id,blob:new File([bytes],file.name,{type:'application/octet-stream'}),meta:file.meta};
  };
  api.exportLocal=()=>{
    const value={exportedAt:new Date().toISOString(),content:typeof saved!=='undefined'?saved:api.initialContent,pending:[...pending.values()],note:'Originalfiler lastes ned separat fra Filer på kontoen. Eksporten inneholder ikke innloggingsinformasjon.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='fellestall-innhold.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  api.removeContent=async(kind,id)=>{
    if(!confirm('Slett '+(kind==='projects'?'prosjektet med samtaler og tilknyttede originalfiler':kind==='conversations'?'samtalen med analyser og tilknyttede originalfiler':'originalfilen')+' fra kontoen? Kopier du allerede har delt eller lastet ned slettes ikke.'))return;
    try {
      await api.flush();await request('/api/customer/resources/'+kind+'/'+id,undefined,{method:'DELETE'});
      await api.refresh();if(typeof sheet!=='undefined'&&sheet.open)sheet.close();if(typeof rerenderMain==='function')rerenderMain();
    } catch(error){banner(error.message,true)}
  };
  api.filesView=async()=>{
    try {
      const result=await request('/api/customer/resources/files');
      const container=document.getElementById('customer-file-list');if(!container)return;
      container.replaceChildren();
      for(const file of result.items) {
        const row=document.createElement('p'),name=document.createElement('span');name.textContent=file.title+' ';row.append(name);
        const download=document.createElement('button');download.type='button';download.className='btn';download.textContent='Last ned original';download.onclick=async()=>{
          try {const data=await api.asset(file.id),url=URL.createObjectURL(data.blob),link=document.createElement('a');link.href=url;link.download=data.blob.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(error){banner(error.message,true)}
        };row.append(download);
        const remove=document.createElement('button');remove.type='button';remove.className='btn';remove.textContent='Slett originalfil';remove.onclick=async()=>{await api.removeContent('files',file.id);await api.filesView()};row.append(remove);container.append(row);
      }
      if(!result.items.length)container.textContent='Du har ingen lagrede originalfiler.';
    }catch(error){banner(error.message,true)}
  };
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-customer-delete]');if(target)void api.removeContent(target.dataset.customerDelete,target.dataset.id);
  });
  window.addEventListener('online',()=>api.flush().catch(()=>{}));
  window.addEventListener('beforeunload',event=>{if(pending.size&&!stopped){event.preventDefault();event.returnValue=''}});
  window.addEventListener('focus',()=>api.refresh());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void api.refresh()});
  setInterval(()=>api.refresh(),15000);
};
