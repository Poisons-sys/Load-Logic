import 'dotenv/config'

type JsonRecord = Record<string, unknown>

class CookieJar {
  private readonly cookies = new Map<string, string>()

  updateFromResponse(response: Response) {
    const headersAny = response.headers as Headers & { getSetCookie?: () => string[] }
    const setCookie = headersAny.getSetCookie?.() ?? []
    if (setCookie.length === 0) {
      const single = response.headers.get('set-cookie')
      if (single) setCookie.push(single)
    }

    for (const raw of setCookie) {
      const [cookiePart, ...attrs] = raw.split(';')
      const separator = cookiePart.indexOf('=')
      if (separator <= 0) continue

      const name = cookiePart.slice(0, separator).trim()
      const value = cookiePart.slice(separator + 1).trim()
      const maxAgeAttr = attrs.find((attr) => attr.trim().toLowerCase().startsWith('max-age='))
      const maxAge = maxAgeAttr ? Number(maxAgeAttr.split('=')[1]) : null
      const expired = maxAge !== null && Number.isFinite(maxAge) && maxAge <= 0
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  toHeader() {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ')
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function run() {
  const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000'
  const email = process.env.SMOKE_EMAIL ?? 'admin@local.test'
  const password = process.env.SMOKE_PASSWORD ?? '12345'

  const jar = new CookieJar()
  let createdPlanId: string | null = null

  const request = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    const cookieHeader = jar.toHeader()
    if (cookieHeader) headers.set('cookie', cookieHeader)

    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers,
      redirect: init.redirect ?? 'manual',
    })
    jar.updateFromResponse(response)
    const body = await parseBody(response)
    return { response, body }
  }

  const loginWithCredentials = async (loginEmail: string, loginPassword: string) => {
    const csrf = await request('/api/auth/csrf')
    assertCondition(csrf.response.ok, `[smoke-roundtrip] csrf failed: ${csrf.response.status}`)
    const csrfToken = (csrf.body as JsonRecord | null)?.csrfToken
    assertCondition(typeof csrfToken === 'string' && csrfToken.length > 0, '[smoke-roundtrip] csrfToken missing')

    const loginForm = new URLSearchParams({
      csrfToken,
      email: loginEmail,
      password: loginPassword,
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    })

    const login = await request('/api/auth/callback/credentials?json=true', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: loginForm.toString(),
    })
    if (login.response.status >= 400) return false

    const session = await request('/api/auth/session')
    const sessionUser = ((session.body as JsonRecord | null)?.user ?? null) as JsonRecord | null
    return session.response.ok && Boolean(sessionUser?.id)
  }

  try {
    console.log(`[smoke-roundtrip] baseUrl=${baseUrl}`)
    const loginOk = await loginWithCredentials(email, password)
    assertCondition(loginOk, '[smoke-roundtrip] login failed')

    const vehiclesRes = await request('/api/vehicles')
    assertCondition(vehiclesRes.response.ok, `[smoke-roundtrip] vehicles failed: ${vehiclesRes.response.status}`)
    const vehicles = (((vehiclesRes.body as JsonRecord | null)?.data ?? []) as JsonRecord[])
      .filter((v) =>
        Number(v.internalLength ?? 0) > 0 &&
        Number(v.internalWidth ?? 0) > 0 &&
        Number(v.internalHeight ?? 0) > 0
      )
    assertCondition(vehicles.length > 0, '[smoke-roundtrip] no vehicles available')
    const vehicle = vehicles[0]

    const productsRes = await request('/api/products')
    assertCondition(productsRes.response.ok, `[smoke-roundtrip] products failed: ${productsRes.response.status}`)
    const products = (((productsRes.body as JsonRecord | null)?.data ?? []) as JsonRecord[])
      .filter((p) => Number(p.length ?? 0) > 0 && Number(p.width ?? 0) > 0 && Number(p.height ?? 0) > 0)
    assertCondition(products.length > 0, '[smoke-roundtrip] no products available')
    const product = products[0]

    const create = await request('/api/load-plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `SMOKE-ROUNDTRIP ${new Date().toISOString()}`,
        vehicleId: String(vehicle.id),
        items: [{ productId: String(product.id), quantity: 3, routeStop: 1 }],
      }),
    })
    assertCondition(create.response.ok, `[smoke-roundtrip] create failed: ${create.response.status}`)
    createdPlanId = String(((create.body as JsonRecord | null)?.data as JsonRecord | null)?.id ?? '')
    assertCondition(createdPlanId.length > 0, '[smoke-roundtrip] create returned empty plan id')

    const optimize = await request(`/api/load-plans/${createdPlanId}/optimize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assertCondition(optimize.response.ok, `[smoke-roundtrip] optimize failed: ${optimize.response.status}`)

    const getBefore = await request(`/api/load-plans/${createdPlanId}`)
    assertCondition(getBefore.response.ok, `[smoke-roundtrip] get before failed: ${getBefore.response.status}`)
    const planBefore = ((getBefore.body as JsonRecord | null)?.data ?? null) as JsonRecord | null
    const placementsBefore = ((planBefore?.placements ?? []) as JsonRecord[])
    assertCondition(placementsBefore.length > 0, '[smoke-roundtrip] no placements to roundtrip')

    const first = placementsBefore[0]
    const firstInstance = String(first.instanceKey ?? `pl-${String(first.id ?? 'x')}`)

    const manualCubes = placementsBefore.map((pl, idx) => {
      const prod = (pl.product ?? {}) as JsonRecord
      const currentX = Number(pl.positionZ ?? 0)
      const shiftedX = idx === 0 ? currentX + 5 : currentX
      return {
        instanceId: String(pl.instanceKey ?? `pl-${String(pl.id ?? idx)}`),
        productId: String(pl.productId ?? prod.id ?? ''),
        x: shiftedX,
        y: Number(pl.positionY ?? 0),
        z: Number(pl.positionX ?? 0),
        width: Number(prod.width ?? 0),
        height: Number(prod.height ?? 0),
        depth: Number(prod.length ?? 0),
        rotY: (Number(pl.rotationY ?? 0) * Math.PI) / 180,
        routeStop: 1,
      }
    })

    const persist = await request(`/api/load-plans/${createdPlanId}/optimize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        manualCubes,
        telemetry: { moves: 1, swaps: 0, rotates: 0, undos: 0, redos: 0, keyNudges: 1, updatedAt: Date.now() },
      }),
    })
    assertCondition(persist.response.ok, `[smoke-roundtrip] persist manual failed: ${persist.response.status}`)

    const getAfter = await request(`/api/load-plans/${createdPlanId}`)
    assertCondition(getAfter.response.ok, `[smoke-roundtrip] get after failed: ${getAfter.response.status}`)
    const planAfter = ((getAfter.body as JsonRecord | null)?.data ?? null) as JsonRecord | null
    const placementsAfter = ((planAfter?.placements ?? []) as JsonRecord[])
    assertCondition(placementsAfter.length === placementsBefore.length, '[smoke-roundtrip] placement count changed unexpectedly')

    const updatedFirst = placementsAfter.find((pl) => String(pl.instanceKey ?? '') === firstInstance)
    assertCondition(Boolean(updatedFirst), '[smoke-roundtrip] first instance not found after save')
    const delta = Math.abs(Number((updatedFirst as JsonRecord).positionZ ?? 0) - (Number(first.positionZ ?? 0) + 5))
    assertCondition(delta < 1.5, `[smoke-roundtrip] first placement was not persisted as expected (delta=${delta.toFixed(2)})`)

    console.log('[smoke-roundtrip] SUCCESS: manual layout persisted 1:1 by instance')

    const del = await request(`/api/load-plans/${createdPlanId}`, { method: 'DELETE' })
    assertCondition(del.response.ok, `[smoke-roundtrip] delete failed: ${del.response.status}`)
    createdPlanId = null
  } catch (error) {
    console.error('[smoke-roundtrip] FAILED:', error)
    if (createdPlanId) {
      try {
        await request(`/api/load-plans/${createdPlanId}`, { method: 'DELETE' })
      } catch {
        // ignore cleanup failures
      }
    }
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('[smoke-roundtrip] unexpected failure:', error)
  process.exit(1)
})
