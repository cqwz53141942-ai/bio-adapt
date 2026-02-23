<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

type Payload = {
  city: string
  sex: 'male' | 'female' | 'other'
  symptoms: string
  wearableJson: string
  birth: { year: number; month: number; day: number; hour: number }
  age: number
  turnstileToken?: string
}

const router = useRouter()

const loading = ref(false)
const error = ref('')
const streamOutput = ref('')
const sections = ref<Array<{ title: string; content: string }>>([])
const payload = ref<Payload | null>(null)

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

async function loadPayload() {
  const raw = sessionStorage.getItem('bio-adapt-form')
  if (!raw) {
    payload.value = null
    return
  }

  try {
    payload.value = JSON.parse(raw) as Payload
  } catch {
    payload.value = null
  }
}

async function fetchAdvice() {
  if (!payload.value) return

  error.value = ''
  streamOutput.value = ''
  sections.value = []
  loading.value = true

  let wearable: unknown
  try {
    wearable = JSON.parse(payload.value.wearableJson)
  } catch {
    loading.value = false
    error.value = '可穿戴数据 JSON 格式不正确。'
    return
  }

  const requestBody = {
    city: payload.value.city,
    age: payload.value.age,
    sex: payload.value.sex,
    symptoms: payload.value.symptoms
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    wearable,
    birth: payload.value.birth,
    turnstileToken: payload.value.turnstileToken
  }

  try {
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
          建议为养生参考，非诊断结论。
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
      <div style="display:flex; gap:12px; flex-wrap:wrap; color:#666;">
        <span>城市：{{ payload.city }}</span>
        <span>性别：{{ payload.sex === 'male' ? '男' : payload.sex === 'female' ? '女' : '其他' }}</span>
        <span>
          出生：{{ payload.birth.year }}年{{ payload.birth.month }}月{{ payload.birth.day }}日
          {{ payload.birth.hour }}时
        </span>
        <span>年龄（估算）：{{ payload.age }}</span>
      </div>

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
