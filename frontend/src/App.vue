<script setup lang="ts">
import { ref } from 'vue'

type Sex = 'male' | 'female' | 'other'

const city = ref('Shanghai')
const age = ref(30)
const sex = ref<Sex>('other')
const symptoms = ref('fatigue, poor sleep')
const wearableJson = ref('{"steps":7200,"hrv":35,"sleepHours":6.1}')

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
    error.value = 'Invalid wearable JSON format.'
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
    wearable
  }

  try {
    const response = await fetch('/api/advice', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok || !response.body) {
      throw new Error(`Request failed: ${response.status}`)
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
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main style="max-width: 860px; margin: 0 auto; padding: 24px; font-family: Arial, sans-serif;">
    <h1>Bio Adapt - Health Advice</h1>
    <p style="color:#666;">Lifestyle guidance generated from your inputs (demo).</p>

    <form @submit.prevent="submitForm" style="display:grid; gap:12px; margin-top:16px;">
      <label>
        City
        <input v-model="city" type="text" style="width:100%; padding:8px;" />
      </label>

      <label>
        Age
        <input v-model.number="age" type="number" min="1" max="120" style="width:100%; padding:8px;" />
      </label>

      <label>
        Sex
        <select v-model="sex" style="width:100%; padding:8px;">
          <option value="male">male</option>
          <option value="female">female</option>
          <option value="other">other</option>
        </select>
      </label>

      <label>
        Symptoms (comma separated)
        <input v-model="symptoms" type="text" style="width:100%; padding:8px;" />
      </label>

      <label>
        Wearable JSON
        <textarea
          v-model="wearableJson"
          rows="5"
          style="width:100%; padding:8px; font-family: Consolas, monospace;"
        />
      </label>

      <button type="submit" :disabled="loading" style="padding:10px 14px; cursor:pointer;">
        {{ loading ? 'Generating...' : 'Generate advice' }}
      </button>
    </form>

    <p v-if="error" style="color:#c00; margin-top:12px;">
      {{ error }}
    </p>

    <section style="margin-top:20px;">
      <h2>Streaming output</h2>
      <pre
        style="white-space:pre-wrap; background:#f6f8fa; padding:12px; border-radius:8px; min-height:120px;"
      >{{ streamOutput }}</pre>
    </section>
  </main>
</template>
