'use strict';
window.FellestallCapacity=(api,{request})=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const percent=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:2});
  let checking,lastRead=0;
  const previousFetch=api.fetch;
  api.fetch=async(...args)=>{
    const response=await previousFetch(...args);
    if(api.user&&/^\/api\/sven\/(chat|file)/.test(String(args[0])))void api.refreshUsage({force:response.status!==202});
    return response;
  };
  api.refreshUsage=async({force=false}={})=>{
    if(!api.user||checking||!force&&Date.now()-lastRead<3000)return checking;
    lastRead=Date.now();
    checking=(async()=>{
      try {
        const usage=await request('/api/customer/usage');api.usage=usage;api.usageUnavailable=false;api.account.plan=usage.plan;
        if(typeof saved!=='undefined'&&usage.ready&&usage.models.length&&!usage.models.includes(saved.svenModel)) {
          saved.svenModel=usage.models[0];persist();
        }
        if(typeof updateQuotaMeter==='function')updateQuotaMeter();
        const details=document.getElementById('customer-capacity-details');
        if(details) {
          details.innerHTML=capacityDetails();
          const select=document.getElementById('sven-model');
          if(select)for(const option of select.options) {
            option.disabled=!usage.models.includes(option.value);
            const label=models.find(model=>model.id===option.value)?.label||option.value;
            option.textContent=label+(option.disabled?(usage.ready?' · krever betalt tilgang':' · ikke konfigurert'):'');
          }
        }
      }catch {api.usageUnavailable=true}
    })();
    try{await checking}finally{checking=null}
  };
  api.monthlyQuota=()=>{
    const usage=api.usage||{};
    const reset=usage.period?new Date(usage.period.resetAt).toLocaleDateString('nb-NO',{timeZone:'Europe/Oslo',day:'numeric',month:'long',year:'numeric'}):'når kapasiteten er konfigurert';
    return {...usage,remaining:usage.ready&&!usage.blocked&&usage.remaining>0?Number.MAX_SAFE_INTEGER:0,
      usedPercent:usage.usedPercent??0,totalUsedPercent:usage.totalUsedPercent??0,extraPercent:usage.extraPercent??null,reset};
  };
  api.capacityMeter=()=>{
    const usage=api.usage||{},total=(usage.included||0)+(usage.extra||0),used=(usage.spent||0)+(usage.extraSpent||0),held=(usage.held||0)+(usage.extraHeld||0);
    const busy=total?(used+held)/total*100:0;
    const label=!usage.ready?'Kapasitet ikke konfigurert':usage.blocked?'Nye analyser er stanset':`${percent.format(total?used/total*100:0)} % brukt${held?' · '+percent.format(total?held/total*100:0)+' % reservert':''}`;
    return `<span class="quota-meter-row"><span class="quota-label">Kapasitet</span><strong>${esc(label)}</strong><span class="quota-track" aria-hidden="true"><span style="width:${Math.max(0,Math.min(100,busy))}%"></span></span></span>`;
  };
  function capacityDetails() {
    const usage=api.usage||{},quota=api.monthlyQuota(),held=(usage.held||0)+(usage.extraHeld||0),total=(usage.included||0)+(usage.extra||0);
    return `<p><strong>${usage.plan==='paid'?'Betalt versjon':'Gratisversjon'}</strong></p>
      ${usage.ready?`<p>${percent.format(quota.totalUsedPercent)} % brukt i perioden. ${held?percent.format(total?held/total*100:0)+' % er reservert for arbeid som ikke er ferdig avregnet.':''}</p><p class="note">Ny periode starter ${esc(quota.reset)}. Modell, svarlengde, kildearbeid og cachebruk påvirker forbruket.</p>`:'<p role="status">Kapasitetsgrensene er ikke konfigurert. Du kan fortsatt åpne og eksportere lagret arbeid.</p>'}
      ${usage.unresolved?'<p role="status">Noe forbruk avventer bekreftelse. Reservasjonen beholdes til forbruket er avklart.</p>':''}
      ${usage.blocked?'<p role="status">Nye analyser er midlertidig stanset. Lagret arbeid er tilgjengelig.</p>':''}
      ${usage.extra?`<p>Ekstra kapasitet: ${percent.format(usage.extraPercent??0)} % igjen.</p>`:''}`;
  }
  api.capacitySheet=async()=>{
    await api.refreshUsage({force:true});const usage=api.usage||{};
    const modelOptions=(typeof models!=='undefined'?models:[]).map(option=>`<option value="${esc(option.id)}"${selectedModel().id===option.id?' selected':''}${!usage.models?.includes(option.id)?' disabled':''}>${esc(option.label)}${usage.models?.includes(option.id)?'':' · krever betalt tilgang'}</option>`).join('');
    openSheet('Kapasitet',`<div id="customer-capacity-details">${capacityDetails()}</div>
      <div class="quota-model"><label class="field">Modell for neste melding<select id="sven-model">${modelOptions}</select></label>
      ${fieldSelect('sven-effort','Resonneringsstyrke',effortLevels.map(option=>[option.id,option.label]),selectedEffort().id)}</div>
      <div class="actions">${command('buy-capacity','Kjøp ekstra kapasitet','btn primary')}</div>
      <p class="note">Betalt abonnement: 314 kr eks. mva. per måned. Betaling er ennå ikke koblet til denne forhåndsvisningen.</p>`);
  };
  api.billingUnavailable=()=>openSheet('Ekstra kapasitet','<p>Betalingskoblingen er ikke klar i denne forhåndsvisningen. Du kan kjøpe ekstra kapasitet når den er aktivert.</p><p>Ingen kapasitet er lagt til, og ingen betaling er startet.</p>');
  window.addEventListener('focus',()=>api.refreshUsage({force:true}));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void api.refreshUsage({force:true})});
  setInterval(()=>{if(!document.hidden)void api.refreshUsage({force:true})},15000);
};
