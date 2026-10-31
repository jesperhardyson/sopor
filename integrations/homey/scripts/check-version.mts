// npm run check:version [-- --tag homey-v0.4.2]: versionerna och ändringsloggen stämmer.

import { readVersions } from './files.mjs'
import { versionProblems } from './version.mjs'

const tagIndex = process.argv.indexOf('--tag')
const problems = versionProblems({ ...readVersions(), tag: tagIndex > 0 ? process.argv[tagIndex + 1] : undefined })
for (const problem of problems) console.error(`✖ ${problem}`)
if (problems.length) process.exit(1)
console.log(`✓ Version ${readVersions().compose} stämmer överallt`)
