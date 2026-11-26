'use strict';
// Loaded instead of mobile.js by the pinned mobile preparation step. Session
// cookies remain HttpOnly; this object is presentation state, never authority.
(() => {
  const nativeFetch=window.fetch.bind(window);
  const encode=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const prefix='fellestall-customer-v1:';
  const params=new URLSearchParams(location.search);
  const resetToken=params.get('token');
  if(resetToken) history.replaceState(null,'',location.pathname+location.hash);
  const registered=new Set();
  let expiring=false;
  const api=window.FellestallCustomer={user:null,account:{plan:'free'},storageKey:prefix+'guest',assetDatabase:prefix+'guest',resetToken};
  function clearLocal() {
    if(api.user) {
      try{localStorage.removeItem(api.storageKey)}catch{}
      try{if(typeof svenAssetStore!=='undefined'&&svenAssetStore)svenAssetStore.then(db=>db.close()).catch(()=>{})}catch{}
      indexedDB.deleteDatabase(api.assetDatabase);
    }
  }
  function expired() {
    if(expiring||!api.user)return;
    expiring=true;clearLocal();history.replaceState(null,'',location.pathname+'#konto');location.reload();
  }
  api.fetch=async(...args)=>{
    const response=await nativeFetch(...args);
    if(response.status===401)expired();
    return response;
  };
  async function json(path,body,{auth=false}={}) {
    const response=await (auth?nativeFetch:api.fetch)(path,{method:body?'POST':'GET',credentials:'same-origin',
      headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const value=await response.json().catch(()=>({}));
    if(!response.ok) {
      const messages={INVALID_EMAIL_OR_PASSWORD:'E-postadressen eller passordet er feil.',EMAIL_NOT_VERIFIED:'Bekreft e-postadressen før du logger inn.',
        INVALID_TOKEN:'Lenken er ugyldig eller utløpt. Be om en ny lenke.',PASSWORD_TOO_SHORT:'Passordet må ha minst 12 tegn.'};
      throw Error(messages[value.code]||value.error||(response.status===429?'Vent litt før du prøver igjen.':'Kunne ikke fullføre. Kontroller opplysningene og prøv igjen.'));
    }
    return value;
  }
  function status(message,error=false) {
    const target=document.getElementById('customer-auth-status');
    if(target){target.textContent=message;target.setAttribute('role',error?'alert':'status')}
  }
  api.accountView=detail=>{
    const reset=detail==='nytt-passord',forgot=detail==='glemt-passord',register=detail==='registrer',verify=detail==='bekreft';
    const title=reset?'Velg nytt passord':forgot?'Glemt passord':register?'Registrer deg':verify?'Bekreft e-postadressen':'Logg inn';
    const mode=reset?'reset':forgot?'forgot':register?'register':verify?'verify':'login';
    const form=reset?'customer-reset-form':forgot?'customer-forgot-form':verify?'customer-verify-form':'login-form';
    return `<h1>${title}</h1><p class="lede">${register?'Opprett en konto for å bruke Sven og ta vare på arbeidet ditt.':forgot?'Vi sender deg en lenke for å velge nytt passord.':verify?'Åpne lenken i e-posten før du logger inn.':'Bruk Fellestall-kontoen din.'}</p>
      <form id="${form}" class="fields" data-customer-mode="${mode}">
      ${register?'<label class="field">Navn<input name="name" autocomplete="name" maxlength="100" required></label>':''}
      ${reset?'':`<label class="field">E-post<input name="email" type="email" autocomplete="email" maxlength="254" value="${encode(api.pendingEmail||'')}" required></label>`}
      ${forgot||verify?'':`<label class="field">${reset?'Nytt passord':'Passord'}<input name="password" type="password" autocomplete="${register||reset?'new-password':'current-password'}" minlength="12" maxlength="128" required></label>${register||reset?'<p class="note">Bruk minst 12 tegn.</p>':''}`}
      <p id="customer-auth-status" role="status"></p>
      <button class="btn primary" type="submit">${reset?'Lagre nytt passord':forgot?'Send lenke':register?'Opprett konto':verify?'Send bekreftelsen på nytt':'Logg inn'}</button></form>
      <div class="actions">${register||forgot||verify||reset?'<a class="textlink" href="#konto">Til innlogging</a>':'<a class="textlink" href="#konto/glemt-passord">Glemt passord?</a><a class="textlink" href="#konto/registrer">Opprett konto</a>'}</div>`;
  };
  api.handlesForm=id=>['login-form','customer-reset-form','customer-forgot-form','customer-verify-form'].includes(id);
  api.submitForm=async form=>{
    const fields=new FormData(form),mode=form.dataset.customerMode;
    const button=form.querySelector('[type=submit]');button.disabled=true;status('Arbeider …');
    try {
      const email=String(fields.get('email')||'').trim(),password=String(fields.get('password')||'');
      if(mode==='register') {
        await json('/api/customer/auth/sign-up/email',{name:String(fields.get('name')||'').trim(),email,password,callbackURL:location.origin+'/#konto'},{auth:true});
        api.pendingEmail=email;form.reset();location.hash='#konto/bekreft';
      } else if(mode==='login') {
        await json('/api/customer/auth/sign-in/email',{email,password},{auth:true});
        form.reset();history.replaceState(null,'',location.pathname+'#sven');location.reload();
      } else if(mode==='forgot') {
        await json('/api/customer/auth/request-password-reset',{email,redirectTo:location.origin+'/#konto/nytt-passord'},{auth:true});
        status('Hvis adressen finnes hos oss, får du en e-post med en lenke.');
      } else if(mode==='verify') {
        await json('/api/customer/auth/send-verification-email',{email,callbackURL:location.origin+'/#konto'},{auth:true});
        status('Hvis adressen kan bekreftes, får du en e-post med en lenke.');
      } else if(mode==='reset') {
        if(!api.resetToken)throw Error('Lenken er ugyldig eller utløpt. Be om en ny lenke.');
        await json('/api/customer/auth/reset-password',{token:api.resetToken,newPassword:password},{auth:true});
        api.resetToken=null;form.reset();location.hash='#konto';
      }
    } catch(error){status(error.message,true)}
    finally{button.disabled=false}
  };
  api.logout=async()=>{
    try {
      await json('/api/customer/auth/sign-out',{}, {auth:true});
      clearLocal();history.replaceState(null,'',location.pathname+'#hjem');location.reload();
    } catch(error){if(typeof notify==='function')notify('Kunne ikke logge ut. Prøv igjen.')}
  };
  api.createProject=async project=>{
    const result=await json('/api/customer/resources/projects',{id:project.id,title:project.name});
    registered.add('projects:'+project.id);return result;
  };
  api.prepareTalk=async talk=>{
    if(!talk)throw Error('Samtalen mangler. Åpne en ny samtale.');
    if(talk.projectId&&!registered.has('projects:'+talk.projectId)) {
      const project=saved.svenProjects?.find(project=>project.id===talk.projectId);
      if(!project)throw Error('Prosjektet mangler. Åpne en ny samtale.');
      await api.createProject(project);
    }
    if(!registered.has('conversations:'+talk.id)) {
      await json('/api/customer/resources/conversations',{id:talk.id,title:talk.title||'Samtale med Sven',...(talk.projectId?{projectId:talk.projectId}:{})});
      registered.add('conversations:'+talk.id);
    }
  };
  async function checkSession() {
    if(!api.user||document.hidden)return;
    try {
      const response=await nativeFetch('/api/customer/session',{credentials:'same-origin',cache:'no-store'});
      if(response.status===401)return expired();
      if(response.ok) {
        const value=await response.json();
        if(value.user.id!==api.user.id)return expired();
      }
    } catch{}
  }
  (async()=>{
    try {
      const response=await nativeFetch('/api/customer/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(response.ok) {
        const value=await response.json();api.user=value.user;api.account=value.account;
        api.storageKey=prefix+api.user.id;api.assetDatabase=prefix+'assets:'+api.user.id;
      }
    } catch{}
    // Load the existing mobile client only after choosing the authenticated
    // user's cache namespace. Never import the old preview/test-account cache.
    const script=document.createElement('script');script.src='./mobile.js';
    script.onerror=()=>{document.getElementById('main').textContent='Siden kunne ikke lastes. Prøv å laste den på nytt.'};
    document.head.append(script);
    window.addEventListener('focus',checkSession);document.addEventListener('visibilitychange',checkSession);
    setInterval(checkSession,60000);
  })();
})();
