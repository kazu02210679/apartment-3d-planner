import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageManifest = {
  readonly name: string
  readonly version: string
  readonly license?: string | { readonly type?: string }
  readonly dependencies?: Record<string, string>
}

type Notice = {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly licenseFile: string
  readonly licenseText: string
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(repositoryRoot, 'THIRD_PARTY_NOTICES.md')
const packageJson = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
) as {
  readonly dependencies: Record<string, string>
}

function findPackageDirectory(packageName: string, fromDirectory: string): string {
  let current = fromDirectory
  while (true) {
    const candidate = resolve(current, 'node_modules', packageName)
    if (existsSync(resolve(candidate, 'package.json'))) return candidate
    const parent = dirname(current)
    if (parent === current)
      throw new Error(`Cannot resolve runtime package ${packageName}.`)
    current = parent
  }
}

function licenseEvidence(
  packageDirectory: string,
  license: PackageManifest['license'],
): { readonly file: string; readonly text: string } {
  const file = readdirSync(packageDirectory).find((entry) =>
    /^(license|copying|notice)(\.[a-z0-9]+)?$/i.test(entry),
  )
  if (file) {
    return {
      file,
      text: readFileSync(resolve(packageDirectory, file), 'utf8')
        .replace(/\r\n/g, '\n')
        .trim(),
    }
  }
  const references: Record<string, readonly string[]> = {
    'Apache-2.0': ['@eslint', 'core', 'LICENSE'],
    MIT: ['three', 'LICENSE'],
  }
  const referenceParts = references[licenseExpression(license) ?? '']
  if (referenceParts) {
    const reference = resolve(repositoryRoot, 'node_modules', ...referenceParts)
    if (existsSync(reference)) {
      return {
        file: `${licenseExpression(license)} (reference text from ${referenceParts.slice(0, -1).join('/')}/${referenceParts.at(-1)})`,
        text: readFileSync(reference, 'utf8').replace(/\r\n/g, '\n').trim(),
      }
    }
  }
  throw new Error(`Package ${packageDirectory} has no LICENSE/COPYING/NOTICE evidence.`)
}

function licenseExpression(license: PackageManifest['license']): string | undefined {
  if (typeof license === 'string' && license.trim()) return license
  if (typeof license === 'object' && license?.type) return license.type
  return undefined
}

function runtimeNotices(): Notice[] {
  const visited = new Set<string>()
  const notices: Notice[] = []

  const visit = (name: string, fromDirectory: string) => {
    const packageDirectory = findPackageDirectory(name, fromDirectory)
    const manifest = JSON.parse(
      readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'),
    ) as PackageManifest
    const key = `${manifest.name}@${manifest.version}`
    if (visited.has(key)) return
    visited.add(key)
    const declaredLicense = licenseExpression(manifest.license)
    const evidence = licenseEvidence(packageDirectory, manifest.license)
    notices.push({
      name: manifest.name,
      version: manifest.version,
      license: declaredLicense ?? 'Unspecified (see installed license text)',
      licenseFile: evidence.file,
      licenseText: evidence.text,
    })
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort())
      visit(dependency, packageDirectory)
  }

  for (const dependency of Object.keys(packageJson.dependencies).sort())
    visit(dependency, repositoryRoot)
  return notices.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  )
}

function renderNotices(notices: readonly Notice[]): string {
  const sections = notices.map(
    (notice) =>
      `## ${notice.name}@${notice.version}\n\n- Source: npm package \`${notice.name}@${notice.version}\`\n- License expression: ${notice.license}\n- License evidence: \`${notice.licenseFile}\`\n\n\`\`\`text\n${notice.licenseText}\n\`\`\``,
  )
  return `# Third-party notices\n\nThis file is generated from the complete non-development dependency closure reachable from \`dependencies\` in \`package.json\`. It records package name/version, npm source, declared license expression, and the installed package's LICENSE/COPYING/NOTICE text. It intentionally does not claim to include development-only dependencies.\n\nRegenerate after changing runtime dependencies with \`npm run notices:generate\`, then review and commit the result. \`npm run notices:check\` fails when the committed notice differs or when a runtime package lacks license evidence.\n\n${sections.join('\n\n')}\n`
}

const generated = renderNotices(runtimeNotices())
if (process.argv[2] === 'generate') {
  writeFileSync(outputPath, generated, 'utf8')
  process.stdout.write('Generated complete runtime third-party notices.\n')
} else if (process.argv[2] === 'check') {
  if (
    !existsSync(outputPath) ||
    readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n') !== generated
  ) {
    throw new Error(
      'Third-party notices are missing or stale. Run npm run notices:generate.',
    )
  }
  process.stdout.write('Third-party notices are complete and current.\n')
} else {
  throw new Error('Use notices.ts generate or notices.ts check.')
}
