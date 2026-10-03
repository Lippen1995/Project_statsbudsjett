import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToString } from 'react-dom/server'
import AnalyseApp from './AnalyseApp.jsx'
import { validateArticle, contentHash } from '../../../scripts/analyser/schema.mjs'
import { factText, analysisPath, archiveEntries } from './model.js'

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const json = (data) => JSON.stringify(data).replaceAll('<', '\\u003c')
export function analysesPlugin() {
  let webRoot
  const load = () => {
    const articles = JSON.parse(
      readFileSync(
        process.env.ANALYSIS_PUBLICATIONS_FILE ??
          resolve(webRoot, 'src/analyser/publications.json'),
        'utf8',
      ),
    )
    if (!Array.isArray(articles)) throw Error('Analysebiblioteket må være en liste')
    const slugs = new Set()
    for (const article of articles) {
      validateArticle(article, { published: true })
      if (slugs.has(article.slug)) throw Error('Duplisert analyseadresse')
      slugs.add(article.slug)
    }
    return articles
  }
  const preview = () =>
    process.env.ANALYSIS_PREVIEW_FILE
      ? validateArticle(JSON.parse(readFileSync(process.env.ANALYSIS_PREVIEW_FILE, 'utf8')))
      : null
  const propsFor = (path) => {
    const articles = load(),
      draft = preview()
    if (path === '/analyser/' || path === '/analyser') return { articles: archiveEntries(articles) }
    if (draft && path === '/analyser/forhandsvisning/') return { article: draft, preview: true }
    const article = articles.find((a) => analysisPath(a.slug) === path)
    return article ? { article } : { notFound: true }
  }
  const page = (html, path, props) => {
    const article = props.article
    const title = article
      ? `${factText(article.copy.title, article.report)} | Fellestall.no`
      : 'Analyser av offentlig pengebruk | Fellestall.no'
    const description = article
      ? factText(article.copy.description, article.report)
      : 'Les grundige analyser av statens og kommunenes pengebruk. Finn temaer, sammenligninger og utvikling over tid, med grafer, metode og åpne kilder.'
    const url = `https://fellestall.no${path}`
    const structured = article
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: factText(article.copy.title, article.report),
          description,
          datePublished: article.publishedAt,
          dateModified: article.publishedAt,
          author: { '@type': 'Organization', name: 'Fellestall.no', url: 'https://fellestall.no/' },
          publisher: { '@type': 'Organization', name: 'Fellestall.no' },
          mainEntityOfPage: url,
          image: 'https://fellestall.no/delingsbilde.png',
          inLanguage: 'nb-NO',
        }
      : {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          url,
          description,
          inLanguage: 'nb-NO',
        }
    html = html
      .replace(/<title>.*?<\/title>/, `<title>${escape(title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/, `$1${escape(description)}`)
      .replace(
        /(<meta (?:property|name)="(?:og:title|twitter:title)" content=")[^"]*/g,
        `$1${escape(title)}`,
      )
      .replace(
        /(<meta (?:property|name)="(?:og:description|twitter:description)" content=")[^"]*/g,
        `$1${escape(description)}`,
      )
      .replace(/(<meta property="og:url" content=")[^"]*/, `$1${escape(url)}`)
      .replace(/(<meta property="og:type" content=")[^"]*/, `$1${article ? 'article' : 'website'}`)
      .replace(/(<link rel="(?:canonical|alternate)"[^>]*href=")[^"]*/g, `$1${escape(url)}`)
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
      .replace(/<script>window\.__FELLESTALL_SEO_META__=[\s\S]*?<\/script>/g, '')
      .replace(/<meta property="og:updated_time"[^>]*>/g, '')
    if (props.preview || props.notFound)
      html = html.replace(/(<meta name="robots" content=")[^"]*/, '$1noindex, nofollow')
    const bodyScripts =
      html
        .match(/<body>[\s\S]*?<\/body>/)?.[0]
        .match(/<script\b[\s\S]*?<\/script>/g)
        ?.join('\n') ?? ''
    html = html.replace(
      /<body>[\s\S]*?<\/body>/,
      `<body><div id="root">${renderToString(<AnalyseApp {...props} />)}</div>${bodyScripts}</body>`,
    )
    // Prebuilt paths work on a static host, without an SPA rewrite.
    const depth = path.split('/').filter(Boolean).length
    const prefix = '../'.repeat(depth)
    html = html.replace(
      /((?:href|src)=")(?:\.\/)?(assets\/|fonter(?:\/|\.css)|favicon\.svg|apple-touch-icon\.png)/g,
      `$1${prefix}$2`,
    )
    return html.replace(
      '</head>',
      `<script>window.__FELLESTALL_ANALYSES__=${json(props)}</script><script type="application/ld+json">${json(structured)}</script></head>`,
    )
  }
  return {
    name: 'fellestall-analyses',
    enforce: 'post',
    configResolved(config) {
      webRoot = config.root
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url, 'http://localhost').pathname
        if (!/^\/analyser(?:\/|$)/.test(path) || /\.[a-z]+$/.test(path)) return next()
        if (path === '/analyser') {
          res.writeHead(302, { Location: '/analyser/' })
          res.end()
          return
        }
        try {
          const props = propsFor(path)
          const raw = readFileSync(resolve(webRoot, 'index.html'), 'utf8')
          const html = page(await server.transformIndexHtml(path, raw), path, props)
          res.writeHead(props.notFound ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
        } catch (error) {
          next(error)
        }
      })
    },
    generateBundle(_options, bundle) {
      const html = bundle['index.html']?.source
      if (typeof html !== 'string') throw Error('Mangler Vite HTML for analysesider')
      const articles = load()
      this.emitFile({
        type: 'asset',
        fileName: 'analyser/index.html',
        source: page(html, '/analyser/', { articles: archiveEntries(articles) }),
      })
      for (const article of articles) {
        this.emitFile({
          type: 'asset',
          fileName: `analyser/${article.slug}/index.html`,
          source: page(html, analysisPath(article.slug), { article }),
        })
        this.emitFile({
          type: 'asset',
          fileName: `analyser/${article.slug}/datagrunnlag.json`,
          source: JSON.stringify(
            { contentHash: contentHash(article), report: article.report },
            null,
            2,
          ),
        })
      }
      const draft = preview()
      if (draft)
        this.emitFile({
          type: 'asset',
          fileName: 'analyser/forhandsvisning/index.html',
          source: page(html, '/analyser/forhandsvisning/', { article: draft, preview: true }),
        })
    },
  }
}
