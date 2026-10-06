import { createServer } from 'http'
import { createHmac, timingSafeEqual } from 'crypto'
import { networkInterfaces } from 'os'
import { Server } from 'socket.io'

const LAN_PORT = 47821
/** Подпись телефона живёт минуту: хватает на расхождение часов, перехваченную позже не применить */
const PROOF_TTL_MS = 60_000
const PRIVATE_IPV4 = /^(10\.\d{1,3}|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/
const PROOF_PATTERN = /^[0-9a-f]{64}$/

/** Чем вероятнее адрес домашней сети, тем раньше его пробует телефон: 10.x — часто VPN, 172.x — WSL и Hyper-V */
const addressRank = (ip: string): number => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2)

/** Адреса этого компьютера в домашней сети — их ретранслятор передаёт телефону. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal && PRIVATE_IPV4.test(address.address))
    .sort((a, b) => addressRank(a.address) - addressRank(b.address))
    .map((address) => `${address.address}:${LAN_PORT}`)
}

/**
 * Прямая связь с телефоном в той же сети: задержка — миллисекунды вместо пути через сервер.
 * В домашней сети нет TLS, поэтому ключ пары по ней не передаётся: телефон шлёт HMAC ключа от своей метки
 * времени, и каждая подпись принимается один раз.
 */
class RemoteControlLan {
  private server: Server | null = null
  private readonly usedProofs = new Map<string, number>()

  start(key: string, onCommand: (payload: object) => void): void {
    this.stop()
    const http = createServer()
    const server = new Server(http, { path: '/socket.io/', transports: ['websocket'], serveClient: false })
    const namespace = server.of('/remote-control')
    namespace.use((socket, next) => {
      const { ts, proof } = socket.handshake.auth as { ts?: number; proof?: string }
      next(this.accepts(key, ts, proof) ? undefined : new Error('unauthorized'))
    })
    namespace.on('connection', (socket) => {
      socket.emit('presence', { desktop: true, lan: [] })
      socket.on('command', (payload: object) => onCommand(payload))
    })
    http.on('error', (error) => console.warn('[remote] сервер в домашней сети не поднялся:', error.message))
    http.listen(LAN_PORT, '0.0.0.0')
    this.server = server
  }

  stop(): void {
    this.server?.close()
    this.server = null
    this.usedProofs.clear()
  }

  private accepts(key: string, ts: number | undefined, proof: string | undefined): boolean {
    const now = Date.now()
    if (typeof ts !== 'number' || Math.abs(now - ts) > PROOF_TTL_MS) return false
    if (typeof proof !== 'string' || !PROOF_PATTERN.test(proof) || this.usedProofs.has(proof)) return false
    const expected = createHmac('sha256', key).update(`lan:${ts}`).digest()
    if (!timingSafeEqual(expected, Buffer.from(proof, 'hex'))) return false

    for (const [used, expiresAt] of this.usedProofs) if (expiresAt < now) this.usedProofs.delete(used)
    this.usedProofs.set(proof, now + PROOF_TTL_MS * 2)
    return true
  }
}

export const remoteControlLan = new RemoteControlLan()
