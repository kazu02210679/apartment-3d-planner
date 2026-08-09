import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDirectory = resolve(repositoryRoot, 'dist')
const prefix = '/apartment-planner/'
const port = Number(process.env.PORT ?? '4173')
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
  const relativePath = requestPath.startsWith(prefix)
    ? requestPath.slice(prefix.length)
    : requestPath === '/apartment-planner'
      ? ''
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
