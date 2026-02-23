type WeatherSource = 'open-meteo' | 'mock'
type CacheStatus = 'hit' | 'miss' | 'bypass'

type GeocodeInfo = {
  name?: string
  country?: string
  admin1?: string
  latitude?: number
  longitude?: number
  timezone?: string
}

export type WeatherSnapshot = {
  condition: string
  temperatureC: number
  humidity: number
  source: WeatherSource
  observedAt?: string
  cacheKey?: string
  cacheStatus?: CacheStatus
  normalizedCity?: string
  geocode?: GeocodeInfo
}

type WeatherEnv = {
  WEATHER_PROVIDER?: string
  WEATHER_CACHE_TTL_SECONDS?: string
  WEATHER_TIMEOUT_MS?: string
  WEATHER_DISABLE_CACHE?: string
  WEATHER_DEBUG_RAW?: string
}

const DEFAULT_TTL_SECONDS = 600
const DEFAULT_TIMEOUT_MS = 4000
const WEATHER_VERSION = 'v3'

const CITY_NAME_MAP: Record<string, string> = {
  北京: 'Beijing',
  上海: 'Shanghai',
  广州: 'Guangzhou',
  深圳: 'Shenzhen',
  重庆: 'Chongqing',
  成都: 'Chengdu',
  杭州: 'Hangzhou',
  南京: 'Nanjing',
  武汉: 'Wuhan',
  西安: 'Xian',
  苏州: 'Suzhou',
  天津: 'Tianjin',
  长沙: 'Changsha',
  郑州: 'Zhengzhou',
  青岛: 'Qingdao',
  厦门: 'Xiamen',
  福州: 'Fuzhou',
  昆明: 'Kunming',
  贵阳: 'Guiyang',
  哈尔滨: 'Harbin',
  沈阳: 'Shenyang',
  合肥: 'Hefei',
  南昌: 'Nanchang',
  济南: 'Jinan',
  宁波: 'Ningbo'
}

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

function parseCityAndAdmin(raw: string) {
  const trimmed = raw.trim()
  const parts = trimmed.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  return {
    name: parts[0] ?? trimmed,
    admin1: parts[1]
  }
}

function selectGeocodeResult(
  results: Array<{
    name?: string
    country_code?: string
    admin1?: string
    latitude?: number
    longitude?: number
    timezone?: string
  }>,
  targetName: string,
  targetAdmin?: string
) {
  const lowerName = targetName.toLowerCase()
  let candidates = results
  const cnCandidates = candidates.filter((item) => item.country_code === 'CN')
  if (cnCandidates.length) candidates = cnCandidates
  if (targetAdmin) {
    const adminCandidates = candidates.filter(
      (item) => (item.admin1 ?? '').toLowerCase() === targetAdmin.toLowerCase()
    )
    if (adminCandidates.length) candidates = adminCandidates
  }

  const exactName = candidates.find((item) => (item.name ?? '').toLowerCase() === lowerName)
  return exactName ?? candidates[0]
}

async function getWeatherFromOpenMeteo(
  city: string,
  env?: WeatherEnv
): Promise<WeatherSnapshot | null> {
  const timeoutMs = Number(env?.WEATHER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const parsed = parseCityAndAdmin(city)
  const mappedName = CITY_NAME_MAP[parsed.name] ?? parsed.name
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(mappedName)}&count=5&language=zh&format=json`
  const geoResp = await fetchWithTimeout(geoUrl, timeoutMs)
  if (!geoResp.ok) return null
  const geo = (await geoResp.json()) as {
    results?: Array<{
      name?: string
      country?: string
      country_code?: string
      admin1?: string
      latitude?: number
      longitude?: number
      timezone?: string
    }>
  }
  const location = geo.results ? selectGeocodeResult(geo.results, mappedName, parsed.admin1) : undefined
  if (!location || location.latitude === undefined || location.longitude === undefined) return null

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}` +
    `&longitude=${location.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code` +
    `&hourly=temperature_2m,relative_humidity_2m,weather_code` +
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
    hourly?: {
      time?: string[]
      temperature_2m?: number[]
      relative_humidity_2m?: number[]
      weather_code?: number[]
    }
  }

  const current = data.current
  let temperatureC = current?.temperature_2m
  let humidity = current?.relative_humidity_2m
  let weatherCode = current?.weather_code
  let observedAt = current?.time

  if (temperatureC === undefined || humidity === undefined) {
    const hourly = data.hourly
    const targetTime = current?.time ?? new Date().toISOString().slice(0, 13) + ':00'
    const timeIndex = hourly?.time?.findIndex((value) => value === targetTime) ?? -1
    const index = timeIndex >= 0 ? timeIndex : 0
    temperatureC = hourly?.temperature_2m?.[index]
    humidity = hourly?.relative_humidity_2m?.[index]
    weatherCode = hourly?.weather_code?.[index]
    observedAt = hourly?.time?.[index]
  }

  if (temperatureC === undefined || humidity === undefined) {
    if (env?.WEATHER_DEBUG_RAW === '1') {
      console.log('open-meteo missing data', {
        city,
        mappedName,
        current,
        hourly: data.hourly
      })
    }
    return null
  }

  if (env?.WEATHER_DEBUG_RAW === '1') {
    console.log('open-meteo snapshot', {
      city,
      mappedName,
      location,
      temperatureC,
      humidity,
      weatherCode,
      observedAt
    })
  }

  return {
    condition: mapWeatherCode(weatherCode),
    temperatureC,
    humidity,
    source: 'open-meteo',
    observedAt,
    geocode: {
      name: location.name,
      country: location.country,
      admin1: location.admin1,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone
    }
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
  const disableCache = env?.WEATHER_DISABLE_CACHE === '1'

  const tryOpenMeteo = providerSetting === 'auto' || providerSetting === 'open-meteo'
  const forceMock = providerSetting === 'mock'

  const cache = caches.default
  const providerKey: WeatherSource = forceMock ? 'mock' : 'open-meteo'
  const cacheKey = buildWeatherCacheKey(providerKey, normalized, bucket)
  const cacheRequest = new Request(`https://cache.local/weather?key=${encodeURIComponent(cacheKey)}`)

  if (!disableCache) {
    const cached = await cache.match(cacheRequest)
    if (cached) {
      const cachedJson = (await cached.json()) as WeatherSnapshot
      return { ...cachedJson, cacheKey, normalizedCity: normalized, cacheStatus: 'hit' }
    }
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

  snapshot.cacheStatus = disableCache ? 'bypass' : 'miss'
  if (!disableCache) {
    const response = new Response(JSON.stringify(snapshot), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${ttlSeconds}`
      }
    })
    await cache.put(cacheRequest, response.clone())
  }

  return { ...snapshot, cacheKey, normalizedCity: normalized }
}
