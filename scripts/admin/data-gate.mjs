import { getSql } from '../neon/postgres.mjs'

try {
  const sql = getSql({direct:true})
  let rows
  try { rows=await sql.query("SELECT data FROM ft_admin_records WHERE collection='preferences' AND id='data-release-gate'") }
  catch(error) { if(error.code!=='42P01')throw error; rows=[] }
  const restore=process.env.DATA_SOURCE==='snapshot'
  if(restore) {
    if(!/^[a-f0-9]{64}$/.test(process.env.DATA_SNAPSHOT || '')||!/^[a-f0-9]{64}$/.test(process.env.EXPECTED_SNAPSHOT || ''))throw Error('Tilbakeføring mangler kontrollerte versjonsreferanser.')
    const active=await sql.query("SELECT snapshot_id FROM fellestall_data.active_snapshot WHERE slot='production'")
    const target=await sql.query("SELECT id FROM fellestall_data.snapshot WHERE id=$1 AND state='verified'",[process.env.DATA_SNAPSHOT])
    if(active[0]?.snapshot_id!==process.env.EXPECTED_SNAPSHOT||!target.length)throw Error('Dataversjonen er endret eller målet er ikke verifisert. Gjeldende nettsted beholdes.')
  } else if(rows[0]?.data?.held)throw Error('Administrator har holdt tilbake dataoppdateringer. Gjeldende nettsted beholdes.')
  console.log(restore?'Verifisert tilbakeføring og gjeldende dataversjon er kontrollert.':'Administratorens publiseringssperre er kontrollert.')
} catch(error) { console.error(error.code?'Datakontrollen kunne ikke fullføres. Gjeldende nettsted beholdes.':error.message);process.exitCode=1 }
