/* =====================================================================
   Settings + per-browser storage (always wrapped: storage can be blocked)
   ===================================================================== */
const Store = {
  get(k, d){ try { const v = localStorage.getItem('strumjam.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem('strumjam.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
};
const Settings = Object.assign({
  drumVol: 0.8, click: false, lefty: false, sens: 6, latency: 80, echo: false,
  apiKey: '', apiModel: 'claude-sonnet-4-5', easy: false, strict: 'normal', deviceId: '', tempo: 100, tuneFirst: true, musicOn: true, musicVol: 0.5, sfxOn: true, sfxVol: 0.7, showNotes: true, fbView: 'down', headphones: false, micProfiles: {},
}, Store.get('settings', {}));
function saveSettings(){ Store.set('settings', Settings); }
