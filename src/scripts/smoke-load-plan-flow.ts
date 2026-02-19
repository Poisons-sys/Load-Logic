import 'dotenv/config'

type JsonRecord = Record<string, unknown>

class CookieJar {
  private readonly cookies = new Map<string, string>()

  updateFromResponse(response: Response) {
    const headersAny = response.headers as Headers & {
      getSetCookie?: () => string[]
    }

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
      const isExpired = maxAge !== null && Number.isFinite(maxAge) && maxAge <= 0

      if (!value || isExpired) {
        this.cookies.delete(name)
      } else {
        this.cookies.set(name, value)
      }
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
    assertCondition(csrf.response.ok, `[smoke] csrf failed: ${csrf.response.status}`)
    const csrfToken = (csrf.body as JsonRecord | null)?.csrfToken
    assertCondition(typeof csrfToken === 'string' && csrfToken.length > 0, '[smoke] csrfToken missing')

    const loginForm = new URLSearchParams({
      csrfToken,
      email: loginEmail,
      password: loginPassword,
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    })

    const login = await request('/api/auth/callback/credentials?json=true', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: loginForm.toString(),
    })

    if (login.response.status >= 400) {
      return { ok: false, status: login.response.status, body: login.body }
    }

    const session = await request('/api/auth/session')
    const sessionUser = ((session.body as JsonRecord | null)?.user ?? null) as JsonRecord | null
    const ok = session.response.ok && Boolean(sessionUser?.id)

    return {
      ok,
      status: session.response.status,
      body: session.body,
      user: sessionUser,
    }
  }

  const registerTempAdmin = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`
      const tempEmail = `smoke.${nonce}@loadlogic.local`
      const tempPassword = `SmokePass!${nonce}`
      const tempRfc = `SMK${nonce}`.slice(0, 13)

      const registerPayload = {
        email: tempEmail,
        password: tempPassword,
        name: `Smoke Admin ${nonce}`,
        companyName: `Smoke Co ${nonce}`,
        companyRfc: tempRfc,
        companyAddress: 'Smoke Street 123',
        companyPhone: '5550000000',
      }

      const register = await request('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(registerPayload),
      })

      if (register.response.ok) {
        console.log(`[smoke] temp user created: ${tempEmail}`)
        return { email: tempEmail, password: tempPassword }
      }
    }

    throw new Error('[smoke] no se pudo crear usuario temporal para prueba')
  }

  try {
    console.log(`[smoke] baseUrl=${baseUrl}`)

    let effectiveEmail = email
    let effectivePassword = password
    let loginResult = await loginWithCredentials(effectiveEmail, effectivePassword)

    if (!loginResult.ok) {
      console.log(
        `[smoke] login con credenciales configuradas falló (${loginResult.status}). Intentando usuario temporal...`
      )
      const temp = await registerTempAdmin()
      effectiveEmail = temp.email
      effectivePassword = temp.password
      loginResult = await loginWithCredentials(effectiveEmail, effectivePassword)
    }

    assertCondition(loginResult.ok, `[smoke] login failed: ${loginResult.status}`)
    console.log(`[smoke] login ok: user=${String(loginResult.user?.email ?? loginResult.user?.id)}`)

    const vehiclesRes = await request('/api/vehicles')
    assertCondition(vehiclesRes.response.ok, `[smoke] vehicles failed: ${vehiclesRes.response.status}`)
    const vehicles = (((vehiclesRes.body as JsonRecord | null)?.data ?? []) as JsonRecord[])
      .filter((v) =>
        Number(v.internalLength ?? 0) > 0 &&
        Number(v.internalWidth ?? 0) > 0 &&
        Number(v.internalHeight ?? 0) > 0
      )
    assertCondition(vehicles.length > 0, '[smoke] no vehicles available')
    const vehicle = vehicles[0]

    const productsRes = await request('/api/products')
    assertCondition(productsRes.response.ok, `[smoke] products failed: ${productsRes.response.status}`)
    const products = (((productsRes.body as JsonRecord | null)?.data ?? []) as JsonRecord[])
      .filter((p) =>
        Number(p.length ?? 0) > 0 &&
        Number(p.width ?? 0) > 0 &&
        Number(p.height ?? 0) > 0 &&
        Number(p.weight ?? 0) > 0
      )
    assertCondition(products.length > 0, '[smoke] no products available')
    const product = products[0]

    const createPayload = {
      name: `SMOKE ${new Date().toISOString()}`,
      vehicleId: String(vehicle.id),
      items: [
        {
          productId: String(product.id),
          quantity: 2,
        },
      ],
    }
    const create = await request('/api/load-plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createPayload),
    })
    assertCondition(create.response.ok, `[smoke] create failed: ${create.response.status}`)
    createdPlanId = String(((create.body as JsonRecord | null)?.data as JsonRecord | null)?.id ?? '')
    assertCondition(createdPlanId.length > 0, '[smoke] create returned empty plan id')
    console.log(`[smoke] create ok: planId=${createdPlanId}`)

    const optimize = await request(`/api/load-plans/${createdPlanId}/optimize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assertCondition(optimize.response.ok, `[smoke] optimize failed: ${optimize.response.status}`)
    const placedCount = Number(
      (((optimize.body as JsonRecord | null)?.data as JsonRecord | null)?.optimization as JsonRecord | null)
        ?.placedItemsCount ?? 0
    )
    assertCondition(placedCount > 0, '[smoke] optimize returned 0 placements')
    console.log(`[smoke] optimize ok: placed=${placedCount}`)

    const getPlan = await request(`/api/load-plans/${createdPlanId}`)
    assertCondition(getPlan.response.ok, `[smoke] get plan failed: ${getPlan.response.status}`)
    const planData = ((getPlan.body as JsonRecord | null)?.data ?? null) as JsonRecord | null
    const placements = ((planData?.placements ?? []) as unknown[])
    assertCondition(placements.length > 0, '[smoke] get plan returned 0 placements')
    console.log(`[smoke] get ok: placements=${placements.length}`)

    const del = await request(`/api/load-plans/${createdPlanId}`, {
      method: 'DELETE',
    })
    assertCondition(del.response.ok, `[smoke] delete failed: ${del.response.status}`)
    console.log('[smoke] delete ok')
    createdPlanId = null

    console.log('[smoke] SUCCESS: create -> optimize -> get -> delete')
  } catch (error) {
    console.error('[smoke] FAILED:', error)
    if (createdPlanId) {
      try {
        const cleanup = await request(`/api/load-plans/${createdPlanId}`, {
          method: 'DELETE',
        })
        console.error(`[smoke] cleanup delete status=${cleanup.response.status}`)
      } catch (cleanupError) {
        console.error('[smoke] cleanup failed:', cleanupError)
      }
    }
    process.exit(1)
  }
}

run().catch((error) => {
  console.error('[smoke] unexpected failure:', error)
  process.exit(1)
})
