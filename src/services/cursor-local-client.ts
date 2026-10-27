import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import https from 'node:https'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AccountConfig, AccountUsage } from '../common/types.js'

const execFileAsync = promisify(execFile)

interface CursorAuthData {
  accessToken?: string
  email?: string
  membershipType?: string
  subscriptionStatus?: string
}

export class CursorLocalClient {
  private static cachedUsage?: AccountUsage
  private static lastFetchTime = 0

  public static async getAuthData(): Promise<CursorAuthData | null> {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    const dbPath = path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')

    if (!fs.existsSync(dbPath)) {
      return null
    }

    try {
      const pyCode = `
import sqlite3, os, json
db = os.path.expandvars(r"%APPDATA%\\Cursor\\User\\globalStorage\\state.vscdb")
if not os.path.exists(db):
    print("{}")
    exit(0)
try:
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    cur = conn.cursor()
    res = {}
    for k, v in cur.execute("SELECT key, value FROM ItemTable WHERE key IN ('cursorAuth/cachedEmail', 'cursorAuth/stripeMembershipType', 'cursorAuth/accessToken', 'cursorAuth/stripeSubscriptionStatus')"):
        if k == 'cursorAuth/cachedEmail': res['email'] = v
        elif k == 'cursorAuth/stripeMembershipType': res['membershipType'] = v
        elif k == 'cursorAuth/accessToken': res['accessToken'] = v
        elif k == 'cursorAuth/stripeSubscriptionStatus': res['subscriptionStatus'] = v
    conn.close()
    print(json.dumps(res))
except Exception:
    print("{}")
`
      const { stdout } = await execFileAsync('python.exe', ['-c', pyCode], { windowsHide: true, timeout: 3000 })
      const data = JSON.parse(stdout.trim() || '{}')
      return data
    } catch (e) {
      console.warn('[CursorLocalClient] Failed to read auth data:', e)
      return null
    }
  }

  public static async queryUsageApi(token: string): Promise<any> {
    return new Promise((resolve) => {
      const req = https.request('https://api2.cursor.sh/auth/usage', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'Cursor/0.46.0',
          'Accept': 'application/json'
        },
        timeout: 5000
      }, res => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch {
            resolve(null)
          }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
      req.end()
    })
  }

  public static async fetchUsage(account: AccountConfig): Promise<AccountUsage> {
    const now = Date.now()
    if (this.cachedUsage && (now - this.lastFetchTime < 30000)) {
      return { ...this.cachedUsage, id: account.id, name: account.name }
    }

    const auth = await this.getAuthData()
    if (!auth || !auth.email) {
      return {
        id: account.id,
        name: account.name || 'Cursor IDE',
        provider: 'cursor' as any,
        iconLetter: 'U',
        brandColor: '#00D1B2',
        status: 'unauthenticated',
        errorMessage: 'Cursor 로그인 세션 없음',
        primaryQuota: { percentUsed: 0, percentLeft: 100, remainingFraction: 1, resetCountdown: '--' },
        updatedAt: new Date().toISOString()
      }
    }

    let percentUsed = 0
    let resetCountdown = '--'

    if (auth.accessToken) {
      const usage = await this.queryUsageApi(auth.accessToken)
      if (usage) {
        const gpt4 = usage['gpt-4'] || {}
        const numRequests = gpt4.numRequests || 0
        const maxRequests = gpt4.maxRequestUsage || 500
        percentUsed = Math.min(100, Math.round((numRequests / maxRequests) * 100))

        if (usage.startOfMonth) {
          const start = new Date(usage.startOfMonth)
          const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate())
          const diffMs = nextMonth.getTime() - now
          if (diffMs > 0) {
            const days = Math.floor(diffMs / (24 * 3600 * 1000))
            const hours = Math.floor((diffMs % (24 * 3600 * 1000)) / (3600 * 1000))
            resetCountdown = `${days}d ${hours}h`
          }
        }
      }
    }

    const tierName = (auth.membershipType || 'Pro').toUpperCase()
    const result: AccountUsage = {
      id: account.id,
      name: account.name || 'Cursor IDE',
      provider: 'cursor' as any,
      iconLetter: 'U',
      brandColor: '#00D1B2',
      email: auth.email,
      tier: `${tierName} (로컬 세션)`,
      status: 'ready',
      isWeeklyOnly: true,
      primaryQuota: {
        percentUsed,
        percentLeft: 100 - percentUsed,
        remainingFraction: (100 - percentUsed) / 100,
        resetCountdown,
        isExhausted: percentUsed >= 100
      },
      updatedAt: new Date().toISOString()
    }

    this.cachedUsage = result
    this.lastFetchTime = now
    return result
  }
}
