// ================================

// Global AI logging helper (available to all functions in this file)
function aiLog(level, tag, data){
  try{
    const ts = new Date().toISOString()
    const out = Object.assign({ ts, tag }, data || {})
    if(level === 'error') console.error('[AI]', tag, out)
    else if(level === 'warn') console.warn('[AI]', tag, out)
    else if(level === 'info') console.info('[AI]', tag, out)
    else console.debug('[AI]', tag, out)
  }catch(e){ /* ignore logging errors */ }
}
function getBackendURL(){
  try{
    const stored = String(localStorage.getItem('backend_url') || '').trim()
    const raw = stored || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
    return String(raw || '').replace(/\/+$/,'')
  }catch(e){ return '' }
}

/** Jika preset dipakai: tone & keyword dari preset; jika tidak: dari dropdown generator. */
function getEffectiveToneAndKeywords(){
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value || '').trim() : ''
    const p = presetKey && window.PresetsManager ? window.PresetsManager.get(presetKey) : null
    if(p){
      const kwParts = [p.keywordMain, p.keywordExtra].filter(Boolean).map(s=>String(s).trim())
      if(p.keywordPriorityOrder && String(p.keywordPriorityOrder).trim()) kwParts.push(String(p.keywordPriorityOrder).trim())
      return { tone: String(p.tone || '').trim(), keywordText: kwParts.length ? kwParts.join(', ') : '' }
    }
    const tone = (document.getElementById('aiToneSelect')?.value || 'neutral').trim()
    const kwEl = document.getElementById('aiKeywordSelect')
    let keywordText = ''
    if(kwEl){
      const opts = Array.from(kwEl.selectedOptions || []).map(o=>o.value).filter(Boolean)
      keywordText = opts.length ? opts.join(', ') : (kwEl.value || '').trim()
    }
    return { tone, keywordText }
  }catch(e){ return { tone: 'neutral', keywordText: '' } }
}

/** Return comma-separated string of all selected keywords (from multi-select or preset). Use in all generate flows. */
function getSelectedKeywords(){
  const { keywordText } = getEffectiveToneAndKeywords()
  if(keywordText) return keywordText
  const kwEl = document.getElementById('aiKeywordSelect')
  if(!kwEl) return ''
  const opts = Array.from(kwEl.selectedOptions || []).map(o=>o.value).filter(Boolean)
  return opts.length ? opts.join(', ') : (kwEl.value || '').trim()
}

// Shared platform rules for buildFullPrompt
const PLATFORM_INSTRUCTIONS = {
  youtube: 'YouTube Shorts rules:\n- Title <= 60 chars, hooky.\n- Description 1–2 short sentences + CTA (watch/follow).\n- Hashtags: 6–10, mix broad + niche.',
  tiktok: 'TikTok rules:\n- Title <= 70 chars, punchy.\n- Description 1–2 short lines, conversational.\n- Hashtags: 8–15.',
  instagram: 'Instagram Reels rules:\n- Title <= 70 chars.\n- Description 2–3 lines, energetic.\n- Hashtags: 12–25.',
  facebook: 'Facebook post rules:\n- Title <= 80 chars.\n- Description 2–4 sentences with engagement question.\n- Hashtags: 3–8.',
  x: 'X (Twitter) rules:\n- Title <= 70 chars.\n- Description <= 240 chars.\n- Hashtags: 1–3 only.',
  shopee: 'Shopee listing rules:\n- Title <= 60 chars.\n- Description: 2–4 short bullet points focusing on benefits.\n- Tags: 5–12 product/category focused.'
}

// Platform limits for character/word counters (title max chars)
const PLATFORM_TITLE_LIMITS = { youtube: 60, tiktok: 70, instagram: 70, facebook: 80, x: 70, shopee: 60 }

function updateCharCounters(){
  const titleEl = document.getElementById('aiMainTitle')
  const overviewEl = document.getElementById('aiMainOverview')
  const titleCounterEl = document.getElementById('aiTitleCounter')
  const overviewCounterEl = document.getElementById('aiOverviewCounter')
  if(!titleEl || !overviewEl || !titleCounterEl || !overviewCounterEl) return
  const platform = (document.getElementById('aiPlatformSelect')?.value || 'youtube').trim() || 'youtube'
  const titleLimit = PLATFORM_TITLE_LIMITS[platform] != null ? PLATFORM_TITLE_LIMITS[platform] : 60
  const presetKey = (document.getElementById('aiPresetSelect')?.value || '').trim()
  const presetObj = presetKey && window.PresetsManager ? window.PresetsManager.get(presetKey) : null
  const wordLimit = (presetObj && presetObj.maxWords != null) ? presetObj.maxWords : 120
  const titleLen = String(titleEl.value || '').length
  const overviewText = String(overviewEl.value || '').trim()
  const wordCount = overviewText ? overviewText.split(/\s+/).filter(Boolean).length : 0
  function colorClass(current, max){ if(current <= max * 0.8) return '#7cb87c'; if(current <= max) return '#d4a84b'; return '#c75c5c' }
  titleCounterEl.textContent = `${titleLen} / ${titleLimit}`
  titleCounterEl.style.color = colorClass(titleLen, titleLimit)
  overviewCounterEl.textContent = `${wordCount} words${wordLimit ? ` (max ${wordLimit})` : ''}`
  overviewCounterEl.style.color = colorClass(wordCount, wordLimit)
}

const VIRALITY_RULES = `Virality rules:
- Start description with a hook in the first 6–10 words.
- Hook: kalimat pembuka menarik untuk 3 detik pertama (FYP); harus bikin scroll berhenti.
- Add a clear CTA. If goal includes Follower: add CTA for follow/subscribe/save/comment.`

/** Single source of truth for AI prompt. Used by generateFromMain and generateVariations. */
function buildFullPrompt(opts){
  const {
    title = '',
    overview = '',
    platform = 'youtube',
    lang = 'id',
    preset = null,
    tone = 'neutral',
    keywords = '',
    presetInstructions = ''
  } = opts
  const goals = (preset && Array.isArray(preset.goal) && preset.goal.length) ? preset.goal : ['FYP', 'Viral']
  const goalsText = goals.join(', ')
  const goalExplicit = `Konten harus dioptimalkan untuk: ${goalsText}. FYP = hook kuat 3 detik pertama; SEO = keyword alami di title/deskripsi; Viral = shareable & emosional; Penjualan = CTA beli jelas; Follower = CTA follow/subscribe/save.`
  let ctaGuide = preset && (preset.ctaMain || preset.cta)
    ? `CTA harus sesuai tujuan: jika Penjualan → ${preset.ctaMain || preset.cta}; jika Follower → ajakan follow/subscribe/save.`
    : 'CTA harus jelas dan sesuai tujuan konten (follow/subscribe/save atau beli).'
  if (preset && preset.ctaAffiliate && String(preset.ctaAffiliate).trim()) {
    ctaGuide += ` Sertakan link/CTA affiliate: "${String(preset.ctaAffiliate).trim()}".`
  }
  const hashtagCount = (preset && preset.hashtagCount != null) ? preset.hashtagCount : 10
  const hashtagRule = `Hashtag: mix niche + keyword + 1–2 trending; total ${hashtagCount}; mendukung FYP dan SEO.`
  const maxWords = (preset && preset.maxWords != null) ? preset.maxWords : 120
  const languageInstruction = lang === 'en' ? 'Respond ONLY in English. Do not use any other language.' : 'Respond ONLY in Indonesian. Do not use any other language.'
  const platformInstruction = PLATFORM_INSTRUCTIONS[platform] || PLATFORM_INSTRUCTIONS.youtube
  const keywordFocus = keywords || 'none'
  let exampleBlock = ''
  if (preset && preset.exampleOutput && String(preset.exampleOutput).trim()) {
    exampleBlock = `\n\nContoh output yang diinginkan (ikuti gaya dan strukturnya):\n${String(preset.exampleOutput).trim()}\n\nGenerate konten baru dengan gaya serupa.\n`
  }
  const trendingBlock = (preset && preset.trendingContext && String(preset.trendingContext).trim())
    ? `\nKonteks trending: ${String(preset.trendingContext).trim()}\n`
    : ''
  return `${languageInstruction}
You are a creative social copywriter. Platform: ${platform}. Write in ${lang === 'id' ? 'Indonesian' : 'English'}.

Context:
- Title: "${title}"
- Overview: "${overview}"
- Keyword focus: ${keywordFocus}
- Tone: ${tone}

${goalExplicit}
${ctaGuide}
${hashtagRule}
Max words description: ${maxWords}.

${platformInstruction}
${presetInstructions ? ('Preset rules: ' + presetInstructions + '\n\n') : ''}${VIRALITY_RULES}
${trendingBlock}${exampleBlock}

Output JSON only with these exact keys: {"title":"...","description":"...","hashtags":["#..","#.."],"hook":"...","narratorScript":"..."}
- hook: kalimat pembuka menarik untuk 3 detik pertama (FYP).
- narratorScript: teks untuk voice/narator video (script yang dibacakan).
Return only the JSON.`.trim()
}

// ===== Keyword extraction & suggestions =====
const STOPWORDS_EN = new Set((`a,an,and,are,as,at,be,by,for,from,has,he,in,is,it,its,of,on,that,the,to,was,were,will,with`.split(',')));
const STOPWORDS_ID = new Set((`yang,dan,di,ke,dari,untuk,pada,adalah,ini,itu,sebuah,oleh,atau,karena,karna,adanya`.split(',')));

function normalizeTextForKeywords(text){
  try{
    const s = String(text||'').toLowerCase()
    // remove punctuation (keep unicode letters and numbers and spaces)
    return s.replace(/[^\p{L}0-9\s]+/gu, ' ')
  }catch(e){ return String(text||'').toLowerCase() }
}

function buildBigrams(tokens){
  const bs = []
  for(let i=0;i<tokens.length-1;i++){
    bs.push(tokens[i] + ' ' + tokens[i+1])
  }
  return bs
}

function extractKeywords(text, topN=5, platform){
  const raw = normalizeTextForKeywords(text)
  const toks = raw.split(/\s+/).filter(Boolean)
  // remove short tokens and stopwords
  const filtered = toks.filter(t => t.length >= 2 && !STOPWORDS_EN.has(t) && !STOPWORDS_ID.has(t) && !/^\d+$/.test(t))
  const bigrams = buildBigrams(filtered)
  const all = filtered.concat(bigrams)
  const freq = {}
  all.forEach(tok => { freq[tok] = (freq[tok]||0) + 1 })
  // weight title tokens slightly higher if platform suggests shorter focus
  const items = Object.keys(freq).map(k=>({k,v:freq[k]})).sort((a,b)=>b.v - a.v)
  return items.slice(0, topN).map(i=>i.k)
}

function getKeywordHistory(){
  try{ return JSON.parse(localStorage.getItem('keyword_history')||'[]') }catch(e){ return [] }
}
function pushKeywordHistory(list){
  try{
    const cur = getKeywordHistory()
    const merged = Array.from(new Set([...list, ...cur])).slice(0,50)
    localStorage.setItem('keyword_history', JSON.stringify(merged))
  }catch(e){}
}

const GENERATE_HISTORY_KEY = 'genco_generate_history'
const GENERATE_HISTORY_MAX = 50
const ACTIVE_PRESET_KEY = 'genco_active_preset'
const FEEDBACK_KEY = 'genco_feedback'
const FEEDBACK_MAX = 200
function getGenerateHistory(){
  try{ return JSON.parse(localStorage.getItem(GENERATE_HISTORY_KEY)||'[]') }catch(e){ return [] }
}
function pushGenerateHistory(entry){
  try{
    const list = getGenerateHistory()
    const id = 'h_' + Date.now()
    list.unshift(Object.assign({ id }, entry))
    const trimmed = list.slice(0, GENERATE_HISTORY_MAX)
    localStorage.setItem(GENERATE_HISTORY_KEY, JSON.stringify(trimmed))
  }catch(e){}
}
function getFeedbackStore(){
  try{ return JSON.parse(localStorage.getItem(FEEDBACK_KEY)||'[]') }catch(e){ return [] }
}
function setFeedback(id, rating){
  try{
    const list = getFeedbackStore().filter(x=> x.id !== id)
    list.unshift({ id, rating, ts: Date.now() })
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list.slice(0, FEEDBACK_MAX)))
  }catch(e){}
}

async function suggestKeywords({useAI=false, provider='openrouter', apiKey='', title='', overview='', topN=5}){
  // if useAI and backend available, call AI to generate keywords
  if(useAI){
    try{
      const backend = getBackendURL()
      if(!backend) throw new Error('Backend not configured')
      const prompt = `Generate ${topN} short keyword phrases (comma separated) from the following TITLE and OVERVIEW. Return only a comma-separated list. TITLE: ${title} OVERVIEW: ${overview}`
      const out = await window.AI.generate({ provider, apiKey, prompt })
      if(!out) return []
      // split by comma
      return out.split(',').map(s=>s.trim()).filter(Boolean).slice(0, topN)
    }catch(e){ console.warn('AI keyword suggest failed', e); return [] }
  }
  // client-side extraction
  const baseText = ((title||'') + ' ' + (overview||'')).trim()
  if(!baseText) return []
  return extractKeywords(baseText, topN)
}
function maskKey(k){ try{ if(!k) return false; const s = String(k); return '***'+s.slice(-4) }catch(e){ return true } }

function showToast(message, type){
  type = type || 'info'
  let el = document.getElementById('genco-toast')
  if(!el){ el = document.createElement('div'); el.id = 'genco-toast'; el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;padding:12px 16px;border-radius:8px;background:#1a1f26;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.4);font-size:14px;transition:opacity 0.2s'; document.body.appendChild(el) }
  el.textContent = message
  el.style.background = type === 'error' ? '#4a2020' : type === 'success' ? '#1a3020' : '#1a1f26'
  el.style.opacity = '1'
  clearTimeout(el._toastTimer)
  el._toastTimer = setTimeout(()=>{ el.style.opacity = '0' }, 2800)
}

// -----------------------
// Core functions
// -----------------------

// Mount AI generator into the main page (#aiMainContainer)
function mountAIGeneratorMain(){
  try{
    console.debug('mountAIGeneratorMain: entry')
    const root = document.getElementById('aiMainContainer')
    if(!root){ console.error('mountAIGeneratorMain: aiMainContainer not found'); return }

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar panel">
        <div class="nav-item active" data-action="generator"><svg viewBox="0 0 24 24"><path d="M12 2L2 7v6c0 5 3.7 9.2 9 11 5.3-1.8 9-6 9-11V7l-10-5z"/></svg><span class="nav-label">Generator</span></div>
        <div class="nav-item" data-action="history"><svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3z"/></svg><span class="nav-label">History</span></div>
        <div class="nav-item" data-action="presets"><svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5z"/></svg><span class="nav-label">Presets</span></div>
        <div style="flex:1"></div>
        <div class="nav-item" data-action="settings"><svg viewBox="0 0 24 24"><path d="M19.4 12.9a7.2 7.2 0 0 0 0-1.8l2.1-1.6-2-3.4-2.5.6a7 7 0 0 0-1.6-.9l-.4-2.6H9.9l-.4 2.6a7 7 0 0 0-1.6.9L5.4 6.1 3.4 9.5l2.1 1.6a7.2 7.2 0 0 0 0 1.8L3.4 15l2 3.4 2.5-.6c.5.4 1 .7 1.6.9l.4 2.6h4.2l.4-2.6c.6-.2 1.1-.5 1.6-.9l2.5.6 2-3.4z"/></svg><span class="nav-label">Settings</span></div>
      </aside>

      <main style="padding:6px">

        <div class="content-main">
          <section class="left-col">
            <div class="panel card">
              <input id="aiMainTitle" placeholder="Topic / Title" style="width:96%;padding:10px;border-radius:8px;border:1px solid #80808042;background:var(--card);color:#fff;margin-bottom:4px" />
              <div id="aiTitleCounter" class="char-counter" style="font-size:11px;margin-bottom:8px;min-height:14px">0 / 60</div>
              <textarea id="aiMainOverview" placeholder="Overview / Description" style="width:96%;padding:10px;border-radius:8px;border:1px solid #80808042;background:var(--card);color:#fff"></textarea>
              <div id="aiOverviewCounter" class="char-counter" style="font-size:11px;margin-top:4px;min-height:14px">0 words</div>
              <div style="display:flex;flex-wrap: wrap;gap:8px;align-items:center;margin-top:10px">
                <select id="aiLangSelect" style="padding:8px;border-radius:8px;background:#0b1218;color:#fff;border:none">
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
                <select id="aiKeywordSelect" style="padding:8px;border-radius:8px;background:#0b1218;color:#fff;border:none">
                  <option value="">(auto)</option>
                </select>
                  <label style="font-size:12px;margin-left:6px;display:flex;align-items:center;gap:6px"><input id="aiKeywordUseAI" type="checkbox" /> Use AI</label>
                  <button id="aiKeywordSuggestBtn" class="secondary">Suggest</button>
                <select id="aiToneSelect" style="padding:8px;border-radius:8px;background:#0b1218;color:#fff;border:none">
                  <option value="neutral">Neutral</option>
                  <option value="energetic">Energetic</option>
                  <option value="dramatic">Dramatic</option>
                  <option value="friendly">Friendly</option>
                </select>
                <div style="flex:1"></div>
                <div class="generate-row">
                  <button id="aiGenerateBtn" class="primary">Generate Content</button>
                  <button id="aiVariationsBtn" class="secondary">Buat 3 variasi</button>
                  <button id="aiClearBtn" class="secondary">Clear</button>
                </div>
              </div>
            </div>

            <div class="panel card">
              <h4 style="margin:0 0 8px 0">Presets</h4>
              <div style="display:flex;gap:8px;align-items:center">
                <select id="aiPresetSelect" style="flex:1;padding:8px;border-radius:6px;background:#0b1218;border:none;color:#fff">
                  <option value="">(Manual - no preset)</option>
                </select>
                <button id="managePresetsBtn" class="secondary">Manage</button>
              </div>
            </div>

          </section>

          <aside class="right-col">
            <div class="panel output-panel">
              <h3>Output</h3>
              <div id="aiResultPanel">Hasil generate akan muncul di sini.</div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  `;

  // render header into <header id="aiMainHeader"> (semantic placement inside #ai-main)
  (function renderHeader(){
    const headerEl = document.getElementById('aiMainHeader')
    if(!headerEl) return
    console.debug('mountAIGeneratorMain: rendering header')
    try{ aiLog('info','startup',{ backendURL: getBackendURL() || null }) }catch(e){}
    headerEl.innerHTML = `
      <div class="panel" style="display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-direction: row-reverse;">
        <button id="sidebarToggle" class="burger-btn" aria-label="Menu" title="Menu"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
        <h1 class="app-header-title">AI Content Generator untuk FYP &amp; Viral</h1>
        <div class="logo">
        <image src="./img/logo.svg" alt="Genco Logo" width="32" height="32" />
        </div>
      </div>
    `

    // create control panel (kept in main, not inside header)
    if(!document.getElementById('aiControlPanel')){
      const mainEl = document.querySelector('#aiMainContainer .app-shell main') || document.querySelector('#aiMainContainer main')
      const cp = document.createElement('div')
      cp.id = 'aiControlPanel'
      cp.className = 'panel header-controls'
      cp.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;flex:1">
          <select id="aiProviderSelect" class="select">
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq</option>
            <option value="together">Together</option>
            <option value="cohere">Cohere</option>
            <option value="huggingface">Hugging Face</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          <select id="aiModelSelect" class="select">
            <option value="">(auto)</option>
          </select>
          <select id="aiPlatformSelect" class="small">
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube Short</option>
            <option value="shopee">Shopee</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="x">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="pinterest">Pinterest</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <button class="primary" id="gotoGenerator">Generator</button>
          <button id="gotoHistory">History</button>
          <button id="gotoPreset">Preset</button>
        </div>
      `

      if(mainEl){
        const contentMain = mainEl.querySelector('.content-main')
        if(contentMain) mainEl.insertBefore(cp, contentMain)
        else mainEl.appendChild(cp)
      }else{
        headerEl.insertAdjacentElement('afterend', cp)
      }
      console.debug('mountAIGeneratorMain: control panel inserted')
    }
  })()

  console.debug('mountAIGeneratorMain: innerHTML set, wiring events')

  // wiring
  document.getElementById('aiGenerateBtn')?.addEventListener('click', generateFromMain)
  document.getElementById('aiVariationsBtn')?.addEventListener('click', ()=> generateVariations())
  document.getElementById('aiClearBtn')?.addEventListener('click', ()=>{
    document.getElementById('aiMainTitle').value = ''
    document.getElementById('aiMainOverview').value = ''
    document.getElementById('aiResultPanel').innerHTML = 'Hasil generate akan muncul di sini.'
    try{ updateCharCounters() }catch(e){}
  })
  document.getElementById('aiMainTitle')?.addEventListener('input', updateCharCounters)
  document.getElementById('aiMainOverview')?.addEventListener('input', updateCharCounters)
  document.getElementById('aiPlatformSelect')?.addEventListener('change', updateCharCounters)
  try{ updateCharCounters() }catch(e){}

  // models wiring
  const providerEl = document.getElementById('aiProviderSelect')
  const modelEl = document.getElementById('aiModelSelect')
  // restore provider from settings if available
  const providerFromSettings = localStorage.getItem('ai_provider') || ''
  if(providerEl && providerFromSettings) providerEl.value = providerFromSettings
  providerEl?.addEventListener('change', ()=> loadModelsFor(providerEl.value || 'gemini', modelEl))
  loadModelsFor(providerEl?.value || 'gemini', modelEl)

  // wire manage button (dropdown will be populated after updatePresetDropdown is defined)
  document.getElementById('managePresetsBtn')?.addEventListener('click', ()=> showView('presets'))
  const presetSel = document.getElementById('aiPresetSelect')
  if(presetSel){
    presetSel.addEventListener('change', ()=>{
      const key = String(presetSel.value || '').trim()
      try{ updatePresetPreview(key) }catch(e){}
      try{ updateCharCounters() }catch(e){}
    })
  }

  // Sidebar toggle (mobile): create overlay and wiring
  try{
    const sidebarToggle = document.getElementById('sidebarToggle')
    if(sidebarToggle){
      let overlay = document.querySelector('.sidebar-overlay')
      if(!overlay){ overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay) }
      const toggleSidebar = (open) => { document.body.classList.toggle('sidebar-open', !!open) }
      sidebarToggle.addEventListener('click', (e)=>{ e.preventDefault(); toggleSidebar(!document.body.classList.contains('sidebar-open')) })
      overlay.addEventListener('click', ()=> toggleSidebar(false))
      document.querySelectorAll('.sidebar .nav-item').forEach(n=> n.addEventListener('click', ()=> toggleSidebar(false)))
      window.addEventListener('resize', ()=> { if(window.innerWidth > 720 && document.body.classList.contains('sidebar-open')) document.body.classList.remove('sidebar-open') })
    }
  }catch(e){ console.warn('sidebar toggle wiring failed', e) }
  console.debug('mountAIGeneratorMain: sidebar wiring complete')

  // Navigation: sidebar items toggle views (generator / history / presets / settings)
  try{
    const navItems = document.querySelectorAll('#aiMainContainer .sidebar .nav-item')
    function showView(view){
      const set = document.getElementById('ai-settings-placeholder')
      const pres = document.getElementById('ai-presets-placeholder')
      const hist = document.getElementById('ai-history-placeholder')
      const gen = document.getElementById('aiMainContainer')
      if(view === 'settings'){
        if(gen) gen.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'none'
        if(set) set.style.display = 'block'
        renderSettingsPage()
      }else if(view === 'presets'){
        if(gen) gen.style.display = 'none'
        if(set) set.style.display = 'none'
        if(hist) hist.style.display = 'none'
        if(pres) pres.style.display = 'block'
        renderPresetsPage()
      }else if(view === 'history'){
        if(gen) gen.style.display = 'none'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'block'
        renderHistoryPage()
      }else{
        if(gen) gen.style.display = 'block'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(hist) hist.style.display = 'none'
      }
    }
    navItems.forEach(it=>{
      it.addEventListener('click', ()=>{
        navItems.forEach(n=>n.classList.remove('active'))
        it.classList.add('active')
        const action = it.getAttribute('data-action')
        if(action === 'settings') showView('settings')
        else if(action === 'presets') showView('presets')
        else if(action === 'history') showView('history')
        else showView('generator')
        // close sidebar on mobile
        if(document.body.classList.contains('sidebar-open')) document.body.classList.remove('sidebar-open')
      })
    })
  }catch(e){ console.warn('nav wiring failed', e) }

  // Settings page renderer + wiring
  function renderSettingsPage(){
    const placeholder = document.getElementById('ai-settings-placeholder')
    if(!placeholder) return

    // If already rendered, just update values
    const existing = placeholder.querySelector('.settings-page')
    if(existing){
      populateSettingsForm()
      return
    }

    placeholder.style.display = 'block'
    placeholder.innerHTML = `
      <div class="panel settings-page">
        <h2 style="margin-top:0">Settings</h2>
        <div class="control-pane">
          <div class="control-group">
              <label>Backend URL</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input id="settingsBackendURL" type="text" style="flex:1" placeholder="https://your-backend.workers.dev" />
                <button id="settingsBackendTest" class="secondary">Test</button>
                <button id="settingsBackendSave" class="primary">Save</button>
              </div>
              <div style="font-size:12px;margin-top:6px;color:#c9d0b3">Backend untuk AI dan penyimpanan presets. Lokal (mis. http://127.0.0.1:8787) = simpan di project; external (mis. workers.dev) = simpan di server tersebut.</div>
            </div>

            <div class="control-group">
              <label>Default provider</label>
              <select id="settingsDefaultProvider">
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="groq">Groq</option>
                <option value="together">Together</option>
                <option value="cohere">Cohere</option>
                <option value="huggingface">Hugging Face</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

          <div class="control-group">
            <label id="settingsKeyLabel">API Key</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="settingsKey_single" type="password" style="flex:1" placeholder="sk-..." />
              <button id="settingsShowBtn" class="secondary">Show</button>
              <button id="testKey_single" class="primary">Test</button>
              <button id="settingsDeleteBtn" class="secondary">Delete from server</button>
            </div>
            <div id="settingsServerStatus" style="font-size:12px;margin-top:6px;color:#c9d0b3"></div>
          </div>

          <div style="display:flex;gap:10px;align-items:center">
            <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="settingsRemember" /> Remember API keys</label>
          </div>

          <div style="display:flex;gap:8px;margin-top:12px">
            <button id="settingsSaveBtn" class="primary">Save</button>
            <button id="settingsCancelBtn" class="secondary">Close</button>
          </div>

          <div id="settingsStatus" class="status info" style="display:none;margin-top:12px"></div>
        </div>
      </div>
    `

    function showStatus(msg, type='info'){
      const el = document.getElementById('settingsStatus')
      if(!el) return
      el.textContent = msg
      el.className = 'status '+(type||'info')
      el.style.display = 'block'
      setTimeout(()=>{ if(el) el.style.display = 'none' }, 4000)
    }

    function getStoredAI(){ try{ return AppSettings.getAI() || { provider: 'gemini', keys: {} } }catch(e){ return { provider: 'gemini', keys: {} } } }

    // Save settings helper used by Settings UI and internal code
    function saveSettings(obj){
      try{
        const raw = localStorage.getItem('ai-settings')
        const s = raw ? JSON.parse(raw) : { provider: 'gemini', keys: {} }
        if(obj && typeof obj === 'object'){
          if(obj.provider) s.provider = obj.provider
          if(obj.keys && typeof obj.keys === 'object') s.keys = Object.assign(s.keys||{}, obj.keys)
        }
        localStorage.setItem('ai-settings', JSON.stringify(s))
        // also persist provider for convenience
        try{ if(s.provider) localStorage.setItem('ai_provider', s.provider) }catch(e){}
        // expose to other modules
        try{ window.AppSettings && typeof window.AppSettings.saveAI === 'function' && window.AppSettings.saveAI(s) }catch(e){}
        return s
      }catch(e){ console.warn('saveSettings failed', e); return null }
    }
    function populateSettingsForm(){
      const s = getStoredAI()
      const remember = localStorage.getItem('remember_api_keys')
      const prov = s.provider || 'gemini'
      document.getElementById('settingsDefaultProvider').value = prov
      document.getElementById('settingsKeyLabel').textContent = `API Key for ${prov}`
      document.getElementById('settingsRemember').checked = remember === null ? true : String(remember) === 'true'
      // delegate loading the key (only call backend if reachable to avoid console errors)
      ;(async ()=>{
        const backendURL = getBackendURL()
        const keyInput = document.getElementById('settingsKey_single')
        // if no backend configured, just populate from local settings
        if(!backendURL){ try{ if(keyInput) keyInput.value = s.keys?.[prov] || '' }catch(e){} return }

        // try a quick ping to /ai/debug with short timeout
        try{
          const controller = new AbortController()
          const timer = setTimeout(()=>controller.abort(), 800)
          const res = await fetch(backendURL + '/ai/debug', { signal: controller.signal })
          clearTimeout(timer)
          if(res && res.ok){
            try{ await loadKeyForProvider(prov) }catch(e){ /* ignore */ }
            return
          }
        }catch(e){ /* unreachable or timed out */ }

        // fallback: show stored key instead of calling backend
        try{ if(keyInput) keyInput.value = s.keys?.[prov] || '' }catch(e){}
      })()
    }

    // populate backend URL control from localStorage or app config
    try{
      const storedBackend = localStorage.getItem('backend_url') || ''
      const backendInput = document.getElementById('settingsBackendURL')
      if(backendInput){
        backendInput.value = storedBackend || (window.APP_CONFIG && window.APP_CONFIG.backendURL) || (window.AI && window.AI.backendURL) || ''
      }
    }catch(e){}

    // Load key for a specific provider (uses backend /ai/get-key when available)
    function loadKeyForProvider(provider){
      const s = getStoredAI()
      const backendURL = getBackendURL()

      document.getElementById('settingsKeyLabel').textContent = `API Key for ${provider}`
      // clear status while loading
      const statusEl = document.getElementById('settingsServerStatus')
      if(statusEl) statusEl.textContent = ''

      if(!backendURL){
        try{ document.getElementById('settingsKey_single').value = s.keys?.[provider] || '' }catch(e){}
        return
      }

      aiLog('info','getKey.request',{ provider, backendURL })
      fetch(`${backendURL}/ai/get-key?provider=${encodeURIComponent(provider)}`)
        .then(r=>r.json())
        .then(j=>{
          aiLog('info','getKey.response',{ provider, result: j })
          try{ document.getElementById('settingsKey_single').value = (!j?.error ? (j.apiKey || (s.keys?.[provider] || '')) : (s.keys?.[provider] || '')) }catch(e){}
          // Query debug endpoint to show whether KV is bound in this runtime
          try{
            fetch(`${backendURL}/ai/debug`).then(r2=>r2.json()).then(dj=>{
              const statusEl2 = document.getElementById('settingsServerStatus')
              if(!statusEl2) return
              if(dj && dj.kvBound) statusEl2.textContent = 'Server: KV bound (keys persisted)'
              else statusEl2.textContent = 'Server: KV not bound — keys may be ephemeral locally'
            }).catch(()=>{})
          }catch(e){}
        }).catch(err=>{ aiLog('error','getKey.error',{ provider, error: String(err) }); try{ document.getElementById('settingsKey_single').value = s.keys?.[provider] || '' }catch(e){} })
    }

    function testKey(){
      const provider = document.getElementById('settingsDefaultProvider').value
      const input = document.getElementById('settingsKey_single')
      const key = input ? String(input.value||'').trim() : ''
      if(!key) return showStatus('API key is empty', 'error')
      showStatus('Testing key...', 'info')
      const backendURL = getBackendURL()
      if(!backendURL) return showStatus('Backend URL not configured', 'error')
      fetch(`${backendURL}/ai/models?provider=${encodeURIComponent(provider)}&apiKey=${encodeURIComponent(key)}`)
        .then(r=>r.json()).then(j=>{
          if(j?.error) throw new Error(j.error)
          if(Array.isArray(j?.models)) showStatus('Key valid — '+(j.models.length)+' models available', 'success')
          else showStatus('Key looks valid', 'success')
        }).catch(err=> showStatus('Key test failed: '+String(err?.message||err), 'error'))
    }

    async function saveSettingsFromForm(){
      const provider = document.getElementById('settingsDefaultProvider').value
      const apiKey = String(document.getElementById('settingsKey_single').value || '').trim()
      const remember = document.getElementById('settingsRemember').checked
      localStorage.setItem('remember_api_keys', remember ? 'true' : 'false')

      if(!apiKey) return showStatus('API key kosong', 'error')

        try{
        showStatus('Menyimpan kunci ke backend...', 'info')
          // read backend URL from settings input (allow overriding default)
          const backendInputEl = document.getElementById('settingsBackendURL')
          let backendURL = (backendInputEl && String(backendInputEl.value||'').trim()) || getBackendURL()
          backendURL = String(backendURL || '').replace(/\/+$/,'')
          if(!backendURL) throw new Error('Backend URL not configured')
          // persist chosen backend URL for future sessions and update runtime config
          try{ localStorage.setItem('backend_url', backendURL); window.APP_CONFIG = window.APP_CONFIG || {}; window.APP_CONFIG.backendURL = backendURL; window.AI = window.AI || {}; window.AI.backendURL = backendURL }catch(e){}
        aiLog('info','saveKey.request',{ provider, backendURL })
        const res = await fetch(`${backendURL}/ai/save-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey })
        })
        const j = await res.json().catch(()=>({}))
        aiLog('info','saveKey.response',{ provider, result: j })
        if(res.ok && j?.ok){
          // save selected provider and key locally according to remember preference
          saveSettings({ provider, keys: { [provider]: apiKey } })
          try{
            if(remember){
              localStorage.setItem('ai_api_key', apiKey)
              localStorage.setItem('ai_provider', provider)
            }else{
              sessionStorage.setItem('ai_api_key', apiKey)
              sessionStorage.setItem('ai_provider', provider)
              // ensure persistent copies removed
              localStorage.removeItem('ai_api_key')
            }
          }catch(e){}
          showStatus('Settings disimpan di backend', 'success')
          const provEl = document.getElementById('aiProviderSelect')
          if(provEl){ provEl.value = provider; loadModelsFor(provider, document.getElementById('aiModelSelect')) }
        }else{
          throw new Error(j?.error || 'Save failed')
        }
      }catch(e){ showStatus('Save failed: '+String(e?.message||e), 'error') }
    }

    // wire buttons
    populateSettingsForm()
    document.getElementById('testKey_single')?.addEventListener('click', ()=> testKey())
    document.getElementById('settingsDefaultProvider')?.addEventListener('change', (ev)=>{
      try{
        const p = (ev && ev.target && ev.target.value) || document.getElementById('settingsDefaultProvider').value
        // update label and load key for the selected provider (from backend or local)
        document.getElementById('settingsKeyLabel').textContent = `API Key for ${p}`
        try{ loadKeyForProvider(p) }catch(e){}
      }catch(e){ /* ignore */ }
    })

    // show/hide API key
    const showBtn = document.getElementById('settingsShowBtn')
    showBtn?.addEventListener('click', ()=>{
      const input = document.getElementById('settingsKey_single')
      if(!input) return
      if(input.type === 'password'){ input.type = 'text'; showBtn.textContent = 'Hide' }
      else { input.type = 'password'; showBtn.textContent = 'Show' }
    })

    // delete key from server (if backend bound)
    const delBtn = document.getElementById('settingsDeleteBtn')
    delBtn?.addEventListener('click', async ()=>{
      const provider = document.getElementById('settingsDefaultProvider').value
      const backendURL = (window.APP_CONFIG && window.APP_CONFIG.backendURL) ? window.APP_CONFIG.backendURL : (window.AI && window.AI.backendURL) ? window.AI.backendURL : ''
      if(!backendURL) return showStatus('Backend URL not configured', 'error')
      if(!confirm('Delete stored API key for "'+provider+'" from server?')) return
      showStatus('Deleting key from server...', 'info')
      try{
        const res = await fetch(`${backendURL}/ai/delete-key?provider=${encodeURIComponent(provider)}`, { method: 'DELETE' })
        const j = await res.json().catch(()=>({}))
        if(res.ok && j?.ok){
          showStatus('Key deleted from server', 'success')
          // clear displayed value and local copies
          try{ document.getElementById('settingsKey_single').value = '' }catch(e){}
          try{ const s = getStoredAI(); if(s && s.keys) s.keys[provider] = ''; saveSettings(s) }catch(e){}
        }else{
          throw new Error(j?.error || 'Delete failed')
        }
      }catch(e){ showStatus('Delete failed: '+String(e?.message||e), 'error') }
    })
    document.getElementById('settingsSaveBtn')?.addEventListener('click', saveSettingsFromForm)
    // backend test button: ping /ai/debug
    document.getElementById('settingsBackendTest')?.addEventListener('click', async ()=>{
      const be = document.getElementById('settingsBackendURL')
      if(!be) return showStatus('Backend input not found','error')
      let url = String(be.value||'').trim()
      url = url.replace(/\/+$/,'')
      if(!url) return showStatus('Backend URL kosong','error')
      showStatus('Testing backend...', 'info')
      try{
        const r = await fetch(url + '/ai/debug')
        const j = await r.json().catch(()=>({}))
        if(j && j.ok) showStatus('Backend reachable — KV bound: '+Boolean(j.kvBound), 'success')
        else showStatus('Backend responded but unexpected body', 'error')
      }catch(e){ showStatus('Backend test failed: '+String(e?.message||e), 'error') }
    })
    // save backend url button
    document.getElementById('settingsBackendSave')?.addEventListener('click', async ()=>{
      const be = document.getElementById('settingsBackendURL')
      if(!be) return showStatus('Backend input not found','error')
      let url = String(be.value||'').trim()
      url = url.replace(/\/+$/,'')
      if(!url) return showStatus('Backend URL kosong','error')
      try{
        localStorage.setItem('backend_url', url)
        window.APP_CONFIG = window.APP_CONFIG || {}; window.APP_CONFIG.backendURL = url
        window.AI = window.AI || {}; window.AI.backendURL = url
        showStatus('Backend URL disimpan', 'success')
      }catch(e){ showStatus('Save failed: '+String(e?.message||e), 'error') }
    })
    document.getElementById('settingsCancelBtn')?.addEventListener('click', ()=>{
      document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
      const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
      if(genNav) genNav.classList.add('active')
      // show generator
      document.getElementById('ai-settings-placeholder').style.display = 'none'
      document.getElementById('aiMainContainer').style.display = 'block'
    })
  }

  console.debug('mountAIGeneratorMain: renderSettingsPage defined')

  function renderHistoryPage(){
    const placeholder = document.getElementById('ai-history-placeholder')
    if(!placeholder) return
    const list = getGenerateHistory()
    const feedbackList = getFeedbackStore()
    const byPlatform = {}
    const byPreset = {}
    list.forEach(e=>{
      const p = e.platform || '(none)'
      byPlatform[p] = (byPlatform[p]||0) + 1
      const k = e.presetKey || '(manual)'
      byPreset[k] = (byPreset[k]||0) + 1
    })
    const topPreset = Object.keys(byPreset).length ? Object.entries(byPreset).sort((a,b)=>b[1]-a[1])[0] : null
    const goodCount = feedbackList.filter(x=>x.rating==='good').length
    const badCount = feedbackList.filter(x=>x.rating==='bad').length
    const platformLines = Object.entries(byPlatform).map(([k,v])=>k+': '+v).join(' · ') || '-'
    placeholder.style.display = 'block'
    placeholder.innerHTML = `
      <div class="panel presets-page">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h2>History Generate</h2>
          <div style="display:flex;gap:8px">
            <button id="historyExportCsvBtn" class="secondary">Export riwayat CSV</button>
            <button id="historyCloseBtn" class="secondary">Close</button>
          </div>
        </div>
        <div id="historyStats" style="margin-top:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:13px;color:#aaa">
          <strong>Stats</strong>: Total ${list.length} generate. Platform: ${platformLines}. ${topPreset ? 'Preset terbanyak: ' + topPreset[0] + ' (' + topPreset[1] + ').' : ''} Feedback: ${goodCount} Bagus, ${badCount} Kurang.
        </div>
        <p style="font-size:13px;color:#888;margin-top:8px">Daftar generate terakhir. Klik "Pakai lagi" untuk mengisi Title & Overview dan kembali ke Generator.</p>
        <div id="historyList" style="margin-top:12px;display:flex;flex-direction:column;gap:8px"></div>
        ${list.length === 0 ? '<p style="color:#666;margin-top:12px">Belum ada riwayat.</p>' : ''}
      </div>
    `
    const listEl = document.getElementById('historyList')
    if(listEl && list.length){
      list.forEach(entry=>{
        const d = entry.ts ? new Date(entry.ts) : null
        const dateStr = d ? d.toLocaleString() : ''
        const titleSnippet = (entry.title || '').slice(0, 50) + ((entry.title||'').length > 50 ? '…' : '')
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;flex-wrap:wrap;gap:8px'
        row.innerHTML = `
          <div>
            <div style="font-weight:600">${(titleSnippet || '(no title)').replace(/</g,'&lt;')}</div>
            <div style="font-size:12px;color:#888;margin-top:4px">${entry.platform || ''}${entry.presetKey ? ' · ' + String(entry.presetKey).replace(/</g,'&lt;') : ''}${entry.goals ? ' · ' + String(entry.goals).replace(/</g,'&lt;') : ''} · ${entry.type || 'generate'} · ${dateStr}</div>
          </div>
          <button class="small primary" data-history-id="${entry.id || ''}" data-history-title="${String(entry.title||'').replace(/"/g,'&quot;')}" data-history-overview="${String(entry.overview||'').replace(/"/g,'&quot;').replace(/</g,'&lt;')}">Pakai lagi</button>
        `
        listEl.appendChild(row)
      })
      listEl.querySelectorAll('button[data-history-id]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const title = btn.getAttribute('data-history-title') || ''
          const overview = btn.getAttribute('data-history-overview') || ''
          const titleEl = document.getElementById('aiMainTitle')
          const overviewEl = document.getElementById('aiMainOverview')
          if(titleEl) titleEl.value = title
          if(overviewEl) overviewEl.value = overview
          showView('generator')
          document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
          const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
          if(genNav) genNav.classList.add('active')
        })
      })
    }
    document.getElementById('historyExportCsvBtn')?.addEventListener('click', ()=>{
      const list = getGenerateHistory()
      const headers = ['ts','date','title','overview','platform','presetKey','goals','type']
      const rows = [headers]
      list.forEach(e=>{
        const d = e.ts ? new Date(e.ts) : null
        rows.push([
          e.ts || '',
          d ? d.toISOString() : '',
          (e.title||'').replace(/"/g,'""'),
          (e.overview||'').replace(/"/g,'""'),
          e.platform || '',
          e.presetKey || '',
          (e.goals||'').replace(/"/g,'""'),
          e.type || ''
        ])
      })
      const csv = rows.map(r=> r.map(c=>'"'+String(c)+'"').join(',')).join('\n')
      const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'genco_history_' + new Date().toISOString().slice(0,10) + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast('Riwayat di-export', 'success')
    })
    document.getElementById('historyCloseBtn')?.addEventListener('click', ()=>{
      placeholder.style.display = 'none'
      document.getElementById('aiMainContainer').style.display = 'block'
      document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
      const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
      if(genNav) genNav.classList.add('active')
    })
  }

  // Presets page renderer (sync from backend first so list is global/cross-device)
  function renderPresetsPage(){
    const placeholder = document.getElementById('ai-presets-placeholder')
    if(!placeholder) return
    const existing = placeholder.querySelector('.presets-page')
    if(existing){ return }

    ;(window.PresetsManager.syncFromBackend || (()=>Promise.resolve()))().then(()=>{
    const presets = window.PresetsManager.list()
    placeholder.innerHTML = `
      <div class="panel presets-page">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2>Presets (Manage)</h2>
          <button id="presetsCloseBtn" class="secondary">Close</button>
        </div>
        <div id="presetsList" style="display:flex;flex-direction:column;gap:8px;margin-top:10px"></div>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <input id="newPresetName" placeholder="Nama preset baru" style="flex:1;min-width:160px;padding:8px;border-radius:6px;background:#0b1218;border:none;color:#fff" />
          <button id="createPresetBtn" class="primary">Buat</button>
        </div>
        <div id="presetsBackendIndicator" style="margin-top:10px;font-size:11px;color:#6a8;padding:6px 8px;background:rgba(0,40,20,0.3);border-radius:6px"></div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="font-size:12px;color:#888">Backup aman (simpan ke file):</span>
          <button id="presetsExportBackupBtn" class="secondary" type="button">Export backup (.json)</button>
          <label style="margin:0;cursor:pointer">
            <input type="file" id="presetsImportBackupInput" accept=".json,application/json" style="display:none" />
            <span class="secondary" style="display:inline-block;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.2)">Import backup</span>
          </label>
        </div>
      </div>
    `

    // Tampilkan backend aktif: presets selalu disimpan ke backend ini (lokal atau external)
    const presetsBackendIndicator = document.getElementById('presetsBackendIndicator')
    if (presetsBackendIndicator) {
      const url = (window.PresetsManager && window.PresetsManager.getBackendURL()) || ''
      if (url) {
        const isLocal = /127\.0\.0\.1|localhost|^https?:\/\/\[?::1\]?/i.test(url)
        presetsBackendIndicator.textContent = 'Presets disimpan ke backend: ' + (isLocal ? 'Lokal (project)' : 'External') + ' — ' + url
      } else {
        presetsBackendIndicator.textContent = 'Presets hanya di browser. Set Backend URL di Settings agar tersimpan ke server.'
      }
    }

    function renderList(){
      const listEl = document.getElementById('presetsList')
      listEl.innerHTML = ''
      const items = window.PresetsManager.list()
      items.forEach(it=>{
        const el = document.createElement('div')
        el.style.display = 'flex'
        el.style.justifyContent = 'space-between'
        el.style.alignItems = 'center'
        el.style.gap = '8px'
        el.innerHTML = `<div style="font-weight:600">${it.label}</div><div style="display:flex;gap:8px"><button class="small" data-preset="${it.key}" data-action="edit">Edit</button><button class="small" data-preset="${it.key}" data-action="delete">Delete</button></div>`
        listEl.appendChild(el)
      })
    }

    function esc(v){ return String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
    function getEditVal(id){ const el = document.getElementById(id); return el ? String(el.value||'').trim() : '' }
    function getEditNum(id, def){ const n = parseInt(document.getElementById(id)?.value, 10); return isNaN(n) ? def : n }
    function getEditChecks(name){ return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el=>el.value) }

    function openEditor(key){
      const data = window.PresetsManager.get(key) || window.PresetsManager.getDefaultPreset({ label: key })
      const goalArr = Array.isArray(data.goal) ? data.goal : (data.goal ? String(data.goal).split(',').map(s=>s.trim()).filter(Boolean) : [])
      const emotionArr = Array.isArray(data.emotionTrigger) ? data.emotionTrigger : []
      const ctaEngArr = Array.isArray(data.ctaEngagement) ? data.ctaEngagement : []
      const modal = document.createElement('div')
      modal.className = 'panel preset-editor-modal'
      modal.style.marginTop = '12px'
      modal.style.maxHeight = '85vh'
      modal.style.overflowY = 'auto'
      modal.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <h3 style="margin:0">Edit Preset: ${esc(key)}</h3>
          <div style="display:flex;gap:8px">
            <button type="button" class="small" data-template="JualanViral">Jualan Viral</button>
            <button type="button" class="small" data-template="EdukasiViral">Edukasi Viral</button>
            <button type="button" class="small" data-template="BrandingViral">Branding Viral</button>
            <button id="cancelPresetEd" class="secondary">Cancel</button>
            <button id="savePresetEd" class="primary">Save</button>
          </div>
        </div>
        <div class="preset-accordion" style="display:flex;flex-direction:column;gap:8px">
          <details class="preset-section" open>
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧩 Section 1: Basic Info</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Label Preset <span title="Digunakan untuk mengoptimalkan FYP dan SEO">?</span></label>
              <input id="editLabel" placeholder="Viral Jualan Pro" value="${esc(data.label||key)}" style="max-width:320px" />
              <label>Platform</label>
              <select id="editPlatform">
                <option value="tiktok" ${(data.platform||'')==='tiktok'?'selected':''}>TikTok</option>
                <option value="youtube" ${(data.platform||'')==='youtube'?'selected':''}>YouTube Shorts</option>
                <option value="shopee" ${(data.platform||'')==='shopee'?'selected':''}>Shopee</option>
                <option value="instagram" ${(data.platform||'')==='instagram'?'selected':''}>Instagram Reels</option>
                <option value="facebook" ${(data.platform||'')==='facebook'?'selected':''}>Facebook</option>
                <option value="X" ${(data.platform||'')==='X'?'selected':''}>X (Twitter)</option>
                 <option value="linkedin" ${(data.platform||'')==='linkedin'?'selected':''}>LinkedIn</option>
                <option value="pinterest" ${(data.platform||'')==='pinterest'?'selected':''}>Pinterest</option>
              </select>
              <label>Tujuan Utama (Goal)</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <label><input type="checkbox" name="editGoal" value="FYP" ${goalArr.includes('FYP')?'checked':''} /> FYP</label>
                <label><input type="checkbox" name="editGoal" value="SEO" ${goalArr.includes('SEO')?'checked':''} /> SEO</label>
                <label><input type="checkbox" name="editGoal" value="Viewer" ${goalArr.includes('Viewer')?'checked':''} /> Viewer</label>
                <label><input type="checkbox" name="editGoal" value="Viral" ${goalArr.includes('Viral')?'checked':''} /> Viral</label>
                <label><input type="checkbox" name="editGoal" value="Penjualan" ${goalArr.includes('Penjualan')?'checked':''} /> Penjualan</label>
                <label><input type="checkbox" name="editGoal" value="Follower" ${goalArr.includes('Follower')?'checked':''} /> Follower</label>
              </div>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧑‍💼 Section 2: AI Role & Audience</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Peran AI (Role / Persona)</label>
              <textarea id="editRole" rows="2" placeholder="Kamu adalah viral content strategist dan social media copywriter profesional">${esc(data.role)}</textarea>
              <label>Target Audiens</label>
              <textarea id="editTargetAudience" rows="2" placeholder="Usia 18–35, suka belanja online, suka promo, pemula">${esc(data.targetAudience)}</textarea>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">✍️ Section 3: Style & Emotion</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Gaya / Tone</label>
              <input id="editTone" placeholder="Santai, persuasif, relatable, urgency ringan" value="${esc(data.tone)}" />
              <label>Aturan Bahasa (Language Rules)</label>
              <textarea id="editLanguageRules" rows="2" placeholder="Bahasa Indonesia santai, kalimat pendek, maksimal 2 emoji, tidak formal">${esc(data.languageRules)}</textarea>
              <label>Emosi Target (Emotion Trigger)</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <label><input type="checkbox" name="editEmotion" value="Penasaran" ${emotionArr.includes('Penasaran')?'checked':''} /> Penasaran</label>
                <label><input type="checkbox" name="editEmotion" value="Takut ketinggalan" ${emotionArr.includes('Takut ketinggalan')?'checked':''} /> Takut ketinggalan</label>
                <label><input type="checkbox" name="editEmotion" value="Senang" ${emotionArr.includes('Senang')?'checked':''} /> Senang</label>
                <label><input type="checkbox" name="editEmotion" value="Termotivasi" ${emotionArr.includes('Termotivasi')?'checked':''} /> Termotivasi</label>
                <label><input type="checkbox" name="editEmotion" value="Ingin beli" ${emotionArr.includes('Ingin beli')?'checked':''} /> Ingin beli</label>
              </div>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧱 Section 4: Structure & Format</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Struktur Output</label>
              <input id="editStructure" placeholder="Hook → Problem → Benefit → Proof → Question → CTA" value="${esc(data.structure)}" />
              <label>Hook Style</label>
              <select id="editHookStyle">
                <option value="">—</option>
                <option value="Pertanyaan" ${(data.hookStyle||'')==='Pertanyaan'?'selected':''}>Pertanyaan</option>
                <option value="Fakta mengejutkan" ${(data.hookStyle||'')==='Fakta mengejutkan'?'selected':''}>Fakta mengejutkan</option>
                <option value="Rahasia" ${(data.hookStyle||'')==='Rahasia'?'selected':''}>Rahasia</option>
                <option value="Larangan" ${(data.hookStyle||'')==='Larangan'?'selected':''}>Larangan</option>
                <option value="Cerita singkat" ${(data.hookStyle||'')==='Cerita singkat'?'selected':''}>Cerita singkat</option>
              </select>
              <label>Format Output</label>
              <select id="editFormatOutput">
                <option value="">—</option>
                <option value="Per baris sesuai struktur" ${(data.formatOutput||'')==='Per baris sesuai struktur'?'selected':''}>Per baris sesuai struktur</option>
                <option value="1 paragraf" ${(data.formatOutput||'')==='1 paragraf'?'selected':''}>1 paragraf</option>
                <option value="2 paragraf" ${(data.formatOutput||'')==='2 paragraf'?'selected':''}>2 paragraf</option>
              </select>
              <label>Panjang Konten</label>
              <select id="editLength">
                <option value="3–4 kalimat" ${(data.length||'')==='3–4 kalimat'?'selected':''}>3–4 kalimat</option>
                <option value="4–6 kalimat" ${(data.length||'')==='4–6 kalimat'?'selected':''}>4–6 kalimat</option>
                <option value="6–8 kalimat" ${(data.length||'')==='6–8 kalimat'?'selected':''}>6–8 kalimat</option>
                <option value="short" ${(data.length||'')==='short'?'selected':''}>short</option>
                <option value="medium" ${(data.length||'')==='medium'?'selected':''}>medium</option>
                <option value="long" ${(data.length||'')==='long'?'selected':''}>long</option>
              </select>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🔍 Section 5: SEO & Discovery</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Keyword Utama (SEO Focus)</label>
              <input id="editKeywordMain" placeholder="skincare murah" value="${esc(data.keywordMain)}" />
              <label>Keyword Tambahan (comma separated)</label>
              <input id="editKeywordExtra" placeholder="glowing, wajah bersih, aman" value="${esc(data.keywordExtra)}" />
              <label>Hashtag Strategy</label>
              <select id="editHashtagStrategy">
                <option value="">—</option>
                <option value="Niche + keyword" ${(data.hashtagStrategy||'')==='Niche + keyword'?'selected':''}>Niche + keyword</option>
                <option value="Keyword + trending" ${(data.hashtagStrategy||'')==='Keyword + trending'?'selected':''}>Keyword + trending</option>
                <option value="Campuran" ${(data.hashtagStrategy||'')==='Campuran'?'selected':''}>Campuran</option>
              </select>
              <label>Jumlah Hashtag</label>
              <input type="number" id="editHashtagCount" min="1" max="30" value="${data.hashtagCount != null ? data.hashtagCount : 10}" style="max-width:80px" />
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">📢 Section 6: Engagement & Conversion</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>CTA Utama (Penjualan)</label>
              <input id="editCtaMain" placeholder="Klik keranjang sekarang" value="${esc(data.ctaMain || data.cta)}" />
              <label>Link/CTA Affiliate (opsional)</label>
              <input id="editCtaAffiliate" placeholder="Link di bio / Klik link" value="${esc(data.ctaAffiliate || '')}" />
              <label>CTA Engagement</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                <label><input type="checkbox" name="editCtaEngagement" value="Comment" ${ctaEngArr.includes('Comment')?'checked':''} /> Comment</label>
                <label><input type="checkbox" name="editCtaEngagement" value="Save" ${ctaEngArr.includes('Save')?'checked':''} /> Save</label>
                <label><input type="checkbox" name="editCtaEngagement" value="Share" ${ctaEngArr.includes('Share')?'checked':''} /> Share</label>
                <label><input type="checkbox" name="editCtaEngagement" value="Follow" ${ctaEngArr.includes('Follow')?'checked':''} /> Follow</label>
              </div>
              <label>Engagement Goal</label>
              <select id="editEngagementGoal">
                <option value="">—</option>
                <option value="Komentar" ${(data.engagementGoal||'')==='Komentar'?'selected':''}>Komentar</option>
                <option value="Save" ${(data.engagementGoal||'')==='Save'?'selected':''}>Save</option>
                <option value="Share" ${(data.engagementGoal||'')==='Share'?'selected':''}>Share</option>
                <option value="Kombinasi" ${(data.engagementGoal||'')==='Kombinasi'?'selected':''}>Kombinasi</option>
              </select>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🚫 Section 7: Control & Quality</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Larangan (Negative Rules)</label>
              <textarea id="editNegativeRules" rows="2" placeholder="Jangan menyebut AI, jangan bahasa formal, jangan terlalu panjang">${esc(data.negativeRules)}</textarea>
              <label>Batas Kalimat / Karakter (Maks kata)</label>
              <input type="number" id="editMaxWords" min="1" max="500" value="${data.maxWords != null ? data.maxWords : 120}" style="max-width:80px" />
              <label>Forbidden Words (opsional)</label>
              <input id="editForbiddenWords" placeholder="gratis palsu, clickbait" value="${esc(data.forbiddenWords)}" />
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🔁 Section 8: Productivity</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Jumlah Variasi Output</label>
              <input type="number" id="editVariationCount" min="1" max="10" value="${data.variationCount != null ? data.variationCount : 3}" style="max-width:80px" />
              <label><input type="checkbox" id="editConsistencyRule" ${data.consistencyRule?'checked':''} /> Aktifkan preset ini untuk semua output sampai diganti</label>
            </div>
          </details>
          <details class="preset-section">
            <summary style="cursor:pointer;font-weight:600;padding:6px 0">🧪 Section 9: Advanced (Optional)</summary>
            <div style="padding:8px 0 0 12px;display:flex;flex-direction:column;gap:8px">
              <label>Example Output (Few-shot)</label>
              <textarea id="editExampleOutput" rows="3" placeholder="Contoh caption ideal...">${esc(data.exampleOutput)}</textarea>
              <label>Trending Context</label>
              <input id="editTrendingContext" placeholder="Tren skincare 2026" value="${esc(data.trendingContext)}" />
              <label>Keyword Priority Order</label>
              <input id="editKeywordPriorityOrder" placeholder="Keyword 1 → Keyword 2 → Keyword 3" value="${esc(data.keywordPriorityOrder)}" />
            </div>
          </details>
        </div>
      `
      const listEl = document.getElementById('presetsList')
      listEl.insertAdjacentElement('afterbegin', modal)

      function readForm(){
        return {
          label: getEditVal('editLabel') || key,
          platform: getEditVal('editPlatform') || 'tiktok',
          goal: getEditChecks('editGoal'),
          role: getEditVal('editRole'),
          targetAudience: getEditVal('editTargetAudience'),
          tone: getEditVal('editTone'),
          languageRules: getEditVal('editLanguageRules'),
          emotionTrigger: getEditChecks('editEmotion'),
          structure: getEditVal('editStructure'),
          hookStyle: getEditVal('editHookStyle'),
          formatOutput: getEditVal('editFormatOutput'),
          length: getEditVal('editLength'),
          keywordMain: getEditVal('editKeywordMain'),
          keywordExtra: getEditVal('editKeywordExtra'),
          hashtagStrategy: getEditVal('editHashtagStrategy'),
          hashtagCount: getEditNum('editHashtagCount', 10),
          ctaMain: getEditVal('editCtaMain'),
          cta: getEditVal('editCtaMain'),
          ctaAffiliate: getEditVal('editCtaAffiliate'),
          ctaEngagement: getEditChecks('editCtaEngagement'),
          engagementGoal: getEditVal('editEngagementGoal'),
          negativeRules: getEditVal('editNegativeRules'),
          maxWords: getEditNum('editMaxWords', 120),
          forbiddenWords: getEditVal('editForbiddenWords'),
          variationCount: getEditNum('editVariationCount', 3),
          consistencyRule: !!document.getElementById('editConsistencyRule')?.checked,
          exampleOutput: getEditVal('editExampleOutput'),
          trendingContext: getEditVal('editTrendingContext'),
          keywordPriorityOrder: getEditVal('editKeywordPriorityOrder')
        }
      }

      modal.querySelectorAll('button[data-template]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const t = window.PresetsManager.getTemplatePreset(btn.getAttribute('data-template'))
          if(!t) return
          document.getElementById('editLabel').value = t.label || ''
          document.getElementById('editPlatform').value = t.platform || 'tiktok'
          document.querySelectorAll('input[name="editGoal"]').forEach(el=>{ el.checked = (t.goal||[]).includes(el.value) })
          document.getElementById('editRole').value = t.role || ''
          document.getElementById('editTargetAudience').value = t.targetAudience || ''
          document.getElementById('editTone').value = t.tone || ''
          document.getElementById('editLanguageRules').value = t.languageRules || ''
          document.querySelectorAll('input[name="editEmotion"]').forEach(el=>{ el.checked = (t.emotionTrigger||[]).includes(el.value) })
          document.getElementById('editStructure').value = t.structure || ''
          document.getElementById('editHookStyle').value = t.hookStyle || ''
          document.getElementById('editFormatOutput').value = t.formatOutput || ''
          document.getElementById('editLength').value = t.length || 'short'
          document.getElementById('editKeywordMain').value = t.keywordMain || ''
          document.getElementById('editKeywordExtra').value = t.keywordExtra || ''
          document.getElementById('editHashtagStrategy').value = t.hashtagStrategy || ''
          document.getElementById('editHashtagCount').value = t.hashtagCount != null ? t.hashtagCount : 10
          document.getElementById('editCtaMain').value = t.ctaMain || t.cta || ''
          document.getElementById('editCtaAffiliate').value = t.ctaAffiliate || ''
          document.querySelectorAll('input[name="editCtaEngagement"]').forEach(el=>{ el.checked = (t.ctaEngagement||[]).includes(el.value) })
          document.getElementById('editEngagementGoal').value = t.engagementGoal || ''
          document.getElementById('editNegativeRules').value = t.negativeRules || ''
          document.getElementById('editMaxWords').value = t.maxWords != null ? t.maxWords : 120
          document.getElementById('editForbiddenWords').value = t.forbiddenWords || ''
          document.getElementById('editVariationCount').value = t.variationCount != null ? t.variationCount : 3
          document.getElementById('editConsistencyRule').checked = !!t.consistencyRule
          document.getElementById('editExampleOutput').value = t.exampleOutput || ''
          document.getElementById('editTrendingContext').value = t.trendingContext || ''
          document.getElementById('editKeywordPriorityOrder').value = t.keywordPriorityOrder || ''
        })
      })

      document.getElementById('cancelPresetEd').addEventListener('click', ()=>{ modal.remove(); renderList() })
      document.getElementById('savePresetEd').addEventListener('click', ()=>{
        window.PresetsManager.upsert(key, readForm())
        modal.remove()
        renderList()
        updatePresetDropdown()
      })
    }

    renderList()

    document.getElementById('createPresetBtn').addEventListener('click', ()=>{
      const name = String(document.getElementById('newPresetName').value||'').trim()
      if(!name){ showToast('Masukkan nama preset', 'error'); return }
      if(window.PresetsManager.get(name)){ showToast('Preset sudah ada', 'error'); return }
      window.PresetsManager.upsert(name, Object.assign(window.PresetsManager.getDefaultPreset(), { label: name }))
      document.getElementById('newPresetName').value = ''
      renderList()
      updatePresetDropdown()
    })

    // delegate actions (edit/delete)
    placeholder.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button')
      if(!btn) return
      const action = btn.getAttribute('data-action')
      const key = btn.getAttribute('data-preset')
      if(action === 'edit'){
        openEditor(key)
      }else if(action === 'delete'){
        if(confirm('Hapus preset "'+key+'"?')){ window.PresetsManager.remove(key); renderList(); updatePresetDropdown() }
      }
    })

    // Export backup: download presets as JSON file (simpan aman di komputer/cloud)
    const exportBackupBtn = document.getElementById('presetsExportBackupBtn')
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', ()=>{
        const backup = window.PresetsManager.exportBackup()
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `genco_presets_backup_${new Date().toISOString().slice(0,10)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
    }

    // Import backup: pilih file .json lalu merge ke presets
    const importBackupInput = document.getElementById('presetsImportBackupInput')
    if (importBackupInput) {
      importBackupInput.addEventListener('change', (e)=>{
        const file = e.target.files && e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = ()=>{
          try {
            const raw = reader.result
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw
            const result = window.PresetsManager.importBackup(data)
            if (result.success) {
              renderList()
              updatePresetDropdown()
              showToast('Backup di-import. ' + (result.mergedCount ? result.mergedCount + ' preset digabung.' : ''), 'success')
            } else {
              showToast('Import gagal: ' + (result.error || 'format tidak valid'), 'error')
            }
          } catch (err) {
            showToast('Import gagal: file bukan JSON valid. ' + (err && err.message), 'error')
          }
          e.target.value = ''
        }
        reader.readAsText(file)
      })
    }

    // Close button wiring: hide presets and show generator
    const closeBtn = document.getElementById('presetsCloseBtn')
    if(closeBtn){
      closeBtn.addEventListener('click', ()=>{
        try{
          placeholder.style.display = 'none'
          const gen = document.getElementById('aiMainContainer')
          if(gen) gen.style.display = 'block'
          document.querySelectorAll('#aiMainContainer .sidebar .nav-item').forEach(n=>n.classList.remove('active'))
          const genNav = document.querySelector('#aiMainContainer .sidebar .nav-item[data-action="generator"]')
          if(genNav) genNav.classList.add('active')
        }catch(e){/* ignore */}
      })
    }
    })
  }

  // preview helper: render preset summary + when preset used, disable Keyword & Tone dropdowns (murni dari preset)
  function updatePresetPreview(key){
    const previewElId = 'presetPreview'
    let el = document.getElementById(previewElId)
    if(!el){
      const panel = document.querySelector('#aiMainContainer .panel.card')
      if(!panel) return
      el = document.createElement('div')
      el.id = previewElId
      el.style.marginTop = '8px'
      el.style.padding = '8px'
      el.style.background = 'rgba(255,255,255,0.02)'
      el.style.borderRadius = '6px'
      panel.appendChild(el)
    }
    const presetNoteId = 'presetControlsNote'
    let presetNote = document.getElementById(presetNoteId)

    if(!key){
      el.innerHTML = '<em>No preset selected</em>'
      if(presetNote) presetNote.remove()
      try{
        const toneSel = document.getElementById('aiToneSelect'); if(toneSel){ toneSel.disabled = false }
        const kwSel = document.getElementById('aiKeywordSelect'); if(kwSel){ kwSel.disabled = false }
        const varBtn = document.getElementById('aiVariationsBtn'); if(varBtn) varBtn.textContent = 'Buat 3 variasi'
      }catch(e){}
      return
    }
    const p = window.PresetsManager.get(key)
    if(!p) return el.innerHTML = '<em>Preset not found</em>'
    const goals = Array.isArray(p.goal) && p.goal.length ? p.goal.join(', ') : (p.goal || '')
    const cta = p.ctaMain || p.cta || ''
    el.innerHTML = `<div style="font-size:13px"><strong>${p.label || key}</strong> — ${goals} · ${p.tone || ''} · ${p.length || ''}</div><div style="font-size:12px;margin-top:6px">Platform: ${p.platform || ''} · CTA: ${cta} · Structure: ${p.structure || ''} · Hashtags: ${p.hashtagCount != null ? p.hashtagCount : ''}</div>`
    if(p.platform){
      const platformEl = document.getElementById('aiPlatformSelect')
      if(platformEl && ['youtube','tiktok','instagram','facebook','x','shopee'].indexOf(p.platform) >= 0) platformEl.value = p.platform
    }
    try{ aiLog('info','presetPreview',{ key, preview: p }) }catch(e){}

    // Preset aktif: nonaktifkan Keyword & Tone dropdown — pakai murni dari preset
    try{
      const toneSel = document.getElementById('aiToneSelect')
      const kwSel = document.getElementById('aiKeywordSelect')
      if(toneSel) toneSel.disabled = true
      if(kwSel) kwSel.disabled = true
      if(!presetNote){
        presetNote = document.createElement('div')
        presetNote.id = presetNoteId
        presetNote.style.fontSize = '12px'
        presetNote.style.marginTop = '6px'
        presetNote.style.color = '#c9d0b3'
        const wrap = document.querySelector('#aiMainContainer .panel.card .generate-row') || toneSel?.parentNode || el
        if(wrap) wrap.insertAdjacentElement('beforebegin', presetNote)
      }
      presetNote.innerHTML = (p.tone ? `<span>Tone (dari preset): <strong>${String(p.tone).replace(/</g,'&lt;')}</strong>. </span>` : '') + 'Menggunakan keyword & tone dari preset.'
      if(p.consistencyRule){
        try{ localStorage.setItem(ACTIVE_PRESET_KEY, key) }catch(e){}
      }else{
        try{ if(localStorage.getItem(ACTIVE_PRESET_KEY) === key) localStorage.removeItem(ACTIVE_PRESET_KEY) }catch(e){}
      }
      const n = (p.variationCount != null ? Math.min(10, Math.max(1, p.variationCount)) : 3)
      const varBtn = document.getElementById('aiVariationsBtn')
      if(varBtn) varBtn.textContent = 'Buat ' + n + ' variasi'
    }catch(e){}
  }

  console.debug('mountAIGeneratorMain: updatePresetPreview defined')

  // ensure placeholder exists in DOM for presets
  let pp = document.getElementById('ai-presets-placeholder')
  if(!pp){ pp = document.createElement('div'); pp.id = 'ai-presets-placeholder'; pp.style.display = 'none'; document.body.appendChild(pp) }

  // helper to update presets dropdown in generator
  function updatePresetDropdown(){
    const sel = document.getElementById('aiPresetSelect')
    if(!sel) return
    const cur = sel.value || ''
    sel.innerHTML = '<option value="">(Manual - no preset)</option>'
    const items = window.PresetsManager.list()
    items.forEach(it=>{ const o = document.createElement('option'); o.value = it.key; o.textContent = it.label; sel.appendChild(o) })
    if(cur) sel.value = cur
  }

  // expose update function globally so main can call it
  window.updatePresetDropdown = updatePresetDropdown

  // populate dropdown after optional backend sync (so presets are global/cross-device)
  ;(window.PresetsManager.syncFromBackend || (()=>Promise.resolve()))().then(()=>{
    try{
      updatePresetDropdown()
      const sel = document.getElementById('aiPresetSelect')
      const activeKey = (function(){ try{ return localStorage.getItem(ACTIVE_PRESET_KEY) || '' }catch(e){ return '' } })()
      if(sel){
        if(activeKey && window.PresetsManager.get(activeKey)){
          sel.value = activeKey
          updatePresetPreview(activeKey)
          const label = (window.PresetsManager.get(activeKey)||{}).label || activeKey
          showToast('Preset "' + label + '" aktif.', 'info')
        } else {
          updatePresetPreview(sel.value || '')
        }
      }
    }catch(e){}
  })
  // keyword suggest wiring
  try{
    const suggestBtn = document.getElementById('aiKeywordSuggestBtn')
    const kwSelect = document.getElementById('aiKeywordSelect')
    const useAICheck = document.getElementById('aiKeywordUseAI')
    const titleEl = document.getElementById('aiMainTitle')
    const overviewEl = document.getElementById('aiMainOverview')
    suggestBtn?.addEventListener('click', async ()=>{
      const title = titleEl ? String(titleEl.value||'') : ''
      const overview = overviewEl ? String(overviewEl.value||'') : ''
      const useAI = !!(useAICheck && useAICheck.checked)
      const provider = document.getElementById('aiProviderSelect')?.value || 'openrouter'
      const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const p = s?.keys?.[provider]; if(p) return String(p).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
      const sug = await suggestKeywords({ useAI, provider, apiKey, title, overview, topN:6 })
      // populate select with suggestions
      if(!kwSelect) return
      // clear previous (keep the auto option)
      const keepAuto = Array.from(kwSelect.options).filter(o=>o.value==='')
      kwSelect.innerHTML = ''
      keepAuto.forEach(o=> kwSelect.appendChild(o))
      sug.forEach(s=>{ const opt = document.createElement('option'); opt.value = s; opt.textContent = s; opt.selected = true; kwSelect.appendChild(opt) })
      // persist history
      if(sug.length) pushKeywordHistory(sug)
    })
  }catch(e){}
  console.debug('mountAIGeneratorMain: presets populated')

  console.debug('mountAIGeneratorMain: done')
  }catch(err){ console.error('mountAIGeneratorMain: unexpected error', err); throw err }


}

// Auto-mount fallback: ensure generator mounts on page load if container exists
(function(){
  function tryMount(){
    if(window.__ai_mounted__) return
    try{
      const hasContainer = !!(document.getElementById('aiMainContainer') || document.getElementById('aiMainHeader'))
      const ready = document.readyState === 'complete' || document.readyState === 'interactive'
      if(ready && hasContainer){
        try{ mountAIGeneratorMain(); window.__ai_mounted__ = true; console.debug('auto-mount: mountAIGeneratorMain invoked') }catch(e){ console.warn('auto-mount failed', e) }
      }
    }catch(e){}
  }
  document.addEventListener('DOMContentLoaded', tryMount)
  // Try again shortly after in case script executed after DOMContentLoaded
  setTimeout(tryMount, 300)
})();

// Load models for a provider and populate a given model <select>
async function loadModelsFor(prov, modelEl){
  if(!modelEl) return
  modelEl.innerHTML = '<option value="">(auto)</option>'

  const pinned = {
    gemini: ['models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite'],
    openai: ['gpt-4o-mini'],
    openrouter: ['meta-llama/llama-3-8b-instruct'],
    groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    together: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'deepseek-ai/DeepSeek-V3'],
    cohere: ['command-r-plus-08-2024', 'command-r7b-12-2024', 'command-a-03-2025'],
    huggingface: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1', 'Qwen/Qwen2.5-72B-Instruct'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner']
  }
  ;(pinned[prov]||[]).forEach(v=>{
    const opt = document.createElement('option')
    opt.value = v
    opt.textContent = `⭐ ${v}`
    modelEl.appendChild(opt)
  })

  const getKeyForProvider = (p) => {
    try{
      const raw = localStorage.getItem('ai-settings')
      if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[p]; if(k) return String(k).trim() }
    }catch(e){}
    return String(localStorage.getItem('ai_api_key')||'').trim()
  }
  const lsKeyFor = (p) => `ai_model_${p}`
  const recommendedDefaults = { gemini: 'models/gemini-2.5-flash', openai: 'gpt-4o-mini', openrouter: 'meta-llama/llama-3-8b-instruct', groq: 'llama-3.1-8b-instant', together: 'meta-llama/Llama-3-70b-chat-hf', cohere: 'command-r-plus-08-2024', huggingface: 'meta-llama/Llama-3-70b-chat-hf', deepseek: 'deepseek-chat' }

  const key = getKeyForProvider(prov)
  const backendURL = getBackendURL()
  if(!key || !backendURL){
    const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
    if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
    return
  }

  // Quick ping to backend /ai/debug with short timeout to avoid noisy ERR_CONNECTION_REFUSED
  try{
    const ctrl = new AbortController()
    const t = setTimeout(()=>ctrl.abort(), 800)
    const ping = await fetch(backendURL + '/ai/debug', { signal: ctrl.signal })
    clearTimeout(t)
    if(!ping.ok){ throw new Error('Backend debug ping failed') }
  }catch(e){
    // backend unreachable — fall back to saved defaults
    const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
    if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
    return
  }

  try{
    const res = await fetch(`${backendURL}/ai/models?provider=${encodeURIComponent(prov)}&apiKey=${encodeURIComponent(key)}`)
    const json = await res.json().catch(()=>({}))
    if(json?.error){
      console.warn('loadModelsFor: backend returned error', json.error)
      // show a friendly fallback option and return
      const saved = localStorage.getItem(lsKeyFor(prov)) || recommendedDefaults[prov] || ''
      if(saved){ const opt = document.createElement('option'); opt.value = saved; opt.textContent = saved; modelEl.appendChild(opt); modelEl.value = saved }
      // also add a disabled option explaining the failure
      const note = document.createElement('option'); note.disabled = true; note.textContent = '(Could not fetch models: ' + String(json.error).slice(0,120) + ')'; modelEl.insertBefore(note, modelEl.firstChild)
      return
    }
    const list = Array.isArray(json?.models) ? json.models : []
    const values = list.map(m => m?.name || m?.id).filter(Boolean)
    aiLog('info','modelList',{ provider: prov, count: values.length, sample: values.slice(0,10) })
    const pinnedSet = new Set((pinned[prov] || []).map(String))
    values.filter(v => !pinnedSet.has(String(v))).forEach(v=>{
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      modelEl.appendChild(opt)
    })
  }catch(e){
    console.warn('loadModelsFor failed', e)
  }

  const saved = localStorage.getItem(lsKeyFor(prov)) || ''
  const fallback = recommendedDefaults[prov] || ''
  const choose = saved || fallback
  if(choose) modelEl.value = choose
}
async function generateFromMain(){
  const title = (document.getElementById('aiMainTitle')?.value || '').trim()
  const overview = (document.getElementById('aiMainOverview')?.value || '').trim()
  if(!title && !overview){
    showToast('Isi minimal Title atau Overview untuk generate.', 'error')
    return
  }

  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[prov]; if(k) return String(k).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
  const platformEl = document.getElementById('aiPlatformSelect')
  const platforms = platformEl ? [platformEl.value] : ['youtube']
  const { tone } = getEffectiveToneAndKeywords()
  const keywords = getSelectedKeywords()
  let presetInstructions = ''
  let presetObj = null
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){
      presetObj = window.PresetsManager.get(presetKey)
      if(presetObj) presetInstructions = (window.PresetsManager.buildPresetInstructions && window.PresetsManager.buildPresetInstructions(presetObj)) || ''
    }
  }catch(e){}

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:24px;color:#888"><span class="spinner" style="display:inline-block;width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:genco-spin 0.8s linear infinite"></span> Generating...</div>'
  if(!document.getElementById('genco-spinner-style')){
    const style = document.createElement('style')
    style.id = 'genco-spinner-style'
    style.textContent = '@keyframes genco-spin { to { transform: rotate(360deg); } }'
    document.head.appendChild(style)
  }

  const extractJson = (txt) => { const m = String(txt||'').match(/\{[\s\S]*\}/); if(!m) return null; try{ return JSON.parse(m[0]) }catch(e){ return null } }
  const forceJsonPrompt = (basePrompt) => `${basePrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanations. If you cannot, output {"title":"","description":"","hashtags":[],"hook":"","narratorScript":""} only.`.trim()

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []

    for(const platform of (platforms.length?platforms:['youtube'])){
      aiLog('info','generate.request.prepare',{ provider: prov, model, lang, platform, title, overview, keywords, tone, apiKeyPresent: !!apiKey, apiKeyMasked: maskKey(apiKey) })
      const prompt = buildFullPrompt({ title, overview, platform, lang, preset: presetObj, tone: tone || 'neutral', keywords, presetInstructions })

      let raw = null
      aiLog('debug','generate.prompt',{ prompt })
      const start = performance.now()
      try{
        raw = await window.AI.generate({ provider: prov, apiKey, prompt, model })
        const duration = Math.round(performance.now() - start)
        aiLog('info','generate.response',{ platform, durationMs: duration, rawLength: String(raw||'').length })
      }catch(e){ raw = String(e?.message||e); aiLog('error','generate.error',{ platform, error: String(e) }) }

      let parsed = extractJson(String(raw || ''))
      if(!parsed){
        try{ const reprompt = forceJsonPrompt(prompt); const raw2 = await window.AI.generate({ provider: prov, apiKey, prompt: reprompt, model }); parsed = extractJson(raw2); aiLog('info','generate.reprompt',{ platform, repromptUsed: true }) }catch(e){ aiLog('error','generate.reprompt.error',{ platform, error: String(e) }) }
      }

      if(!parsed) parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [], hook: '', narratorScript: '' }
      if(!parsed.hook) parsed.hook = ''
      if(!parsed.narratorScript) parsed.narratorScript = ''
      aiLog('info','generate.parsed',{ platform, parsed })
      results.push({ platform, parsed })
    }

    const esc = (s)=> String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const batchId = Date.now()
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Results</strong><div><button id="aiExportCSV" style="padding:6px 10px;border-radius:6px;margin-left:8px">Export CSV</button></div></div>'
    results.forEach(({ platform, parsed })=>{
      const idSafe = `aiRes_${platform}`
      const feedbackId = `${batchId}_${platform}`
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <strong style="text-transform:capitalize">${platform}</strong>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <button data-feedback-id="${feedbackId}" data-feedback-rating="good" style="padding:4px 8px;border-radius:6px;font-size:11px">Bagus</button>
            <button data-feedback-id="${feedbackId}" data-feedback-rating="bad" style="padding:4px 8px;border-radius:6px;font-size:11px">Kurang</button>
            <button data-copy-all="${idSafe}" style="padding:6px;border-radius:6px">Copy all</button>
            <button data-copy-caption="${idSafe}" style="padding:6px;border-radius:6px">Copy as caption</button>
            <button data-copy-target="${idSafe}_title" style="padding:6px;border-radius:6px">Copy Title</button>
            <button data-copy-target="${idSafe}_desc" style="padding:6px;border-radius:6px">Copy Desc</button>
            <button data-copy-target="${idSafe}_hook" style="padding:6px;border-radius:6px">Copy Hook</button>
            <button data-copy-target="${idSafe}_narrator" style="padding:6px;border-radius:6px">Copy Script</button>
            <button data-copy-target="${idSafe}_tags" style="padding:6px;border-radius:6px">Copy Tags</button>
          </div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#b0b0b0">Title</div>
        <div id="${idSafe}_title" style="margin-top:4px;color:#d9cd71">${esc(parsed.title)}</div>
        <div style="margin-top:8px;font-size:12px;color:#b0b0b0">Description / Overview</div>
        <div id="${idSafe}_desc" style="margin-top:4px;color:#fff">${esc(parsed.description)}</div>
        <div style="margin-top:8px;font-size:12px;color:#b0b0b0">Hook</div>
        <div id="${idSafe}_hook" style="margin-top:4px;color:#e8c547">${esc(parsed.hook)}</div>
        <div style="margin-top:8px;font-size:12px;color:#b0b0b0">Script narator/voice</div>
        <div id="${idSafe}_narrator" style="margin-top:4px;color:#a8d8ea">${esc(parsed.narratorScript)}</div>
        <div style="margin-top:8px;font-size:12px;color:#b0b0b0">Hashtags</div>
        <div id="${idSafe}_tags" style="margin-top:4px;color:#2c9dc1">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):(parsed.hashtags||'')}</div>
      `
      panel.appendChild(card)
    })

    // per-card copy wiring
    function copyTextAndToast(text, btn, prevLabel){
      if(!text){ showToast('Nothing to copy', 'info'); return }
      navigator.clipboard.writeText(text).then(()=>{ showToast('Copied to clipboard', 'success'); if(btn){ const prev = prevLabel != null ? prevLabel : btn.textContent; btn.textContent = 'Copied'; setTimeout(()=> btn.textContent = prev, 1200) } }).catch(()=> showToast('Copy failed', 'error'))
    }
    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        const text = el ? el.textContent : ''
        copyTextAndToast(text, b)
      })
    })
    panel.querySelectorAll('button[data-copy-all]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-all')
        const parts = ['title','desc','hook','narrator','tags'].map(k=> { const el = document.getElementById(prefix + '_' + k); return el ? el.textContent : '' })
        const text = parts.join('\n\n')
        copyTextAndToast(text, b)
      })
    })
    panel.querySelectorAll('button[data-copy-caption]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-caption')
        const descEl = document.getElementById(prefix + '_desc')
        const tagsEl = document.getElementById(prefix + '_tags')
        const desc = descEl ? descEl.textContent : ''
        const tags = tagsEl ? tagsEl.textContent : ''
        const text = tags ? (desc + '\n\n' + tags).trim() : desc
        copyTextAndToast(text, b)
      })
    })
    panel.querySelectorAll('button[data-feedback-id]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-feedback-id')
        const rating = b.getAttribute('data-feedback-rating') || 'good'
        setFeedback(id, rating)
        showToast(rating === 'good' ? 'Terima kasih!' : 'Feedback tercatat.', 'success')
      })
    })

    // export csv
    const exportBtn = document.getElementById('aiExportCSV')
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const rows = [['platform','title','description','hook','narratorScript','hashtags']]
        results.forEach(r=> rows.push([r.platform, (r.parsed.title||'').replace(/"/g,'""'), (r.parsed.description||'').replace(/"/g,'""'), (r.parsed.hook||'').replace(/"/g,'""'), (r.parsed.narratorScript||'').replace(/"/g,'""'), Array.isArray(r.parsed.hashtags)?r.parsed.hashtags.join(' '):(r.parsed.hashtags||'')]))
        const csv = rows.map(r => r.map(c=>`"${String(c||'').replace(/\"/g,'""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${(title||'content').replace(/[^a-z0-9\-]/gi,'_')}_social.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
        showToast('CSV exported', 'success')
      })
    }
    const goals = (presetObj && Array.isArray(presetObj.goal) && presetObj.goal.length) ? presetObj.goal.join(', ') : ''
    pushGenerateHistory({ ts: Date.now(), title, overview, platform: platforms[0], presetKey: presetObj ? (document.getElementById('aiPresetSelect')?.value || '') : '', goals, type: 'generate', results })
  }catch(err){ console.error('AI generation failed', err); showToast(err && err.message ? err.message : 'AI generation failed.', 'error'); panel.innerHTML = '<div style="padding:12px;color:#c66">AI generation failed. See console.</div>' }
}

async function generateVariations(count) {
  const title = (document.getElementById('aiMainTitle')?.value || '').trim()
  const overview = (document.getElementById('aiMainOverview')?.value || '').trim()
  if(!title && !overview){
    showToast('Isi minimal Title atau Overview untuk generate.', 'error')
    return
  }
  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[prov]; if(k) return String(k).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
  const platform = document.getElementById('aiPlatformSelect')?.value || 'youtube'
  const { tone } = getEffectiveToneAndKeywords()
  const keywords = getSelectedKeywords()
  let presetObj = null
  let presetInstructions = ''
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){ presetObj = window.PresetsManager.get(presetKey); if(presetObj) presetInstructions = (window.PresetsManager.buildPresetInstructions && window.PresetsManager.buildPresetInstructions(presetObj)) || '' }
  }catch(e){}
  const resolvedCount = typeof count === 'number' && count >= 1 ? count : (presetObj && presetObj.variationCount != null ? Math.min(10, Math.max(1, presetObj.variationCount)) : 3)

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Variations</strong><div id="variationsLoading" style="font-size:12px;color:#888"></div></div>`

  const extractJson = (txt) => { const m = String(txt||'').match(/\{[\s\S]*\}/); if(!m) return null; try{ return JSON.parse(m[0]) }catch(e){ return null } }

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []
    const loadingEl = document.getElementById('variationsLoading')

    const batchIdVar = Date.now()
    for(let i=0;i<resolvedCount;i++){
      if(loadingEl) loadingEl.textContent = `Variasi ${i+1}/${resolvedCount}...`
      const prompt = buildFullPrompt({ title, overview, platform, lang, preset: presetObj, tone: tone || 'neutral', keywords, presetInstructions })

      let raw = null
      try{ raw = await window.AI.generate({ provider: prov, apiKey, prompt, model }) }catch(e){ raw = String(e?.message||e) }

      let parsed = extractJson(String(raw || ''))
      if(!parsed) parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [], hook: '', narratorScript: '' }
      if(!parsed.hook) parsed.hook = ''
      if(!parsed.narratorScript) parsed.narratorScript = ''
      results.push({ i: i+1, parsed, raw })

      const esc = (s)=> String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      const feedbackIdVar = `${batchIdVar}_var_${i}`
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><strong>Var ${i+1}</strong><div style="display:flex;flex-wrap:wrap;gap:6px"><button data-feedback-id="${feedbackIdVar}" data-feedback-rating="good" style="padding:4px 8px;border-radius:6px;font-size:11px">Bagus</button><button data-feedback-id="${feedbackIdVar}" data-feedback-rating="bad" style="padding:4px 8px;border-radius:6px;font-size:11px">Kurang</button><button data-copy-all="var_${i}">Copy all</button><button data-copy-caption="var_${i}">Copy as caption</button><button data-copy-target="var_${i}_title">Copy Title</button><button data-copy-target="var_${i}_desc">Copy Desc</button><button data-copy-target="var_${i}_hook">Copy Hook</button><button data-copy-target="var_${i}_narrator">Copy Script</button><button data-copy-target="var_${i}_tags">Copy Tags</button></div></div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Title</div><div id="var_${i}_title" style="margin-top:4px;color:#d9cd71;background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.title)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Description / Overview</div><div id="var_${i}_desc" style="margin-top:4px;color:#fff;background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.description)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Hook</div><div id="var_${i}_hook" style="margin-top:4px;color:#e8c547;background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.hook)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Script narator/voice</div><div id="var_${i}_narrator" style="margin-top:4px;color:#a8d8ea;background:#040f1abd;padding:10px;border-radius:8px">${esc(parsed.narratorScript)}</div><div style="margin-top:6px;font-size:12px;color:#b0b0b0">Hashtags</div><div id="var_${i}_tags" style="margin-top:4px;color:#2c9dc1;background:#040f1abd;padding:10px;border-radius:8px">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):(parsed.hashtags||'')}</div>`
      panel.appendChild(card)
    }

    if(loadingEl) loadingEl.textContent = ''

    function copyTextAndToastVar(text, btn){
      if(!text){ showToast('Nothing to copy', 'info'); return }
      navigator.clipboard.writeText(text).then(()=>{ showToast('Copied to clipboard', 'success'); if(btn){ const prev = btn.textContent; btn.textContent = 'Copied'; setTimeout(()=> btn.textContent = prev, 1200) } }).catch(()=> showToast('Copy failed', 'error'))
    }
    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        copyTextAndToastVar(el ? el.textContent : '', b)
      })
    })
    panel.querySelectorAll('button[data-copy-all]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-all')
        const parts = ['title','desc','hook','narrator','tags'].map(k=> { const el = document.getElementById(prefix + '_' + k); return el ? el.textContent : '' })
        copyTextAndToastVar(parts.join('\n\n'), b)
      })
    })
    panel.querySelectorAll('button[data-copy-caption]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const prefix = b.getAttribute('data-copy-caption')
        const descEl = document.getElementById(prefix + '_desc')
        const tagsEl = document.getElementById(prefix + '_tags')
        const desc = descEl ? descEl.textContent : ''
        const tags = tagsEl ? tagsEl.textContent : ''
        copyTextAndToastVar(tags ? (desc + '\n\n' + tags).trim() : desc, b)
      })
    })
    panel.querySelectorAll('button[data-feedback-id]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id = b.getAttribute('data-feedback-id')
        const rating = b.getAttribute('data-feedback-rating') || 'good'
        setFeedback(id, rating)
        showToast(rating === 'good' ? 'Terima kasih!' : 'Feedback tercatat.', 'success')
      })
    })

    const exp = document.createElement('div')
    exp.style.marginTop = '10px'
    exp.innerHTML = `<button id="exportJsonVariations" class="primary">Export JSON</button>`
    panel.appendChild(exp)
    document.getElementById('exportJsonVariations').addEventListener('click', ()=>{
      const json = JSON.stringify(results.map(r=>r.parsed), null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${(title||'variations').replace(/[^a-z0-9\-]/gi,'_')}_variations.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      showToast('JSON exported', 'success')
    })
    const presetKey = document.getElementById('aiPresetSelect')?.value || ''
    const goalsVar = (presetObj && Array.isArray(presetObj.goal) && presetObj.goal.length) ? presetObj.goal.join(', ') : ''
    pushGenerateHistory({ ts: Date.now(), title, overview, platform, presetKey, goals: goalsVar, type: 'variations', results })
  }catch(err){ console.error('generateVariations failed', err); showToast(err && err.message ? err.message : 'Variations failed.', 'error'); panel.innerHTML = '<div style="padding:12px;color:#c66">Variations failed. See console.</div>' }
}

async function loadMedia(page = 1){
  try{
    document.getElementById('loader').style.display = 'block'
    const s = window.appState
    let data
    if(s.searchQuery){
      // Search endpoint does not support many server-side filters; apply post-filtering in client
      data = await window.TMDB.search({ media: s.mediaType, query: s.searchQuery, page })
    } else {
      // Build discover params
      const params = new URLSearchParams()
      if (s.selectedGenre) params.append('with_genres', s.selectedGenre)
      if (s.selectedYear) {
        if (s.mediaType === 'movie') params.append('primary_release_year', s.selectedYear)
        else params.append('first_air_date_year', s.selectedYear)
      }
      // rating filters
      if (typeof s.minUserScore === 'number' && s.minUserScore > 0) params.append('vote_average.gte', String(s.minUserScore))
      params.append('vote_average.lte', '10')
      if (typeof s.minUserVotes === 'number' && s.minUserVotes > 0) params.append('vote_count.gte', String(s.minUserVotes))

      // sort handling: if combined -> sort will be done client-side, otherwise send sort_by
      if (s.selectedSort && !s.selectedSort.startsWith('combined')) {
        params.append('sort_by', s.selectedSort)
      }

      // pick endpoints for special categories
      if(s.mediaCategory === 'now_playing' && s.mediaType === 'movie'){
        data = await (await fetch(`${window.TMDB.base}/movie/now_playing?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'upcoming' && s.mediaType === 'movie'){
        data = await (await fetch(`${window.TMDB.base}/movie/upcoming?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'airing_today' && s.mediaType === 'tv'){
        data = await (await fetch(`${window.TMDB.base}/tv/airing_today?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else if(s.mediaCategory === 'on_the_air' && s.mediaType === 'tv'){
        data = await (await fetch(`${window.TMDB.base}/tv/on_the_air?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      } else {
        // discover
        data = await (await fetch(`${window.TMDB.base}/discover/${s.mediaType}?api_key=${window.TMDB.apiKey}&page=${page}&${params.toString()}`)).json()
      }

    }

    window.appState.maxPage = Math.min(data.total_pages || 1, 500)
    let results = data.results || []

    // apply combined sort locally
    if((window.appState.selectedSort || '').startsWith('combined')){
      const desc = (window.appState.selectedSort||'').endsWith('.desc')
      results.sort((a,b)=>{ const score = it => (it.popularity||0) + ((it.vote_average||0)*10); return desc ? score(b)-score(a) : score(a)-score(b) })
    }

    // client-side filtering for search or safety
    const minScore = window.appState.minUserScore || 0
    const minVotes = window.appState.minUserVotes || 0
    if(minScore>0 || minVotes>0){
      results = results.filter(r=>{ const avg = r.vote_average||0; const vc = r.vote_count||0; return avg>=minScore && avg<=10 && vc>=minVotes })
    }

    // enrich movie list with details when movie to get countries
    if(window.appState.mediaType === 'movie' && results.length){
      // fetch details in batches to avoid too many parallel requests
      const concurrency = 8
      const details = []
      for (let i = 0; i < results.length; i += concurrency) {
        const chunk = results.slice(i, i + concurrency)
        // use TMDB.getDetails which has caching
        // map to promises and wait for the chunk
        const chunkRes = await Promise.all(chunk.map(r => window.TMDB.getDetails('movie', r.id).catch(() => null)))
        details.push(...chunkRes)
      }
      const mediaList = results.map((m, idx)=>{
        const d = details[idx] || {}
        const statusText = (m.release_date && new Date(m.release_date) <= new Date()) ? 'Released' : 'Upcoming'
        const countries = (d.production_countries && d.production_countries.length)
          ? d.production_countries.map(c=> (c.iso_3166_1||'').toLowerCase()).filter(Boolean).join(', ')
          : (m.origin_country?.map(c=>c.toLowerCase()).join(', ')||'-')
        return {...m, statusText, countries}
      })
      // keep last fetched list available for quick fallbacks
      window.lastMediaList = mediaList
      renderMovies(mediaList)
    } else {
      const mediaList = results.map(m=>{
        const statusText = (m.first_air_date && new Date(m.first_air_date) <= new Date()) ? 'Aired' : 'Upcoming'
        const countries = m.origin_country?.map(c=>c.toLowerCase()).join(', ') || '-'
        return {...m, statusText, countries}
      })
      renderMovies(mediaList)
    }

    renderPagination(page)
  }catch(err){
    console.error('loadMedia error', err)
    const cont = document.getElementById('movieGrid') || document.getElementById('movieList')
    if (cont) cont.innerHTML = '<p>Error loading data. Try again later.</p>'
  }finally{
    document.getElementById('loader').style.display = 'none'
  }
}

function renderMovies(mediaList){
  const container = document.getElementById('movieGrid') || document.getElementById('movieList')
  container.innerHTML = ''
  mediaList.forEach(m=>{
    const img = m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : 'https://netmoviestvshows.github.io/movie/images/no-poster-movie-tv.png'
    const title = window.appState.mediaType === 'movie' ? (m.title || '') : (m.name || '')
    const release = window.appState.mediaType === 'movie' ? (m.release_date ? m.release_date.split('-')[0] : 'Unknown') : (m.first_air_date ? m.first_air_date.split('-')[0] : 'Unknown')
    const rating = m.vote_average != null ? (m.vote_average.toFixed ? m.vote_average.toFixed(1) : m.vote_average) : 'N/A'
    const safeTitle = String(title||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    const html = `
      <div class="movie" title="${title} (${release})">
        <div class="rating">⭐ ${rating}</div>
        <div class="media-type-icon">${window.appState.mediaType==='movie'?'Movie':'TV'}</div>
        <img loading="lazy" src="${img}" alt="${title}" onclick="handleItemClick(event, ${m.id}, '${safeTitle}')">
        <div class="title">${title}</div>
        <div class="year">${m.statusText} : ${release}</div>
        <div class="country">${m.countries || '-'}</div>
      </div>`
    container.insertAdjacentHTML('beforeend', html)
  })
}

function renderPagination(page){
  const pag = document.getElementById('pagination')
  pag.innerHTML = ''
  const total = window.appState.maxPage || 1
  const addBtn = (label, p, disabled=false) => pag.insertAdjacentHTML('beforeend', `<button ${disabled? 'disabled': ''} onclick="goPage(${p})">${label}</button>`)
  addBtn('« First', 1, page===1)
  addBtn('‹ Prev', Math.max(1, page-1), page===1)
  const pages = []
  pages.push(1)
  let start = Math.max(2, page-2); let end = Math.min(total-1, page+2)
  if(start>2) pages.push('...')
  for(let i=start;i<=end;i++) pages.push(i)
  if(end<total-1) pages.push('...')
  pages.push(total)
  const unique = [...new Set(pages)]
  unique.forEach(p=>{
    if(p==='...') pag.insertAdjacentHTML('beforeend','<span>…</span>')
    else if(p===page) pag.insertAdjacentHTML('beforeend', `<button class="active">${p}</button>`)
    else pag.insertAdjacentHTML('beforeend', `<button onclick="goPage(${p})">${p}</button>`)
  })
  addBtn('Next ›', Math.min(total, page+1), page>=total)
  addBtn('Last »', total, page>=total)
}

function goPage(p){ if(p<1||p>window.appState.maxPage) return; window.appState.currentPage = p; loadMedia(p) }

function doSearch(){ window.appState.searchQuery = document.getElementById('searchInput').value.trim(); window.appState.currentPage = 1; loadMedia(1) }
function clearSearch(){ document.getElementById('searchInput').value=''; window.appState.searchQuery=''; window.appState.currentPage=1; loadMedia(1) }

function applyAllFilters(){
  window.appState.selectedGenre = document.getElementById('genreFilter').value || ''
  window.appState.selectedYear = document.getElementById('yearFilter').value || ''
  window.appState.selectedSort = document.getElementById('sortFilter').value || 'popularity.desc'
  window.appState.searchQuery = document.getElementById('searchInput').value.trim() || ''
  window.appState.minUserScore = parseFloat(document.getElementById('scoreSlider').value) || 0
  window.appState.minUserVotes = parseInt(document.getElementById('votesSlider').value,10) || 0
  window.appState.currentPage = 1
  loadMedia(1)
}

function resetFilters(){
  document.getElementById('genreFilter').value = ''
  document.getElementById('yearFilter').value = ''
  document.getElementById('sortFilter').value = 'popularity.desc'
  document.getElementById('searchInput').value = ''
  document.getElementById('scoreSlider').value = 0
  document.getElementById('votesSlider').value = 0
  document.getElementById('scoreLabel').textContent = '0'
  document.getElementById('votesLabel').textContent = '0'
  window.appState.selectedGenre = ''
  window.appState.selectedYear = ''
  window.appState.selectedSort = 'popularity.desc'
  window.appState.searchQuery = ''
  window.appState.minUserScore = 0
  window.appState.minUserVotes = 0
  window.appState.currentPage = 1
  loadMedia(1)
}

// Modal: fetch details and populate
async function openModal(id){ console.warn('openModal disabled - modal removed from UI'); return }

// Modal-related UI removed — kept openModal as a no-op to avoid runtime errors.
// If modal functionality needs to be restored in future, implement inside openModal(id) and ensure variables are properly scoped.


function closeModal(){
  const modal = document.getElementById('modal')
  if(modal) modal.style.display = 'none'
  // remove item query param (pattern used: ?=id-slug) without adding a history entry
  try{
    if(window.location.search && window.location.search.startsWith('?=')){
      history.replaceState(null, '', window.location.pathname)
    }
  }catch(e){ /* ignore */ }
}

// Close modal when clicking backdrop or elements with data-action="close-modal"; Esc to close
document.addEventListener('click', (ev)=>{
  try{
    const modal = document.getElementById('modal')
    if(!modal) return
    const target = ev.target
    if(target === modal || target.closest('[data-action="close-modal"]')){
      closeModal()
    }
  }catch(e){}
})

document.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape'){
    const modal = document.getElementById('modal')
    if(modal && modal.style.display !== 'none') closeModal()
  }
})

// Ensure explicit close button (id="closeModal") calls closeModal when clicked
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.getElementById('closeModal')
  if(btn) btn.addEventListener('click', closeModal)
})

// If URL contains ?=id-slug open modal for that id
function checkUrlForModal(){
  try{
    const qs = window.location.search
    if(qs && qs.startsWith('?=')){
      const raw = qs.slice(2)
      const id = parseInt(raw.split('-')[0], 10)
      if(!isNaN(id)) openModal(id)
    }
  }catch(e){ console.error('checkUrlForModal', e) }
}

// handle back/forward navigation
window.addEventListener('popstate', ()=>{ checkUrlForModal() })

// AI generate using backend proxy via window.AI.summarize
async function generateAIContent(){
  const md = document.getElementById('modalDetails')
  const id = md?.getAttribute('data-media-id')
  const mediaType = md?.getAttribute('data-media-type')
  if(!id || !mediaType) { showToast('No media selected', 'error'); return }
  const title = document.getElementById('modalTitle')?.textContent || ''
  const overview = document.getElementById('modalOverview')?.textContent || ''
  try{
    const text = await window.AI.summarize({ movieId: id, title, overview })
    // expect JSON in result; attempt to extract JSON object
    const jsonMatch = String(text).match(/\{[\s\S]*\}/)
    if(!jsonMatch) throw new Error('Invalid AI output')
    const parsed = JSON.parse(jsonMatch[0])
    document.getElementById('aiTitle').textContent = parsed.title || '-'
    document.getElementById('aiDescription').textContent = parsed.description || '-'
    document.getElementById('aiHashtags').textContent = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(h=>`#${h}`).join(' ') : '-'
    document.getElementById('aiResult').style.display = 'block'
  }catch(err){ console.error('AI generate error', err); showToast('AI generate failed. See console.', 'error') }
}

// expose handlers used by inline attributes
// window.handleItemClick removed - movie grid removed from UI

// --- Gallery (based on original.html implementation) ---
// openGallery supports two modes:
//  - called with no args or a number: uses window._currentGallery (objects)
//  - called with an array of URL strings as first argument: will convert to gallery objects
function openGallery(arg, startIndex = 0){
  try{
    // normalize to window._currentGallery array of objects { original, medium, thumb, download }
    if(Array.isArray(arg) && typeof arg[0] === 'string'){
      window._currentGallery = arg.map(u => ({ original: u, medium: u, thumb: u, download: u }))
      window._currentGalleryType = 'posters'
      window._currentGalleryIndex = startIndex || 0
    } else if(typeof arg === 'number'){
      window._currentGalleryIndex = arg || 0
    } else {
      window._currentGalleryIndex = startIndex || window._currentGalleryIndex || 0
    }

    const gallery = window._currentGallery || []
    if(!gallery.length) return

    const overlay = document.getElementById('galleryOverlay')
    const gridPosters = document.getElementById('galleryGrid')
    const gridBackdrops = document.getElementById('galleryGridBackdrop')
    const galleryType = window._currentGalleryType || 'posters'
    if(!overlay) return

    overlay.style.display = 'flex'

    // choose which grid to use and show/hide appropriately
    let grid
    if(galleryType === 'backdrops'){
      if(gridPosters){ gridPosters.style.display = 'none'; gridPosters.innerHTML = '' }
      if(gridBackdrops){ gridBackdrops.style.display = 'grid'; gridBackdrops.innerHTML = '' }
      grid = gridBackdrops || gridPosters
    } else {
      if(gridBackdrops){ gridBackdrops.style.display = 'none'; gridBackdrops.innerHTML = '' }
      if(gridPosters){ gridPosters.style.display = 'grid'; gridPosters.innerHTML = '' }
      grid = gridPosters || gridBackdrops
    }

    // populate grid with cards and lazy-load placeholders
    const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
    gallery.forEach((g, i)=>{
      const card = document.createElement('div')
      card.className = (galleryType === 'backdrops') ? 'gallery-backdrop-card' : 'gallery-card'

      const img = document.createElement('img')
      const realUrl = g.thumb || g.medium || g.original || ''
      if(realUrl) img.dataset.src = realUrl
      img.src = placeholder
      img.alt = `${galleryType === 'backdrops' ? 'Backdrop' : 'Poster'} ${i+1}`
      img.loading = 'lazy'
      img.decoding = 'async'
      img.style.cursor = realUrl ? 'zoom-in' : 'default'

      // click opens high-res in new tab
      img.onclick = (e) => {
        e.stopPropagation()
        const openUrl = g.original || g.medium || g.thumb || ''
        if(openUrl) window.open(openUrl, '_blank')
      }

      // download button
      const downloadUrl = g.download || g.original || g.medium || g.thumb || ''
      const dlBtn = document.createElement('button')
      dlBtn.className = 'gallery-download-btn'
      dlBtn.type = 'button'
      dlBtn.title = galleryType === 'backdrops' ? 'Download high-res (w1280)' : 'Download high-res (w1280)'
      dlBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
            <path stroke-dasharray="32" d="M12 21c-4.97 0 -9 -4.03 -9 -9c0 -4.97 4.03 -9 9 -9"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="32;0"></animate></path>
            <path stroke-dasharray="2 4" stroke-dashoffset="6" d="M12 3c4.97 0 9 4.03 9 9c0 4.97 -4.03 9 -9 9" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.45s" to="1"></set><animateTransform fill="freeze" attributeName="transform" begin="0.45s" dur="0.6s" type="rotate" values="-180 12 12;0 12 12"></animateTransform><animate attributeName="stroke-dashoffset" begin="0.85s" dur="0.6s" repeatCount="indefinite" to="0"></animate></path>
            <path stroke-dasharray="10" stroke-dashoffset="10" d="M12 8v7.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.85s" dur="0.2s" to="0"></animate></path>
            <path stroke-dasharray="8" stroke-dashoffset="8" d="M12 15.5l3.5 -3.5M12 15.5l-3.5 -3.5"><animate fill="freeze" attributeName="stroke-dashoffset" begin="1.05s" dur="0.2s" to="0"></animate></path>
          </g>
        </svg>`
      dlBtn.style.cursor = downloadUrl ? 'pointer' : 'default'
      dlBtn.onclick = (ev) => { ev.stopPropagation(); ev.preventDefault(); if(!downloadUrl) return; const baseTitle = document.getElementById('modalTitle')?.textContent || ''; const suffix = galleryType === 'backdrops' ? 'backdrop' : 'poster'; downloadHighRes(downloadUrl, baseTitle, suffix) }

      const meta = document.createElement('div')
      meta.className = 'card-meta'
      meta.textContent = `${galleryType === 'backdrops' ? 'Backdrop' : 'Poster'} ${i+1}`

      card.appendChild(img)
      card.appendChild(dlBtn)
      card.appendChild(meta)
      if(grid) grid.appendChild(card)
    })

    // setup IntersectionObserver to lazy-load images
    try{
      if(window._galleryObserver){ try{ window._galleryObserver.disconnect() }catch(e){} }
      const rootEl = document.getElementById('galleryInner')
      const imgs = grid ? grid.querySelectorAll('img[data-src]') : []
      const obs = new IntersectionObserver((entries, observer)=>{
        entries.forEach(ent=>{
          if(ent.isIntersecting){
            const el = ent.target
            if(el.dataset && el.dataset.src){ el.src = el.dataset.src; el.removeAttribute('data-src') }
            observer.unobserve(el)
          }
        })
      }, { root: rootEl, rootMargin: '200px', threshold: 0.01 })
      imgs.forEach(iimg=>obs.observe(iimg))
      window._galleryObserver = obs
    }catch(e){ console.warn('gallery lazy observer failed', e) }

    // Accessibility + visible class
    overlay.classList.add('gallery-visible')
    overlay.removeAttribute('aria-hidden')
    // ensure gallery starts at top and first card is visible
    try{
      const inner = document.getElementById('galleryInner')
      if(inner) inner.scrollTop = 0
      const firstCard = (grid) ? (grid.querySelector('.gallery-card') || grid.querySelector('.gallery-backdrop-card')) : null
      if(firstCard && firstCard.scrollIntoView) {
        // delay a bit to allow images/layout to settle, then ensure first card is top-left
        setTimeout(()=>{
          try{ firstCard.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' }) }catch(e){}
          try{ if(inner) inner.scrollLeft = 0 }catch(e){}
        }, 120)
      }
    }catch(e){}
  }catch(err){ console.error('openGallery error', err) }
}
window.openGallery = openGallery

function closeGallery(){
  const overlay = document.getElementById('galleryOverlay')
  if(!overlay) return
  overlay.style.display = 'none'
  try{ const g1 = document.getElementById('galleryGrid'); if(g1) g1.innerHTML = '' }catch(e){}
  try{ const g2 = document.getElementById('galleryGridBackdrop'); if(g2) g2.innerHTML = '' }catch(e){}
  try{ if(window._galleryObserver){ window._galleryObserver.disconnect(); window._galleryObserver = null } }catch(e){}
}
window.closeGallery = closeGallery

async function downloadHighRes(url, baseTitle, suffix){
  window._downloadNameCounts = window._downloadNameCounts || {}
  const base = (typeof baseTitle === 'string' && baseTitle.trim()) ? String(baseTitle).trim().replace(/[^a-z0-9-]/gi, '_') : ''
  const safeSuggested = base ? `${base}_${suffix||'image'}` : (suffix||'image')
  const ext = 'jpg'
  const key = `${safeSuggested}.${ext}`
  const count = window._downloadNameCounts[key] ? window._downloadNameCounts[key] + 1 : 1
  window._downloadNameCounts[key] = count
  const filename = count === 1 ? `${safeSuggested}.${ext}` : `${safeSuggested}_${count}.${ext}`
  try{
    const res = await fetch(url, { mode: 'cors' })
    if(!res.ok) throw new Error('Network response was not ok')
    const blob = await res.blob()
    const a = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    a.href = objectUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(()=>URL.revokeObjectURL(objectUrl), 1000)
  }catch(err){ console.error('Download failed', err); try{ window.open(url, '_blank') }catch(e){} }
}

function galleryPrev(){ const g = window._currentGallery || []; if(!g.length) return; window._currentGalleryIndex = (window._currentGalleryIndex - 1 + g.length) % g.length; updateGalleryImage() }
function galleryNext(){ const g = window._currentGallery || []; if(!g.length) return; window._currentGalleryIndex = (window._currentGalleryIndex + 1) % g.length; updateGalleryImage() }
function updateGalleryImage(){ const g = window._currentGallery || []; if(!g.length) return; const idx = Math.max(0, Math.min(window._currentGalleryIndex||0, g.length-1)); window._currentGalleryIndex = idx; const img = document.getElementById('galleryImage'); if(img) img.src = g[idx].original || g[idx].medium || g[idx].thumb || ''; const thumbs = document.querySelectorAll('.gallery-thumb'); thumbs.forEach((t,i)=> t.classList.toggle('active', i===idx)) }

// Wire gallery close handlers and poster/backdrop clicks to open gallery
document.addEventListener('DOMContentLoaded', ()=>{
  const overlay = document.getElementById('galleryOverlay')
  const closeBtn = document.getElementById('galleryClose')
  if(closeBtn) closeBtn.addEventListener('click', ()=>{ closeGallery() })
  if(overlay) overlay.addEventListener('click', (ev)=>{ if(ev.target === overlay) closeGallery() })
  document.addEventListener('keydown', (ev)=>{ if(ev.key === 'Escape'){ const o = document.getElementById('galleryOverlay'); if(o && getComputedStyle(o).display==='flex'){ closeGallery() } } })

  const modalPoster = document.getElementById('modalPoster')
  const modalBackdropImage = document.getElementById('modalBackdropImage')
  function attachClick(el, preferType){ if(!el) return; el.style.cursor='pointer'; el.addEventListener('click', async ()=>{
    const md = document.getElementById('modalDetails'); const id = md?.getAttribute('data-media-id'); const mediaType = md?.getAttribute('data-media-type') || 'movie'; if(!id) return; let data = null; try{ data = await window.TMDB.getDetails(mediaType, id) }catch(e){ return }
    let postersArr = (data?.images?.posters || [])
    let backdropsArr = (data?.images?.backdrops || [])
    if((!postersArr.length && !backdropsArr.length)){
      try{ const url = `${window.TMDB.base}/${mediaType}/${id}/images?api_key=${window.TMDB.apiKey}`; const res = await fetch(url); if(res.ok){ const json = await res.json(); postersArr = json.posters || postersArr; backdropsArr = json.backdrops || backdropsArr } }
      catch(err){ console.warn('attachClick: images fallback fetch error', err) }
    }
    const posters = (postersArr||[]).map(p=>({ original: p.file_path?window.TMDB.imageUrl(p.file_path,'w1280'): '', download: p.file_path?window.TMDB.imageUrl(p.file_path,'w1280'): '', medium: p.file_path?window.TMDB.imageUrl(p.file_path,'w500'): '', thumb: p.file_path?window.TMDB.imageUrl(p.file_path,'w300'): '' })).filter(x=>x.original||x.medium||x.thumb||x.download)
    const backdrops = (backdropsArr||[]).map(b=>({ original: b.file_path?window.TMDB.imageUrl(b.file_path,'w1280'):'', download: b.file_path?window.TMDB.imageUrl(b.file_path,'w1280'):'', medium: b.file_path?window.TMDB.imageUrl(b.file_path,'w500'):'', thumb: b.file_path?window.TMDB.imageUrl(b.file_path,'w300'):'' })).filter(x=>x.original||x.medium||x.thumb||x.download)
    // choose based on preferType: if preferType indicates backdrop, prefer backdrops first
    const preferBackdrops = String(preferType || '').toLowerCase().includes('backdrop')
    if(preferBackdrops){
      if(backdrops.length){ window._currentGallery = backdrops; window._currentGalleryType='backdrops'; window._currentGalleryIndex = 0; openGallery(0); }
      else if(posters.length){ window._currentGallery = posters; window._currentGalleryType='posters'; window._currentGalleryIndex = 0; openGallery(0); }
    } else {
      if(posters.length){ window._currentGallery = posters; window._currentGalleryType='posters'; window._currentGalleryIndex = 0; openGallery(0); }
      else if(backdrops.length){ window._currentGallery = backdrops; window._currentGalleryType='backdrops'; window._currentGalleryIndex = 0; openGallery(0); }
    }
  }) }
    attachClick(modalPoster, 'poster')
    attachClick(modalBackdropImage, 'backdrop')
})
