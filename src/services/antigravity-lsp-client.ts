import https from 'node:https'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { formatCountdown } from '../common/time-utils.js'
import type { AccountConfig, AccountUsage, ModelQuotaDetail, QuotaInfo } from '../common/types.js'

const execFileAsync = promisify(execFile)

interface LspEndpoint { pid: number; csrf: string; port: number; proto: 'https' | 'http' }

interface ModelConfig {
  label?: string
  modelId?: string
  quotaInfo?: { remainingFraction?: number; resetTime?: string }
}

/**
 * agy CLI 가 없을 때 실행 중인 Antigravity language_server 에 직접 GetUserStatus 를 질의한다 (읽기 전용).
 * 프로세스/포트 탐색은 비용이 크므로(PowerShell spawn) 성공한 엔드포인트를 캐시하고 실패 시에만 재탐색한다.
 */
export class AntigravityLspClient {
  private static endpoint: LspEndpoint | null = null

  private static async discover(): Promise<LspEndpoint | null> {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name like 'language_server%'\" | ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
    ], { windowsHide: true, timeout: 5000 })

    const procs = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!procs.length) return null

    const { stdout: net } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP'], { windowsHide: true, timeout: 5000 })
    const netLines = net.split(/\r?\n/).filter(l => l.includes('LISTENING'))

    for (const line of procs) {
      const sep = line.indexOf('|')
      const pid = parseInt(line.slice(0, sep), 10)
      const csrf = /--csrf_token[= ](\S+)/.exec(line.slice(sep + 1))?.[1]
      if (!pid || !csrf) continue
      const ports = [...new Set(netLines
        .filter(l => l.trim().split(/\s+/).pop() === String(pid))
        .map(l => /127\.0\.0\.1:(\d+)/.exec(l)?.[1])
        .filter((p): p is string => !!p)
        .map(Number))]
      for (const port of ports) {
        for (const proto of ['https', 'http'] as const) {
          const ep = { pid, csrf, port, proto }
          try {
            await this.request(ep)
            return ep
          } catch { /* 다음 후보 */ }
        }
      }
    }
    return null
  }

  private static request(ep: LspEndpoint): Promise<any> {
    const body = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'ko' } })
    const mod = ep.proto === 'https' ? https : http
    return new Promise((resolve, reject) => {
      const req = mod.request({
        host: '127.0.0.1', port: ep.port, method: 'POST',
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        rejectUnauthorized: false, timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': ep.csrf,
          'Content-Length': Buffer.byteLength(body)
        }
      }, res => {
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
          try {
            const json = JSON.parse(data)
            if (!json.userStatus) return reject(new Error('userStatus 없음'))
            resolve(json)
          } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.end(body)
    })
  }

  private static quotaOf(fraction: number, resetTime?: string): QuotaInfo {
    const percentLeft = Math.round(fraction * 100)
    return {
      remainingFraction: fraction,
      percentLeft,
      percentUsed: 100 - percentLeft,
      resetTime,
      resetCountdown: formatCountdown(resetTime),
      isExhausted: fraction <= 0.01
    }
  }

  /** language_server 가 없으면 null (호출 측에서 에러 처리) */
  public static async fetchUsage(account: AccountConfig): Promise<AccountUsage | null> {
    let json: any
    try {
      if (!this.endpoint) this.endpoint = await this.discover()
      if (!this.endpoint) return null
      json = await this.request(this.endpoint)
    } catch {
      // 포트/토큰이 바뀌었을 수 있다 (IDE 재시작). 한 번만 재탐색
      this.endpoint = await this.discover().catch(() => null)
      if (!this.endpoint) return null
      json = await this.request(this.endpoint)
    }

    const status = json.userStatus
    const configs: ModelConfig[] = status.cascadeModelConfigData?.clientModelConfigs ?? []
    const now = Date.now()
    const SHORT_WINDOW_MS = 6 * 3600 * 1000

    const models: ModelQuotaDetail[] = []
    let primary: { f: number; reset?: string } | undefined
    let weekly: { f: number; reset?: string } | undefined

    for (const m of configs) {
      const f = m.quotaInfo?.remainingFraction
      // remainingFraction 이 생략되면 0(소진)으로 오는 경우가 있다 — quotaInfo 자체가 있을 때만 0 으로 간주
      const frac = typeof f === 'number' && Number.isFinite(f) ? f : (m.quotaInfo ? 0 : null)
      if (frac === null) continue
      const reset = m.quotaInfo?.resetTime
      models.push({ modelId: m.modelId || m.label || 'model', displayName: m.label || m.modelId || 'model', quota: this.quotaOf(frac, reset) })
      const resetMs = reset ? Date.parse(reset) - now : Infinity
      if (resetMs <= SHORT_WINDOW_MS) {
        if (!primary || frac < primary.f) primary = { f: frac, reset }
      } else if (!weekly || frac < weekly.f) {
        weekly = { f: frac, reset }
      }
    }

    if (!primary && !weekly) throw new Error('language_server 응답에 모델 쿼터가 없습니다')

    const plan = status.planStatus?.planInfo?.planName || 'Antigravity'
    return {
      id: account.id,
      name: account.name || 'Antigravity',
      provider: 'antigravity',
      iconLetter: 'A',
      brandColor: '#2563EB',
      email: status.email,
      tier: plan,
      status: 'ready',
      isWeeklyOnly: !primary,
      primaryQuota: this.quotaOf((primary ?? weekly)!.f, (primary ?? weekly)!.reset),
      weeklyQuota: primary && weekly ? this.quotaOf(weekly.f, weekly.reset) : undefined,
      // 가장 빠듯한 모델이 위로
      models: models.sort((a, b) => a.quota.remainingFraction - b.quota.remainingFraction),
      updatedAt: new Date().toISOString()
    }
  }
}
