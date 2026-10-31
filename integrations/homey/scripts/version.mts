// Appens version finns på tre ställen och i ändringsloggen. De ska alltid stämma överens.

export interface Versions {
  /** .homeycompose/app.json, källan som Homeys CLI utgår från */
  compose: string
  app: string
  pkg: string
  changelog: Record<string, { en?: string; sv?: string }>
  /** Git-taggen vid en release, till exempel "homey-v0.4.2" */
  tag?: string
}

export const TAG_PREFIX = 'homey-v'

export function versionProblems({ compose, app, pkg, changelog, tag }: Versions): string[] {
  const problems: string[] = []
  for (const [file, version] of [['app.json', app], ['package.json', pkg]]) {
    if (version !== compose) problems.push(`${file} har ${version}, .homeycompose/app.json har ${compose}`)
  }
  for (const lang of ['en', 'sv'] as const) {
    if (!changelog[compose]?.[lang]) problems.push(`.homeychangelog.json saknar ${lang} för ${compose}`)
  }
  if (tag !== undefined && tag !== TAG_PREFIX + compose) problems.push(`taggen ${tag} stämmer inte med versionen ${compose}`)
  return problems
}

const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null)

/** Varför `next` inte duger som ny version, eller null om den duger. */
export function bumpProblem(current: string, next: string): string | null {
  const [a, b] = [parse(current), parse(next)]
  if (!b) return `${next} är inte en version på formen x.y.z`
  const diff = a!.map((n, i) => b[i] - n).find((d) => d !== 0) ?? 0
  return diff > 0 ? null : `${next} är inte högre än ${current}`
}
