import { cp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const mobileBaseline='55bfa030951d4736a0c06e50eb62e35a387f7640'
function replaceOnce(source,old,replacement) {
  if(source.split(old).length!==2)throw Error('Mobilklientens forventede kilde er endret: '+old.slice(0,70))
  return source.replace(old,replacement)
}
export async function prepareCustomerMobile(sourceArg,outputArg) {
  const source=resolve(sourceArg),output=resolve(outputArg)
  if(!relative(source,output).startsWith('..')||!relative(output,source).startsWith('..'))throw Error('Kilde og output må være separate kataloger.')
  const sha=execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()
  if(sha!==mobileBaseline)throw Error('Bruk den registrerte klientcommiten '+mobileBaseline)
  if(execFileSync('git',['-C',source,'status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim())throw Error('Klientkilden har lokale endringer.')
  await mkdir(output,{recursive:true})
  if((await readdir(output)).length)throw Error('Output må være en tom katalog.')
  // Copy tracked blobs from the pinned commit. Untracked files (including
  // local configuration and uploads) must never enter the served artifact.
  const entries=execFileSync('git',['-C',source,'ls-tree','-r','-z',sha,'dist'],{encoding:'utf8'}).split('\0').filter(Boolean)
  for(const entry of entries) {
    const [info,path]=entry.split('\t')
    if(!/^100(?:644|755) blob /.test(info)||!path?.startsWith('dist/')||path.split('/').includes('..'))throw Error('Klientkilden inneholder en uventet filtype.')
    const target=resolve(output,path.slice('dist/'.length))
    await mkdir(resolve(target,'..'),{recursive:true})
    await writeFile(target,execFileSync('git',['-C',source,'show',sha+':'+path],{maxBuffer:16*1024*1024}))
  }
  let html=await readFile(resolve(output,'index.html'),'utf8')
  html=replaceOnce(html,'<head>','<head>\n<meta name="sven-live" content="true">\n<meta name="fellestall-customer-auth" content="true">\n<meta name="referrer" content="no-referrer">')
  html=replaceOnce(html,'<script defer src="./mobile.js"></script>','<script defer src="./customer-auth.js"></script>')
  await writeFile(resolve(output,'index.html'),html)
  await cp(new URL('../../web/public/customer-auth.js',import.meta.url),resolve(output,'customer-auth.js'))
  let mobile=await readFile(resolve(output,'mobile.js'),'utf8')
  mobile=replaceOnce(mobile,"const key = liveSven?'fellestall-mobil-sven-preview':'fellestall-mobil-1';","const key = window.FellestallCustomer?.storageKey || (liveSven?'fellestall-mobil-sven-preview':'fellestall-mobil-1');")
  mobile=replaceOnce(mobile,"if(liveSven&&location.hash==='#sven') saved.session=true;", "if(window.FellestallCustomer) { saved.session=Boolean(window.FellestallCustomer.user); if(saved.session) Object.assign(saved,{name:window.FellestallCustomer.user.name,email:window.FellestallCustomer.user.email}); } else if(liveSven&&location.hash==='#sven') saved.session=true;")
  mobile=replaceOnce(mobile,'function accountView(detail) {','function accountView(detail) {\n  if(window.FellestallCustomer) return window.FellestallCustomer.accountView(detail);')
  mobile=replaceOnce(mobile,"  const id=event.target.id;\n  const fields=new FormData(event.target);", "  const id=event.target.id;\n  if(window.FellestallCustomer?.handlesForm(id)) { void window.FellestallCustomer.submitForm(event.target); return; }\n  const fields=new FormData(event.target);")
  mobile=replaceOnce(mobile,"    case 'logout':\n      saved.session=false;", "    case 'logout':\n      if(window.FellestallCustomer) { void window.FellestallCustomer.logout(); break; }\n      saved.session=false;")
  mobile=replaceOnce(mobile,'async function liveReply(item, history, resume) {','async function liveReply(item, history, resume) {\n  const customerTalk=saved.talks.find(talk=>talk.messages.includes(item));\n  if(!resume) await window.FellestallCustomer?.prepareTalk(customerTalk);')
  mobile=replaceOnce(mobile,'    requestId:item.requestId,question:questionWithAttachment(item.question,item.attachment),history,model:item.model,effort:item.effort,','    requestId:item.requestId,question:questionWithAttachment(item.question,item.attachment),history,model:item.model,effort:item.effort,\n    ...(window.FellestallCustomer?{conversationId:customerTalk.id,...(customerTalk.projectId?{projectId:customerTalk.projectId}:{})}:{}),')
  mobile=replaceOnce(mobile,"settingStatus('Lokal testkonto','Passord, totrinnsbekreftelse og aktive økter krever tilkobling til Fellestall-kontoen.')", "(window.FellestallCustomer?settingStatus('Fellestall-konto',saved.session?saved.email:'Logg inn for å bruke kontoen din.'):settingStatus('Lokal testkonto','Passord, totrinnsbekreftelse og aktive økter krever tilkobling til Fellestall-kontoen.'))")
  mobile=mobile.replaceAll("fetch('/api/sven/chat'","(window.FellestallCustomer?.fetch || fetch)('/api/sven/chat'")
  await writeFile(resolve(output,'mobile.js'),mobile)
  let workspace=await readFile(resolve(output,'sven-workspace.js'),'utf8')
  workspace=replaceOnce(workspace,"indexedDB.open('fellestall-sven-private-assets',1)","indexedDB.open(window.FellestallCustomer?.assetDatabase || 'fellestall-sven-private-assets',1)")
  workspace=replaceOnce(workspace,'function svenCreateProject(name) {','async function svenCreateProject(name) {')
  workspace=replaceOnce(workspace,"  const project={id:crypto.randomUUID(),name:title,assets:[]};\n  saved.svenProjects.unshift(project);", "  const project={id:crypto.randomUUID(),name:title,assets:[]};\n  try { await window.FellestallCustomer?.createProject(project); } catch(error) { notify(error.message); return; }\n  saved.svenProjects.unshift(project);")
  workspace=replaceOnce(workspace,'    meta.assetId=crypto.randomUUID();','    meta.assetId=parsed.assetId||crypto.randomUUID();')
  // All extracted attachments retain their server-owned ID, including text files.
  workspace=replaceOnce(workspace,'  return meta;','  if(parsed.assetId) meta.assetId=parsed.assetId;\n  return meta;')
  await writeFile(resolve(output,'sven-workspace.js'),workspace)
  for(const name of ['sven-files.js','sven-insights.js']) {
    let text=await readFile(resolve(output,name),'utf8')
    text=text.replaceAll("fetch('/api/sven/","(window.FellestallCustomer?.fetch || fetch)('/api/sven/")
    await writeFile(resolve(output,name),text)
  }
  const customerRoot=fileURLToPath(new URL('../..',import.meta.url))
  await writeFile(resolve(output,'customer-source.json'),JSON.stringify({mobile:sha,
    customer:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',cwd:customerRoot}).trim(),
    customerDirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8',cwd:customerRoot}).trim())},null,2)+'\n')
  return {directory:output,mobile:sha}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [source,output]=process.argv.slice(2)
  if(!source||!output)throw Error('Bruk: node scripts/customer/prepare-mobile.mjs <privat-klientrepo> <output>')
  console.log(JSON.stringify(await prepareCustomerMobile(source,output)))
}
