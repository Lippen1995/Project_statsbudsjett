import test from 'node:test'
import assert from 'node:assert/strict'
import { flytKilder, flytRader } from '../src/fellestall/flyttall.js'

test('valgt serie brukes også for fondsoverføring, petroleum og lån utelates', () => {
  const kap=(i,t,s,x)=>({i,t,n:t,l:'k',s:{2027:s},x})
  const data={inntekter:[{c:[kap('tax','Kap. 5501',[1,null,null,10]),kap('oil','Kap. 5507',[1,null,null,20]),kap('loan','Kap. 5999',[1,null,null,30]),{...kap('fund','Kap. 5800',[1,null,null,40],1),c:[{i:'fund-post',n:'Overføring',l:'p',x:1,s:{2027:[1,null,null,40]}}]}]}]}
  const r=flytRader(flytKilder(data,true),2027,3,true)
  assert.equal(r.reduce((s,n)=>s+n.mill,0),50)
  assert.equal(r.find(n=>n.node.i==='flyt-fond').mill,40)
})

test('øvrige-gruppen beholder beløp og kan åpnes videre', () => {
  const n=Array.from({length:15},(_,i)=>({i:String(i),n:String(i),l:'p',s:{2027:[0,null,null,i+1]}}))
  const r=flytRader(n,2027,3,true)
  assert.equal(r.length,10)
  assert.equal(r.reduce((s,n)=>s+n.mill,0),120)
  assert.equal(r.at(-1).kanNed,true)
  assert.equal(flytRader(r.at(-1).node.c,2027,3,true).reduce((s,n)=>s+n.mill,0),r.at(-1).mill)
})

import { flytOmrade } from '../src/fellestall/flyttall.js'

const post=(id,n,belop)=>({i:id,n,l:'p',s:{2027:[null,null,null,belop]}})
const kap=(id,n,nr,children)=>({i:id,n,t:`Kap. ${nr}`,l:'k',c:children,s:{2027:[null,null,null,children.reduce((s,p)=>s+p.s[2027][3],0)]}})
const dept=(id,c)=>({i:id,n:id,l:'d',c})

test('kostnadsdrill kobler områdeinntekter og beregnet avgiftsandel til samme utgifter',()=>{
  const pensjon=kap('u-06-2670','Alderdom',2670,[post('u-06-2670-70','Pensjon',80)])
  const helse=kap('u-07-2751','Legemidler',2751,[post('u-07-2751-70','Legemidler',20)])
  const nav=kap('u-06-0605','Nav',605,[post('u-06-0605-01','Drift',10)])
  const inn=kap('i-06-3605','Nav',3605,[post('i-06-3605-01','Refusjon',2)])
  const avg=kap('i-16-5700','Folketrygdens inntekter',5700,[post('i-16-5700-71','Trygdeavgift',40),post('i-16-5700-72','Arbeidsgiveravgift',10)])
  const d={utgifter:[dept('u-06',[pensjon,nav]),dept('u-07',[helse])],inntekter:[dept('i-06',[inn]),dept('i-16',[avg])]}
  let r=flytOmrade(d,d.utgifter[0],2027,3,true)
  assert.equal(r.utgift,90)
  assert.equal(r.avgiftsAndel,.8)
  assert.equal(r.inntekt,42)
  assert.equal(r.rest,48)
  assert.equal(r.kilder.reduce((s,x)=>s+x.mill,0),r.utgift)
  r=flytOmrade(d,pensjon,2027,3,true)
  assert.equal(r.inntekt,40)
  assert.equal(r.rest,40)
  assert.ok(!r.kilder.some(k=>k.node.i===inn.i))
})

test('postinntekt fordeles eksplisitt etter kostnadsandel, ikke likt postnummer',()=>{
  const a=post('u-01-0100-01','Drift',30),b=post('u-01-0100-70','Tilskudd',70)
  const k=kap('u-01-0100','Virksomhet',100,[a,b])
  const inn=kap('i-01-3100','Virksomhet',3100,[post('i-01-3100-70','Gebyr',20)])
  const d={utgifter:[dept('u-01',[k])],inntekter:[dept('i-01',[inn])]}
  const r=flytOmrade(d,a,2027,3,true)
  assert.equal(r.inntekt,6)
  assert.equal(r.rest,24)
  assert.equal(r.fordeltPost,true)
  assert.ok(r.kilder[0].navn.includes('fordelt anslag'))
})

test('overskytende inntekter blir netto til felles finansiering og manglende inntekter blir rest',()=>{
  const k=kap('u-01-0100','Virksomhet',100,[post('u-01-0100-01','Drift',10)])
  const inn=kap('i-01-3100','Virksomhet',3100,[post('i-01-3100-01','Gebyr',20)])
  const d={utgifter:[dept('u-01',[k])],inntekter:[dept('i-01',[inn])]}
  assert.equal(flytOmrade(d,k,2027,3,true).rest,-10)
  d.inntekter=[]
  assert.equal(flytOmrade(d,k,2027,3,true).rest,10)
})

test('negative utgifter og inntekter synliggjøres uten å bryte beløpsbalansen',()=>{
  const drift=kap('u-01-0100','Drift',100,[post('u-01-0100-01','Drift',100)])
  const credit=kap('u-01-0101','Nettoinntekt',101,[post('u-01-0101-01','Inntektsføring',-10)])
  const inn=kap('i-01-3100','Refusjon',3100,[post('i-01-3100-01','Tilbakebetaling',-5)])
  const d={utgifter:[dept('u-01',[drift,credit])],inntekter:[dept('i-01',[inn])]}
  const r=flytOmrade(d,d.utgifter[0],2027,3,true)
  assert.equal(r.utgift,90)
  assert.equal(r.kreditering,10)
  assert.equal(r.tilbakebetaling,5)
  assert.equal(r.inntekt,-5)
  assert.equal(r.rest,95)
  assert.equal(r.kilder.reduce((s,k)=>s+k.mill,0),100+r.tilbakebetaling)
})
