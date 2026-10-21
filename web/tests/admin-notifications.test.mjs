import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationDestination } from '../src/admin/notificationDestination.js'

test('Sven-varsler åpner arbeidsloggen i admin', () => {
  const destination = notificationDestination('sven')
  assert.equal(destination.section, 'sven')
  assert.equal(destination.href, '/admin/#sven')
  assert.match(destination.label, /arbeidslogg/)
})

test('jobbvarsler beholder lenken til den konkrete GitHub-kjøringen', () => {
  for (const suffix of ['39428178909', '39428178909/attempts/2']) {
    const href = `https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/${suffix}`
    const destination = notificationDestination(href)
    assert.equal(destination.href, href)
    assert.equal(destination.external, true)
    assert.match(destination.label, /feilsteg/)
  }
})

test('varseldata kan ikke lage lenker til vilkårlige sider eller kjøre skript', () => {
  for (const resource of [
    'javascript:alert(1)',
    'http://github.com/Lippen1995/Project_statsbudsjett/actions/runs/1',
    'https://github.com.evil.example/Lippen1995/Project_statsbudsjett/actions/runs/1',
    'https://github.com@evil.example/Lippen1995/Project_statsbudsjett/actions/runs/1',
    'https://user:pass@github.com/Lippen1995/Project_statsbudsjett/actions/runs/1',
    'https://github.com:444/Lippen1995/Project_statsbudsjett/actions/runs/1',
    'https://github.com/someone/another-repo/actions/runs/1',
    'https://github.com/Lippen1995/Project_statsbudsjett/issues/1',
    'https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/1?redirect=elsewhere',
    'https://github.com/Lippen1995/Project_statsbudsjett/actions/runs/1#untrusted',
    '__proto__',
    'constructor',
  ])
    assert.equal(notificationDestination(resource), null, resource)
})

test('eldre varsler uten gjenkjent mål kan fortsatt vise detaljer uten lenke', () => {
  for (const resource of [null, undefined, '', 'ukjent'])
    assert.equal(notificationDestination(resource), null)
})
