export function nodeHandler(handle) {
  return async (req, res) => {
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > (new URL(req.url,'https://fellestall.no').pathname==='/api/admin/backups/import'?3000000:110000)) {
          res.writeHead(413, { 'Cache-Control': 'no-store' })
          res.end()
          return
        }
        chunks.push(chunk)
      }
      const origin = process.env.BETTER_AUTH_URL || 'https://fellestall.no'
      const response = await handle(
        new Request(new URL(req.url, origin), {
          method: req.method,
          headers: req.headers,
          ...(!['GET', 'HEAD'].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        }),
      )
      res.statusCode = response.status
      for (const [key, value] of response.headers)
        if (key !== 'set-cookie') res.setHeader(key, value)
      const cookies = response.headers.getSetCookie()
      if (cookies.length) res.setHeader('set-cookie', cookies)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      })
      res.end(
        JSON.stringify({
          error:
            'Administrasjonstjenesten mangler serveroppsett eller er utilgjengelig.',
        }),
      )
    }
  }
}
