const sections = {
  sven: 'Åpne Svens arbeidslogg',
  drift: 'Se driftsstatus og jobber',
  data: 'Se datakvalitet',
  ytelse: 'Se ytelsesmålinger',
  overvaking: 'Se overvåking og forbruk',
}

export function notificationDestination(resource) {
  if (Object.hasOwn(sections, resource))
    return {
      section: resource,
      href: `/admin/#${resource}`,
      label: sections[resource],
    }
  if (typeof resource !== 'string') return null
  try {
    const url = new URL(resource)
    if (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/Lippen1995\/Project_statsbudsjett\/actions\/runs\/\d+(?:\/attempts\/\d+)?\/?$/i.test(
        url.pathname,
      )
    )
      return {
        href: url.href,
        label: 'Åpne kjøring og feilsteg i GitHub',
        external: true,
      }
  } catch {
    // Old notifications can lack a destination; their details remain readable.
  }
  return null
}
