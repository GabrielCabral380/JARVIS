// ══════════════════════════════════════════════════════
// JARVIS — Client-Side Full Implementation v2.0
// Funciona 100% no GitHub Pages sem backend
// Todas as funções do projeto original por voz
// ══════════════════════════════════════════════════════

const $ = s => document.querySelector(s);
const APP = document.getElementById('app');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let safeMode = false;

// ── STORAGE ──
const Store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('jarvis-' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem('jarvis-' + k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem('jarvis-' + k); }
};

// ── CONFIG ──
const DEFAULTS = {
  AI_PROVIDER: 'local', OPENAI_API_KEY: '', OPENAI_MODEL: 'gpt-4o-mini', OPENAI_BASE_URL: 'https://api.openai.com/v1',
  OPENROUTER_API_KEY: '', OPENROUTER_MODEL: 'openai/gpt-4o-mini', OPENROUTER_SITE_URL: 'https://gabrielcabral380.github.io/JARVIS/', OPENROUTER_SITE_NAME: 'JARVIS Cloud',
  NVIDIA_API_KEY: '', NVIDIA_MODEL: 'meta/llama-3.1-70b-instruct',
  CODEX_ENABLED: false, HERMES_ENABLED: true, HERMES_URL: 'http://localhost:8001',
  OPENCLAW_ENABLED: true, OPENCLAW_URL: 'http://localhost:8675',
  MCP_ENABLED: true, MCP_URL: 'http://localhost:3001/mcp',
  LOCAL_TOOLS_ENABLED: true, APPROVAL_POLICY: 'once',
  VOICE_LANG: 'pt-BR', VOICE_RATE: 1.0, VOICE_PITCH: 0.95, CONTINUOUS_VOICE: true
};
function loadConfig() { return { ...DEFAULTS, ...Store.get('config', {}) }; }
function saveConfig(p) { const c = loadConfig(); Object.assign(c, p); Store.set('config', c); return c; }

// ── MEMORY ──
function loadMemory() { return Store.get('memory', []); }
function saveMemory(m) { Store.set('memory', m.slice(-200)); }
function appendMemory(role, text) { const m = loadMemory(); m.push({ role, text: String(text).slice(0, 1200), ts: new Date().toISOString() }); saveMemory(m); }

// ── REMINDERS ──
function loadReminders() { return Store.get('reminders', []); }
function saveReminders(r) { Store.set('reminders', r); }
function addReminder(text, when) { const r = loadReminders(); r.push({ id: Date.now().toString(36), text, when: when || null, done: false, created: new Date().toISOString() }); saveReminders(r); return r[r.length - 1]; }
function listReminders() { return loadReminders().filter(r => !r.done); }
function dueReminders() { const n = Date.now(); return loadReminders().filter(r => !r.done && r.when && new Date(r.when).getTime() <= n); }
function parseReminder(text) {
  const t = text.toLowerCase();
  const patterns = [/(?:me\s+)?lembre\s+(?:de\s+)?(.+?)(?:\s+em\s+(\d+)\s*(?:min|minutos?|h|horas?))?$/i, /(?:me\s+)?lembrar\s+(?:de\s+)?(.+?)(?:\s+em\s+(\d+)\s*(?:min|minutos?|h|horas?))?$/i, /(?:me\s+)?lembre\s+(?:de\s+)?(.+?)(?:\s+(?:amanh[ãa]|hoje)\s*(?:[àa]s\s+)?([0-9]{1,2}:[0-9]{2}))?$/i, /(?:me\s+)?lembre\s+(?:de\s+)?(.+?)(?:\s+(?:amanh[ãa]|[0-9]{1,2}:[0-9]{2}))?$/i];
  for (const p of patterns) { const m = text.match(p); if (m) { const rt = m[1].trim(); let w = null; if (m[2]) { if (m[2].includes(':')) { const [hh, mm] = m[2].split(':'); const d = new Date(); d.setHours(parseInt(hh), parseInt(mm), 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); w = d.toISOString(); } else { const n = parseInt(m[2]); w = new Date(Date.now() + n * (t.includes('hora') ? 3600000 : 60000)).toISOString(); } } else if (t.includes('amanh')) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); w = d.toISOString(); } return { text: rt, when: w }; } }
  return null;
}

// ── APPROVALS ──
function loadApprovals() { return Store.get('approvals', { trusted: [], pending: [], policy: 'once' }); }
function saveApprovals(a) { Store.set('approvals', a); }

// ── VOICE ──
function speak(text) {
  if (!('speechSynthesis' in window)) { const e = $('#voiceStatus'); if (e) e.textContent = 'Sem suporte a voz.'; return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = (loadConfig().VOICE_LANG || 'pt-BR'); u.rate = parseFloat(loadConfig().VOICE_RATE) || 1; u.pitch = parseFloat(loadConfig().VOICE_PITCH) || 0.95;
  u.onstart = () => { const e = $('#voiceStatus'); if (e) e.textContent = 'Falando...'; setMode('SPEAKING', '◉'); };
  u.onend = () => { const e = $('#voiceStatus'); if (e) e.textContent = listening ? 'Ouvindo...' : 'Pronta.'; setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎'); };
  window.speechSynthesis.speak(u);
}
function stopSpeaking() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
function startListening() {
  if (!SpeechRecognition) { const e = $('#voiceStatus'); if (e) e.textContent = 'Sem reconhecimento de voz.'; return; }
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = loadConfig().VOICE_LANG || 'pt-BR';
    recognition.continuous = true; recognition.interimResults = false;
    recognition.onstart = () => { listening = true; const e = $('#voiceStatus'); if (e) e.textContent = '🎙️ Ouvindo...'; setMode('LISTENING', '◉'); };
    recognition.onend = () => {
      if (listening) { try { recognition.start(); } catch {} return; }
      const e = $('#voiceStatus'); if (e) e.textContent = 'Pronta.'; setMode('PAGES', '◎');
    };
    recognition.onerror = ev => {
      if (ev.error === 'no-speech' || ev.error === 'aborted') { if (listening) { try { recognition.start(); } catch {} } return; }
      if (listening) { try { recognition.start(); } catch {} return; }
      listening = false; const e = $('#voiceStatus'); if (e) e.textContent = 'Erro: ' + (ev.error || '?'); setMode('PAGES', '◎');
    };
    recognition.onresult = ev => { const t = ev.results[ev.results.length - 1][0].transcript || ''; if (ev.results[ev.results.length - 1].isFinal) { const ci = $('#commandInput'); if (ci) ci.value = t; runCommand(t, true); } };
  }
  try { recognition.start(); } catch {}
}
function stopListening() {
  listening = false;
  if (recognition) { try { recognition.stop(); } catch {} }
  const e = $('#voiceStatus'); if (e) e.textContent = '⏹️ Parada.';
  setMode('PAGES', '◎');
}

// ── UI ──
function setMode(mode, mood) { const m = $('#mode'); const o = $('#mood'); if (m) m.textContent = mode; if (o) o.textContent = mood || '◎'; }
function addMessage(html, type) { const w = $('#messages'); if (!w) return; const d = document.createElement('div'); d.className = 'msg ' + (type || 'assistant'); d.innerHTML = html; w.appendChild(d); w.scrollTop = w.scrollHeight; }
function addTyping() { const w = $('#messages'); if (!w) return null; const d = document.createElement('div'); d.className = 'msg assistant typing'; d.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>'; w.appendChild(d); w.scrollTop = w.scrollHeight; return d; }
function removeTyping(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }
function esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ── AI CHAT ──
async function callAI(baseUrl, key, model, msgs) {
  const r = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify({ model, messages: msgs, max_tokens: 2048, temperature: 0.7 }) });
  if (!r.ok) { const t = await r.text(); throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 200)); }
  const d = await r.json(); return d.choices?.[0]?.message?.content || 'Sem resposta.';
}
async function aiChat(msg) {
  const c = loadConfig(); const mem = loadMemory().slice(-10).map(m => ({ role: m.role === 'preference' ? 'system' : m.role, content: m.text }));
  const sys = { role: 'system', content: 'Você é JARVIS, assistente virtual. Personalidade: elegante, calma, precisa, proativa. Responda em pt-BR. Seja direto.' };
  const msgs = [sys, ...mem, { role: 'user', content: msg }];
  if (c.AI_PROVIDER === 'openrouter' && c.OPENROUTER_API_KEY) return callAI('https://openrouter.ai/api/v1', c.OPENROUTER_API_KEY, c.OPENROUTER_MODEL, msgs);
  if (c.AI_PROVIDER === 'openai' && c.OPENAI_API_KEY) return callAI(c.OPENAI_BASE_URL, c.OPENAI_API_KEY, c.OPENAI_MODEL, msgs);
  if (c.AI_PROVIDER === 'nvidia' && c.NVIDIA_API_KEY) return callAI('https://integrate.api.nvidia.com/v1', c.NVIDIA_API_KEY, c.NVIDIA_MODEL, msgs);
  return localReply(msg);
}

// ══════════════════════════════════════════════════════
// LOCAL REPLY — TODAS as funções do projeto original
// ══════════════════════════════════════════════════════
function localReply(cmd) {
  const text = (cmd || '').toLowerCase().trim();
  if (!text) return 'Estou ouvindo, Senhor.';

  if (text === 'status' || text.includes('status') || text.includes('como você está') || text.includes('tudo bem'))
    return 'Sistema operacional. Voz ativa. Memória: ' + loadMemory().length + ' entradas. Lembretes: ' + listReminders().length + ' ativos.';

  if (text.includes('testar voz') || text.includes('testa voz') || text === 'fala' || text === 'voz' || text.includes('fale'))
    return 'Voz online. Respondendo do navegador, Senhor.';

  if (text.includes('parar voz') || text.includes('para voz') || text.includes('calar') || text.includes('silêncio') || text.includes('silencio') || text === 'stop') {
    stopSpeaking(); stopListening(); return 'Voz pausada, Senhor.';
  }

  if (text.includes('youtube') || text.includes('abrir yt') || text === 'yt') { window.open('https://www.youtube.com', '_blank'); return 'Abrindo YouTube.'; }

  const ytM = text.match(/(?:pesquisar|buscar|procurar|tocar|ouvir)\s+(?:no\s+)?youtube\s+(.+)/i) || text.match(/youtube\s+(.+)/i);
  if (ytM) { window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(ytM[1].trim()), '_blank'); return 'Pesquisando "' + ytM[1].trim() + '" no YouTube.'; }

  const sM = text.match(/(?:pesquisar|buscar|procurar)\s+(?:na\s+)?(?:internet|google|web)?\s*(.+)/i);
  if (sM) { const q = sM[1].replace(/^(sobre|por|de|do|da|o|a|os|as|um|uma)\s+/i, '').trim(); if (q) { window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank'); return 'Pesquisando "' + q + '".'; } }
  if (text.includes('pesquis') || text.includes('buscar') || text.includes('procurar')) {
    const cl = cmd.replace(/^(jarvis|por favor|,)\s*/i, '').replace(/pesquis(e|ar)|buscar|procurar|na internet|no google/gi, '').trim();
    if (cl.length > 2) { window.open('https://www.google.com/search?q=' + encodeURIComponent(cl), '_blank'); return 'Pesquisando "' + cl + '".'; }
  }
  if (text.includes('abrir navegador') || text.includes('abrir browser') || text.includes('abrir google') || text.includes('navegador')) { window.open('https://www.google.com', '_blank'); return 'Abrindo navegador.'; }

  // ══════════════════════════════════════════════════════
  // INTEGRAÇÕES — E-mail, WhatsApp, Redes Sociais, Apps
  // ══════════════════════════════════════════════════════

  // ── E-MAIL ──
  if (text.includes('email') || text.includes('e-mail') || text.includes('correio')) {
    const emailCmd = text.match(/(?:enviar?|escrever|compor|mandar?)\s+(?:e[-]?email|email|mensagem)\s+(?:para\s+)?(.+)/i);
    if (emailCmd) {
      const to = emailCmd[1].trim();
      const subjectMatch = text.match(/assunto\s+(.+?)(?:\s+com\s+|$)/i);
      const subject = subjectMatch ? encodeURIComponent(subjectMatch[1].trim()) : '';
      window.open('mailto:' + to + '?subject=' + subject, '_blank');
      return '📧 Abrindo e-mail para ' + to + '.';
    }
    if (text.includes('gmail')) { window.open('https://mail.google.com', '_blank'); return '📧 Abrindo Gmail.'; }
    if (text.includes('outlook') || text.includes('hotmail')) { window.open('https://outlook.live.com', '_blank'); return '📧 Abrindo Outlook.'; }
    if (text.includes('yahoo')) { window.open('https://mail.yahoo.com', '_blank'); return '📧 Abrindo Yahoo Mail.'; }
    window.open('https://mail.google.com', '_blank');
    return '📧 Abrindo Gmail.';
  }
  if (text === 'gmail' || text.includes('abrir gmail')) { window.open('https://mail.google.com', '_blank'); return '📧 Abrindo Gmail.'; }
  if (text === 'outlook' || text.includes('abrir outlook') || text.includes('hotmail')) { window.open('https://outlook.live.com', '_blank'); return '📧 Abrindo Outlook.'; }

  // ── WHATSAPP ──
  if (text.includes('whatsapp') || text.includes('whats')) {
    if (text.includes('web') || text.includes('computador') || text.includes('pc')) {
      window.open('https://web.whatsapp.com', '_blank');
      return '💬 Abrindo WhatsApp Web.';
    }
    const wMatch = text.match(/(?:whatsapp|whats)\s+(?:para\s+)?(\d[\d\s\-().+]{6,})/i);
    if (wMatch) {
      const num = wMatch[1].replace(/[\s\-().+]/g, '');
      const msgMatch = text.match(/(?:dizendo|mensagem|falando|enviar?)\s+["']?(.+?)["']?\s*$/i);
      const msg = msgMatch ? encodeURIComponent(msgMatch[1].trim()) : '';
      window.open('https://wa.me/' + num + (msg ? '?text=' + msg : ''), '_blank');
      return '💬 Abrindo WhatsApp para ' + wMatch[1].trim() + '.';
    }
    window.open('https://web.whatsapp.com', '_blank');
    return '💬 Abrindo WhatsApp Web.';
  }

  // ── REDES SOCIAIS ──
  if (text.includes('instagram') || text === 'insta') { window.open('https://www.instagram.com', '_blank'); return '📸 Abrindo Instagram.'; }
  if (text.includes('twitter') || text === 'x.com' || text === 'x') { window.open('https://x.com', '_blank'); return '🐦 Abrindo X (Twitter).'; }
  if (text.includes('facebook') || text === 'face') { window.open('https://www.facebook.com', '_blank'); return '📘 Abrindo Facebook.'; }
  if (text.includes('linkedin')) { window.open('https://www.linkedin.com', '_blank'); return '💼 Abrindo LinkedIn.'; }
  if (text.includes('tiktok') || text === 'tik tok') { window.open('https://www.tiktok.com', '_blank'); return '🎵 Abrindo TikTok.'; }
  if (text.includes('telegram')) { window.open('https://web.telegram.org', '_blank'); return '✈️ Abrindo Telegram Web.'; }
  if (text.includes('discord')) { window.open('https://discord.com/app', '_blank'); return '🎮 Abrindo Discord.'; }
  if (text.includes('slack')) { window.open('https://app.slack.com', '_blank'); return '💬 Abrindo Slack.'; }
  if (text.includes('teams') || text.includes('microsoft teams')) { window.open('https://teams.microsoft.com', '_blank'); return '👥 Abrindo Microsoft Teams.'; }
  if (text.includes('zoom')) { window.open('https://zoom.us/join', '_blank'); return '📹 Abrindo Zoom.'; }
  if (text.includes('meet') || text.includes('google meet')) { window.open('https://meet.google.com', '_blank'); return '📹 Abrindo Google Meet.'; }

  // ── STREAMING ──
  if (text.includes('netflix')) { window.open('https://www.netflix.com', '_blank'); return '🎬 Abrindo Netflix.'; }
  if (text.includes('spotify')) { window.open('https://open.spotify.com', '_blank'); return '🎵 Abrindo Spotify.'; }
  if (text.includes('disney') || text.includes('disney+')) { window.open('https://www.disneyplus.com', '_blank'); return '✨ Abrindo Disney+.'; }
  if (text.includes('hbo') || text.includes('max')) { window.open('https://www.max.com', '_blank'); return '🎬 Abrindo HBO Max.'; }

  // ── TRABALHO / PRODUTIVIDADE ──
  if (text.includes('google drive') || text.includes('drive')) { window.open('https://drive.google.com', '_blank'); return '📁 Abrindo Google Drive.'; }
  if (text.includes('google docs') || text.includes('docs')) { window.open('https://docs.google.com', '_blank'); return '📄 Abrindo Google Docs.'; }
  if (text.includes('google sheets') || text.includes('planilha')) { window.open('https://sheets.google.com', '_blank'); return '📊 Abrindo Google Sheets.'; }
  if (text.includes('google calendar') || text.includes('calendário') || text.includes('calendario') || text.includes('agenda')) { window.open('https://calendar.google.com', '_blank'); return '📅 Abrindo Google Calendar.'; }
  if (text.includes('notion')) { window.open('https://www.notion.so', '_blank'); return '📝 Abrindo Notion.'; }
  if (text.includes('trello')) { window.open('https://trello.com', '_blank'); return '📋 Abrindo Trello.'; }
  if (text.includes('github')) { window.open('https://github.com', '_blank'); return '💻 Abrindo GitHub.'; }
  if (text.includes('figma')) { window.open('https://www.figma.com', '_blank'); return '🎨 Abrindo Figma.'; }
  if (text.includes('canva')) { window.open('https://www.canva.com', '_blank'); return '🎨 Abrindo Canva.'; }

  // ── COMPRAS / FINANCEIRO ──
  if (text.includes('amazon')) { window.open('https://www.amazon.com.br', '_blank'); return '🛒 Abrindo Amazon.'; }
  if (text.includes('mercado livre') || text.includes('mercadolibre')) { window.open('https://www.mercadolivre.com.br', '_blank'); return '🛒 Abrindo Mercado Livre.'; }
  if (text.includes('olx')) { window.open('https://www.olx.com.br', '_blank'); return '🛒 Abrindo OLX.'; }
  if (text.includes('shopee')) { window.open('https://shopee.com.br', '_blank'); return '🛒 Abrindo Shopee.'; }
  if (text.includes('nubank') || text.includes('banco')) { window.open('https://app.nubank.com.br', '_blank'); return '🏦 Abrindo Nubank.'; }
  if (text.includes('ifood')) { window.open('https://www.ifood.com.br', '_blank'); return '🍕 Abrindo iFood.'; }

  // ── NOTÍCIAS ──
  if (text.includes('notícia') || text.includes('noticia') || text.includes('jornal')) { window.open('https://news.google.com', '_blank'); return '📰 Abrindo Google Notícias.'; }
  if (text.includes('g1') || text.includes('globo')) { window.open('https://g1.globo.com', '_blank'); return '📰 Abrindo G1.'; }
  if (text.includes('uol')) { window.open('https://www.uol.com.br', '_blank'); return '📰 Abrindo UOL.'; }
  if (text.includes('cnn')) { window.open('https://www.cnnbrasil.com.br', '_blank'); return '📰 Abrindo CNN Brasil.'; }

  // ── MAPAS / TRANSPORTE ──
  if (text.includes('google maps') || text.includes('mapa')) { window.open('https://maps.google.com', '_blank'); return '🗺️ Abrindo Google Maps.'; }
  if (text.includes('waze')) { window.open('https://www.waze.com/live-map', '_blank'); return '🗺️ Abrindo Waze.'; }
  if (text.includes('uber')) { window.open('https://m.uber.com', '_blank'); return '🚗 Abrindo Uber.'; }
  if (text.includes('99') || text.includes('nove nove')) { window.open('https://99app.com', '_blank'); return '🚗 Abrindo 99.'; }

  // ── Open apps locais (Windows) ──
  const oM = text.match(/(?:abrir|abre|abra)\s+(?:o|a|os|as)?\s*(.+)/i);
  if (oM && !oM[1].includes('navegador') && !oM[1].includes('browser')) {
    const app = oM[1].trim().toLowerCase();
    const webApps = ['gmail','outlook','yahoo','whatsapp','instagram','twitter','facebook','linkedin','telegram','discord','slack','teams','zoom','meet','netflix','spotify','disney','hbo','max','google drive','docs','sheets','calendar','notion','trello','github','figma','canva','amazon','mercado livre','olx','shopee','nubank','ifood','maps','waze','uber','99'];
    if (webApps.some(w => app.includes(w))) return null;
    const prot = { 'calculadora':'ms-calculator:','bloco de notas':'notepad:','notepad':'notepad:','paint':'ms-paint:','explorador':'file:///C:/','documentos':'file:///C:/Users/User/Documents','downloads':'file:///C:/Users/User/Downloads','música':'file:///C:/Users/User/Music','musica':'file:///C:/Users/User/Music','imagens':'file:///C:/Users/User/Pictures','fotos':'file:///C:/Users/User/Pictures','vídeos':'file:///C:/Users/User/Videos','videos':'file:///C:/Users/User/Videos','desktop':'file:///C:/Users/User/Desktop' };
    const p = prot[app];
    if (p) { window.open(p, '_blank'); return '🖥️ Abrindo ' + app + '.'; }
    return '💡 Não encontrei "' + app + '". Posso abrir: calculadora, bloco de notas, explorador, documentos, downloads, desktop. E web: Gmail, WhatsApp, Instagram, Spotify, Netflix, Drive, Calendar e mais.';
  }

  if (text.includes('música') || text.includes('musica') || text.includes('tocar') || text.includes('ouvir') || text.includes('quero ouvir')) {
    const am = text.match(/(?:tocar|ouvir|música|musica)\s+(.+)/i);
    if (am) { window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(am[1].trim()), '_blank'); return 'Buscando: ' + am[1].trim() + '.'; }
    window.open('https://music.youtube.com', '_blank'); return 'Abrindo YouTube Music.';
  }

  if (text.includes('calculadora') || text.includes('calcul') || text.includes('calcular')) { window.open('ms-calculator:', '_blank'); return 'Abrindo calculadora.'; }

  if (text.includes('lembre') || text.includes('lembrar') || text.includes('lembret')) {
    if (text.includes('listar') || text.includes('mostrar') || text.includes('quais') || text.includes('ver')) {
      const r = listReminders(); if (!r.length) return 'Nenhum lembrete ativo.';
      return 'Lembretes:\n' + r.map(x => '• ' + x.text + (x.when ? ' (' + new Date(x.when).toLocaleString('pt-BR') + ')' : '')).join('\n');
    }
    if (text.includes('limpar') || text.includes('apagar todos') || text.includes('remover todos')) { saveReminders([]); return 'Lembretes removidos.'; }
    const p = parseReminder(cmd);
    if (p) { addReminder(p.text, p.when); return 'Lembrete: "' + p.text + '"' + (p.when ? ' para ' + new Date(p.when).toLocaleString('pt-BR') : '') + '.'; }
    return 'Diga: "Lembre de [algo] em 10 minutos" ou "Lembre de [algo] amanhã às 15:30".';
  }

  if (text.includes('memória') || text.includes('memoria') || text.includes('o que você sabe') || text.includes('suas memórias')) {
    const m = loadMemory(); if (!m.length) return 'Memória vazia.';
    const prefs = m.filter(x => x.role === 'preference');
    const conv = m.filter(x => x.role !== 'preference').slice(-5).map(x => x.role + ': ' + x.text.slice(0, 100)).join('\n');
    return 'Conversas:\n' + conv + (prefs.length ? '\n\nPreferências:\n' + prefs.map(x => '• ' + x.text).join('\n') : '');
  }
  if (text.includes('apagar memória') || text.includes('limpar memória') || text.includes('esquecer tudo')) { saveMemory([]); return 'Memória limpa.'; }
  if (text.includes('esquecer prefer')) { saveMemory(loadMemory().filter(x => x.role !== 'preference')); return 'Preferências removidas.'; }

  const lM = cmd.match(/(?:aprenda que|lembre-se que|guarde que|saiba que|esqueça que)\s+(.+)/i);
  if (lM) { const info = lM[1].trim(); if (text.includes('esque')) { saveMemory(loadMemory().filter(x => x.role !== 'preference' || x.text.toLowerCase() !== info.toLowerCase())); return 'Preferência removida.'; } appendMemory('preference', info); return 'Aprendi: ' + info; }

  if ((text.includes('hor') && (text.includes('são') || text.includes('sao') || text.includes('é') || text.includes('e'))) || text === 'hora' || text === 'que horas')
    return 'Agora são ' + new Date().toLocaleTimeString('pt-BR') + '.';
  if (text.includes('data') || (text.includes('dia') && (text.includes('hoje') || text.includes('é') || text.includes('e'))))
    return 'Hoje é ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.';
  if (text.includes('clima') || text.includes('tempo') || text.includes('temperatura') || text.includes('previsão') || text.includes('previsao'))
    { window.open('https://www.google.com/search?q=previsão+do+tempo', '_blank'); return 'Abrindo previsão do tempo.'; }

  if (text.includes('opinião') || text.includes('opinao') || text.includes('o que você acha') || text.includes('o que voce acha') || text.includes('converse') || text.includes('papo'))
    return 'Configure uma API de IA em Config para respostas completas.';

  if (text.includes('ajuda') || text.includes('help') || text.includes('o que você faz') || text.includes('o que voce faz') || text.includes('comandos') || text === 'menu' || text === 'opções' || text === 'opcoes')
    return `Comandos de voz:
• "Pesquisar [tema]" / "Abrir YouTube"
• "Abrir calculadora/bloco de notas/explorador"
• "Lembre de [algo] em 10 min / amanhã às 15:30"
• "Listar lembretes" / "Limpar lembretes"
• "Que horas são?" / "Que dia é hoje?"
• "Aprenda que [preferência]"
• "Minha memória" / "Limpar memória"
• "Status" / "Testar voz" / "Parar voz"
• "Previsão do tempo"
• "Modo seguro"
• "Limpar chat"
• Chat livre (configure API em Config)`;

  if (text.includes('modo seguro') || text.includes('safe mode')) { safeMode = !safeMode; return safeMode ? 'Modo seguro ativado.' : 'Modo seguro desativado.'; }
  if (text.includes('limpar chat') || text.includes('limpar conversa') || text.includes('limpar mensagens')) { const m = $('#messages'); if (m) m.innerHTML = ''; return 'Chat limpo.'; }

  if (text.includes('hermes') && !text.includes('envie para hermes')) return 'Hermes: orquestrador de agentes. Configure URL em Config.';
  if (text.includes('openclaw') && !text.includes('envie para openclaw')) return 'OpenClaw: executor local. Configure URL em Config.';
  if (text.includes('mcp') && !text.includes('envie para mcp')) return 'MCP: Model Context Protocol. Configure URL em Config.';

  return 'Recebi: "' + cmd + '". Configure API em Config para respostas completas.';
}

// ── ORCHESTRATOR ──
async function checkOrch(url, t = 2000) {
  if (!url) return false;
  try { const c = new AbortController(); setTimeout(() => c.abort(), t); const r = await fetch(url, { signal: c.signal }); return r.ok; } catch { return false; }
}
async function updateOrch() {
  const c = loadConfig(); const r = {};
  if (c.HERMES_ENABLED) r.hermes = await checkOrch(c.HERMES_URL + '/api/status');
  if (c.OPENCLAW_ENABLED) r.openclaw = await checkOrch(c.OPENCLAW_URL + '/api/status');
  if (c.MCP_ENABLED) r.mcp = await checkOrch(c.MCP_URL);
  const e = $('#orchestratorStatus'); if (e) {
    const p = [];
    if (r.hermes !== undefined) p.push('Hermes: ' + (r.hermes ? '🟢' : '🔴'));
    if (r.openclaw !== undefined) p.push('OpenClaw: ' + (r.openclaw ? '🟢' : '🔴'));
    if (r.mcp !== undefined) p.push('MCP: ' + (r.mcp ? '🟢' : '🔴'));
    e.textContent = p.length ? p.join(' • ') : 'Não configurado.';
  }
  return r;
}
async function sendOrch(target, cmd) {
  const c = loadConfig(); const urls = { hermes: c.HERMES_URL, openclaw: c.OPENCLAW_URL, mcp: c.MCP_URL };
  const url = urls[target]; if (!url) return target + ' não configurado.';
  try {
    const r = await fetch(url + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: cmd }) });
    if (r.ok) { const d = await r.json(); return d.text || d.reply || 'Resposta de ' + target + '.'; }
    return target + ' erro ' + r.status + '.';
  } catch { return target + ' indisponível.'; }
}

// ── COMMAND PROCESSOR ──
async function runCommand(cmd, fromVoice) {
  const prompt = String(cmd || '').trim();
  addMessage('<b>Você:</b> ' + esc(prompt), 'user');
  if (!prompt) { addMessage('<b>JARVIS:</b> Estou ouvindo.', 'assistant'); speak('Estou ouvindo.'); return; }
  appendMemory('user', prompt);
  setMode('THINKING', '◌');
  const typing = addTyping();
  try {
    const lower = prompt.toLowerCase();
    let reply;
    if (lower.startsWith('hermes:') || lower.startsWith('hermes ')) reply = await sendOrch('hermes', prompt.replace(/^hermes[:\s]*/i, ''));
    else if (lower.startsWith('openclaw:') || lower.startsWith('openclaw ')) reply = await sendOrch('openclaw', prompt.replace(/^openclaw[:\s]*/i, ''));
    else if (lower.startsWith('mcp:') || lower.startsWith('mcp ')) reply = await sendOrch('mcp', prompt.replace(/^mcp[:\s]*/i, ''));
    else reply = await aiChat(prompt);
    removeTyping(typing);
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    appendMemory('assistant', reply);
    speak(reply);
  } catch (err) {
    removeTyping(typing);
    const reply = 'Erro: ' + err.message;
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant'); speak(reply);
  } finally { setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎'); }
}

// ── CONFIG PANEL ──
function renderConfig() {
  const p = $('#configPanel'); if (!p) return;
  const c = loadConfig();
  const provs = [{ v: 'local', l: 'Local' }, { v: 'openrouter', l: 'OpenRouter' }, { v: 'openai', l: 'OpenAI' }, { v: 'nvidia', l: 'NVIDIA NIM' }];
  p.innerHTML = `<div class="config-section"><h4>🤖 Provedor de IA</h4><select id="cfgProvider">${provs.map(x => `<option value="${x.v}" ${c.AI_PROVIDER === x.v ? 'selected' : ''}>${x.l}</option>`).join('')}</select></div>
  <div class="config-section" id="cfgOR" style="${c.AI_PROVIDER !== 'openrouter' ? 'display:none' : ''}"><h4>🌐 OpenRouter</h4><input id="cfgORK" type="password" placeholder="sk-or-..." value="${c.OPENROUTER_API_KEY}" /><input id="cfgORM" placeholder="Modelo" value="${c.OPENROUTER_MODEL}" /></div>
  <div class="config-section" id="cfgOA" style="${c.AI_PROVIDER !== 'openai' ? 'display:none' : ''}"><h4>🧠 OpenAI</h4><input id="cfgOAK" type="password" placeholder="sk-..." value="${c.OPENAI_API_KEY}" /><input id="cfgOAM" placeholder="Modelo" value="${c.OPENAI_MODEL}" /><input id="cfgOAB" placeholder="Base URL" value="${c.OPENAI_BASE_URL}" /></div>
  <div class="config-section" id="cfgNV" style="${c.AI_PROVIDER !== 'nvidia' ? 'display:none' : ''}"><h4>⚡ NVIDIA</h4><input id="cfgNVK" type="password" placeholder="nvapi-..." value="${c.NVIDIA_API_KEY}" /><input id="cfgNVM" placeholder="Modelo" value="${c.NVIDIA_MODEL}" /></div>
  <div class="config-section"><h4>🎙️ Voz</h4><label>Idioma: <input id="cfgVL" value="${c.VOICE_LANG}" style="width:80px" /></label><label>Velocidade: <input id="cfgVR" type="range" min="0.5" max="2" step="0.1" value="${c.VOICE_RATE}" /><span id="cfgVRV">${c.VOICE_RATE}</span></label><label>Tom: <input id="cfgVP" type="range" min="0.5" max="2" step="0.05" value="${c.VOICE_PITCH}" /><span id="cfgVPV">${c.VOICE_PITCH}</span></label></div>
  <div class="config-section"><h4>🔗 Orquestradores</h4><label>Hermes: <input id="cfgHU" value="${c.HERMES_URL}" /></label><label>OpenClaw: <input id="cfgOU" value="${c.OPENCLAW_URL}" /></label><label>MCP: <input id="cfgMU" value="${c.MCP_URL}" /></label></div>
  <div class="config-section"><h4>🛡️ Segurança</h4><select id="cfgAP"><option value="once" ${c.APPROVAL_POLICY === 'once' ? 'selected' : ''}>Aprovar uma vez</option><option value="always" ${c.APPROVAL_POLICY === 'always' ? 'selected' : ''}>Sempre aprovar</option><option value="off" ${c.APPROVAL_POLICY === 'off' ? 'selected' : ''}>Desativado</option></select></div>
  <div class="config-actions"><button id="cfgSave" class="btn primary">Salvar</button><button id="cfgTest" class="btn">Testar API</button><button id="cfgClear" class="btn danger">Limpar Chaves</button></div>
  <div id="cfgResult" class="config-test-result"></div>`;

  const ps = $('#cfgProvider'); if (ps) ps.addEventListener('change', () => { const v = ps.value; document.getElementById('cfgOR').style.display = v === 'openrouter' ? '' : 'none'; document.getElementById('cfgOA').style.display = v === 'openai' ? '' : 'none'; document.getElementById('cfgNV').style.display = v === 'nvidia' ? '' : 'none'; });
  const rv = $('#cfgVR'); const rvv = $('#cfgVRV'); if (rv && rvv) rv.addEventListener('input', () => rvv.textContent = rv.value);
  const pv = $('#cfgVP'); const pvv = $('#cfgVPV'); if (pv && pvv) pv.addEventListener('input', () => pvv.textContent = pv.value);

  $('#cfgSave')?.addEventListener('click', () => {
    saveConfig({ AI_PROVIDER: $('#cfgProvider')?.value || 'local', OPENROUTER_API_KEY: $('#cfgORK')?.value?.trim() || '', OPENROUTER_MODEL: $('#cfgORM')?.value?.trim() || 'openai/gpt-4o-mini', OPENAI_API_KEY: $('#cfgOAK')?.value?.trim() || '', OPENAI_MODEL: $('#cfgOAM')?.value?.trim() || 'gpt-4o-mini', OPENAI_BASE_URL: $('#cfgOAB')?.value?.trim() || 'https://api.openai.com/v1', NVIDIA_API_KEY: $('#cfgNVK')?.value?.trim() || '', NVIDIA_MODEL: $('#cfgNVM')?.value?.trim() || 'meta/llama-3.1-70b-instruct', VOICE_LANG: $('#cfgVL')?.value?.trim() || 'pt-BR', VOICE_RATE: parseFloat($('#cfgVR')?.value) || 1, VOICE_PITCH: parseFloat($('#cfgVP')?.value) || 0.95, HERMES_URL: $('#cfgHU')?.value?.trim() || 'http://localhost:8001', OPENCLAW_URL: $('#cfgOU')?.value?.trim() || 'http://localhost:8675', MCP_URL: $('#cfgMU')?.value?.trim() || 'http://localhost:3001/mcp', APPROVAL_POLICY: $('#cfgAP')?.value || 'once' });
    addMessage('<b>JARVIS:</b> Configuração salva.', 'assistant'); speak('Configuração salva.');
  });

  $('#cfgTest')?.addEventListener('click', async () => {
    const r = $('#cfgResult'); if (r) r.textContent = 'Testando...';
    try { const prov = $('#cfgProvider')?.value || 'local'; if (prov === 'local') { if (r) r.textContent = '✅ Modo local.'; return; }
      const key = prov === 'openrouter' ? $('#cfgORK')?.value : prov === 'openai' ? $('#cfgOAK')?.value : $('#cfgNVK')?.value;
      if (!key) { if (r) r.textContent = '❌ Sem chave.'; return; }
      const reply = await aiChat('Responda: OK'); if (r) r.textContent = '✅ OK! Resposta: ' + reply.slice(0, 80);
    } catch (e) { if (r) r.textContent = '❌ ' + e.message; }
  });

  $('#cfgClear')?.addEventListener('click', () => { if (confirm('Remover chaves?')) { saveConfig({ OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', NVIDIA_API_KEY: '' }); addMessage('<b>JARVIS:</b> Chaves removidas.', 'assistant'); renderConfig(); } });
}

// ══════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════
function renderApp() {
  const c = loadConfig();
  const hasAI = (c.AI_PROVIDER === 'openrouter' && c.OPENROUTER_API_KEY) || (c.AI_PROVIDER === 'openai' && c.OPENAI_API_KEY) || (c.AI_PROVIDER === 'nvidia' && c.NVIDIA_API_KEY);

  APP.innerHTML = `<header class="topbar"><div class="brand">J·A·R·V·I·S</div><nav><button class="tab active" data-tab="pages">Pages</button><button class="tab" data-tab="config">Config</button></nav><div class="clock" id="clock">--:--:--</div></header>
  <section class="layout">
    <aside class="panel left"><h3>◉ STATUS</h3><div id="status" class="orchestrator">${hasAI ? 'IA: ' + c.AI_PROVIDER : 'Modo local. Configure API em Config.'}</div><h3>◉ VOZ</h3><div id="voiceStatus" class="orchestrator">Pronta.</div><h3>◉ MEMÓRIA</h3><div id="memStatus" class="orchestrator">${loadMemory().length} entradas • ${listReminders().length} lembretes</div></aside>
    <main class="center">
      <section class="screen tabpage active" id="tab-pages"><div class="orb-wrap"><div class="orb"><div class="face"><h1 id="mood">◎</h1><p id="mode">PAGES</p></div></div></div><div class="chatbox" id="messages"></div><div class="composer"><input id="commandInput" placeholder="Diga ou digite seu comando..." /><button id="sendCommand">Enviar</button></div><div class="quick"><button id="testVoice">🔊 Testar voz</button><button id="startVoice">🎙️ Falar</button><button id="stopVoice" style="display:none">⏹️ Parar</button><button id="openYouTube">📺 YouTube</button><button id="openBrowser">🌐 Pesquisar</button></div><p class="muted">Voz local ativa. Chat com IA via API do navegador. Configure em Config.</p></section>
      <section class="screen tabpage" id="tab-config"><h2>⚙️ Configuração</h2><div id="configPanel"></div></section>
    </main>
    <aside class="panel right"><h3>▸ OBSERVAÇÕES</h3><div class="orchestrator"><p><b>Pages:</b> ativo.</p><p><b>JARVIS pronto.</b></p><p>Voz local ativa.</p></div><h3>▸ ORQUESTRADOR</h3><div id="orchestratorStatus" class="orchestrator">Verificando...</div></aside>
  </section>`;

  // Tabs
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.tabpage').forEach(x => x.classList.remove('active')); t.classList.add('active'); const el = document.getElementById('tab-' + t.dataset.tab); if (el) el.classList.add('active'); if (t.dataset.tab === 'config') renderConfig(); }));
  // Clock
  function tick() { const e = $('#clock'); if (e) e.textContent = new Date().toLocaleTimeString('pt-BR'); } setInterval(tick, 1000); tick();
  // Send
  $('#sendCommand')?.addEventListener('click', () => { const i = $('#commandInput'); if (i) { runCommand(i.value.trim()); i.value = ''; } });
  $('#commandInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { const i = $('#commandInput'); if (i) { runCommand(i.value.trim()); i.value = ''; } } });
  // Voice
  $('#testVoice')?.addEventListener('click', () => { addMessage('<b>Você:</b> testar voz', 'user'); const r = 'Voz online.'; addMessage('<b>JARVIS:</b> ' + r, 'assistant'); speak(r); });
  $('#startVoice')?.addEventListener('click', () => { startListening(); const s = $('#startVoice'); const p = $('#stopVoice'); if (s) { s.style.display = 'none'; } if (p) { p.style.display = ''; p.classList.add('listening'); } });
  $('#stopVoice')?.addEventListener('click', () => { stopListening(); stopSpeaking(); const s = $('#startVoice'); const p = $('#stopVoice'); if (s) s.style.display = ''; if (p) { p.style.display = 'none'; p.classList.remove('listening'); } });
  // Quick
  $('#openYouTube')?.addEventListener('click', () => { addMessage('<b>Você:</b> Abrir YouTube', 'user'); window.open('https://www.youtube.com', '_blank'); const r = 'Abrindo YouTube.'; addMessage('<b>JARVIS:</b> ' + r, 'assistant'); speak(r); });
  $('#openBrowser')?.addEventListener('click', () => { const q = prompt('Pesquisar:'); if (q) { addMessage('<b>Você:</b> Pesquisar: ' + q, 'user'); window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank'); const r = 'Pesquisando "' + q + '".'; addMessage('<b>JARVIS:</b> ' + r, 'assistant'); speak(r); } });
  // Orch
  updateOrch(); setInterval(updateOrch, 30000);
  // Reminders
  setInterval(() => { const d = dueReminders(); if (d.length) { const t = 'Lembrete: ' + d[0].text; addMessage('<b>JARVIS:</b> ⏰ ' + t, 'assistant'); speak(t); const r = loadReminders(); const it = r.find(x => x.id === d[0].id); if (it) it.done = true; saveReminders(r); } }, 30000);
  // Mem status
  setInterval(() => { const e = $('#memStatus'); if (e) e.textContent = loadMemory().length + ' entradas • ' + listReminders().length + ' lembretes'; }, 10000);
  // Init msg
  addMessage('<b>JARVIS:</b> Página pública pronta. Voz local ativa. Configure API em Config para IA completa.', 'assistant');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', renderApp);
