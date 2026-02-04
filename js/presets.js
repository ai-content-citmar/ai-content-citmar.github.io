// presets.js - presets manager: full Viral SEO Sales schema + localStorage + backend (KV) sync
(function(){
  const KEY = 'genco_presets_v1'

  /** Single default preset shape (all sections). Backward-compat: old fields label, platform, goal, tone, cta, structure, hashtagCount kept. */
  function getDefaultPreset(overrides){
    const d = {
      label: '',
      platform: 'tiktok',
      goal: [], // multi: FYP, SEO, Viewer, Viral, Penjualan
      role: '',
      targetAudience: '',
      tone: '',
      languageRules: '',
      emotionTrigger: [], // Penasaran, Takut ketinggalan, Senang, Termotivasi, Ingin beli
      structure: '',
      hookStyle: '',
      formatOutput: '',
      length: '',
      keywordMain: '',
      keywordExtra: '',
      hashtagStrategy: '',
      hashtagCount: 10,
      ctaMain: '',
      ctaAffiliate: '', // e.g. "Link di bio", "Klik link"
      ctaEngagement: [], // Comment, Save, Share, Follow
      engagementGoal: '',
      negativeRules: '',
      maxWords: 120,
      forbiddenWords: '',
      variationCount: 3,
      consistencyRule: false,
      exampleOutput: '',
      trendingContext: '',
      keywordPriorityOrder: '',
      // legacy
      goal: [],
      cta: '',
      structure: '',
      length: 'short',
      emojiStyle: 'light'
    }
    return Object.assign({}, d, overrides || {})
  }

  /** Build AI instruction string from preset object (all sections). */
  function buildPresetInstructions(p){
    if(!p || typeof p !== 'object') return ''
    const arr = []
    if(p.platform) arr.push('Platform: ' + p.platform)
    if(Array.isArray(p.goal) && p.goal.length) arr.push('Tujuan: ' + p.goal.join(', '))
    else if(p.goal) arr.push('Tujuan: ' + (typeof p.goal === 'string' ? p.goal : String(p.goal)))
    if(p.role) arr.push('Peran AI: ' + p.role)
    if(p.targetAudience) arr.push('Target audiens: ' + p.targetAudience)
    if(p.tone) arr.push('Gaya/Tone: ' + p.tone)
    if(p.languageRules) arr.push('Aturan bahasa: ' + p.languageRules)
    if(Array.isArray(p.emotionTrigger) && p.emotionTrigger.length) arr.push('Emosi target: ' + p.emotionTrigger.join(', '))
    if(p.structure) arr.push('Struktur: ' + p.structure)
    if(p.hookStyle) arr.push('Hook style: ' + p.hookStyle)
    if(p.formatOutput) arr.push('Format output: ' + p.formatOutput)
    if(p.length) arr.push('Panjang: ' + p.length)
    if(p.keywordMain) arr.push('Keyword utama: ' + p.keywordMain)
    if(p.keywordExtra) arr.push('Keyword tambahan: ' + p.keywordExtra)
    if(p.hashtagStrategy) arr.push('Strategi hashtag: ' + p.hashtagStrategy)
    if(p.hashtagCount != null) arr.push('Jumlah hashtag: ' + p.hashtagCount)
    if(p.ctaMain || p.cta) arr.push('CTA: ' + (p.ctaMain || p.cta))
    if(p.ctaAffiliate) arr.push('Link/CTA affiliate: ' + p.ctaAffiliate)
    if(Array.isArray(p.ctaEngagement) && p.ctaEngagement.length) arr.push('CTA engagement: ' + p.ctaEngagement.join(', '))
    if(p.engagementGoal) arr.push('Engagement goal: ' + p.engagementGoal)
    if(p.negativeRules) arr.push('Larangan: ' + p.negativeRules)
    if(p.maxWords != null) arr.push('Maks kata: ' + p.maxWords)
    if(p.forbiddenWords) arr.push('Kata terlarang: ' + p.forbiddenWords)
    if(p.exampleOutput) arr.push('Contoh output: ' + p.exampleOutput)
    if(p.trendingContext) arr.push('Trending: ' + p.trendingContext)
    if(p.keywordPriorityOrder) arr.push('Urutan keyword: ' + p.keywordPriorityOrder)
    return arr.join('. ')
  }

  const defaults = {
    Informal: Object.assign(getDefaultPreset(), {
      label: 'Informal',
      platform: 'youtube',
      goal: ['Viewer', 'Viral'],
      tone: 'santai, friendly',
      length: 'short',
      cta: 'Follow for more',
      structure: 'Hook -> Benefit -> CTA',
      hashtagCount: 8
    }),
    Jualan: Object.assign(getDefaultPreset(), {
      label: 'Jualan',
      platform: 'tiktok',
      goal: ['FYP', 'Penjualan'],
      tone: 'persuasif, santai',
      length: 'short',
      cta: 'Beli sekarang',
      structure: 'Hook -> Benefit -> Social proof -> CTA',
      hashtagCount: 10
    }),
    Edukasi: Object.assign(getDefaultPreset(), {
      label: 'Edukasi',
      platform: 'youtube',
      goal: ['SEO', 'Viewer'],
      tone: 'informative, clear',
      length: 'medium',
      cta: 'Pelajari lebih lanjut',
      structure: 'Hook -> 2 tips -> CTA',
      hashtagCount: 6
    }),
    TikTokFYP: Object.assign(getDefaultPreset(), {
      label: 'TikTok FYP',
      platform: 'tiktok',
      goal: ['FYP', 'Viral', 'Follower'],
      tone: 'energetic, hooky, relatable',
      length: 'short',
      cta: 'Follow & save',
      structure: 'Hook 3 detik -> Value -> CTA',
      hashtagCount: 12,
      variationCount: 3
    }),
    ReelsViral: Object.assign(getDefaultPreset(), {
      label: 'Reels Viral',
      platform: 'instagram',
      goal: ['FYP', 'Viral', 'Follower'],
      tone: 'energetic, aspirational',
      length: 'short',
      cta: 'Follow for more',
      structure: 'Hook -> Story/Value -> CTA',
      hashtagCount: 15,
      variationCount: 3
    }),
    FollowerGrowth: Object.assign(getDefaultPreset(), {
      label: 'Follower Growth',
      platform: 'youtube',
      goal: ['Follower', 'Viewer', 'Viral'],
      tone: 'friendly, engaging',
      length: 'short',
      cta: 'Subscribe & like',
      structure: 'Hook -> Benefit -> CTA follow/subscribe',
      hashtagCount: 8,
      variationCount: 3
    })
  }

  function getBackendURL(){
    try {
      const stored = String(localStorage.getItem('backend_url') || '').trim()
      const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || (window.API_BASE_URL || '')
      return String(raw || '').replace(/\/+$/, '')
    } catch (e) { return '' }
  }

  function load(){
    try { const raw = localStorage.getItem(KEY); if(!raw) return JSON.parse(JSON.stringify(defaults)); return JSON.parse(raw) } catch(e){ return JSON.parse(JSON.stringify(defaults)) }
  }

  function saveLocal(obj){
    try { localStorage.setItem(KEY, JSON.stringify(obj)); return true } catch(e){ return false }
  }

  /** Simpan ke localStorage + ke backend yang aktif (dari Settings/config: lokal 127.0.0.1:8787 atau external workers.dev). */
  function save(obj){
    saveLocal(obj)
    const base = getBackendURL()
    if (base) {
      fetch(base + '/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presets: obj })
      }).catch(() => {})
    }
    return true
  }

  function syncFromBackend(){
    const base = getBackendURL()
    if (!base) return Promise.resolve()
    return fetch(base + '/presets')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.presets === 'object' && Object.keys(data.presets).length) {
          const merged = Object.assign({}, defaults, data.presets)
          saveLocal(merged)
        }
      })
      .catch(() => {})
  }

  function list(){ const p = load(); return Object.keys(p).map(k=> ({ key:k, label: (p[k].label != null ? p[k].label : k) })) }
  function get(key){ const p = load(); return p[key] || null }
  function upsert(key, data){ const p = load(); p[key] = Object.assign(getDefaultPreset(), p[key] || {}, data); save(p); return true }
  function remove(key){ const p = load(); delete p[key]; save(p); return true }

  /** Export full presets as JSON (for backup to file). Safe to store on disk/cloud. */
  function exportBackup(){
    const obj = load()
    return { version: 1, key: KEY, exportedAt: new Date().toISOString(), presets: obj }
  }

  /** Import from backup object. Merges with existing (backup presets overwrite by key). Returns { success, mergedCount, error? }. */
  function importBackup(backup){
    if (!backup || typeof backup !== 'object') return { success: false, error: 'Invalid backup data' }
    const presets = backup.presets && typeof backup.presets === 'object' ? backup.presets : backup
    const current = load()
    let merged = Object.assign({}, current)
    let mergedCount = 0
    for (const k of Object.keys(presets)) {
      const v = presets[k]
      if (v && typeof v === 'object') {
        merged[k] = Object.assign(getDefaultPreset(), merged[k] || {}, v)
        mergedCount++
      }
    }
    save(merged)
    return { success: true, mergedCount }
  }

  /** Template presets for "Auto-fill" buttons (Jualan Viral, Edukasi Viral, Branding Viral). */
  function getTemplatePreset(name){
    const t = {
      JualanViral: getDefaultPreset({
        label: 'Jualan Viral Pro',
        platform: 'tiktok',
        goal: ['FYP', 'Viral', 'Penjualan'],
        role: 'Kamu adalah viral content strategist dan social media copywriter profesional untuk penjualan.',
        targetAudience: 'Usia 18–35, suka belanja online, suka promo, pemula.',
        tone: 'Santai, persuasif, relatable, urgency ringan',
        languageRules: 'Bahasa Indonesia santai, kalimat pendek, maksimal 2 emoji, tidak formal.',
        emotionTrigger: ['Penasaran', 'Takut ketinggalan', 'Ingin beli'],
        structure: 'Hook → Problem → Benefit → Proof → Question → CTA',
        hookStyle: 'Pertanyaan',
        formatOutput: 'Per baris sesuai struktur',
        length: '4–6 kalimat',
        keywordMain: 'skincare murah',
        keywordExtra: 'glowing, wajah bersih, aman',
        hashtagStrategy: 'Niche + keyword',
        hashtagCount: 10,
        ctaMain: 'Klik keranjang sekarang',
        ctaEngagement: ['Comment', 'Save', 'Share'],
        engagementGoal: 'Kombinasi',
        negativeRules: 'Jangan menyebut AI, jangan bahasa formal, jangan terlalu panjang.',
        maxWords: 120,
        forbiddenWords: 'gratis palsu, clickbait',
        variationCount: 3
      }),
      EdukasiViral: getDefaultPreset({
        label: 'Edukasi Viral',
        platform: 'youtube',
        goal: ['SEO', 'Viewer', 'Viral'],
        role: 'Kamu adalah edukator konten viral dan copywriter yang membuat penjelasan rumit jadi mudah.',
        targetAudience: 'Usia 18–40, ingin belajar cepat, suka konten singkat.',
        tone: 'Informative, clear, engaging',
        languageRules: 'Bahasa Indonesia baku santai, kalimat singkat, maksimal 1 emoji.',
        emotionTrigger: ['Penasaran', 'Termotivasi'],
        structure: 'Hook → 2 tips → CTA',
        hookStyle: 'Fakta mengejutkan',
        formatOutput: 'Per baris sesuai struktur',
        length: '4–6 kalimat',
        keywordMain: '',
        keywordExtra: '',
        hashtagStrategy: 'Keyword + trending',
        hashtagCount: 6,
        ctaMain: 'Pelajari lebih lanjut',
        ctaEngagement: ['Save', 'Share'],
        engagementGoal: 'Save',
        negativeRules: 'Jangan terlalu panjang, jangan jargon berat.',
        maxWords: 100,
        variationCount: 3
      }),
      BrandingViral: getDefaultPreset({
        label: 'Branding Viral',
        platform: 'instagram',
        goal: ['FYP', 'Viewer', 'Viral'],
        role: 'Kamu adalah brand storyteller dan copywriter yang membangun awareness dengan konten viral.',
        targetAudience: 'Usia 18–35, tertarik lifestyle dan brand.',
        tone: 'Energetic, aspirational, relatable',
        languageRules: 'Bahasa Indonesia santai, tone brand konsisten.',
        emotionTrigger: ['Senang', 'Termotivasi'],
        structure: 'Hook → Cerita singkat → Benefit → CTA',
        hookStyle: 'Cerita singkat',
        formatOutput: '2 paragraf',
        length: '6–8 kalimat',
        hashtagStrategy: 'Campuran',
        hashtagCount: 12,
        ctaMain: 'Follow untuk konten seru',
        ctaEngagement: ['Follow', 'Share'],
        engagementGoal: 'Kombinasi',
        negativeRules: 'Jangan terlalu jualan, fokus value.',
        maxWords: 150,
        variationCount: 3
      }),
      AffiliateReview: getDefaultPreset({
        label: 'Affiliate Review',
        platform: 'tiktok',
        goal: ['FYP', 'Penjualan', 'Viral'],
        role: 'Kamu adalah affiliate marketer yang menulis review produk yang jujur dan persuasif.',
        targetAudience: 'Pembeli online yang cari review singkat sebelum beli.',
        tone: 'Jujur, relatable, persuasif ringan',
        languageRules: 'Bahasa Indonesia santai, kalimat pendek.',
        emotionTrigger: ['Penasaran', 'Ingin beli'],
        structure: 'Hook → Review singkat → Kelebihan/Kekurangan → Rekomendasi → CTA',
        hookStyle: 'Pertanyaan atau pernyataan mengejutkan',
        hashtagCount: 10,
        ctaMain: 'Cek link di bio',
        ctaAffiliate: 'Link di bio',
        ctaEngagement: ['Save', 'Share', 'Comment'],
        maxWords: 100,
        variationCount: 3
      }),
      AffiliateTutorial: getDefaultPreset({
        label: 'Affiliate Tutorial',
        platform: 'youtube',
        goal: ['SEO', 'Viewer', 'Penjualan'],
        role: 'Kamu adalah pembuat tutorial yang mempromosikan produk lewat cara pakai/langkah-langkah.',
        targetAudience: 'Pemula yang cari panduan praktis.',
        tone: 'Informative, step-by-step, friendly',
        languageRules: 'Bahasa Indonesia jelas, langkah numerik.',
        emotionTrigger: ['Termotivasi', 'Penasaran'],
        structure: 'Hook → Masalah → Langkah 1–3 → Hasil → CTA',
        hookStyle: 'Janji solusi',
        hashtagCount: 8,
        ctaMain: 'Klik link di deskripsi',
        ctaAffiliate: 'Klik link di deskripsi',
        ctaEngagement: ['Save', 'Subscribe'],
        maxWords: 120,
        variationCount: 3
      })
    }
    return t[name] ? Object.assign(getDefaultPreset(), t[name]) : null
  }

  window.PresetsManager = {
    load, save, saveLocal, list, get, upsert, remove, syncFromBackend, getBackendURL,
    exportBackup, importBackup,
    getDefaultPreset, buildPresetInstructions, getTemplatePreset
  }
})()
