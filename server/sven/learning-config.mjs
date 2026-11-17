import {readFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {openLearningRegistry,builtinSettings,candidateId} from './learning.mjs'

export async function configuredRegistry(path=process.env.SVEN_LEARNING_CONFIG) {
  if(!path)throw new Error('SVEN_LEARNING_CONFIG må peke til kontrollørens private konfigurasjon')
  const config=JSON.parse(await readFile(path,'utf8'))
  return openLearningRegistry(resolve(dirname(path),config.registryPath),config)
}
export async function activeLearningProfile() {
  if(!process.env.SVEN_LEARNING_CONFIG)return {id:candidateId(builtinSettings),settings:builtinSettings}
  const registry=await configuredRegistry()
  try {return registry.current()}finally{registry.close()}
}
