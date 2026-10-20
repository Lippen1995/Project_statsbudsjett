import { parseArgs } from 'node:util'
import { randomUUID } from 'node:crypto'
import { githubClient } from '../analyser/github.mjs'

const {positionals,values}=parseArgs({allowPositionals:true,options:{id:{type:'string'},state:{type:'string'},note:{type:'string'},review:{type:'string'}}})
const g=githubClient({repository:'Lippen1995/Project_statsbudsjett',transport:process.env.GH_TOKEN?'fetch':'gh'})
const path='editorial/sven-status.json',at=new Date().toISOString()
if(!['start','update','finish'].includes(positionals[0]))throw Error('Bruk start, update eller finish')
const states=['waiting','researching','writing','delivering','review','completed','failed']
const state=positionals[0]==='start'?'researching':values.state
if(!states.includes(state))throw Error('Ugyldig arbeidsstatus')
const id=positionals[0]==='start'?randomUUID():values.id
if(!/^[a-f0-9-]{36}$/.test(id || ''))throw Error('Mangler kjørings-ID')
const note=(values.note || '').trim();if(note.length>1000)throw Error('Statusnotatet er for langt')
if(values.review&&!/^https:\/\/github\.com\/Lippen1995\/Project_statsbudsjett\/pull\/\d+$/.test(values.review))throw Error('Ugyldig gjennomgangslenke')
const head=await g.api(g.root+'/git/ref/heads/main')
const stored=await g.content(path),document=stored?.value || {version:1,history:[]}
if(positionals[0]!=='start'&&document.current?.id!==id)throw Error('En annen kjøring har overtatt. Statusen er beholdt.')
if(positionals[0]==='start') {
  if(document.current)document.history=[...(document.history || []),document.current].slice(-60)
  document.current={id,startedAt:at,instructionCommit:head.object.sha}
}
document.current={...document.current,state,note,updatedAt:at,...(values.review?{review:values.review}:{}),...(positionals[0]==='finish'?{finishedAt:at}:{})}
await g.commit('main',head.object.sha,{[path]:document},'sven: rapporter faktisk arbeidsstatus')
console.log(JSON.stringify({id,state,at}))
