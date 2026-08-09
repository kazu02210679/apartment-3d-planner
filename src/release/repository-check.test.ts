import { describe, expect, it } from 'vitest'

import { scanRepositoryFiles } from './repository-check'

const requiredFiles = [
  'README.md',
  'LICENSE',
  'docs/architecture.md',
  'docs/scene-format.md',
  'docs/catalog-extension.md',
  'docs/assets.md',
  'public/samples/future-workstation-apartment.json',
]

function publicFiles(extra: Record<string, string> = {}) {
  return new Map<string, string>([
    ...requiredFiles.map((path): readonly [string, string] => [
      path,
      path.endsWith('.md') ? '# Public\n' : '{}',
    ]),
    ...Object.entries(extra),
  ])
}

describe('repository public-release check', () => {
  it('reports only rule names for meaningful public safety failures', () => {
    const violations = scanRepositoryFiles(
      publicFiles({
        'src/runtime.ts':
          "fetch('https://example.invalid')\nconst apiToken = 'supersecretvalue'\n",
        'README.md': '[missing](docs/missing.md)\nC:\\Users\\planner\\draft.json\n',
      }),
    )

    expect(violations).toContain('README.md:broken-relative-link')
    expect(violations).toContain('src/runtime.ts:runtime-network-api')
    expect(violations).toContain('src/runtime.ts:suspicious-secret-assignment')
    expect(violations).toContain('README.md:absolute-local-path')
    expect(violations.join('\n')).not.toContain('supersecretvalue')
  })

  it('excludes tests and documentation examples while still requiring public files', () => {
    const files = publicFiles({
      'src/runtime.test.ts': "fetch('https://example.invalid')\n",
      'docs/examples/example.md': 'OPENAI_API_KEY=example-only\n',
    })
    files.delete('docs/assets.md')

    expect(scanRepositoryFiles(files)).toEqual(['docs/assets.md:missing-required-file'])
  })

  it('keeps the scanner self-exclusion narrow while production source remains checked', () => {
    const violations = scanRepositoryFiles(
      publicFiles({
        'src/release/repository-check.ts': 'const pattern = /fetch/\n',
        'src/network-client.ts': 'new WebSocket("wss://example.invalid")\n',
      }),
    )

    expect(violations).not.toContain(
      'src/release/repository-check.ts:runtime-network-api',
    )
    expect(violations).toContain('src/network-client.ts:runtime-network-api')
  })

  it('catches modern credentials, private material, and every production remote-loading form', () => {
    const violations = scanRepositoryFiles(
      publicFiles({
        'src/keys.ts': "const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'\n",
        'src/google.ts': "const key = 'AIzaabcdefghijklmnopqrstuvwxyz0123456789_'\n",
        'src/remote-style.css':
          "main { background: url('https://example.invalid/image.png'); }\n",
        'src/imported-style.css': '@import "https://example.invalid/style.css";\n',
        'src/lazy.ts': "await import('https://example.invalid/module.js')\n",
        'index.html': '<img src="https://example.invalid/image.png">\n',
        'e2e/accident.spec.ts':
          "const credential = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'\n",
        '.npmrc': 'registry=https://registry.npmjs.org/\n',
        'config/service-account.json': '{}\n',
        'certs/release.cer': 'certificate\n',
      }),
    )

    expect(violations).toContain('src/keys.ts:token-pattern')
    expect(violations).toContain('src/google.ts:token-pattern')
    expect(violations).toContain('src/remote-style.css:runtime-network-api')
    expect(violations).toContain('src/imported-style.css:runtime-network-api')
    expect(violations).toContain('src/lazy.ts:runtime-network-api')
    expect(violations).toContain('index.html:runtime-network-api')
    expect(violations).toContain('e2e/accident.spec.ts:token-pattern')
    expect(violations).toContain('.npmrc:private-credential-file')
    expect(violations).toContain('config/service-account.json:private-credential-file')
    expect(violations).toContain('certs/release.cer:private-credential-file')
  })

  it('allows only exact placeholder assignments in an environment example and skips binary bytes', () => {
    const safeExample = publicFiles({
      '.env.example': "API_TOKEN='example'\n",
      'public/logo.png': 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789\n',
      'docs/assets.md': '# Public\nlogo.png\n',
    })
    const unsafeExample = publicFiles({
      '.env.example': "API_TOKEN='not-a-placeholder'\n",
    })

    expect(scanRepositoryFiles(safeExample)).toEqual([])
    expect(scanRepositoryFiles(unsafeExample)).toContain(
      '.env.example:suspicious-secret-assignment',
    )
  })
})
