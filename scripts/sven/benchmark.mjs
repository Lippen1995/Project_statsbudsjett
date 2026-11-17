import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { prepareBenchmark, blindBenchmark, scoreBenchmark, digest } from '../../server/sven/benchmark.mjs'
const read = async path => JSON.parse(await readFile(path,'utf8'))
const write = async (path,data) => writeFile(path,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'})
try {
  const [command,dir,input,ratingsPath] = process.argv.slice(2)
  if (!dir) throw new Error('Oppgi en privat testmappe utenfor repoet')
  const root=resolve(dir)
  if (command==='prepare') {
    const cases=await read(input || new URL('../../evaluation/sven/cases.json',import.meta.url))
    const manifest=prepareBenchmark(cases,{asOf:new Date().toISOString().slice(0,10)})
    await mkdir(root,{recursive:true,mode:0o700})
    await write(join(root,'manifest.json'),manifest)
    await write(join(root,'submission-template.json'),{manifestHash:digest(manifest),caseId:cases[0].id,product:'ChatGPT',model:'',productVersion:'',runAt:'',tools:[],elapsedSeconds:0,status:'completed',answer:''})
    console.log(`Testprotokoll opprettet: ${cases.length} spørsmål × 3 produkter. Ingen modeller er kjørt.`)
  } else if (command==='blind') {
    const {review,key}=blindBenchmark(await read(join(root,'manifest.json')),await read(input))
    // Never give the key to reviewers. Keep it in a separate access-controlled location.
    if (!ratingsPath) throw new Error('Oppgi egen sti til blindnøkkelen som siste argument')
    await write(resolve(ratingsPath),key)
    await write(join(root,'review.json'),review)
    await write(join(root,'ratings-template.json'),review.cases.flatMap(c=>c.answers.map(a=>({caseId:c.id,label:a.label,criticalError:false,scores:Object.fromEntries(review.dimensions.map(d=>[d,null])),reason:''}))))
    console.log('Blindpakke klar. Del review.json og vurderingsmalen, ikke nøkkelen eller råsvarene.')
  } else if(command==='score') {
    console.log(JSON.stringify(scoreBenchmark(await read(join(root,'review.json')),await read(input),await read(ratingsPath)),null,2))
  } else throw new Error('Bruk: benchmark.mjs prepare <mappe> [testsaker.json] | blind <mappe> <svar.json> <privat-nøkkel.json> | score <mappe> <privat-nøkkel.json> <vurderinger.json>')
} catch(error) {console.error(error.message);process.exitCode=1}
