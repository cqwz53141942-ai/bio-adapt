<script setup lang="ts">
import { ref } from 'vue'

type Sex = 'male' | 'female' | 'other'

const city = ref('Shanghai')
const age = ref(30)
const sex = ref<Sex>('other')
const symptoms = ref('fatigue, poor sleep')
const wearableJson = ref('{"steps": 7200, "hrv": 35, "sleepHours": 6.1}')
const loading = ref(false)
const error = ref('')
const streamOutput = ref('')

async function submitForm() {
  error.value = ''
  streamOutput.value = ''
  loading.value = true

  let wearable: unknown
  try {
    wearable = JSON.parse(wearableJson.value)
  } catch {
    loading.value = false
    error.value = 'wearable JSON 格式不正确'
    return
  }

  const payload = {
    city: city.value,
    age: age.value,
    sex: sex.value,
    symptoms: symptoms.value.split(',').map(s => s.trim()).filter(Boolean),
    wearable
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
  }
}
</script>

<template>
  <main>
    <h1>Bio Adapt - Health Advice</h1>

    <form @submit.prevent="submitForm">
      <label>
        City
        <input v-model="city" required />
      </label>

      <label>
        Age
        <input v-model.number="age" type="number" min="0" max="120" required />
      </label>

      <label>
        Sex
        <select v-model="sex">
          <option value="male">male</option>
          <option value="female">female</option>
          <option value="other">other</option>
        </select>
      </label>

      <label>
        Symptoms (comma separated)
        <input v-model="symptoms" placeholder="fatigue, cough" />
      </label>

      <label>
        Wearable JSON
        <textarea v-model="wearableJson" rows="6"></textarea>
      </label>

      <button :disabled="loading" type="submit">{{ loading ? 'Generating...' : 'Get Advice' }}</button>
    </form>

    <p v-if="loading">加载中，正在流式生成建议...</p>
    <p v-if="error" class="error">错误：{{ error }}</p>

    <section>
      <h2>Stream Output</h2>
      <pre>{{ streamOutput }}</pre>
    </section>
  </main>
</template>

<style scoped>
main { max-width: 760px; margin: 2rem auto; font-family: system-ui, sans-serif; }
form { display: grid; gap: 0.8rem; }
label { display: grid; gap: 0.3rem; }
input, select, textarea, button { padding: 0.5rem; font-size: 1rem; }
pre { background: #111; color: #79f29a; padding: 1rem; border-radius: 8px; white-space: pre-wrap; }
.error { color: #c00; }
</style>
