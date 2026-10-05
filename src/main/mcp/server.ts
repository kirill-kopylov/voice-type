// HTTP-сервер MCP (Streamable HTTP, без сессий). Слушает только 127.0.0.1 и требует токен в Authorization.
import http from 'http'
import { createHash, timingSafeEqual, webcrypto } from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpStatus } from '../../shared/types'
import { createMcpServer, type McpToolsHost } from './tools'

// В Node 18 (Electron 28) глобального crypto нет, а SDK берёт из него randomUUID
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })

const LOOPBACK_ADDRESS = '127.0.0.1'
const MCP_PATH = '/mcp'
const MAX_BODY_BYTES = 1024 * 1024

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest()

function isAuthorized(header: string | undefined, token: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  // Хэши одной длины — timingSafeEqual не бросает и не выдаёт длину токена по времени ответа
  return token.length > 0 && timingSafeEqual(sha256(presented), sha256(token))
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendJsonRpcError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null })
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Тело запроса слишком большое'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch {
        reject(new Error('Некорректный JSON'))
      }
    })
    req.on('error', reject)
  })
}

export class McpHttpServer {
  private httpServer: http.Server | null = null
  private port = 0
  private lastError: string | undefined

  constructor(private readonly host: McpToolsHost) {}

  getStatus(): McpStatus {
    return {
      running: this.httpServer?.listening ?? false,
      url: this.httpServer?.listening ? `http://${LOOPBACK_ADDRESS}:${this.port}${MCP_PATH}` : '',
      error: this.lastError
    }
  }

  async start(port: number, token: string): Promise<McpStatus> {
    await this.stop()
    this.port = port
    this.lastError = undefined

    const server = http.createServer((req, res) => {
      this.handle(req, res, token).catch((error: Error) => {
        console.error('[mcp] ошибка запроса:', error)
        if (!res.headersSent) sendJsonRpcError(res, 500, 'Internal server error')
      })
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, LOOPBACK_ADDRESS, () => {
          server.off('error', reject)
          resolve()
        })
      })
      this.httpServer = server
      console.log(`[mcp] слушаю http://${LOOPBACK_ADDRESS}:${port}${MCP_PATH}`)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      this.lastError = code === 'EADDRINUSE' ? `Порт ${port} занят — выберите другой` : `Не удалось запустить: ${(error as Error).message}`
      console.error('[mcp]', this.lastError)
    }
    return this.getStatus()
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    this.httpServer = null
    this.lastError = undefined
    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse, token: string): Promise<void> {
    // Защита от DNS-rebinding: обращаться можно только по адресу loopback
    const allowedHosts = [`${LOOPBACK_ADDRESS}:${this.port}`, `localhost:${this.port}`]
    if (!req.headers.host || !allowedHosts.includes(req.headers.host)) {
      return sendJsonRpcError(res, 403, 'Forbidden host')
    }
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== MCP_PATH) {
      return sendJson(res, 404, { error: `Not found. MCP endpoint: ${MCP_PATH}` })
    }
    if (!isAuthorized(req.headers.authorization, token)) {
      res.setHeader('WWW-Authenticate', 'Bearer')
      return sendJsonRpcError(res, 401, 'Unauthorized: send the token as "Authorization: Bearer <token>"')
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJsonRpcError(res, 405, 'Method not allowed')
    }

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch (error) {
      return sendJsonRpcError(res, 400, (error as Error).message)
    }

    // Без сессий: на каждый запрос — свой сервер и транспорт, состояния между вызовами нет
    const mcpServer = createMcpServer(this.host)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void mcpServer.close()
    })
    await mcpServer.connect(transport)
    await transport.handleRequest(req, res, body)
  }
}
