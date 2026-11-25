import { extractUpload, maxUploadBytes } from '../../server/sven/file-input.mjs'
import { exportFile, fileTypes, normalizeExport } from '../../server/sven/file-export.mjs'

const maxEncodedUpload = 4 * Math.ceil(maxUploadBytes / 3)

export function previewFiles({ environment = process.env.VERCEL_ENV } = {}) {
  return async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const error = (status, message) => res.status(status).json({ error: message })
    if (environment !== 'preview') return error(404, 'Sven preview er utilgjengelig.')
    if (req.method !== 'POST') return error(405, 'Metoden støttes ikke.')
    if (req.headers.origin !== `https://${req.headers.host}` ||
        req.headers['content-type']?.split(';', 1)[0] !== 'application/json') {
      return error(403, 'Bruk filverktøyet fra den beskyttede forhåndsvisningen.')
    }
    const { action, name, data, format, document } = req.body ?? {}
    if (action === 'extract') {
      if (typeof data !== 'string' || !data.length || data.length > maxEncodedUpload ||
          data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        return error(400, 'Velg en lesbar fil opptil 2 MB.')
      }
      try {
        const input = await extractUpload(name, Buffer.from(data, 'base64'))
        return res.status(200).json(input)
      } catch (cause) {
        const message = cause?.message
        const readable = typeof message === 'string' && /^(Velg|Vedlegget|Jeg fant|Office-filen|PDF-en|Filen)/.test(message)
        return error(422, readable ? message : 'Sven kunne ikke lese vedlegget. Sjekk at filen kan åpnes og prøv igjen.')
      }
    }
    if (action !== 'export') return error(400, 'Velg lesing eller et filformat.')
    const parsed = normalizeExport(format, document)
    if (!parsed) return error(422, 'Denne leveransen mangler gyldig tallgrunnlag eller innhold for filformatet.')
    try {
      const bytes = await exportFile(format, parsed)
      res.setHeader('Content-Type', fileTypes[format])
      const stem = parsed.title.toLocaleLowerCase('nb-NO').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 80) || 'sven'
      res.setHeader('Content-Disposition', `attachment; filename="sven.${format}"; filename*=UTF-8''${encodeURIComponent(stem)}.${format}`)
      res.status(200)
      for (let index = 0; index < bytes.length; index += 64 * 1024) res.write(bytes.subarray(index, index + 64 * 1024))
      return res.end()
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
