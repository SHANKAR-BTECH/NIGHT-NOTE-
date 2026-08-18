import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ensureAnonymousSession } from './lib/db'

// Initialize anonymous session on app startup
ensureAnonymousSession().catch((err) => {
  console.warn('[main.tsx] Anonymous session init:', err)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
