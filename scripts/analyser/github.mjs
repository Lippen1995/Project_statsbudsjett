export function githubClient({
  token = process.env.GH_TOKEN,
  repository = process.env.GITHUB_REPOSITORY,
} = {}) {
  if (!token || !repository || !/^[-\w.]+\/[-\w.]+$/.test(repository))
    throw Error('GitHub-tilgang og repository mangler')
  const api = async (path, { method = 'GET', body, allow404 = false } = {}) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    })
    if (response.status === 404 && allow404) return null
    if (!response.ok) {
      if (response.status === 403 && method === 'POST' && path.endsWith('/pulls')) {
        const detail = await response.json().catch(() => null)
        if (
          detail?.message === 'GitHub Actions is not permitted to create or approve pull requests.'
        )
          throw Error(
            'GitHub Actions har ikke tillatelse til å opprette pull requests. Aktiver «Allow GitHub Actions to create and approve pull requests» i repositoryets Actions-innstillinger.',
          )
      }
      throw Error(`GitHub ${method} ${path.split('?')[0]}: HTTP ${response.status}`)
    }
    return response.status === 204 ? {} : response.json()
  }
  const root = `/repos/${repository}`
  const pages = async (path) => {
    const all = []
    for (let page = 1; page <= 20; page++) {
      const rows = await api(
        `${root}${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
      )
      if (!Array.isArray(rows)) throw Error('Uleselig GitHub-liste')
      all.push(...rows)
      if (rows.length < 100) return all
    }
    throw Error('GitHub-listen er for stor til en fullstendig sikker gjennomgang')
  }
  const content = async (path, ref = 'main') => {
    let file = await api(`${root}/contents/${path}?ref=${encodeURIComponent(ref)}`, {
      allow404: true,
    })
    if (!file) return null
    if (file.type !== 'file') throw Error('Uventet innholdsfil')
    // Contents API omits base64 for files above one MiB; the blob API supports
    // the growing archive without treating an incomplete response as empty.
    if (file.encoding === 'none') file = await api(`${root}/git/blobs/${file.sha}`)
    if (file.encoding !== 'base64') throw Error('Uventet innholdsfil')
    return {
      sha: file.sha,
      value: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')),
    }
  }
  const permission = async (login) => {
    const result = await api(`${root}/collaborators/${encodeURIComponent(login)}/permission`, {
      allow404: true,
    })
    return ['admin', 'write', 'maintain'].includes(result?.permission)
  }
  const commit = async (branch, parent, changes, message, { mergeParent = null } = {}) => {
    const previous = await api(`${root}/git/commits/${parent}`)
    const tree = []
    for (const [path, value] of Object.entries(changes)) {
      if (value === null) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null })
        continue
      }
      const blob = await api(`${root}/git/blobs`, {
        method: 'POST',
        body: { content: JSON.stringify(value, null, 2) + '\n', encoding: 'utf-8' },
      })
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
    }
    const newTree = await api(`${root}/git/trees`, {
      method: 'POST',
      body: { base_tree: previous.tree.sha, tree },
    })
    const next = await api(`${root}/git/commits`, {
      method: 'POST',
      body: { message, tree: newTree.sha, parents: mergeParent ? [parent, mergeParent] : [parent] },
    })
    // Never force: a concurrently changed branch must cause a failure.
    await api(`${root}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: { sha: next.sha, force: false },
    })
    return next.sha
  }
  return { api, root, pages, content, permission, commit, repository }
}
