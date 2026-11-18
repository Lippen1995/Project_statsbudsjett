import {readFile} from 'node:fs/promises'
import {configuredRegistry} from '../../server/sven/learning-config.mjs'
try {
  const [command,path]=process.argv.slice(2)
  const registry=await configuredRegistry()
  try {
    if(command==='current')console.log(JSON.stringify(registry.current(),null,2))
    else if(command==='propose')console.log(JSON.stringify(registry.propose(JSON.parse(await readFile(path,'utf8'))),null,2))
    else if(command==='apply')console.log(JSON.stringify(registry.apply(JSON.parse(await readFile(path,'utf8'))),null,2))
    else throw new Error('Bruk: learning.mjs current | propose <kandidat.json> | apply <signert-rapport.json>')
  }finally{registry.close()}
}catch(error){console.error(error.message);process.exitCode=1}
