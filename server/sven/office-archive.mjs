import { fromBuffer } from 'yauzl'

const maxZipPayload = 24 * 1024 * 1024

export function unzipOffice(bytes, wanted) {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, archive) => {
      if (error) return reject(error)
      let entries = 0
      let total = 0
      const extracted = new Map()
      const fail = failure => { archive.close(); reject(failure) }
      archive.once('error', fail)
      archive.once('end', () => resolve(extracted))
      archive.on('entry', entry => {
        total += entry.uncompressedSize
        if (++entries > 1600 || total > maxZipPayload || entry.isEncrypted()) {
          fail(new Error('Office-filen er for stor eller passordbeskyttet.'))
          return
        }
        if (!wanted(entry.fileName)) return archive.readEntry()
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(streamError)
          const chunks = []
          stream.on('data', chunk => chunks.push(chunk))
          stream.once('error', fail)
          stream.once('end', () => {
            extracted.set(entry.fileName, Buffer.concat(chunks).toString('utf8'))
            archive.readEntry()
          })
        })
      })
      archive.readEntry()
    })
  })
}

