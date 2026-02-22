interface AdviceInput {
  city: string
  age: number
  sex: 'male' | 'female' | 'other'
  symptoms: string[]
  wearable: Record<string, unknown>
  turnstileToken?: string
}

interface Env {
  TURNSTILE_SECRET?: string
}

const encoder = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyTurnstile(env: Env, token?: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true
  if (!token) return false

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token
  })

  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })

  if (!result.ok) return false
  const data = await result.json<{ success?: boolean }>()
  return Boolean(data.success)
}

async function getMockWeather(city: string): Promise<{ city: string; tempC: number; humidity: number }> {
  const cache = caches.default
  const key = new Request(`https://cache.local/weather?city=${encodeURIComponent(city.toLowerCase())}`)
  const cached = await cache.match(key)
  if (cached) {
    return cached.json()
  }

  const seed = city.length
  const weather = {
    city,
    tempC: 18 + (seed % 12),
    humidity: 45 + (seed % 40)
  }

  const response = new Response(JSON.stringify(weather), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300'
    }
  })

  await cache.put(key, response.clone())
  return weather
}

function buildAdvice(input: AdviceInput, weather: { city: string; tempC: number; humidity: number }): string {
  const risk = input.age >= 60 ? 'higher' : input.age >= 40 ? 'moderate' : 'lower'
  const symptomLine = input.symptoms.length ? input.symptoms.join(', ') : 'none reported'
  const hydration = weather.tempC >= 28 ? 'Increase hydration and avoid mid-day outdoor strain.' : 'Maintain regular hydration.'
  const sleepHint = typeof input.wearable.sleepHours === 'number' && (input.wearable.sleepHours as number) < 7
    ? 'Your wearable suggests short sleep; target 7-8h with consistent bedtime.'
    : 'Keep sleep schedule stable and monitor recovery.'

  return [
    `City: ${input.city}. Weather now ~${weather.tempC}°C, humidity ${weather.humidity}%.`,
    `Age risk tier: ${risk}. Symptoms: ${symptomLine}.`,
    hydration,
    sleepHint,
    'If symptoms worsen or persist, seek professional medical care promptly.'
  ].join('\n')
}

function sseHeaders() {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  }
}

async function streamText(text: string): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = text.match(/.{1,60}(\s|$)/g) ?? [text]
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`))
        await new Promise(resolve => setTimeout(resolve, 80))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })

  return new Response(stream, { headers: sseHeaders() })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const input = (await request.json()) as AdviceInput

    const humanVerified = await verifyTurnstile(env, input.turnstileToken)
    if (!humanVerified) {
      return new Response('Turnstile verification failed', { status: 403 })
    }

    const hash = await sha256Hex(JSON.stringify(input))
    const cache = caches.default
    const adviceCacheKey = new Request(`https://cache.local/advice?hash=${hash}`)
    const cachedAdvice = await cache.match(adviceCacheKey)

    if (cachedAdvice) {
      const text = await cachedAdvice.text()
      return streamText(text)
    }

    const weather = await getMockWeather(input.city)
    const adviceText = buildAdvice(input, weather)

    await cache.put(
      adviceCacheKey,
      new Response(adviceText, {
        headers: { 'cache-control': 'public, max-age=600' }
      })
    )

    return streamText(adviceText)
  } catch (error) {
    return new Response(`Bad request: ${String(error)}`, { status: 400 })
  }
}
