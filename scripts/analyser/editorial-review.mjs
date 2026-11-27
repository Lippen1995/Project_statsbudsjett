// Reuses the existing evaluator's trusted Ed25519 public key. The writer has
// no signing key and cannot turn its own scores into editorial approval.
import { verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { digest, policyHash, editorialInputHash } from './editorial-policy.mjs'

function configuredPublicKey() {
  if (!process.env.SVEN_LEARNING_CONFIG) return null
  return JSON.parse(readFileSync(process.env.SVEN_LEARNING_CONFIG,'utf8')).publicKey
}
export function verifyEditorialReview(article, assessment, envelope, {publicKey, now=Date.now(),allowExpired=false}={}) {
  if (!envelope) return {verified:false,reason:'Egenvurderingen er registrert. Uavhengig redaksjonell kontroll mangler.'}
  let key=publicKey
  try { key??=configuredPublicKey() }
  catch { return {verified:false,reason:'Konfigurasjonen for uavhengig evaluator kunne ikke leses; automatisk godkjenning er sperret.'} }
  if (!key) return {verified:false,reason:'Den eksisterende uavhengige evaluatoren er ikke konfigurert; automatisk godkjenning er sperret.'}
  try {
    if(typeof envelope.payload!=='string'||envelope.payload.length>200000||typeof envelope.signature!=='string'||
        !verify(null,Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'base64')))
      throw Error('Ugyldig signatur fra uavhengig evaluator')
    const report=JSON.parse(envelope.payload)
    if(report.kind!=='editorial-review'||report.independent!==true||typeof report.reviewer!=='string'||report.reviewer.trim().length<3||
        report.inputHash!==editorialInputHash(article)||report.policyHash!==policyHash||report.assessmentHash!==digest(assessment))
      throw Error('Den uavhengige kontrollen gjelder ikke denne artikkelen og vurderingen')
    const issued=Date.parse(report.issuedAt),expires=Date.parse(report.expiresAt)
    if(!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now||(!allowExpired&&expires<=now)||expires<=issued||expires-issued>86400000)
      throw Error('Den uavhengige kontrollen er utløpt eller har ugyldig tidspunkt')
    return {verified:true,reviewer:report.reviewer}
  } catch(error) { return {verified:false,reason:error.message} }
}
