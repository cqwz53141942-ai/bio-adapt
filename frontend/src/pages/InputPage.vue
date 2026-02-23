<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

type Sex = 'male' | 'female' | 'other'

type Birth = {
  year: number
  month: number
  day: number
  hour: number
}

type Profile = {
  city: string
  sex: Sex
  birth: Birth
}

type FormPayload = {
  profile: Profile
  symptoms: string[]
  wearable: Record<string, unknown>
  age: number
  turnstileToken?: string
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          theme?: string
        }
      ) => string
      reset?: (widgetId?: string) => void
    }
  }
}

const router = useRouter()
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const cityOptions = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '重庆',
  '成都',
  '杭州',
  '南京',
  '武汉',
  '西安',
  '苏州',
  '天津',
  '长沙',
  '郑州',
  '青岛',
  '厦门',
  '福州',
  '昆明',
  '贵阳',
  '哈尔滨',
  '沈阳',
  '合肥',
  '南昌',
  '济南',
  '宁波'
]

const city = ref(cityOptions[0])
const sex = ref<Sex>('other')
const symptomsText = ref('疲劳, 睡眠不足')
const wearableJson = ref('{"steps":7200,"hrv":35,"sleepHours":6.1}')

const now = new Date()
const yearOptions = Array.from({ length: 100 }, (_, i) => now.getFullYear() - i)
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const dayOptions = Array.from({ length: 31 }, (_, i) => i + 1)
const hourOptions = Array.from({ length: 24 }, (_, i) => i)

const birthYear = ref(now.getFullYear() - 30)
const birthMonth = ref(now.getMonth() + 1)
const birthDay = ref(now.getDate())
const birthHour = ref(9)

const loading = ref(false)
const error = ref('')

const healthStatus = ref<{ ok: boolean; ts: string } | null>(null)
const healthError = ref('')

const turnstileToken = ref('')
const turnstileError = ref('')
const turnstileContainer = ref<HTMLDivElement | null>(null)
const turnstileWidgetId = ref<string | null>(null)

const age = computed(() => {
  const birth = new Date(birthYear.value, birthMonth.value - 1, birthDay.value, birthHour.value)
  const nowDate = new Date()
  let years = nowDate.getFullYear() - birth.getFullYear()
  const hasBirthdayPassed =
    nowDate.getMonth() > birth.getMonth() ||
    (nowDate.getMonth() === birth.getMonth() && nowDate.getDate() >= birth.getDate())
  if (!hasBirthdayPassed) years -= 1
  return Math.max(0, years)
})

function renderTurnstile() {
  if (!turnstileSiteKey || !turnstileContainer.value || !window.turnstile) return
  if (turnstileWidgetId.value) return

  turnstileWidgetId.value = window.turnstile.render(turnstileContainer.value, {
    sitekey: turnstileSiteKey,
    callback: (token) => {
      turnstileToken.value = token
      turnstileError.value = ''
    },
    'expired-callback': () => {
      turnstileToken.value = ''
    }
  })
}

function loadTurnstileScript() {
  if (!turnstileSiteKey) return

  const existing = document.getElementById('turnstile-script')
  if (existing) {
    renderTurnstile()
    return
  }

  const script = document.createElement('script')
  script.id = 'turnstile-script'
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true
  script.defer = true
  script.onload = () => renderTurnstile()
  document.head.appendChild(script)
}

async function checkHealth() {
  healthError.value = ''
  healthStatus.value = null
  try {
    const response = await fetch('/api/health')
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`)
    }
    const data = (await response.json()) as { ok: boolean; ts: string }
    healthStatus.value = data
  } catch (e) {
    healthError.value = e instanceof Error ? e.message : '未知错误'
  }
}

function normalizeSymptoms(input: string) {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function persistForm() {
  const birth: Birth = {
    year: birthYear.value,
    month: birthMonth.value,
    day: birthDay.value,
    hour: birthHour.value
  }

  const profile: Profile = {
    city: city.value,
    sex: sex.value,
    birth
  }

  const payload: FormPayload = {
    profile,
    symptoms: normalizeSymptoms(symptomsText.value),
    wearable: JSON.parse(wearableJson.value),
    age: age.value,
    turnstileToken: turnstileToken.value || undefined
  }

  const requestKey = [
    profile.city,
    profile.birth.year,
    profile.birth.month,
    profile.birth.day,
    profile.birth.hour,
    payload.symptoms.join('|')
  ].join(':')

  // Clear any previous cached result when input changes.
  sessionStorage.removeItem('bio-adapt-advice')
  sessionStorage.removeItem('bio-adapt-advice-key')
  sessionStorage.setItem('bio-adapt-form-key', requestKey)
  sessionStorage.setItem('bio-adapt-form', JSON.stringify(payload))
}

async function submitForm() {
  error.value = ''
  loading.value = true

  if (turnstileSiteKey && !turnstileToken.value) {
    loading.value = false
    turnstileError.value = '请先完成安全验证。'
    return
  }

  try {
    JSON.parse(wearableJson.value)
  } catch {
    loading.value = false
    error.value = '可穿戴数据 JSON 格式不正确。'
    return
  }

  persistForm()
  await router.push('/result')
  loading.value = false
}

onMounted(() => {
  loadTurnstileScript()
})
</script>

<template>
  <main style="max-width: 960px; margin: 0 auto; padding: 28px; font-family: 'Noto Serif SC', serif;">
    <h1>本草智养 · 信息填写</h1>
    <p style="color:#555;">
      填写基础信息后，我们将生成中医养生参考建议（非诊断）。
    </p>

    <section style="margin:16px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <button type="button" @click="checkHealth" style="padding:8px 12px; cursor:pointer;">
        检查服务状态
      </button>
      <span v-if="healthStatus" style="color:#2b6;">
        服务正常：{{ healthStatus.ok ? 'OK' : 'FAIL' }}，时间：{{ healthStatus.ts }}
      </span>
      <span v-else-if="healthError" style="color:#c00;">服务异常：{{ healthError }}</span>
    </section>

    <form @submit.prevent="submitForm" style="display:grid; gap:12px; margin-top:12px;">
      <label>
        城市
        <select v-model="city" style="width:100%; padding:8px;">
          <option v-for="option in cityOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <label>
        出生时间（年/月/日/时）
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-top:6px;">
          <select v-model.number="birthYear" style="padding:8px;">
            <option v-for="option in yearOptions" :key="option" :value="option">
              {{ option }}年
            </option>
          </select>
          <select v-model.number="birthMonth" style="padding:8px;">
            <option v-for="option in monthOptions" :key="option" :value="option">
              {{ option }}月
            </option>
          </select>
          <select v-model.number="birthDay" style="padding:8px;">
            <option v-for="option in dayOptions" :key="option" :value="option">
              {{ option }}日
            </option>
          </select>
          <select v-model.number="birthHour" style="padding:8px;">
            <option v-for="option in hourOptions" :key="option" :value="option">
              {{ option }}时
            </option>
          </select>
        </div>
        <p style="color:#777; margin:6px 0 0;">系统会根据出生时间粗略计算年龄：{{ age }} 岁</p>
      </label>

      <label>
        性别
        <select v-model="sex" style="width:100%; padding:8px;">
          <option value="male">男</option>
          <option value="female">女</option>
          <option value="other">其他</option>
        </select>
      </label>

      <label>
        近期症状（逗号分隔）
        <input v-model="symptomsText" type="text" style="width:100%; padding:8px;" />
      </label>

      <label>
        可穿戴数据 JSON
        <textarea
          v-model="wearableJson"
          rows="5"
          style="width:100%; padding:8px; font-family: Consolas, monospace;"
        />
      </label>

      <div style="border:1px dashed #ccc; padding:12px; border-radius:8px;">
        <div v-if="turnstileSiteKey">
          <div ref="turnstileContainer"></div>
          <p v-if="turnstileError" style="color:#c00; margin-top:8px;">{{ turnstileError }}</p>
        </div>
        <div v-else style="color:#777;">
          Turnstile 未配置（仅在生产环境建议启用）。
        </div>
      </div>

      <button type="submit" :disabled="loading" style="padding:10px 14px; cursor:pointer;">
        {{ loading ? '跳转中...' : '生成养生建议' }}
      </button>
    </form>

    <p v-if="error" style="color:#c00; margin-top:12px;">
      {{ error }}
    </p>
  </main>
</template>
