import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { editorialService } from '../../server/admin/editorial.mjs'
const article = JSON.parse(readFileSync(new URL('../../editorial/drafts/pilot.json', import.meta.url)))
test('review API returns persisted comment statuses and excludes technical receipts across pages', async () => {
 const calls=[]
 const comments=Array.from({length:100}, (_,i)=>({id:i+1,user:{type:'Bot',login:'unrelated'},body:'noise'}))
 comments[0]={id:1,user:{type:'User',login:'editor'},body:'Bruk SSB',created_at:'2026-11-02T08:00:00Z'}
 const receipt={id:101,user:{type:'User',login:'sven'},created_at:'2026-11-02T09:00:00Z',body:'<!-- fellestall-feedback-status:{"state":"working","ids":["comment-1"]} -->'}
 const github={
  readFile:async()=>({content:JSON.stringify(article),path:'editorial/drafts/pilot.json',sha:'file'}),
  api:async path=>{
   calls.push(path)
   if(path==='pulls/123') return {state:'open',head:{sha:'a'.repeat(40),ref:'analysis/weekly-test',repo:{full_name:'Lippen1995/Project_statsbudsjett'}},base:{ref:'main'}}
   if(path==='pulls/123/files?per_page=100') return [{status:'added',filename:'editorial/drafts/pilot.json'}]
   if(path.startsWith('issues/123/comments'))return path.endsWith('page=1')?comments:[receipt]
   if(path==='collaborators/sven/permission') return {permission:'write'}
   if(path.includes('/reviews')||path.includes('/commits'))return []
   throw Error(path)
  }
 }
 const review=await editorialService({github}).review(123)
 assert.equal(review.feedback.length,1)
 assert.equal(review.feedback[0].body,'Bruk SSB')
 assert.equal(review.feedback[0].status,'working')
 assert.equal(review.feedback[0].statusAt,receipt.created_at)
 assert(calls.includes('issues/123/comments?per_page=100&page=2'))
})
