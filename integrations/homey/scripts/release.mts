// npm run release -- <version> "<ändring på engelska>" "<ändring på svenska>"
// Sätter versionen, skriver ändringsloggen, committar och taggar homey-v<version>.
// Pushen gör du själv. Taggen startar uppladdningen till Athom i CI.

import { execFileSync } from 'node:child_process'
import { addChangelog, readVersions, writeVersion } from './files.mjs'
import { bumpProblem, TAG_PREFIX, versionProblems } from './version.mjs'

const [version, en, sv] = process.argv.slice(2)
const fail = (message: string) => {
  console.error(`✖ ${message}`)
  process.exit(1)
}
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

if (!version || !en || !sv) fail('Användning: npm run release -- 0.4.2 "Text på engelska" "Text på svenska"')
if (git('status', '--porcelain')) fail('Det finns ocommittade ändringar. Committa eller stasha dem först.')
const problem = bumpProblem(readVersions().compose, version)
if (problem) fail(problem)

writeVersion(version)
addChangelog(version, en, sv)
const problems = versionProblems(readVersions())
if (problems.length) fail(problems.join('\n'))

git('add', '.homeycompose/app.json', 'app.json', 'package.json', 'package-lock.json', '.homeychangelog.json')
git('commit', '-m', `Homey-appen ${version}`)
git('tag', TAG_PREFIX + version)
console.log(`✓ ${TAG_PREFIX}${version} är committad och taggad. Pusha med:\n  git push && git push origin ${TAG_PREFIX}${version}`)
