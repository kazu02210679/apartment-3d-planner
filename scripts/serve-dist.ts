import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDirectory = resolve(repositoryRoot, 'dist')
const prefix = '/apartment-planner/'
const portArgument = process.argv.find((argument) => argument.startsWith('--port='))
const port = Number(portArgument?.slice('--port='.length) ?? process.env.PORT ?? '4173')
const prefixOnly = process.argv.includes('--prefix-only')
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function safeFile(pathname: string): string | undefined {
  const publicPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  const candidate = resolve(distDirectory, publicPath)
  return relative(distDirectory, candidate).startsWith('..') ? undefined : candidate
}

createServer((request, response) => {
  const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (requestPath === '/health') {
    response.writeHead(204)
    response.end()
    return
  }
  const isSubpathRequest =
    requestPath === '/apartment-planner' || requestPath.startsWith(prefix)
  if (prefixOnly && !isSubpathRequest) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const relativePath = requestPath.startsWith(prefix)
    ? requestPath.slice(prefix.length)
    : requestPath
  const candidate = safeFile(relativePath)
  const isAssetRequest = relativePath.startsWith('assets/')
  const file =
    candidate && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : undefined

  if (file) {
    response.writeHead(200, {
      'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    createReadStream(file).pipe(response)
    return
  }

  if (!isAssetRequest) {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    })
    createReadStream(resolve(distDirectory, 'index.html')).pipe(response)
    return
  }

  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}).listen(port, '127.0.0.1', () => {
  console.log(`Static release server listening at http://127.0.0.1:${port}${prefix}`)
})
