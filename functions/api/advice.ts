interface AdviceInput {
city: string
age: number
sex: 'male' | 'female' | 'other'
symptoms: string[]
wearable: Record<string, unknown>
birth?: {
  year: number
  month: number
  day: number
  hour: number
}
turnstileToken?: string
}

interface Env {
TURNSTILE_SECRET?: string
TCM_BACKEND_URL?: string
TCM_BACKEND_API_KEY?: string
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

async function callTcmBackend(
  env: Env,
  input: AdviceInput,
  weather: { city: string; tempC: number; humidity: number }
): Promise<string | null> {
  if (!env.TCM_BACKEND_URL) return null

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    const response = await fetch(env.TCM_BACKEND_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(env.TCM_BACKEND_API_KEY ? { 'x-api-key': env.TCM_BACKEND_API_KEY } : {})
      },
      body: JSON.stringify({
        city: input.city,
        birth: input.birth,
        age: input.age,
        sex: input.sex,
        symptoms: input.symptoms,
        wearable: input.wearable,
        weather
      }),
      signal: controller.signal
    })

    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as { text?: string; advice?: string }
      return data.text ?? data.advice ?? null
    }

    const text = await response.text()
    return text || null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function buildAdvice(input: AdviceInput, weather: { city: string; tempC: number; humidity: number }): string {
  const risk = input.age >= 60 ? '偏高' : input.age >= 40 ? '中等' : '偏低'
  const symptomLine = input.symptoms.length ? input.symptoms.join('、') : '无明显不适'

  const getNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const sleepHours = getNumber(input.wearable.sleepHours)
  const hrv = getNumber(input.wearable.hrv)
  const steps = getNumber(input.wearable.steps)

  const tempBias =
    weather.tempC >= 28 ? '偏热' : weather.tempC <= 10 ? '偏寒' : '偏平'
  const humidityHint =
    weather.humidity >= 70 ? '体感偏闷湿' : weather.humidity <= 35 ? '体感偏干燥' : '体感适中'

  const overall = [
    `城市：${input.city}，当前约 ${weather.tempC}℃，湿度 ${weather.humidity}%。`,
    `体感偏向：${tempBias}（${humidityHint}）。`,
    `年龄影响：${risk}；自述症状：${symptomLine}。`,
    input.birth
      ? `出生时间：${input.birth.year}年${input.birth.month}月${input.birth.day}日${input.birth.hour}时（用于四柱参考）。`
      : undefined,
    sleepHours !== undefined ? `睡眠时长：约 ${sleepHours.toFixed(1)} 小时。` : undefined,
    hrv !== undefined ? `HRV：${hrv}。` : undefined,
    steps !== undefined ? `步数：${steps}。` : undefined
  ].filter(Boolean).join(' ')

  const routine = [
    sleepHours !== undefined && sleepHours < 7
      ? '近期睡眠偏短，建议将就寝时间前移 30-60 分钟，保证 7-8 小时睡眠。'
      : '保持规律作息，尽量固定就寝与起床时间。',
    tempBias === '偏热'
      ? '白天注意避开正午高温时段，午后适当小憩。'
      : tempBias === '偏寒'
        ? '注意腰腹与足部保暖，减少久坐久站。'
        : '作息保持平稳，避免熬夜。'
  ].join(' ')

  const diet = [
    tempBias === '偏热'
      ? '饮食以清淡为主，适量补水，可多选瓜果与清润汤品。'
      : tempBias === '偏寒'
        ? '饮食以温润为主，少冷饮，适量加入姜枣类温养食材。'
        : '饮食保持清淡均衡，蔬果与优质蛋白搭配。',
    humidityHint === '体感偏闷湿'
      ? '减少油腻甜食，控制晚间重口味。'
      : humidityHint === '体感偏干燥'
        ? '适当补充温水与润燥食材。'
        : '保持三餐规律，少量多餐更稳。'
  ].join(' ')

  const exercise = [
    steps !== undefined && steps < 6000
      ? '今日活动量偏低，可安排 20-30 分钟轻中强度步行。'
      : '保持适度活动，避免过度疲劳。',
    tempBias === '偏热'
      ? '运动尽量选择清晨或傍晚，注意补水与散热。'
      : tempBias === '偏寒'
        ? '运动前充分热身，避免受寒。'
        : '运动后拉伸放松，避免肌肉紧绷。'
  ].join(' ')

  const today = [
    input.symptoms.includes('疲劳') || input.symptoms.includes('fatigue')
      ? '今日可降低强度，专注恢复与舒缓。'
      : '根据体感灵活调整节奏，量力而行。',
    hrv !== undefined && hrv < 30
      ? 'HRV 偏低时建议减少高强度刺激。'
      : '保持情绪平稳，避免连续高压工作。'
  ].join(' ')

  const disclaimer = '以上建议用于日常养生参考，不构成诊断或治疗意见；如不适持续或加重，请及时咨询专业医生。'

  return [
    `【总体判断】\n${overall}`,
    `【作息建议】\n${routine}`,
    `【饮食建议】\n${diet}`,
    `【运动建议】\n${exercise}`,
    `【今日提醒】\n${today}`,
    `【免责声明】\n${disclaimer}`
  ].join('\n\n')
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
const backendAdvice = await callTcmBackend(env, input, weather)
const adviceText = backendAdvice ?? buildAdvice(input, weather)

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
