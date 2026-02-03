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

async function generateVariations(count = 3) {
  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[prov]; if(k) return String(k).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
  const platform = document.getElementById('aiPlatformSelect')?.value || 'youtube'
  const chosenKeyword = document.getElementById('aiKeywordSelect')?.value || ''
  // If a preset is selected and defines a tone, use that; otherwise use dropdown
  const presetSel_top = document.getElementById('aiPresetSelect')
  const presetKey_top = presetSel_top ? String(presetSel_top.value || '').trim() : ''
  let presetObj_top = null
  try{ presetObj_top = presetKey_top ? window.PresetsManager.get(presetKey_top) : null }catch(e){ presetObj_top = null }
  const tone = (presetObj_top && presetObj_top.tone) ? presetObj_top.tone : (document.getElementById('aiToneSelect')?.value || 'neutral')
  const title = document.getElementById('aiMainTitle')?.value || ''
  const overview = document.getElementById('aiMainOverview')?.value || ''

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Variations</strong><div></div></div>`

  // build presetInstructions for variations
  let presetInstructions = ''
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){ const p = window.PresetsManager.get(presetKey); if(p) presetInstructions = `Platform: ${p.platform||platform}. Goal: ${p.goal||''}. Tone: ${p.tone||''}. Length: ${p.length||''}. CTA: ${p.cta||''}. Structure: ${p.structure||''}. HashtagCount: ${p.hashtagCount||''}.` }
  }catch(e){ presetInstructions = '' }

  const platformInstructionMap = { youtube: 'YouTube Shorts rules: Title <= 60 chars, Description short, Hashtags 6–10.', tiktok: 'TikTok rules: punchy, Hashtags 8–15.', instagram: 'Instagram: energetic, Hashtags 12–25.', shopee: 'Shopee: product-focused, 5 tags.' }
  const platformInstruction = platformInstructionMap[platform] || ''
  aiLog('debug','variation.prepare',{ platform, lang, provider: prov, model, apiKeyPresent: !!apiKey, apiKeyMasked: maskKey(apiKey) })

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []

    for(let i=0;i<count;i++){
      const languageInstruction = lang === 'en' ? 'Respond ONLY in English. Do not use any other language.' : 'Respond ONLY in Indonesian. Do not use any other language.'
      // include selected keywords into prompt to focus generation
      const selKeywords = (function(){ try{ const s = document.getElementById('aiKeywordSelect'); if(!s) return ''; const vals = Array.from(s.selectedOptions||[]).map(o=>o.value).filter(Boolean); return vals.length ? vals.join(', ') : '' }catch(e){ return '' } })()
      const keywordNote = selKeywords ? (`\n- Keywords: ${selKeywords}`) : ''
      const prompt = `${languageInstruction}\nYou are a creative social copywriter. Platform: ${platform}. Write in ${lang==='id'?'Indonesian':'English'}.\nContext:\n- Title: "${title}"\n- Overview: "${overview}"${keywordNote}\n- Keyword focus: ${chosenKeyword||'none'}\n- Tone: ${tone}\n\n${platformInstruction}\n\n${presetInstructions ? ('Preset rules: ' + presetInstructions + '\\n\\n') : ''}\nReturn only JSON: {"title":"...","description":"...","hashtags":["#.."]}`
      let raw = null
      const reqMeta = { provider: prov, model, attempt: i+1 }
      aiLog('info','variation.request',{ ...reqMeta, prompt })
      const t0 = performance.now()
      try{ raw = await window.AI.generate({ provider: prov, apiKey, prompt, model })
        const dur = Math.round(performance.now() - t0)
        aiLog('info','variation.response',{ ...reqMeta, durationMs: dur, rawLength: String(raw||'').length })
      }catch(e){ raw = String(e?.message||e); aiLog('error','variation.error',{ ...reqMeta, error: String(e) }) }

      let parsed = null
      try{ parsed = JSON.parse((String(raw).match(/\{[\s\S]*\}/)||[''])[0]) }catch(e){ parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [] } }
      results.push({ i: i+1, parsed, raw })

      // render card
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><strong>Var ${i+1}</strong><div style="display:flex;gap:8px"><button data-copy-target="var_${i}_title">Copy Title</button><button data-copy-target="var_${i}_desc">Copy Desc</button><button data-copy-target="var_${i}_tags">Copy Tags</button></div></div><div id="var_${i}_title" style="margin-top:8px;color:#d9cd71">${parsed.title||''}</div><div id="var_${i}_desc" style="margin-top:8px;color:#fff">${parsed.description||''}</div><div id="var_${i}_tags" style="margin-top:8px;color:#2c9dc1">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):parsed.hashtags||''}</div>`
      panel.appendChild(card)
    }

    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        const text = el ? el.textContent : ''
        try{ await navigator.clipboard.writeText(text); const prev = b.textContent; b.textContent = 'Copied'; setTimeout(()=>b.textContent = prev,1200) }catch(e){}
      })
    })

    // export JSON
    const exp = document.createElement('div')
    exp.style.marginTop = '10px'
    exp.innerHTML = `<button id="exportJsonVariations" class="primary">Export JSON</button>`
    panel.appendChild(exp)
    document.getElementById('exportJsonVariations').addEventListener('click', ()=>{
      const json = JSON.stringify(results.map(r=>r.parsed), null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${(title||'variations').replace(/[^a-z0-9\-]/gi,'_')}_variations.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    })

  }catch(err){ console.error('generateVariations failed', err); panel.appendChild(document.createElement('div')).textContent = 'Variations failed. See console.' }
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

      <main style="padding:0 6px">

        <div class="content-main">
          <section class="left-col">
            <div class="panel card">
              <input id="aiMainTitle" placeholder="Topic / Title" style="width:96%;padding:10px;border-radius:8px;border:none;background:#0f1a20;color:#fff;margin-bottom:8px" />
              <textarea id="aiMainOverview" placeholder="Overview / Description" style="width:96%;padding:10px;border-radius:8px;border:none;background:#0f1a20;color:#fff"></textarea>
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
        <h1 class="app-header-title">AI Social Content Generator</h1>
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
          </select>
          <select id="aiModelSelect" class="select">
            <option value="">(auto)</option>
          </select>
          <select id="aiPlatformSelect" class="small">
            <option value="youtube">YouTube Short</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="x">X (Twitter)</option>
            <option value="shopee">Shopee</option>
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
  document.getElementById('aiVariationsBtn')?.addEventListener('click', ()=> generateVariations(3))
  document.getElementById('aiClearBtn')?.addEventListener('click', ()=>{
    document.getElementById('aiMainTitle').value = ''
    document.getElementById('aiMainOverview').value = ''
    document.getElementById('aiResultPanel').innerHTML = 'Hasil generate akan muncul di sini.'
  })

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
      const presetSel = document.getElementById('aiPresetSelect')
      const set = document.getElementById('ai-settings-placeholder')
      const pres = document.getElementById('ai-presets-placeholder')
      const gen = document.getElementById('aiMainContainer')
      if(view === 'settings'){
        if(gen) gen.style.display = 'none'
        if(pres) pres.style.display = 'none'
        if(set) set.style.display = 'block'
        renderSettingsPage()
      }else if(view === 'presets'){
        if(gen) gen.style.display = 'none'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'block'
        renderPresetsPage()
      }else{
        if(gen) gen.style.display = 'block'
        if(set) set.style.display = 'none'
        if(pres) pres.style.display = 'none'
      }
    }
    navItems.forEach(it=>{
      it.addEventListener('click', ()=>{
        navItems.forEach(n=>n.classList.remove('active'))
        it.classList.add('active')
        const action = it.getAttribute('data-action')
        if(action === 'settings') showView('settings')
        else if(action === 'presets') showView('presets')
        else if(action === 'history') showView('generator')
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
              <div style="font-size:12px;margin-top:6px;color:#c9d0b3">Set the backend endpoint used by the app (can be local or remote).</div>
            </div>

            <div class="control-group">
              <label>Default provider</label>
              <select id="settingsDefaultProvider">
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
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

  // Presets page renderer
  function renderPresetsPage(){
    const placeholder = document.getElementById('ai-presets-placeholder')
    if(!placeholder) return
    const existing = placeholder.querySelector('.presets-page')
    if(existing){ return }

    const presets = window.PresetsManager.list()
    placeholder.innerHTML = `
      <div class="panel presets-page">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h2>Presets (Manage)</h2>
          <button id="presetsCloseBtn" class="secondary">Close</button>
        </div>
        <div id="presetsList" style="display:flex;flex-direction:column;gap:8px;margin-top:10px"></div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <input id="newPresetName" placeholder="Nama preset baru" style="flex:1;padding:8px;border-radius:6px;background:#0b1218;border:none;color:#fff" />
          <button id="createPresetBtn" class="primary">Buat</button>
        </div>
      </div>
    `

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

    function openEditor(key){
      const data = window.PresetsManager.get(key) || { label:key, platform: 'youtube', goal:'', tone:'', length:'short', cta:'', structure:'', hashtagCount:6 }
      const modal = document.createElement('div')
      modal.className = 'panel'
      modal.style.marginTop = '12px'
      modal.innerHTML = `
        <h3>Edit Preset: ${key}</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label>Label</label>
          <input id="editLabel" value="${(data.label||key).replace(/\"/g,'&quot;')}" />
          <label>Platform</label>
          <select id="editPlatform"><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="shopee">Shopee</option></select>
          <label>Tujuan</label>
          <input id="editGoal" value="${(data.goal||'').replace(/\"/g,'&quot;')}" />
          <label>Gaya / Tone</label>
          <input id="editTone" value="${(data.tone||'').replace(/\"/g,'&quot;')}" />
          <label>Panjang (short/medium/long)</label>
          <input id="editLength" value="${(data.length||'short').replace(/\"/g,'&quot;')}" />
          <label>CTA</label>
          <input id="editCta" value="${(data.cta||'').replace(/\"/g,'&quot;')}" />
          <label>Struktur output (contoh: Hook -> Benefit -> CTA)</label>
          <input id="editStructure" value="${(data.structure||'').replace(/\"/g,'&quot;')}" />
          <label>Jumlah hashtag (angka)</label>
          <input id="editHashtagCount" value="${(data.hashtagCount||6)}" />
          <div style="display:flex;gap:8px"><button id="savePresetEd" class="primary">Save</button><button id="cancelPresetEd" class="secondary">Cancel</button></div>
        </div>
      `
      const listEl = document.getElementById('presetsList')
      listEl.insertAdjacentElement('afterbegin', modal)

      document.getElementById('cancelPresetEd').addEventListener('click', ()=>{ modal.remove(); renderList() })
      document.getElementById('savePresetEd').addEventListener('click', ()=>{
        const label = document.getElementById('editLabel').value || key
        const platform = document.getElementById('editPlatform').value || 'youtube'
        const goal = document.getElementById('editGoal').value || ''
        const tone = document.getElementById('editTone').value || ''
        const length = document.getElementById('editLength').value || 'short'
        const cta = document.getElementById('editCta').value || ''
        const structure = document.getElementById('editStructure').value || ''
        const hashtagCount = parseInt(document.getElementById('editHashtagCount').value || '6', 10) || 6
        window.PresetsManager.upsert(key, { label, platform, goal, tone, length, cta, structure, hashtagCount })
        modal.remove()
        renderList()
        updatePresetDropdown()
      })
    }

    renderList()

    document.getElementById('createPresetBtn').addEventListener('click', ()=>{
      const name = String(document.getElementById('newPresetName').value||'').trim()
      if(!name) return alert('Masukkan nama preset')
      if(window.PresetsManager.get(name)) return alert('Preset sudah ada')
      window.PresetsManager.upsert(name, { label: name, platform: 'youtube', goal: '', tone: '', length: 'short', cta: '', structure: '', hashtagCount: 6 })
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
  }

  // preview helper: render preset summary in generator panel
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
    if(!key){ el.innerHTML = '<em>No preset selected</em>'; 
      // remove any preset tone note
      const prevNote = document.getElementById('presetToneNote'); if(prevNote) prevNote.remove();
      return }
    const p = window.PresetsManager.get(key)
    if(!p) return el.innerHTML = '<em>Preset not found</em>'
    el.innerHTML = `<div style="font-size:13px"><strong>${p.label}</strong> — ${p.goal || ''} · ${p.tone || ''} · ${p.length || ''}</div><div style="font-size:12px;margin-top:6px">Platform: ${p.platform || ''} · CTA: ${p.cta || ''} · Structure: ${p.structure || ''} · Hashtags: ${p.hashtagCount || ''}</div>`
    try{ aiLog('info','presetPreview',{ key, preview: p }) }catch(e){}
    // If preset defines a tone, apply it to the tone dropdown and show a small note
    try{
      if(p.tone){
        const toneSel = document.getElementById('aiToneSelect')
        if(toneSel){
          const normalized = String(p.tone||'').trim()
          const opt = Array.from(toneSel.options).find(o=>String(o.value||'').toLowerCase() === normalized.toLowerCase() || String(o.textContent||'').toLowerCase() === normalized.toLowerCase())
          let note = document.getElementById('presetToneNote')
          if(!note){ note = document.createElement('div'); note.id = 'presetToneNote'; note.style.fontSize = '12px'; note.style.marginTop = '6px'; note.style.color = '#c9d0b3'; toneSel.parentNode && toneSel.parentNode.appendChild(note) }
          if(opt){
            toneSel.value = opt.value
            toneSel.disabled = true
            note.textContent = 'Tone diset dari preset: ' + opt.textContent
          } else {
            // preset tone doesn't match available options; leave current selection and notify
            toneSel.disabled = true
            note.textContent = 'Preset tone: ' + p.tone + ' (tidak cocok dengan opsi)'
          }
        }
      } else {
        const prevNote = document.getElementById('presetToneNote'); if(prevNote) prevNote.remove();
        try{ const toneSel = document.getElementById('aiToneSelect'); if(toneSel) toneSel.disabled = false }catch(e){}
      }
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

  // populate dropdown immediately now that function exists and update preview
  try{ updatePresetDropdown(); const sel = document.getElementById('aiPresetSelect'); if(sel) updatePresetPreview(sel.value || ''); }catch(e){}
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
    openrouter: ['meta-llama/llama-3-8b-instruct']
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
  const recommendedDefaults = { gemini: 'models/gemini-2.5-flash', openai: 'gpt-4o-mini', openrouter: 'meta-llama/llama-3-8b-instruct' }

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
  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[prov]; if(k) return String(k).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
  const platformEl = document.getElementById('aiPlatformSelect')
  const platforms = platformEl ? [platformEl.value] : ['youtube']
  const chosenKeyword = document.getElementById('aiKeywordSelect')?.value || ''
  const tone = document.getElementById('aiToneSelect')?.value || 'neutral'
  const title = document.getElementById('aiMainTitle')?.value || ''
  const overview = document.getElementById('aiMainOverview')?.value || ''
  // build preset-based instructions (do not overwrite user description)
  let presetInstructions = ''
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){
      const p = window.PresetsManager.get(presetKey)
      if(p){
        presetInstructions = `Platform: ${p.platform || platforms[0]}. Goal: ${p.goal || ''}. Tone: ${p.tone || ''}. Length: ${p.length || ''}. CTA: ${p.cta || ''}. Structure: ${p.structure || ''}. HashtagCount: ${p.hashtagCount || ''}.`
      }
    }
  }catch(e){ presetInstructions = '' }

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Results</strong><div><button id="aiExportCSV" style="padding:6px 10px;border-radius:6px;margin-left:8px">Export CSV</button></div></div>'

  const platformInstructions = {
    youtube: 'YouTube Shorts rules:\n- Title <= 60 chars, hooky.\n- Description 1–2 short sentences + CTA (watch/follow).\n- Hashtags: 6–10, mix broad + niche.',
    tiktok: 'TikTok rules:\n- Title <= 70 chars, punchy.\n- Description 1–2 short lines, conversational.\n- Hashtags: 8–15.',
    instagram: 'Instagram Reels rules:\n- Title <= 70 chars.\n- Description 2–3 lines, energetic.\n- Hashtags: 12–25.',
    facebook: 'Facebook post rules:\n- Title <= 80 chars.\n- Description 2–4 sentences with engagement question.\n- Hashtags: 3–8.',
    x: 'X (Twitter) rules:\n- Title <= 70 chars.\n- Description <= 240 chars.\n- Hashtags: 1–3 only.',
    shopee: 'Shopee listing rules:\n- Title <= 60 chars.\n- Description: 2–4 short bullet points focusing on benefits.\n- Tags: 5–12 product/category focused.'
  }

  const extractJson = (txt) => { const m = String(txt||'').match(/\{[\s\S]*\}/); if(!m) return null; try{ return JSON.parse(m[0]) }catch(e){ return null } }
  const forceJsonPrompt = (basePrompt) => `${basePrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanations. If you cannot, output {"title":"","description":"","hashtags":[]} only.`.trim()

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []

    for(const platform of (platforms.length?platforms:['youtube'])){
      const platformInstruction = platformInstructions[platform] || ''
      const presetSel = document.getElementById('aiPresetSelect')
      const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
      aiLog('info','generate.request.prepare',{ provider: prov, model, lang, platform, title, overview, chosenKeyword, tone, presetKey, apiKeyPresent: !!apiKey, apiKeyMasked: maskKey(apiKey) })
      const languageInstruction = lang === 'en' ? 'Respond ONLY in English. Do not use any other language.' : 'Respond ONLY in Indonesian. Do not use any other language.'
      const prompt = `${languageInstruction}\nYou are a creative social copywriter.\nPlatform: ${platform}.\nWrite in ${lang === 'id' ? 'Indonesian' : 'English'}.\n\nContext:\n- Title: "${title}"\n- Overview: "${overview}"\n- Keyword focus: ${chosenKeyword||'none'}\n- Tone: ${tone}\n\n${platformInstruction}\n\n${presetInstructions ? ('Preset rules: ' + presetInstructions + '\\n\\n') : ''}Virality rules:\n- Start description with a hook in the first 6–10 words.\n- Add a clear CTA.\n\nOutput JSON only:{"title":"...","description":"...","hashtags":["#..","#.."]}\nReturn only the JSON.`.trim()

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

      if(!parsed) parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [] }
      aiLog('info','generate.parsed',{ platform, parsed })
      results.push({ platform, parsed })

      // render card
      const idSafe = `aiRes_${platform}`
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <strong style="text-transform:capitalize">${platform}</strong>
          <div style="display:flex;gap:8px">
            <button data-copy-target="${idSafe}_title" style="padding:6px;border-radius:6px">Copy Title</button>
            <button data-copy-target="${idSafe}_desc" style="padding:6px;border-radius:6px">Copy Desc</button>
            <button data-copy-target="${idSafe}_tags" style="padding:6px;border-radius:6px">Copy Tags</button>
          </div>
        </div>
        <div id="${idSafe}_title" style="margin-top:8px;color:#d9cd71">${parsed.title || ''}</div>
        <div id="${idSafe}_desc" style="margin-top:8px;color:#fff">${parsed.description || ''}</div>
        <div id="${idSafe}_tags" style="margin-top:8px;color:#2c9dc1">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):(parsed.hashtags||'')}</div>
      `
      panel.appendChild(card)
    }

    // per-card copy wiring
    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        const text = el ? el.textContent : ''
        try{ await navigator.clipboard.writeText(text); const prev = b.textContent; b.textContent = 'Copied'; setTimeout(()=>b.textContent = prev,1200) }catch(e){}
      })
    })

    // export csv
    const exportBtn = document.getElementById('aiExportCSV')
    if(exportBtn){
      exportBtn.addEventListener('click', ()=>{
        const rows = [['platform','title','description','hashtags']]
        results.forEach(r=> rows.push([r.platform, r.parsed.title.replace(/"/g,'""'), r.parsed.description.replace(/"/g,'""'), Array.isArray(r.parsed.hashtags)?r.parsed.hashtags.join(' '):r.parsed.hashtags]))
        const csv = rows.map(r => r.map(c=>`"${String(c||'').replace(/\"/g,'""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `${(title||'content').replace(/[^a-z0-9\-]/gi,'_')}_social.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      })
    }

  }catch(err){ console.error('AI generation failed', err); panel.appendChild(document.createElement('div')).textContent = 'AI generation failed. See console.' }
}

async function generateVariations(count = 3) {
  const lang = document.getElementById('aiLangSelect')?.value || 'id'
  const prov = document.getElementById('aiProviderSelect')?.value || 'gemini'
  const model = document.getElementById('aiModelSelect')?.value || ''
  const apiKey = (function(){ try{ const raw = localStorage.getItem('ai-settings'); if(raw){ const s = JSON.parse(raw); const k = s?.keys?.[prov]; if(k) return String(k).trim() } }catch(e){} return String(localStorage.getItem('ai_api_key')||'').trim() })()
  const platform = document.getElementById('aiPlatformSelect')?.value || 'youtube'
  const chosenKeyword = document.getElementById('aiKeywordSelect')?.value || ''
  const tone = document.getElementById('aiToneSelect')?.value || 'neutral'
  const title = document.getElementById('aiMainTitle')?.value || ''
  const overview = document.getElementById('aiMainOverview')?.value || ''

  const panel = document.getElementById('aiResultPanel')
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Variations</strong><div></div></div>`

  // build presetInstructions for variations
  let presetInstructions = ''
  try{
    const presetSel = document.getElementById('aiPresetSelect')
    const presetKey = presetSel ? String(presetSel.value||'').trim() : ''
    if(presetKey){ const p = window.PresetsManager.get(presetKey); if(p) presetInstructions = `Platform: ${p.platform||platform}. Goal: ${p.goal||''}. Tone: ${p.tone||''}. Length: ${p.length||''}. CTA: ${p.cta||''}. Structure: ${p.structure||''}. HashtagCount: ${p.hashtagCount||''}.` }
  }catch(e){ presetInstructions = '' }

  const platformInstructionMap = { youtube: 'YouTube Shorts rules: Title <= 60 chars, Description short, Hashtags 6–10.', tiktok: 'TikTok rules: punchy, Hashtags 8–15.', instagram: 'Instagram: energetic, Hashtags 12–25.', shopee: 'Shopee: product-focused, 5 tags.' }
  const platformInstruction = platformInstructionMap[platform] || ''

  try{
    if(!apiKey) throw new Error('AI API key is empty for selected provider (set it in Settings, then Save)')
    const results = []

    for(let i=0;i<count;i++){
      const prompt = `You are a creative social copywriter. Platform: ${platform}. Write in ${lang==='id'?'Indonesian':'English'}.\nContext:\n- Title: "${title}"\n- Overview: "${overview}"\n- Keyword focus: ${chosenKeyword||'none'}\n- Tone: ${tone}\n\n${platformInstruction}\n\n${presetInstructions ? ('Preset rules: ' + presetInstructions + '\\n\\n') : ''}\nReturn only JSON: {"title":"...","description":"...","hashtags":["#.."]}`

      let raw = null
      try{ raw = await window.AI.generate({ provider: prov, apiKey, prompt, model }) }catch(e){ raw = String(e?.message||e) }

      let parsed = null
      try{ parsed = JSON.parse((String(raw).match(/\{[\s\S]*\}/)||[''])[0]) }catch(e){ parsed = { title: '', description: String(raw||'').slice(0,800), hashtags: [] } }
      results.push({ i: i+1, parsed, raw })

      // render card
      const card = document.createElement('div')
      card.style.borderTop = '1px solid rgba(255,255,255,0.04)'
      card.style.paddingTop = '10px'
      card.style.marginTop = '10px'
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-start"><strong>Var ${i+1}</strong><div style="display:flex;gap:8px"><button data-copy-target="var_${i}_title">Copy Title</button><button data-copy-target="var_${i}_desc">Copy Desc</button><button data-copy-target="var_${i}_tags">Copy Tags</button></div></div><div id="var_${i}_title" style="margin-top:8px;color:#d9cd71">${parsed.title||''}</div><div id="var_${i}_desc" style="margin-top:8px;color:#fff">${parsed.description||''}</div><div id="var_${i}_tags" style="margin-top:8px;color:#2c9dc1">${Array.isArray(parsed.hashtags)?parsed.hashtags.join(' '):parsed.hashtags||''}</div>`
      panel.appendChild(card)
    }

    panel.querySelectorAll('button[data-copy-target]').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const tgt = b.getAttribute('data-copy-target')
        const el = document.getElementById(tgt)
        const text = el ? el.textContent : ''
        try{ await navigator.clipboard.writeText(text); const prev = b.textContent; b.textContent = 'Copied'; setTimeout(()=>b.textContent = prev,1200) }catch(e){}
      })
    })

    // export JSON
    const exp = document.createElement('div')
    exp.style.marginTop = '10px'
    exp.innerHTML = `<button id="exportJsonVariations" class="primary">Export JSON</button>`
    panel.appendChild(exp)
    document.getElementById('exportJsonVariations').addEventListener('click', ()=>{
      const json = JSON.stringify(results.map(r=>r.parsed), null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${(title||'variations').replace(/[^a-z0-9\-]/gi,'_')}_variations.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    })

  }catch(err){ console.error('generateVariations failed', err); panel.appendChild(document.createElement('div')).textContent = 'Variations failed. See console.' }
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
  if(!id || !mediaType) { alert('No media selected'); return }
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
  }catch(err){ console.error('AI generate error', err); alert('AI generate failed. See console.') }
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