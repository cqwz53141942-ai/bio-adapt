<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

type Sex = 'male' | 'female' | 'other'

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

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const city = ref('上海')
const age = ref(30)
const sex = ref<Sex>('other')
const symptoms = ref('疲劳, 睡眠不足')
const wearableJson = ref('{"steps":7200,"hrv":35,"sleepHours":6.1}')

const loading = ref(false)
const error = ref('')
const streamOutput = ref('')
const sections = ref<Array<{ title: string; content: string }>>([])

const healthStatus = ref<{ ok: boolean; ts: string } | null>(null)
const healthError = ref('')

const turnstileToken = ref('')
const turnstileError = ref('')
const turnstileContainer = ref<HTMLDivElement | null>(null)
const turnstileWidgetId = ref<string | null>(null)

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

async function submitForm() {
  error.value = ''
  streamOutput.value = ''
  sections.value = []
  loading.value = true

  if (turnstileSiteKey && !turnstileToken.value) {
    loading.value = false
    turnstileError.value = '请先完成安全验证。'
    return
  }

  let wearable: unknown
  try {
    wearable = JSON.parse(wearableJson.value)
  } catch {
    loading.value = false
    error.value = '可穿戴数据 JSON 格式不正确。'
    return
  }

  const payload = {
    city: city.value,
    age: age.value,
    sex: sex.value,
    symptoms: symptoms.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    wearable,
    turnstileToken: turnstileToken.value || undefined
  }

  try {
    const response = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
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
    if (window.turnstile?.reset && turnstileWidgetId.value) {
      window.turnstile.reset(turnstileWidgetId.value)
      turnstileToken.value = ''
    }
  }
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

watch(streamOutput, (value) => {
  sections.value = parseSections(value)
})

onMounted(() => {
  loadTurnstileScript()
})
</script>

<template>
  <main style="max-width: 960px; margin: 0 auto; padding: 28px; font-family: 'Noto Serif SC', serif;">
    <h1>本草智养 · 体感建议</h1>
    <p style="color:#555;">
      基于城市天气、年龄、症状与可穿戴数据，生成日常养生参考建议（非诊断）。
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
        <input v-model="city" type="text" style="width:100%; padding:8px;" />
      </label>

      <label>
        年龄
        <input v-model.number="age" type="number" min="1" max="120" style="width:100%; padding:8px;" />
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
        <input v-model="symptoms" type="text" style="width:100%; padding:8px;" />
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
        {{ loading ? '生成中...' : '生成养生建议' }}
      </button>
    </form>

    <p v-if="error" style="color:#c00; margin-top:12px;">
      {{ error }}
    </p>

    <section style="margin-top:24px;">
      <h2>分段建议</h2>
      <div v-if="sections.length" style="display:grid; gap:12px; margin-top:12px;">
        <article v-for="section in sections" :key="section.title" style="padding:12px; border:1px solid #eee;">
          <h3 style="margin:0 0 8px;">{{ section.title }}</h3>
          <p style="white-space:pre-wrap; margin:0; color:#333;">{{ section.content }}</p>
        </article>
      </div>
      <p v-else style="color:#777; margin-top:8px;">等待流式建议输出...</p>
    </section>
  </main>
</template>
