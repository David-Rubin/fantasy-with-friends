import strings from '../i18n.json'

export function t(key: string, vars?: Record<string, string | number>): string {
  const template = (strings as Record<string, string>)[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}
