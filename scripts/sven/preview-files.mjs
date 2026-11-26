import { extractUpload, maxUploadBytes, unzipOffice } from '../../server/sven/file-input.mjs'
import { exportFile, fileTypes, normalizeExport } from '../../server/sven/file-export.mjs'
import { editOfficeFile, relatedOfficeParts } from '../../server/sven/office-edit.mjs'
import { visionImport } from '../../server/sven/vision-import.mjs'
import { runtimeCustomerAccess } from '../../server/customer/runtime.mjs'

const maxEncodedUpload = 4 * Math.ceil(maxUploadBytes / 3)

const originalFormats = ['pptx', 'docx', 'xlsx']
const validData = data => typeof data === 'string' && data.length && data.length <= maxEncodedUpload &&
  data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data)

function fileResponse(res, format, bytes, title) {
  const stem = title.toLocaleLowerCase('nb-NO').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'sven'
  res.setHeader('Content-Type', fileTypes[format])
  res.setHeader('Content-Disposition', `attachment; filename="sven.${format}"; filename*=UTF-8''${encodeURIComponent(stem)}.${format}`)
  res.status(200)
  for (let index = 0; index < bytes.length; index += 64 * 1024) res.write(bytes.subarray(index, index + 64 * 1024))
  return res.end()
}

export function previewFiles({ environment = process.env.VERCEL_ENV, readVisual, createVisual=visionImport, access = runtimeCustomerAccess } = {}) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const error = (status, message) => res.status(status).json({ error: message })
    if (environment !== 'preview') return error(404, 'Sven preview er utilgjengelig.')
    if (req.method !== 'POST') return error(405, 'Metoden støttes ikke.')
    let customer
    try { customer = await access.authorize(req) }
    catch(cause) {return error(cause.status??503,cause.status?cause.message:'Kundeinnloggingen er utilgjengelig.')}
    if (req.headers.origin !== (customer.origin ?? `https://${req.headers.host}`) ||
        req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
      return error(403, 'Bruk filverktøyet fra den beskyttede forhåndsvisningen.')
    }
    const { action, name, data, format, document, edits, append, visual, version } = req.body ?? {}
    if (req.body?.fileId) {
      try {await access.owned(customer,'files',req.body.fileId)}
      catch(cause) {return error(cause.status??503,cause.status?cause.message:'Kundeinnloggingen er utilgjengelig.')}
    }
    if (action === 'extract') {
      try {
        if(req.body.projectId)await access.owned(customer,'projects',req.body.projectId)
        if(req.body.conversationId)await access.owned(customer,'conversations',req.body.conversationId)
      }catch(cause){return error(cause.status??503,cause.status?cause.message:'Fillageret er utilgjengelig.')}
      if (!validData(data)) {
        return error(400, 'Velg en lesbar fil opptil 2 MB.')
      }
      try {
        const meteredVisual=async input=>{
          if(access.quota&&!/^[a-f0-9]{64}$/.test(req.body.requestId??''))throw Object.assign(Error('Fillesingen mangler en gyldig innsending. Prøv å legge ved filen på nytt.'),{status:400})
          return (readVisual??createVisual({...(access.quota?{meter:{quota:access.quota,userId:customer.id,requestId:req.body.requestId}}:{})}))(input)
        }
        const input = await extractUpload(name, Buffer.from(data, 'base64'), { readVisual:meteredVisual, visual: visual === true })
        const file = access.saveFile
          ? await access.saveFile(customer,{name:input.name,bytes:Buffer.from(data,'base64'),meta:input,projectId:req.body.projectId,conversationId:req.body.conversationId})
          : await access.createFile(customer, input.name)
        return res.status(200).json({...input,assetId:file.id})
      } catch (cause) {
        if(cause.status)return error(cause.status,cause.message)
        const message = cause?.message
        const readable = typeof message === 'string' && /^(Velg|Vedlegget|Jeg fant|Office-filen|PDF-en|Filen|Sven kan ikke bruke visuell|Sven kunne ikke lese bildet)/.test(message)
        return res.status(422).json({ error: readable ? message : 'Sven kunne ikke lese vedlegget. Sjekk at filen kan åpnes og prøv igjen.',
          ...(cause.usage ? { usage: cause.usage } : {}) })
      }
    }
    if (action === 'office-edit') {
      if (!validData(data) || !originalFormats.includes(format) || typeof name !== 'string' ||
        name.split('.').at(-1)?.toLowerCase() !== format || name.length > 180) return error(400, 'Velg den originale Office-filen.')
      try {
        const original = Buffer.from(data, 'base64')
        if (original.length > maxUploadBytes) return error(400, 'Velg en originalfil på opptil 2 MB.')
        const parts = await unzipOffice(original, relatedOfficeParts)
        const bytes = await editOfficeFile(original, parts, format, edits, append)
        return fileResponse(res, format, bytes, name.slice(0, -(format.length + 1)) + '-v' + (Number.isInteger(version) && version > 1 ? version : 2))
      } catch (cause) {
        return error(422, /^(Filfeltet|Filendringen)/.test(cause.message) ? cause.message : 'Sven kunne ikke redigere denne Office-filen.')
      }
    }
    if (action !== 'export') return error(400, 'Velg lesing eller et filformat.')
    const parsed = normalizeExport(format, document)
    if (!parsed) return error(422, 'Denne leveransen mangler gyldig tallgrunnlag eller innhold for filformatet.')
    try {
      return fileResponse(res, format, await exportFile(format, parsed), parsed.title + (Number.isInteger(version) && version > 0 ? '-v' + version : ''))
    } catch (cause) {
      if (!res.headersSent) {
        res.removeHeader('Content-Type')
        res.removeHeader('Content-Disposition')
        console.warn('[Sven export]', format, cause?.name)
        return error(500, 'Sven kunne ikke opprette filen. Prøv å laste den ned på nytt.')
      }
      res.end()
    }
  }
}

export default previewFiles()
