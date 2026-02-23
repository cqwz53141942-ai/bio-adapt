import { createRouter, createWebHistory } from 'vue-router'
import InputPage from './pages/InputPage.vue'
import ResultPage from './pages/ResultPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/input' },
    { path: '/input', component: InputPage },
    { path: '/result', component: ResultPage }
  ]
})
