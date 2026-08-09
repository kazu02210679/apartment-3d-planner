import { posix } from 'node:path'

const requiredPublicFiles = [
  'README.md',
  'LICENSE',
  'docs/architecture.md',
  'docs/scene-format.md',
  'docs/catalog-extension.md',
  'docs/assets.md',
  'public/samples/future-workstation-apartment.json',
]

const privateFilePattern =
  /(^|\/)(\.env(?!\.example$)|\.npmrc|[^/]+\.(pem|key|p12|pfx|crt|cer|der)|(?:service-account|credentials?)\.json)$/i
const binaryAssetPattern =
  /\.(png|jpe?g|gif|webp|avif|svg|glb|gltf|fbx|obj|mp3|wav|mp4|webm)$/i
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g
const secretValuePattern =
  /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/
const secretAssignmentPattern =
  /\b(password|secret|token|api[_-]?(key|token))\b\s*[:=]\s*['"]([^'"]*)['"]/gi
const backslash = String.fromCharCode(92)
const windowsDrive = '[A-Za-z]' + ':'
const localPathPattern = new RegExp(
  [
    `${windowsDrive}${backslash}${backslash}`,
    `${windowsDrive}/(?!/)`,
    `${backslash}${backslash}${backslash}${backslash}`,
    'file' + '://',
    '/' + 'Users/',
    '/' + 'home/',
  ].join('|'),
)
const runtimeNetworkPattern =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b|(?:from\s*|import\s*\(\s*|@import\s*)['"]https?:\/\/|url\(\s*['"]?https?:\/\/|(?:src|href)\s*=\s*['"]https?:\/\//i
const placeholderSecretValuePattern =
  /^(?:|example(?:[-_ ](?:key|token|value))?|your[-_ ]?(?:api[-_ ]?)?(?:key|token)|changeme|replace[-_ ]?me|redacted|<[^>]+>)$/i

function isExplicitContentCheckExclusion(path: string): boolean {
  return (
    path.startsWith('docs/examples/') || path === 'src/release/repository-check.test.ts'
  )
}

function isRuntimeNetworkCheckExclusion(path: string): boolean {
  return (
    path.includes('/fixtures/') ||
    path.includes('.test.') ||
    path.startsWith('e2e/') ||
    path === 'src/release/repository-check.ts'
  )
}

function resolveMarkdownLink(sourcePath: string, target: string): string | undefined {
  const trimmed = target.trim().replace(/^<|>$/g, '')
  if (!trimmed || trimmed.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return undefined
  }
  const pathname = trimmed.split(/[?#]/, 1)[0]
  if (!pathname) return undefined
  const resolved = posix.normalize(posix.join(posix.dirname(sourcePath), pathname))
  return resolved.startsWith('../') || resolved === '..' ? undefined : resolved
}

function hasNonPlaceholderSecretAssignment(content: string): boolean {
  return [...content.matchAll(secretAssignmentPattern)].some(
    (match) => !placeholderSecretValuePattern.test(match[3]!.trim()),
  )
}

export function scanRepositoryFiles(files: ReadonlyMap<string, string>): string[] {
  const violations = new Set<string>()
  const assetsDocument = files.get('docs/assets.md') ?? ''

  for (const required of requiredPublicFiles) {
    if (!files.has(required)) violations.add(`${required}:missing-required-file`)
  }

  for (const [path, content] of files) {
    if (path === 'README.md' || path.startsWith('docs/')) {
      for (const match of content.matchAll(markdownLinkPattern)) {
        const target = resolveMarkdownLink(path, match[1]!)
        if (target && !files.has(target)) violations.add(`${path}:broken-relative-link`)
      }
    }
    if (!isExplicitContentCheckExclusion(path)) {
      if (localPathPattern.test(content)) violations.add(`${path}:absolute-local-path`)
    }
    if (privateFilePattern.test(path)) violations.add(`${path}:private-credential-file`)
    if (binaryAssetPattern.test(path)) {
      if (!assetsDocument.includes(posix.basename(path))) {
        violations.add(`${path}:undocumented-binary-asset`)
      }
      continue
    }
    if (!isExplicitContentCheckExclusion(path)) {
      if (secretValuePattern.test(content)) violations.add(`${path}:token-pattern`)
      if (hasNonPlaceholderSecretAssignment(content)) {
        violations.add(`${path}:suspicious-secret-assignment`)
      }
    }
    if (
      (path === 'index.html' || path.startsWith('src/')) &&
      !isRuntimeNetworkCheckExclusion(path) &&
      runtimeNetworkPattern.test(content)
    ) {
      violations.add(`${path}:runtime-network-api`)
    }
  }

  return [...violations].sort()
}
