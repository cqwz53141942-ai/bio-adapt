type WeatherSource = 'open-meteo' | 'mock'

export type WeatherSnapshot = {
  condition: string
  temperatureC: number
  humidity: number
  source: WeatherSource
  observedAt?: string
  cacheKey?: string
  normalizedCity?: string
}

type WeatherEnv = {
  WEATHER_PROVIDER?: string
  WEATHER_CACHE_TTL_SECONDS?: string
  WEATHER_TIMEOUT_MS?: string
}

const DEFAULT_TTL_SECONDS = 600
const DEFAULT_TIMEOUT_MS = 4000
const WEATHER_VERSION = 'v1'

function normalizeCity(city: string): string {
  return city.trim().toLowerCase()
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function buildWeatherCacheKey(provider: WeatherSource, normalizedCity: string, bucket: number) {
  return `weather:${WEATHER_VERSION}:${provider}:${normalizedCity}:${bucket}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function mapWeatherCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return '未知'
  if (code === 0) return '晴'
  if (code <= 3) return '多云'
  if (code <= 48) return '阴'
  if (code <= 67) return '小雨'
  if (code <= 77) return '小雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '阵雪'
  return '未知'
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function getWeatherFromOpenMeteo(
  city: string,
  env?: WeatherEnv
): Promise<WeatherSnapshot | null> {
  const timeoutMs = Number(env?.WEATHER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`
  const geoResp = await fetchWithTimeout(geoUrl, timeoutMs)
  if (!geoResp.ok) return null
  const geo = (await geoResp.json()) as { results?: Array<{ latitude: number; longitude: number }> }
  const location = geo.results?.[0]
  if (!location) return null

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code` +
    `&timezone=auto`
  const weatherResp = await fetchWithTimeout(forecastUrl, timeoutMs)
  if (!weatherResp.ok) return null
  const data = (await weatherResp.json()) as {
    current?: {
      temperature_2m?: number
      relative_humidity_2m?: number
      weather_code?: number
      time?: string
    }
  }

  if (!data.current || data.current.temperature_2m === undefined || data.current.relative_humidity_2m === undefined) {
    return null
  }

  return {
    condition: mapWeatherCode(data.current.weather_code),
    temperatureC: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    source: 'open-meteo',
    observedAt: data.current.time
  }
}

function getMockWeather(city: string, normalizedCity: string): WeatherSnapshot {
  const hash = hashString(normalizedCity)
  const temperatureC = 8 + (hash % 25)
  const humidity = 30 + ((hash >>> 8) % 56)
  const conditions = ['晴', '多云', '阴', '小雨', '阵雨', '多雾']
  const condition = conditions[(hash >>> 16) % conditions.length]

  return {
    condition,
    temperatureC,
    humidity,
    source: 'mock',
    observedAt: new Date().toISOString()
  }
}

export async function getWeatherByCity(city: string, env?: WeatherEnv): Promise<WeatherSnapshot> {
  const normalized = normalizeCity(city || '未知')
  const ttlSeconds = Number(env?.WEATHER_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS)
  const bucket = Math.floor(Date.now() / (ttlSeconds * 1000))
  const providerSetting = (env?.WEATHER_PROVIDER ?? 'auto').toLowerCase()

  const tryOpenMeteo = providerSetting === 'auto' || providerSetting === 'open-meteo'
  const forceMock = providerSetting === 'mock'

  const cache = caches.default
  const providerKey: WeatherSource = forceMock ? 'mock' : 'open-meteo'
  const cacheKey = buildWeatherCacheKey(providerKey, normalized, bucket)
  const cacheRequest = new Request(`https://cache.local/weather?key=${encodeURIComponent(cacheKey)}`)
  const cached = await cache.match(cacheRequest)
  if (cached) {
    const cachedJson = (await cached.json()) as WeatherSnapshot
    return { ...cachedJson, cacheKey, normalizedCity: normalized }
  }

  let snapshot: WeatherSnapshot | null = null
  if (tryOpenMeteo && !forceMock) {
    try {
      snapshot = await getWeatherFromOpenMeteo(city, env)
    } catch {
      snapshot = null
    }
  }

  if (!snapshot) {
    snapshot = getMockWeather(city, normalized)
  }

  snapshot.temperatureC = clamp(snapshot.temperatureC, 8, 32)
  snapshot.humidity = clamp(snapshot.humidity, 30, 85)

  const response = new Response(JSON.stringify(snapshot), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttlSeconds}`
    }
  })
  await cache.put(cacheRequest, response.clone())

  return { ...snapshot, cacheKey, normalizedCity: normalized }
}
