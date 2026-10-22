import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToString } from 'react-dom/server'
import ProductApp from './ProductApp.jsx'
import { PRODUCT_PATHS, productRoute, productMetadata } from './launch.mjs'
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function productsPlugin() {
  let root
  const page = (html,path,props) => {
    const meta = productMetadata(props)
    html = html.replace(/<title>.*?<\/title>/,`<title>${escape(meta.title)}</title>`)
      .replace(/(<meta name="description" content=")[^"]*/,`$1${escape(meta.description)}`)
      .replace(/(<meta name="robots" content=")[^"]*/,`$1${meta.robots}`)
      .replace(/(<link rel="(?:canonical|alternate)"[^>]*href=")[^"]*/g,`$1${escape(meta.canonical)}`)
      .replace(/(<meta property="og:(?:title|description|url)" content=")[^"]*/g,(match,prefix)=>prefix+escape(match.includes('og:title')?meta.title:match.includes('og:url')?meta.canonical:meta.description))
      .replace(/(<meta name="twitter:(?:title|description)" content=")[^"]*/g,(match,prefix)=>prefix+escape(match.includes('twitter:title')?meta.title:meta.description))
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'')
      .replace(/<script>window\.__FELLESTALL_SEO_META__=[\s\S]*?<\/script>/g,'')
      .replace(/<meta property="og:updated_time"[^>]*>/g,'')
    const scripts=html.match(/<body>[\s\S]*?<\/body>/)?.[0].match(/<script\b[\s\S]*?<\/script>/g)?.join('\n')??''
    html=html.replace(/<body>[\s\S]*?<\/body>/,`<body><div id="root">${renderToString(<ProductApp {...props}/>)}</div>${scripts}</body>`)
    const prefix='../'.repeat(path.split('/').filter(Boolean).length)
    html=html.replace(/((?:href|src)=")(?:\.\/)?(assets\/|fonter(?:\/|\.css)|favicon\.svg|apple-touch-icon\.png)/g,`$1${prefix}$2`)
    return html.replace('</head>',`<script>window.__FELLESTALL_PRODUCTS__=${JSON.stringify(props).replaceAll('<','\\u003c')}</script></head>`)
  }
  return {
    name:'fellestall-products',enforce:'post',
    configResolved(config) {root=config.root},
    configureServer(server) {
      server.middlewares.use(async(req,res,next)=>{
        const path=new URL(req.url,'http://localhost').pathname
        if(!/^\/hjelper-deg(?:\/|$)/.test(path) || /\.[a-z]+$/.test(path)) return next()
        const props=productRoute(path)
        if(!props.notFound && !path.endsWith('/')) {res.writeHead(302,{Location:path+'/'});res.end();return}
        try {const html=page(await server.transformIndexHtml(path,readFileSync(resolve(root,'index.html'),'utf8')),path,props)
          res.writeHead(props.notFound?404:200,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':productMetadata(props).robots});res.end(html)
        } catch(error) {next(error)}
      })
    },
    generateBundle(_options,bundle) {
      const html=bundle['index.html']?.source
      if(typeof html!=='string') throw Error('Mangler Vite HTML for produktsider')
      for(const path of PRODUCT_PATHS) this.emitFile({type:'asset',fileName:path.slice(1)+'index.html',source:page(html,path,productRoute(path))})
    },
  }
}
