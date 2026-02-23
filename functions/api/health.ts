import { getWeatherByCity } from '../lib/weather'

interface Env {
  WEATHER_PROVIDER?: string
  WEATHER_CACHE_TTL_SECONDS?: string
  WEATHER_TIMEOUT_MS?: string
  HEALTH_WEATHER_PROBE_CITY?: string
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const probeCity = env.HEALTH_WEATHER_PROBE_CITY ?? '北京'
  let weatherSource: string | undefined
  try {
    const snapshot = await getWeatherByCity(probeCity, env)
    weatherSource = snapshot.source
  } catch {
    weatherSource = 'unknown'
  }

  return Response.json({
    ok: true,
    ts: new Date().toISOString(),
    weatherProvider: env.WEATHER_PROVIDER ?? 'auto',
    weatherCacheTtlSeconds: env.WEATHER_CACHE_TTL_SECONDS ?? '600',
    weatherTimeoutMs: env.WEATHER_TIMEOUT_MS ?? '4000',
    weatherProbeCity: probeCity,
    weatherProbeSource: weatherSource
  })
}
