import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// window.storage polyfill — maps to localStorage for real deployment
window.storage = {
  get: (key) => Promise.resolve(
    localStorage.getItem(key) ? { key, value: localStorage.getItem(key) } : null
  ),
  set: (key, value) => Promise.resolve(
    localStorage.setItem(key, value) || { key, value }
  ),
  delete: (key) => Promise.resolve(
    localStorage.removeItem(key) || { key, deleted: true }
  ),
  list: (prefix) => Promise.resolve({
    keys: Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix))
  }),
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
