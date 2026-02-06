// ================================
// ai.js - AI Client + Cache
// ================================

// Preserve any existing values (set by config.js) to avoid overwriting backendURL
;(function(){
  const _prev = window.AI || {}
  window.AI = {
    backendURL: _prev.backendURL || "",
    provider: _prev.provider || "",
    apiKey: _prev.apiKey || "",

  // Helper: prefer localStorage override, then APP_CONFIG/AI, strip trailing slashes
  getBackendURLFromConfig() {
    try{
      const stored = String(localStorage.getItem('backend_url') || '').trim()
      const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
      return String(raw || '').replace(/\/+$/,'')
    }catch(e){ return '' }
  },

  // Helper: Get headers with JWT token for authenticated requests
  getAuthHeaders() {
    const headers = {}
    try{
      const token = localStorage.getItem('auth_token')
      if(token){
        headers['Authorization'] = 'Bearer ' + token
      }
    }catch(e){}
    return headers
  },

  init({ backendURL, provider, apiKey }) {
    // idempotent init: skip if nothing changed
    if (
      this.backendURL === backendURL &&
      this.provider === provider &&
      this.apiKey === apiKey
    ) {
      return
    }

    this.backendURL = backendURL
    this.provider = provider
    this.apiKey = apiKey

    console.log("🤖 AI ready:", provider)
    console.trace("AI.init called from:")
  },

  cacheKey(movieId) {
    return `ai_summary_${this.provider}_${movieId}`
  },

  async summarize({ movieId, title, overview }) {
    const key = this.cacheKey(movieId)

    // ===== CACHE HIT =====
    const cached = localStorage.getItem(key)
    if (cached) {
      console.log("🧠 AI cache hit")
      return cached
    }

    // ===== PROMPT =====
    const prompt = `
Ringkas film berikut secara singkat, padat, dan menarik:

Judul: ${title}
Sinopsis: ${overview}
    `.trim()

    // ===== CALL BACKEND =====
    // prefer a configured backend URL (localStorage / APP_CONFIG) over any pre-set this.backendURL
    const base = this.getBackendURLFromConfig() || this.backendURL
    if(!base) throw new Error('AI backendURL not configured')
    const res = await fetch(`${base}/ai/summarize`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        provider: this.provider,
        apiKey: this.apiKey,
        prompt
      })
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error)

    // ===== SAVE CACHE =====
    localStorage.setItem(key, data.result)

    return data.result
  }
  ,

  // Generic prompt runner (used by AI suggestions / social generator)
  async generate({ provider, apiKey, prompt, model } = {}) {
    const useProvider = provider || this.provider
    const useKey = apiKey || this.apiKey
    if (!this.backendURL) throw new Error("AI backendURL not configured")
    if (!useProvider) throw new Error("AI provider not configured")
    if (!useKey) throw new Error("AI apiKey not configured")
    if (!prompt) throw new Error("Missing prompt")

    // prefer a configured backend URL (localStorage / APP_CONFIG) over any pre-set this.backendURL
    const base = this.getBackendURLFromConfig() || this.backendURL
    if(!base) throw new Error('AI backendURL not configured')
    const res = await fetch(`${base}/ai/summarize`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({
        provider: useProvider,
        apiKey: useKey,
        prompt,
        model
      })
    })

    const data = await res.json()
    if (data?.error) throw new Error(data.error)
    return data?.result
  }
  }
})();