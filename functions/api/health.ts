interface Env {
  WEATHER_PROVIDER?: string
  WEATHER_CACHE_TTL_SECONDS?: string
  WEATHER_TIMEOUT_MS?: string
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({
    ok: true,
    ts: new Date().toISOString(),
    weatherProvider: env.WEATHER_PROVIDER ?? 'auto',
    weatherCacheTtlSeconds: env.WEATHER_CACHE_TTL_SECONDS ?? '600',
    weatherTimeoutMs: env.WEATHER_TIMEOUT_MS ?? '4000'
  })
}
