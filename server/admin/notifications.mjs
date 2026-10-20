import { randomUUID } from 'node:crypto'
import { recordStore } from './core.mjs'

export function notificationService(sql) {
  return {
    async publish({
      key,
      type,
      severity,
      title,
      detail,
      resource = null,
      resolved = false,
    }) {
      await sql.query(
        `INSERT INTO ft_admin_notifications(id,dedupe_key,type,severity,title,detail,resource,resolved_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END
        WHERE NOT $8 OR EXISTS(SELECT 1 FROM ft_admin_notifications WHERE dedupe_key=$2)
        ON CONFLICT(dedupe_key) DO UPDATE SET title=EXCLUDED.title,detail=EXCLUDED.detail,
          severity=EXCLUDED.severity,opened_at=CASE WHEN NOT $8 AND ft_admin_notifications.resolved_at IS NOT NULL THEN now() ELSE ft_admin_notifications.opened_at END,resolved_at=CASE WHEN $8 THEN COALESCE(ft_admin_notifications.resolved_at,now()) ELSE NULL END`,
        [randomUUID(), key, type, severity, title, detail, resource, resolved],
      )
    },
    async list({ type = '', severity = '' } = {}) {
      const [items, acknowledgements, recipients, deliveries] =
        await Promise.all([
          sql.query(
            `SELECT * FROM ft_admin_notifications WHERE ($1='' OR type=$1) AND ($2='' OR severity=$2)
          ORDER BY created_at DESC LIMIT 150`,
            [type, severity],
          ),
          recordStore(sql).list('acknowledgements'),
          recordStore(sql).list('recipients'),
          sql.query(
            'SELECT id,recipient,type,subject,status,error_code,attempts,created_at,sent_at FROM ft_admin_deliveries ORDER BY created_at DESC LIMIT 50',
          ),
        ])
      return {
        items: items.map((item) => ({
          ...item,
          acknowledged: acknowledgements.some(
            (a) => a.data.key === item.dedupe_key && a.data.acknowledged,
          ),
        })),
        recipients,
        deliveries,
      }
    },
  }
}
