<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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

type LegacyPayload = {
  city?: string
  sex?: Sex
  birth?: Birth
  age?: number
  symptoms?: string | string[]
  wearable?: Record<string, unknown>
  wearableJson?: string
  turnstileToken?: string
}

const router = useRouter()

const loading = ref(false)
const error = ref('')
const streamOutput = ref('')
const sections = ref<Array<{ title: string; content: string }>>([])
const payload = ref<FormPayload | null>(null)

function parseSections(text: string) {
  const results: Array<{ title: string; content: string }> = []
  const regex = /【([^】]+)】/g
  let lastTitle = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex && lastTitle) {
      const content = text.slice(lastIndex, match.index).trim()
      if (content) results.push({ title: lastTitle, content })
    }
    lastTitle = match[1]
    lastIndex = regex.lastIndex
  }

  if (lastTitle) {
    const content = text.slice(lastIndex).trim()
    if (content) results.push({ title: lastTitle, content })
  }

  return results
}

function normalizeLegacy(raw: LegacyPayload): FormPayload | null {
  if ((raw as FormPayload).profile) return raw as FormPayload

  const birth = raw.birth ?? { year: 1990, month: 1, day: 1, hour: 0 }
  const profile = {
    city: raw.city ?? '未知',
    sex: raw.sex ?? 'other',
    birth
  }

  let symptoms: string[] = []
  if (Array.isArray(raw.symptoms)) {
    symptoms = raw.symptoms
  } else if (typeof raw.symptoms === 'string') {
    symptoms = raw.symptoms.split(',').map((item) => item.trim()).filter(Boolean)
  }

  let wearable: Record<string, unknown> = raw.wearable ?? {}
  if (!raw.wearable && raw.wearableJson) {
    try {
      wearable = JSON.parse(raw.wearableJson)
    } catch {
      wearable = {}
    }
  }

  return {
    profile,
    symptoms,
    wearable,
    age: raw.age ?? 0,
    turnstileToken: raw.turnstileToken
  }
}

async function loadPayload() {
  const raw = sessionStorage.getItem('bio-adapt-form')
  if (!raw) {
    payload.value = null
    return
  }

  try {
    const parsed = JSON.parse(raw) as FormPayload | LegacyPayload
    payload.value = normalizeLegacy(parsed)
  } catch {
    payload.value = null
  }
}

function summarizeWearable(wearable: Record<string, unknown>) {
  const parts: string[] = []
  const steps = typeof wearable.steps === 'number' ? wearable.steps : undefined
  const hrv = typeof wearable.hrv === 'number' ? wearable.hrv : undefined
  const sleepHours = typeof wearable.sleepHours === 'number' ? wearable.sleepHours : undefined

  if (steps !== undefined) parts.push(`步数 ${steps}`)
  if (hrv !== undefined) parts.push(`HRV ${hrv}`)
  if (sleepHours !== undefined) parts.push(`睡眠 ${sleepHours.toFixed(1)} 小时`)

  return parts.length ? parts.join('，') : '未提供关键字段'
}

const analysisBasis = computed(() => {
  if (!payload.value) return []
  const profile = payload.value.profile
  const birth = `${profile.birth.year}年${profile.birth.month}月${profile.birth.day}日${profile.birth.hour}时`
  const symptoms = payload.value.symptoms.length ? payload.value.symptoms.join('、') : '无明显不适'
  const wearableSummary = summarizeWearable(payload.value.wearable ?? {})

  return [
    `城市：${profile.city}`,
    `出生时间：${birth}`,
    `症状摘要：${symptoms}`,
    `可穿戴摘要：${wearableSummary}`
  ]
})

const requestKey = computed(() => {
  if (!payload.value) return ''
  const profile = payload.value.profile
  return [
    profile.city,
    profile.birth.year,
    profile.birth.month,
    profile.birth.day,
    profile.birth.hour,
    payload.value.symptoms.join('|')
  ].join(':')
})

async function fetchAdvice() {
  if (!payload.value) return

  error.value = ''
  streamOutput.value = ''
  sections.value = []
  loading.value = true

  const requestBody = {
    profile: payload.value.profile,
    symptoms: payload.value.symptoms,
    wearable: payload.value.wearable,
    age: payload.value.age,
    turnstileToken: payload.value.turnstileToken
  }

  try {
    sessionStorage.setItem('bio-adapt-advice-key', requestKey.value)
    const response = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok || !response.body) {
      throw new Error(`请求失败: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const eventText of events) {
        const lines = eventText.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              loading.value = false
              return
            }
            streamOutput.value += data
          }
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '未知错误'
  } finally {
    loading.value = false
  }
}

watch(streamOutput, (value) => {
  sections.value = parseSections(value)
})

watch(requestKey, (value, previous) => {
  if (!value || value === previous) return
  streamOutput.value = ''
  sections.value = []
  error.value = ''
})

onMounted(async () => {
  await loadPayload()
  if (payload.value) {
    await fetchAdvice()
  }
})
</script>

<template>
  <main style="max-width: 960px; margin: 0 auto; padding: 28px; font-family: 'Noto Serif SC', serif;">
    <header style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <div>
        <h1 style="margin:0;">本草智养 · 建议结果</h1>
        <p style="color:#555; margin:6px 0 0;">
          建议为养生参考，不构成诊断或治疗建议。
        </p>
      </div>
      <button type="button" @click="router.push('/input')" style="padding:8px 12px; cursor:pointer;">
        返回修改
      </button>
    </header>

    <div v-if="!payload" style="margin-top:20px; color:#c00;">
      未检测到输入信息，请先填写。
      <button type="button" @click="router.push('/input')" style="margin-left:8px; padding:6px 10px; cursor:pointer;">
        前往填写
      </button>
    </div>

    <section v-else style="margin-top:20px;">
      <section style="border:1px solid #eee; padding:12px; border-radius:8px;">
        <h2 style="margin:0 0 8px;">本次分析依据</h2>
        <ul style="margin:0; padding-left:18px; color:#555;">
          <li v-for="item in analysisBasis" :key="item">{{ item }}</li>
        </ul>
      </section>

      <p v-if="loading" style="margin-top:16px; color:#555;">建议生成中，请稍候...</p>
      <p v-if="error" style="margin-top:16px; color:#c00;">{{ error }}</p>

      <section style="margin-top:16px;">
        <h2>分段建议</h2>
        <div v-if="sections.length" style="display:grid; gap:12px; margin-top:12px;">
          <article v-for="section in sections" :key="section.title" style="padding:12px; border:1px solid #eee;">
            <h3 style="margin:0 0 8px;">{{ section.title }}</h3>
            <p style="white-space:pre-wrap; margin:0; color:#333;">{{ section.content }}</p>
          </article>
        </div>
        <p v-else style="color:#777; margin-top:8px;">等待流式建议输出...</p>
      </section>
    </section>
  </main>
</template>
