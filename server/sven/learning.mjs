import { verify } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync,chmodSync } from 'node:fs'
import { dirname } from 'node:path'

import {candidateSettings,candidateId,builtinSettings} from './tuning.mjs'
export {candidateSettings,candidateId,builtinSettings} from './tuning.mjs'

function validateAttestation(envelope, publicKey, now) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > 50000 ||
    !verify(null,Buffer.from(envelope.payload),publicKey,Buffer.from(envelope.signature,'base64'))) throw new Error('Ugyldig signatur fra uavhengig evaluator')
  const data=JSON.parse(envelope.payload)
  if (typeof data.id !== 'string' || !data.id || !Number.isFinite(Date.parse(data.issuedAt)) || !Number.isFinite(Date.parse(data.expiresAt)) ||
    Date.parse(data.issuedAt)>now || Date.parse(data.expiresAt)<=now || Date.parse(data.expiresAt)-Date.parse(data.issuedAt)>86400000) throw new Error('Ugyldig eller utløpt evaluering')
  return data
}

export function openLearningRegistry(path,{publicKey,holdoutHashes,domains,minCases=30,minGain=0.1,maxCostRatio=1.2,clock=Date.now}) {
  if(!publicKey || !Array.isArray(holdoutHashes) || !holdoutHashes.length || !Array.isArray(domains) || !domains.length) throw new Error('Uavhengig evaluator og reservert testgrunnlag må konfigureres')
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700})
  const db=new DatabaseSync(path)
  if(path!==':memory:')chmodSync(path,0o600)
  db.exec(`CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,settings TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS active(singleton INTEGER PRIMARY KEY CHECK(singleton=1),candidate_id TEXT NOT NULL,previous_id TEXT);
    CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,kind TEXT NOT NULL,candidate_id TEXT NOT NULL,accepted INTEGER NOT NULL,reason TEXT NOT NULL,attestation TEXT NOT NULL);`)
  const builtin=candidateId(builtinSettings)
  db.prepare('INSERT OR IGNORE INTO candidates(id,settings) VALUES(?,?)').run(builtin,JSON.stringify(builtinSettings))
  db.prepare('INSERT OR IGNORE INTO active(singleton,candidate_id) VALUES(1,?)').run(builtin)
  const current=()=>{
    const row=db.prepare('SELECT a.*,c.settings FROM active a JOIN candidates c ON c.id=a.candidate_id WHERE singleton=1').get()
    return {id:row.candidate_id,previousId:row.previous_id,settings:JSON.parse(row.settings)}
  }
  return {
    close:()=>db.close(),current,
    propose(settings){
      const normalized=candidateSettings({...settings,...(!Object.hasOwn(settings,'editorialSkills') && current().settings.editorialSkills ? {editorialSkills:current().settings.editorialSkills} : {})}),id=candidateId(normalized)
      db.prepare('INSERT OR IGNORE INTO candidates(id,settings) VALUES(?,?)').run(id,JSON.stringify(normalized))
      return {id,settings:normalized}
    },
    apply(envelope){
      const report=validateAttestation(envelope,publicKey,clock())
      db.exec('BEGIN IMMEDIATE')
      try {
        if(db.prepare('SELECT id FROM decisions WHERE id=?').get(report.id))throw new Error('Evalueringen er allerede behandlet')
        const active=current()
        let accepted=false,reason='Ugyldig evalueringstype'
        if(report.kind==='evaluation') {
          const candidate=db.prepare('SELECT * FROM candidates WHERE id=?').get(report.candidateId)
          if(!candidate || report.candidateId===active.id || report.baselineId!==active.id)throw new Error('Kandidaten eller sammenligningsversjonen stemmer ikke')
          if(!holdoutHashes.includes(report.holdoutHash))throw new Error('Testsettet er ikke godkjent for denne kontrolløren')
          const rows=report.domains
          if(!Array.isArray(rows)||rows.length!==domains.length||new Set(rows.map(r=>r.name)).size!==domains.length||rows.some(r=>!domains.includes(r.name)||
            !Number.isInteger(r.cases)||r.cases<minCases||!Number.isFinite(r.candidateScore)||r.candidateScore<0||r.candidateScore>4||
            !Number.isFinite(r.baselineScore)||r.baselineScore<0||r.baselineScore>4))throw new Error('Fagdekning eller antall evalueringssaker er utilstrekkelig')
          const gain=rows.reduce((sum,r)=>sum+r.candidateScore-r.baselineScore,0)/rows.length
          const noRegression=rows.every(r=>r.candidateScore>=r.baselineScore)
          accepted=report.criticalErrors===0 && report.privacyPassed===true && report.publicationPolicyPassed===true &&
            Number.isFinite(report.costRatio)&&report.costRatio>=0&&report.costRatio<=maxCostRatio&&noRegression&&gain>=minGain
          reason=accepted?'Forbedring bestått i uavhengig test uten faglig tilbakegang':'Krav til kvalitet, personvern, publisering eller kostnad er ikke oppfylt'
          if(accepted)db.prepare('UPDATE active SET candidate_id=?,previous_id=? WHERE singleton=1 AND candidate_id=?').run(report.candidateId,active.id,active.id)
        }else if(report.kind==='monitor') {
          if(report.candidateId!==active.id)throw new Error('Overvåkingen gjelder ikke aktiv kandidat')
          if(!Number.isInteger(report.criticalErrors)||report.criticalErrors<0||typeof report.privacyPassed!=='boolean'||typeof report.publicationPolicyPassed!=='boolean')throw new Error('Ugyldig overvåkingsrapport')
          accepted=!!active.previousId && (report.criticalErrors>0||!report.privacyPassed||!report.publicationPolicyPassed)
          reason=accepted?'Automatisk tilbakeføring etter signert kritisk avvik':'Ingen kritisk tilbakeføringsgrunn eller ingen tidligere versjon'
          if(accepted)db.prepare('UPDATE active SET candidate_id=?,previous_id=NULL WHERE singleton=1').run(active.previousId)
        }else throw new Error('Ukjent rapporttype')
        db.prepare('INSERT INTO decisions VALUES(?,?,?,?,?,?)').run(report.id,report.kind,report.candidateId,accepted?1:0,reason,JSON.stringify(envelope))
        db.exec('COMMIT')
        return {accepted,reason,active:current()}
      }catch(error){db.exec('ROLLBACK');throw error}
    },
  }
}
