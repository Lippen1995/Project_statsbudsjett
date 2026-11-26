import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { openLearningRegistry } from '../../server/sven/learning.mjs'
import { fileURLToPath } from 'node:url'
import { digest } from './editorial-policy.mjs'
import { withEditorialExamples } from './learning-context.mjs'
export const skillRoot = fileURLToPath(new URL('../../editorial/skills/', import.meta.url))
export const stageSkills = Object.freeze({
  research: ['research'], angle: ['storytelling'], draft: ['storytelling', 'language'],
  visual: ['visual'], language: ['language'], factcheck: ['research', 'review'],
  editor: ['review'], learning: ['learning'],
})
export function loadSkills(stage, { query = '', limit = 6, root = skillRoot, packet } = {}) {
  const registry = JSON.parse(readFileSync(root + 'registry.json', 'utf8'))
  let activeHashes
  if (process.env.SVEN_LEARNING_CONFIG) {
    const path = process.env.SVEN_LEARNING_CONFIG
    const config = JSON.parse(readFileSync(path, 'utf8'))
    const learning = openLearningRegistry(resolve(dirname(path), config.registryPath), config)
    try { activeHashes = learning.current().settings.editorialSkills ?? {} } finally { learning.close() }
  }
  const skills = (stageSkills[stage] ?? []).map(id => {
    let entry = registry.skills[id]
    if (activeHashes && ['language', 'storytelling', 'visual'].includes(id)) {
      const hash = activeHashes[id]
      const file = hash ? readdirSync(root).find(name => new RegExp(`^${id}-v[1-9][0-9]*\\.md$`).test(name) && digest(readFileSync(root+name,'utf8')) === hash) : `${id}-v1.md`
      if (!file) throw Error('Den godkjente skill-versjonen finnes ikke lokalt')
      entry = {file,hash:hash ?? digest(readFileSync(root+file,'utf8')),version:Number(/-v(\d+)\.md$/.exec(file)[1])}
    }
    if (!entry || !/^[a-z-]+-v[1-9][0-9]*\.md$/.test(entry.file)) throw Error('Ugyldig skill-versjon')
    const content = readFileSync(root + entry.file, 'utf8')
    if (digest(content) !== entry.hash) throw Error('Skill-innholdet samsvarer ikke med registrert hash')
    return { id, ...entry, content }
  })
  const preferences = JSON.parse(readFileSync(new URL('../../editorial/learning/preferences.json', import.meta.url), 'utf8'))
  const terms = new Set(query.toLowerCase().split(/[^\p{L}]+/u).filter(x => x.length > 3))
  const rules = preferences.rules.filter(r => r.status === 'active' && !r.supersededBy &&
    (!r.validUntil || Date.parse(r.validUntil) > Date.now()) &&
    (stage !== 'learning' || r.scope === 'learning'))
    .map(r => ({ ...r, relevance: [...terms].filter(t => r.rule.toLowerCase().includes(t)).length }))
    .sort((a, b) => b.relevance - a.relevance || b.id.localeCompare(a.id)).slice(0, limit)
  return { stage, skills, rules, examples: packet ? withEditorialExamples(packet).editorialExamples ?? [] : [],
    hash: digest(skills.map(({ id, version, hash }) => ({ id, version, hash }))) }
}
