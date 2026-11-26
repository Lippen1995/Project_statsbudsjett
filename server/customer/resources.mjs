import { randomUUID } from 'node:crypto'

export const customerKinds = new Set(['projects','conversations','files','jobs'])
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
export const resourceId = (kind,id) => customerKinds.has(kind) && (kind === 'jobs' ? /^[a-f0-9]{64}$/.test(id ?? '') : uuid(id))
export function customerError(message, status = 400) { return Object.assign(Error(message), { status }) }

export function customerResources(sql) {
  const view = row => ({ id:row.id,kind:row.kind,title:row.title,projectId:row.project_id,conversationId:row.conversation_id,
    createdAt:row.created_at,updatedAt:row.updated_at })
  async function owned(user,kind,id) {
    if (!user?.id || !resourceId(kind,id)) throw customerError('Innholdet finnes ikke.',404)
    const [row] = await sql.query('SELECT * FROM ft_customer_resource WHERE owner_id=$1 AND kind=$2 AND id=$3',[user.id,kind,id])
    if (!row) throw customerError('Innholdet finnes ikke.',404)
    return view(row)
  }
  async function create(user,kind,{id = randomUUID(),title,projectId,conversationId} = {}) {
    if (!user?.id || !resourceId(kind,id) || typeof title !== 'string' || !title.trim() || title.length > 180) {
      throw customerError('Innholdet mangler gyldig ID eller navn.')
    }
    if (kind === 'projects' && (projectId || conversationId)) throw customerError('Prosjektet kan ikke ha en overordnet samtale eller prosjekt.')
    if (projectId) await owned(user,'projects',projectId)
    if (conversationId) {
      const conversation = await owned(user,'conversations',conversationId)
      if ((conversation.projectId ?? null) !== (projectId ?? null)) throw customerError('Samtalen tilhører et annet prosjekt.',409)
    }
    await sql.query(`INSERT INTO ft_customer_resource(kind,id,owner_id,title,project_id,conversation_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,id) DO NOTHING`,[kind,id,user.id,title.trim(),projectId||null,conversationId||null])
    const result = await owned(user,kind,id)
    if ((result.projectId ?? null) !== (projectId || null) || (result.conversationId ?? null) !== (conversationId || null)) {
      throw customerError('Innholdets tilknytning kan ikke endres ved gjentatt oppretting.',409)
    }
    return result
  }
  return {
    owned, create,
    async list(user,kind) {
      if (!customerKinds.has(kind)) throw customerError('Innholdet finnes ikke.',404)
      return (await sql.query('SELECT * FROM ft_customer_resource WHERE owner_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 200',[user.id,kind])).map(view)
    },
    async rename(user,kind,id,title) {
      if (typeof title !== 'string' || !title.trim() || title.length > 180) throw customerError('Skriv et navn på opptil 180 tegn.')
      await owned(user,kind,id)
      await sql.query('UPDATE ft_customer_resource SET title=$4,updated_at=now() WHERE owner_id=$1 AND kind=$2 AND id=$3',[user.id,kind,id,title.trim()])
      return owned(user,kind,id)
    },
  }
}
