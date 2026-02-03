// presets.js - simple presets manager stored in localStorage
(function(){
  const KEY = 'genco_presets_v1'
  const defaults = {
    Informal: {
      label: 'Informal',
      platform: 'youtube',
      goal: 'Engagement',
      tone: 'santai, friendly',
      length: 'short',
      cta: 'Follow for more',
      structure: 'Hook -> Benefit -> CTA',
      hashtagCount: 8,
      emojiStyle: 'light'
    },
    Jualan: {
      label: 'Jualan',
      platform: 'tiktok',
      goal: 'Jualan',
      tone: 'persuasif, santai',
      length: 'short',
      cta: 'Beli sekarang',
      structure: 'Hook -> Benefit -> Social proof -> CTA',
      hashtagCount: 10,
      emojiStyle: 'minimal'
    },
    Edukasi: {
      label: 'Edukasi',
      platform: 'youtube',
      goal: 'Edukasi',
      tone: 'informative, clear',
      length: 'medium',
      cta: 'Pelajari lebih lanjut',
      structure: 'Hook -> 2 tips -> CTA',
      hashtagCount: 6,
      emojiStyle: 'none'
    }
  }

  function load(){
    try{ const raw = localStorage.getItem(KEY); if(!raw) return JSON.parse(JSON.stringify(defaults)); return JSON.parse(raw) }catch(e){ return JSON.parse(JSON.stringify(defaults)) }
  }
  function save(obj){ try{ localStorage.setItem(KEY, JSON.stringify(obj)); return true }catch(e){ return false } }
  function list(){ const p = load(); return Object.keys(p).map(k=> ({ key:k, label: p[k].label })) }
  function get(key){ const p = load(); return p[key] || null }
  function upsert(key, data){ const p = load(); p[key] = data; save(p); return true }
  function remove(key){ const p = load(); delete p[key]; save(p); return true }

  window.PresetsManager = { load, save, list, get, upsert, remove }
})();
