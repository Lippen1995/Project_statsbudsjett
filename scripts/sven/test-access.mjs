// Explicit operator identity for model/file unit tests. Customer integration
// tests use real Better Auth sessions and PostgreSQL ownership records.
import { randomUUID } from 'node:crypto'
import { hostedPreview as createHostedPreview } from './hosted-preview.mjs'
import { previewFiles as createPreviewFiles } from './preview-files.mjs'
import { previewWatch as createPreviewWatch } from './preview-watch.mjs'

const access={authorize:async()=>({id:'test-operator'}),owned:async()=>({}),claimJob:async()=>({}),createFile:async()=>({id:randomUUID()})}
export const hostedPreview=options=>createHostedPreview({access,...options})
export const previewFiles=options=>createPreviewFiles({access,...options})
export const previewWatch=options=>createPreviewWatch({access,...options})
