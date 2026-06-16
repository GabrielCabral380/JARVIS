// ══════════════════════════════════════════════════════
// JARVIS — Client-Side Full Implementation
// Funciona 100% no GitHub Pages sem backend
// ══════════════════════════════════════════════════════

const $ = (s) => document.querySelector(s);
const APP = document.getElementById('app');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let safeMode = false;
let approvalsCache = { trusted: [], pending: [], policy: 'once' };

// ══════════════════════════════════════════════════════
// STORAGE HELPERS
// ══════════════════════════════════════════════════════

const Store = {
  get(key, def) {
    try { return JSON.parse(localStorage.getItem('jarvis-' + key)) ?? def; } catch { return def; }
  },
  set(key, val) {
    localStorage.setItem('jarvis-' + key, JSON.stringify(val));
  },
  del(key) { localStorage.removeItem('jarvis-' + key); }
};

// ══════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  AI_PROVIDER: 'local',
  OPENAI_API_KEY: '',
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_BASE_URL: 'https://api.openai.com/v1',
  OPENROUTER_API_KEY: '',
  OPENROUTER_MODEL: 'openai/gpt-4o-mini',
  OPENROUTER_SITE_URL: 'https://gabrielcabral380.github.io/JARVIS/',
  OPENROUTER_SITE_NAME: 'JARVIS Cloud Access',
  NVIDIA_API_KEY: '',
  NVIDIA_MODEL: 'meta/llama-3.1-70b-instruct',
  CODEX_ENABLED: false,
  HERMES_ENABLED: true,
  HERMES_URL: 'http://localhost:8001',
  OPENCLAW_ENABLED: true,
  OPENCLAW_URL: 'http://localhost:8675',
  MCP_ENABLED: true,
  MCP_URL: 'http://localhost:3001/mcp',
  LOCAL_TOOLS_ENABLED: true,
  APPROVAL_POLICY: 'once',
  VOICE_LANG: 'pt-BR',
  VOICE_RATE: 1.0,
  VOICE_PITCH: 0.95,
  CONTINUOUS_VOICE: true
};

function loadConfig() {
  const saved = Store.get('config', {});
  return { ...DEFAULT_CONFIG, ...saved };
}

function saveConfig(patch) {
  const config = loadConfig();
  Object.assign(config, patch);
  Store.set('config', config);
  return config;
}

const CONFIG = loadConfig();

// ══════════════════════════════════════════════════════
// MEMORY
// ══════════════════════════════════════════════════════

function loadMemory() { return Store.get('memory', []); }
function saveMemory(mem) { Store.set('memory', mem.slice(-200)); }

function appendMemory(role, text) {
  const mem = loadMemory();
  mem.push({ role, text: String(text).slice(0, 1200), ts: new Date().toISOString() });
  saveMemory(mem);
}

function memoryContext(roleFilter, limit = 20) {
  return loadMemory().filter(m => !roleFilter || m.role === roleFilter).slice(-limit);
}

// ══════════════════════════════════════════════════════
// REMINDERS
// ══════════════════════════════════════════════════════

function loadReminders() { return Store.get('reminders', []); }
function saveReminders(r) { Store.set('reminders', r); }

function addReminder(text, when) {
  const r = loadReminders();
  r.push({ id: Date.now().toString(36), text, when: when || null, done: false, created: new Date().toISOString() });
  saveReminders(r);
  return r[r.length - 1];
}

function removeReminder(id) {
  saveReminders(loadReminders().filter(r => r.id !== id));
}

function dueReminders() {
  const now = Date.now();
  return loadReminders().filter(r => !r.done && r.when && new Date(r.when).getTime() <= now);
}

function listReminders() { return loadReminders().filter(r => !r.done); }

// ══════════════════════════════════════════════════════
// APPROVAL SYSTEM
// ══════════════════════════════════════════════════════

function loadApprovals() {
  return Store.get('approvals', { trusted: [], pending: [], policy: 'once' });
}
function saveApprovals(a) { Store.set('approvals', a); }

function checkApproval(kind, action, target) {
  const a = loadApprovals();
  const scope = `${kind}:${action}:${target || 'generic'}`;
  if (a.policy === 'off') return { approved: true };
  if (a.policy === 'once' && a.trusted.includes(scope)) return { approved: true };
  const token = 'apr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  a.pending.push({ token, scope, kind, action, target, created: new Date().toISOString() });
  saveApprovals(a);
  return { approved: false, token, scope };
}

function approveAction(token, trust = true) {
  const a = loadApprovals();
  const idx = a.pending.findIndex(p => p.token === token);
  if (idx < 0) return null;
  const item = a.pending.splice(idx, 1)[0];
  if (trust) a.trusted.push(item.scope);
  saveApprovals(a);
  return item;
}

// ══════════════════════════════════════════════════════
// VOICE
// ══════════════════════════════════════════════════════

function speak(text, onStart, onEnd) {
  if (!('speechSynthesis' in window)) {
    updateVoiceStatus('Navegador não suporta síntese de voz.');
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = CONFIG.VOICE_LANG;
  u.rate = CONFIG.VOICE_RATE;
  u.pitch = CONFIG.VOICE_PITCH;
  u.onstart = () => {
    updateVoiceStatus('Falando agora.');
    setMode('SPEAKING', '◉');
    if (onStart) onStart();
  };
  u.onend = () => {
    updateVoiceStatus(listening ? 'Ouvindo...' : 'Pronta para síntese de voz.');
    setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎');
    if (onEnd) onEnd();
  };
  window.speechSynthesis.speak(u);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function startListening() {
  if (!SpeechRecognition) {
    updateVoiceStatus('Reconhecimento de voz não suportado.');
    speak('Este navegador não suporta reconhecimento de voz.');
    return;
  }
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = CONFIG.VOICE_LANG;
    recognition.continuous = CONFIG.CONTINUOUS_VOICE;
    recognition.interimResults = false;
    recognition.onstart = () => {
      listening = true;
      updateVoiceStatus('Ouvindo...');
      setMode('LISTENING', '◉');
    };
    recognition.onend = () => {
      listening = false;
      updateVoiceStatus('Pronta para síntese de voz.');
      setMode('PAGES', '◎');
    };
    recognition.onerror = (e) => {
      listening = false;
      updateVoiceStatus('Falha ao capturar voz: ' + (e.error || 'erro'));
      setMode('PAGES', '◎');
    };
    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript || '';
      if (event.results[event.results.length - 1].isFinal) {
        $('#commandInput').value = transcript;
        runCommand(transcript, true);
      }
    };
  }
  try { recognition.start(); } catch { /* already started */ }
}

function stopListening() {
  if (recognition) { try { recognition.stop(); } catch {} }
  listening = false;
}

// ══════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════

function setMode(mode, mood) {
  const modeEl = $('#mode');
  const moodEl = $('#mood');
  if (modeEl) modeEl.textContent = mode;
  if (moodEl) moodEl.textContent = mood || '◎';
}

function updateStatus(html) {
  const el = $('#status');
  if (el) el.innerHTML = html;
}

function updateVoiceStatus(text) {
  const el = $('#voiceStatus');
  if (el) el.textContent = text;
}

function addMessage(text, type) {
  const wrap = $('#messages');
  if (!wrap) return;
  const d = document.createElement('div');
  d.className = 'msg ' + (type || 'assistant');
  d.innerHTML = text;
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
}

function addTyping() {
  const wrap = $('#messages');
  if (!wrap) return null;
  const d = document.createElement('div');
  d.className = 'msg assistant typing';
  d.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
  return d;
}

function removeTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ══════════════════════════════════════════════════════
// AI CHAT — Client-side API calls
// ══════════════════════════════════════════════════════

async function callOpenAI(baseUrl, apiKey, model, messages) {
  const res = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.7 })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('HTTP ' + res.status + ': ' + errText.slice(0, 200));
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Sem resposta.';
}

async function callOpenRouter(apiKey, model, messages) {
  return callOpenAI('https://openrouter.ai/api/v1', apiKey, model, messages);
}

async function callNVIDIA(apiKey, model, messages) {
  return callOpenAI('https://integrate.api.nvidia.com/v1', apiKey, model, messages);
}

async function aiChat(userMessage) {
  const cfg = loadConfig();
  const provider = cfg.AI_PROVIDER;

  // Build context from memory
  const memCtx = memoryContext(null, 10);
  const systemPrompt = {
    role: 'system',
    content: 'Você é JARVIS, assistente virtual inteligente. Personalidade: elegante, calma, precisa e proativa. Responda sempre em português brasileiro. Seja direto e útil. Use o contexto da memória quando relevante.'
  };

  const history = memCtx.map(m => ({ role: m.role, content: m.text }));
  const messages = [systemPrompt, ...history, { role: 'user', content: userMessage }];

  if (provider === 'openrouter' && cfg.OPENROUTER_API_KEY) {
    return callOpenRouter(cfg.OPENROUTER_API_KEY, cfg.OPENROUTER_MODEL, messages);
  }
  if (provider === 'openai' && cfg.OPENAI_API_KEY) {
    return callOpenAI(cfg.OPENAI_BASE_URL, cfg.OPENAI_API_KEY, cfg.OPENAI_MODEL, messages);
  }
  if (provider === 'nvidia' && cfg.NVIDIA_API_KEY) {
    return callNVIDIA(cfg.NVIDIA_API_KEY, cfg.NVIDIA_MODEL, messages);
  }

  // Local fallback
  return localReply(userMessage);
}

// ══════════════════════════════════════════════════════
// LOCAL TOOLS
// ══════════════════════════════════════════════════════

function parseReminder(text) {
  const t = text.toLowerCase();
  const patterns = [
    /(?:me\s+)?lembre\s+(?:de\s+)?(.+?)(?:\s+em\s+(\d+)\s*(?:min|minutos?|h|horas?))?$/i,
    /(?:me\s+)?lembrar\s+(?:de\s+)?(.+?)(?:\s+em\s+(\d+)\s*(?:min|minutos?|h|horas?))?$/i,
    /(?:me\s+)?lembre\s+(?:de\s+)?(.+?)(?:\s+(?:amanh[ãa]|[0-9]{1,2}:[0-9]{2}))?$/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const reminderText = m[1].trim();
      let when = null;
      if (m[2]) {
        const num = parseInt(m[2]);
        const isHour = t.includes('hora') || t.includes('h');
        when = new Date(Date.now() + num * (isHour ? 3600000 : 60000)).toISOString();
      } else if (t.includes('amanh')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        when = d.toISOString();
      }
      return { text: reminderText, when };
    }
  }
  return null;
}

function localReply(command) {
  const text = (command || '').toLowerCase().trim();
  if (!text) return 'Estou ouvindo, Senhor.';

  // Status
  if (text.includes('status')) {
    return 'Sistema operacional. Voz local ativa. Memória: ' + loadMemory().length + ' entradas. Lembretes: ' + listReminders().length + ' ativos.';
  }

  // Testar voz
  if (text.includes('testar voz') || text.includes('fala') || text.includes('voz')) {
    return 'Voz online. Estou respondendo diretamente do navegador, Senhor.';
  }

  // Abrir YouTube
  if (text.includes('youtube') || text.includes('abrir yt')) {
    window.open('https://www.youtube.com', '_blank');
    return 'Abrindo YouTube, Senhor.';
  }

  // Abrir navegador / pesquisa
  if (text.includes('pesquis') || text.includes('buscar') || text.includes('procurar')) {
    const query = command.replace(/^(jarvis|por favor|,)\s*/i, '').replace(/pesquis(e|ar)|buscar|procurar|na internet|no google/gi, '').trim();
    if (query) {
      window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
      return 'Pesquisando "' + query + '" na internet.';
    }
    window.open('https://www.google.com', '_blank');
    return 'Abrindo navegador.';
  }

  if (text.includes('abrir navegador') || text.includes('abrir browser')) {
    window.open('https://www.google.com', '_blank');
    return 'Abrindo navegador.';
  }

  // Lembretes
  if (text.includes('lembre') || text.includes('lembrar') || text.includes('lembret')) {
    if (text.includes('listar') || text.includes('mostrar') || text.includes('quais')) {
      const r = listReminders();
      if (!r.length) return 'Nenhum lembrete ativo.';
      return 'Lembretes ativos:\n' + r.map(x => '• ' + x.text + (x.when ? ' (' + new Date(x.when).toLocaleString('pt-BR') + ')' : '')).join('\n');
    }
    if (text.includes('limpar') || text.includes('apagar todos')) {
      saveReminders([]);
      return 'Todos os lembretes foram removidos.';
    }
    const parsed = parseReminder(command);
    if (parsed) {
      addReminder(parsed.text, parsed.when);
      return 'Lembrete criado: "' + parsed.text + '"' + (parsed.when ? ' para ' + new Date(parsed.when).toLocaleString('pt-BR') : '') + '.';
    }
    return 'Para criar um lembrete, diga: "Lembre de [algo] em [tempo]".';
  }

  // Memória
  if (text.includes('memória') || text.includes('memoria') || text.includes('o que você sabe')) {
    const mem = loadMemory();
    if (!mem.length) return 'Minha memória está vazia.';
    const recent = mem.slice(-5).map(m => m.role + ': ' + m.text.slice(0, 80)).join('\n');
    return 'Últimas entradas de memória:\n' + recent;
  }

  if (text.includes('apagar memória') || text.includes('limpar memória') || text.includes('esquecer')) {
    saveMemory([]);
    return 'Memória limpa, Senhor.';
  }

  // Aprender / salvar preferência
  if (text.includes('aprenda que') || text.includes('lembre-se que') || text.includes('guarde que')) {
    const info = command.replace(/aprenda que|lembre-se que|guarde que/gi, '').trim();
    appendMemory('preference', info);
    return 'Aprendi: ' + info;
  }

  // Hora
  if (text.includes('horas') || text.includes('que hora')) {
    return 'Agora são ' + new Date().toLocaleTimeString('pt-BR') + '.';
  }

  // Data
  if (text.includes('data') || text.includes('que dia')) {
    return 'Hoje é ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.';
  }

  // Opinião / conversa
  if (text.includes('opinião') || text.includes('o que você acha') || text.includes('converse')) {
    return 'Entendo seu interesse, Senhor. Com uma API de IA configurada, posso dar respostas muito mais completas. Configure em Config > API Key.';
  }

  // Ajuda
  if (text.includes('ajuda') || text.includes('help') || text.includes('o que você faz') || text.includes('comandos')) {
    return `Posso fazer:
• Pesquisar na internet ("pesquisar [tema]")
• Abrir YouTube
• Criar lembretes ("lembre de X em 10 min")
• Listar lembretes
• Lembrar preferências ("aprenda que...")
• Informar hora e data
• Chat com IA (configure API em Config)
• Controle por voz (clique Falar)`;
  }

  return 'Recebi seu comando: "' + command + '". Configure uma API de IA em Config para respostas completas.';
}

// ══════════════════════════════════════════════════════
// ORCHESTRATOR STATUS
// ══════════════════════════════════════════════════════

async function checkOrchestrator(url, timeout = 2000) {
  if (!url) return { available: false };
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    return { available: true, status: res.status };
  } catch {
    return { available: false };
  }
}

async function updateOrchestratorStatus() {
  const cfg = loadConfig();
  const results = {};

  if (cfg.HERMES_ENABLED) {
    results.hermes = await checkOrchestrator(cfg.HERMES_URL + '/api/status');
  }
  if (cfg.OPENCLAW_ENABLED) {
    results.openclaw = await checkOrchestrator(cfg.OPENCLAW_URL + '/api/status');
  }
  if (cfg.MCP_ENABLED) {
    results.mcp = await checkOrchestrator(cfg.MCP_URL);
  }

  const orchEl = $('#orchestratorStatus');
  if (orchEl) {
    const parts = [];
    if (results.hermes) parts.push('Hermes: ' + (results.hermes.available ? '🟢 Online' : '🔴 Offline'));
    if (results.openclaw) parts.push('OpenClaw: ' + (results.openclaw.available ? '🟢 Online' : '🔴 Offline'));
    if (results.mcp) parts.push('MCP: ' + (results.mcp.available ? '🟢 Online' : '🔴 Offline'));
    orchEl.innerHTML = parts.length ? parts.join(' • ') : 'Orquestradores não configurados.';
  }

  return results;
}

// ══════════════════════════════════════════════════════
// COMMAND PROCESSOR
// ══════════════════════════════════════════════════════

async function runCommand(command, fromVoice) {
  const prompt = String(command || '').trim();
  addMessage('<b>Você:</b> ' + escapeHtml(prompt), 'user');
  if (!prompt) {
    const reply = 'Estou ouvindo, Senhor.';
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    speak(reply);
    return;
  }

  appendMemory('user', prompt);
  setMode('THINKING', '◌');
  const typing = addTyping();

  try {
    // Check for orchestrator commands
    const lower = prompt.toLowerCase();
    if (lower.startsWith('hermes:') || lower.startsWith('hermes ')) {
      removeTyping(typing);
      const reply = await sendOrchestratorCommand('hermes', prompt.replace(/^hermes[:\s]*/i, ''));
      addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
      appendMemory('assistant', reply);
      speak(reply);
      return;
    }
    if (lower.startsWith('openclaw:') || lower.startsWith('openclaw ')) {
      removeTyping(typing);
      const reply = await sendOrchestratorCommand('openclaw', prompt.replace(/^openclaw[:\s]*/i, ''));
      addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
      appendMemory('assistant', reply);
      speak(reply);
      return;
    }
    if (lower.startsWith('mcp:') || lower.startsWith('mcp ')) {
      removeTyping(typing);
      const reply = await sendOrchestratorCommand('mcp', prompt.replace(/^mcp[:\s]*/i, ''));
      addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
      appendMemory('assistant', reply);
      speak(reply);
      return;
    }

    // Try AI first, fall back to local
    let reply;
    const cfg = loadConfig();
    const hasAI = (cfg.AI_PROVIDER === 'openrouter' && cfg.OPENROUTER_API_KEY) ||
                  (cfg.AI_PROVIDER === 'openai' && cfg.OPENAI_API_KEY) ||
                  (cfg.AI_PROVIDER === 'nvidia' && cfg.NVIDIA_API_KEY);

    if (hasAI) {
      try {
        reply = await aiChat(prompt);
      } catch (err) {
        reply = 'Erro na API: ' + err.message + '. Usando resposta local.\n\n' + localReply(prompt);
      }
    } else {
      reply = localReply(prompt);
    }

    removeTyping(typing);
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    appendMemory('assistant', reply);
    speak(reply);
  } catch (err) {
    removeTyping(typing);
    const reply = 'Erro: ' + err.message;
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    speak(reply);
  } finally {
    setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎');
  }
}

async function sendOrchestratorCommand(target, command) {
  const cfg = loadConfig();
  const urls = { hermes: cfg.HERMES_URL, openclaw: cfg.OPENCLAW_URL, mcp: cfg.MCP_URL };
  const url = urls[target];
  if (!url) return target + ' não está configurado.';

  try {
    const res = await fetch(url + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: command })
    });
    if (res.ok) {
      const data = await res.json();
      return data.text || data.reply || 'Resposta recebida de ' + target + '.';
    }
    return target + ' respondeu com erro ' + res.status + '.';
  } catch {
    return target + ' não está disponível. Verifique se está rodando.';
  }
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ══════════════════════════════════════════════════════
// CONFIG PANEL
// ══════════════════════════════════════════════════════

function renderConfigPanel() {
  const cfg = loadConfig();
  const panel = $('#configPanel');
  if (!panel) return;

  const providers = [
    { value: 'local', label: 'Local (sem IA)' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'nvidia', label: 'NVIDIA NIM' }
  ];

  panel.innerHTML = `
    <div class="config-section">
      <h4>🤖 Provedor de IA</h4>
      <select id="cfgProvider">
        ${providers.map(p => `<option value="${p.value}" ${cfg.AI_PROVIDER === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
    </div>
    <div class="config-section" id="openrouterConfig" style="${cfg.AI_PROVIDER !== 'openrouter' ? 'display:none' : ''}">
      <h4>🌐 OpenRouter</h4>
      <input id="cfgOpenRouterKey" type="password" placeholder="sk-or-..." value="${cfg.OPENROUTER_API_KEY}" />
      <input id="cfgOpenRouterModel" placeholder="Modelo" value="${cfg.OPENROUTER_MODEL}" />
    </div>
    <div class="config-section" id="openaiConfig" style="${cfg.AI_PROVIDER !== 'openai' ? 'display:none' : ''}">
      <h4>🧠 OpenAI</h4>
      <input id="cfgOpenAIKey" type="password" placeholder="sk-..." value="${cfg.OPENAI_API_KEY}" />
      <input id="cfgOpenAIModel" placeholder="Modelo" value="${cfg.OPENAI_MODEL}" />
      <input id="cfgOpenAIBaseUrl" placeholder="Base URL" value="${cfg.OPENAI_BASE_URL}" />
    </div>
    <div class="config-section" id="nvidiaConfig" style="${cfg.AI_PROVIDER !== 'nvidia' ? 'display:none' : ''}">
      <h4>⚡ NVIDIA NIM</h4>
      <input id="cfgNvidiaKey" type="password" placeholder="nvapi-..." value="${cfg.NVIDIA_API_KEY}" />
      <input id="cfgNvidiaModel" placeholder="Modelo" value="${cfg.NVIDIA_MODEL}" />
    </div>
    <div class="config-section">
      <h4>🎙️ Voz</h4>
      <label>Idioma: <input id="cfgVoiceLang" value="${cfg.VOICE_LANG}" style="width:80px" /></label>
      <label>Velocidade: <input id="cfgVoiceRate" type="range" min="0.5" max="2" step="0.1" value="${cfg.VOICE_RATE}" /><span id="cfgVoiceRateVal">${cfg.VOICE_RATE}</span></label>
      <label>Tom: <input id="cfgVoicePitch" type="range" min="0.5" max="2" step="0.05" value="${cfg.VOICE_PITCH}" /><span id="cfgVoicePitchVal">${cfg.VOICE_PITCH}</span></label>
    </div>
    <div class="config-section">
      <h4>🔗 Orquestradores (localhost)</h4>
      <label>Hermes URL: <input id="cfgHermesUrl" value="${cfg.HERMES_URL}" /></label>
      <label>OpenClaw URL: <input id="cfgOpenClawUrl" value="${cfg.OPENCLAW_URL}" /></label>
      <label>MCP URL: <input id="cfgMcpUrl" value="${cfg.MCP_URL}" /></label>
    </div>
    <div class="config-section">
      <h4>🛡️ Segurança</h4>
      <select id="cfgApprovalPolicy">
        <option value="once" ${cfg.APPROVAL_POLICY === 'once' ? 'selected' : ''}>Aprovar uma vez</option>
        <option value="always" ${cfg.APPROVAL_POLICY === 'always' ? 'selected' : ''}>Sempre aprovar</option>
        <option value="off" ${cfg.APPROVAL_POLICY === 'off' ? 'selected' : ''}>Desativado</option>
      </select>
    </div>
    <div class="config-actions">
      <button id="cfgSave" class="btn primary">Salvar Configuração</button>
      <button id="cfgTest" class="btn">Testar API</button>
      <button id="cfgClearKeys" class="btn danger">Limpar Chaves</button>
    </div>
    <div id="cfgTestResult" class="config-test-result"></div>
  `;

  // Provider toggle
  const provSel = $('#cfgProvider');
  if (provSel) provSel.addEventListener('change', () => {
    const v = provSel.value;
    const sections = { openrouter: 'openrouterConfig', openai: 'openaiConfig', nvidia: 'nvidiaConfig' };
    for (const [key, id] of Object.entries(sections)) {
      const el = document.getElementById(id);
      if (el) el.style.display = key === v ? '' : 'none';
    }
  });

  // Voice sliders
  const rateEl = $('#cfgVoiceRate');
  const rateVal = $('#cfgVoiceRateVal');
  if (rateEl && rateVal) rateEl.addEventListener('input', () => rateVal.textContent = rateEl.value);
  const pitchEl = $('#cfgVoicePitch');
  const pitchVal = $('#cfgVoicePitchVal');
  if (pitchEl && pitchVal) pitchEl.addEventListener('input', () => pitchVal.textContent = pitchEl.value);

  // Save
  $('#cfgSave')?.addEventListener('click', () => {
    const provider = $('#cfgProvider')?.value || 'local';
    saveConfig({
      AI_PROVIDER: provider,
      OPENROUTER_API_KEY: $('#cfgOpenRouterKey')?.value?.trim() || '',
      OPENROUTER_MODEL: $('#cfgOpenRouterModel')?.value?.trim() || 'openai/gpt-4o-mini',
      OPENAI_API_KEY: $('#cfgOpenAIKey')?.value?.trim() || '',
      OPENAI_MODEL: $('#cfgOpenAIModel')?.value?.trim() || 'gpt-4o-mini',
      OPENAI_BASE_URL: $('#cfgOpenAIBaseUrl')?.value?.trim() || 'https://api.openai.com/v1',
      NVIDIA_API_KEY: $('#cfgNvidiaKey')?.value?.trim() || '',
      NVIDIA_MODEL: $('#cfgNvidiaModel')?.value?.trim() || 'meta/llama-3.1-70b-instruct',
      VOICE_LANG: $('#cfgVoiceLang')?.value?.trim() || 'pt-BR',
      VOICE_RATE: parseFloat($('#cfgVoiceRate')?.value) || 1.0,
      VOICE_PITCH: parseFloat($('#cfgVoicePitch')?.value) || 0.95,
      HERMES_URL: $('#cfgHermesUrl')?.value?.trim() || 'http://localhost:8001',
      OPENCLAW_URL: $('#cfgOpenClawUrl')?.value?.trim() || 'http://localhost:8675',
      MCP_URL: $('#cfgMcpUrl')?.value?.trim() || 'http://localhost:3001/mcp',
      APPROVAL_POLICY: $('#cfgApprovalPolicy')?.value || 'once'
    });
    addMessage('<b>JARVIS:</b> Configuração salva com sucesso.', 'assistant');
    speak('Configuração salva.');
  });

  // Test
  $('#cfgTest')?.addEventListener('click', async () => {
    const resultEl = $('#cfgTestResult');
    if (resultEl) resultEl.textContent = 'Testando...';
    try {
      const provider = $('#cfgProvider')?.value || 'local';
      if (provider === 'local') {
        if (resultEl) resultEl.textContent = '✅ Modo local ativo (sem API).';
        return;
      }
      const key = provider === 'openrouter' ? $('#cfgOpenRouterKey')?.value :
                  provider === 'openai' ? $('#cfgOpenAIKey')?.value :
                  $('#cfgNvidiaKey')?.value;
      if (!key) {
        if (resultEl) resultEl.textContent = '❌ Chave de API não configurada.';
        return;
      }
      const reply = await aiChat('Responda apenas: OK');
      if (resultEl) resultEl.textContent = '✅ API funcionando! Resposta: ' + reply.slice(0, 100);
    } catch (err) {
      if (resultEl) resultEl.textContent = '❌ Erro: ' + err.message;
    }
  });

  // Clear keys
  $('#cfgClearKeys')?.addEventListener('click', () => {
    if (confirm('Remover todas as chaves de API?')) {
      saveConfig({ OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', NVIDIA_API_KEY: '' });
      addMessage('<b>JARVIS:</b> Chaves removidas.', 'assistant');
      renderConfigPanel();
    }
  });
}

// ══════════════════════════════════════════════════════
// MAIN APP RENDER
// ══════════════════════════════════════════════════════

function renderApp() {
  const cfg = loadConfig();
  const hasAI = (cfg.AI_PROVIDER === 'openrouter' && cfg.OPENROUTER_API_KEY) ||
                (cfg.AI_PROVIDER === 'openai' && cfg.OPENAI_API_KEY) ||
                (cfg.AI_PROVIDER === 'nvidia' && cfg.NVIDIA_API_KEY);

  APP.innerHTML = `
  <header class="topbar">
    <div class="brand">J·A·R·V·I·S</div>
    <nav>
      <button class="tab active" data-tab="pages">Pages</button>
      <button class="tab" data-tab="config">Config</button>
    </nav>
    <div class="clock" id="clock">--:--:--</div>
  </header>

  <section class="layout">
    <!-- LEFT PANEL -->
    <aside class="panel left" id="leftPanel">
      <h3>◉ STATUS</h3>
      <div id="status" class="orchestrator">${hasAI ? 'IA configurada: ' + cfg.AI_PROVIDER : 'Modo local. Configure uma API em Config.'}</div>
      <h3>◉ VOZ</h3>
      <div id="voiceStatus" class="orchestrator">Pronta para síntese de voz.</div>
      <h3>◉ MEMÓRIA</h3>
      <div id="memoryStatus" class="orchestrator">${loadMemory().length} entradas • ${listReminders().length} lembretes</div>
    </aside>

    <!-- CENTER -->
    <main class="center">
      <!-- PAGES TAB -->
      <section class="screen tabpage active" id="tab-pages">
        <div class="orb-wrap">
          <div class="orb"><div class="face"><h1 id="mood">◎</h1><p id="mode">PAGES</p></div></div>
        </div>
        <div class="chatbox" id="messages"></div>
        <div class="composer">
          <input id="commandInput" placeholder="Diga ou digite seu comando para o JARVIS" />
          <button id="sendCommand">Enviar</button>
        </div>
        <div class="quick">
          <button id="testVoice">🔊 Testar voz</button>
          <button id="startVoice">🎙️ Falar</button>
          <button id="stopVoice" style="display:none">⏹️ Parar voz</button>
          <button id="openYouTube">📺 YouTube</button>
          <btn id="openBrowser">🌐 Pesquisar</btn>
        </div>
        <p class="muted">Voz local ativa. Chat com IA via API do navegador. Configure em Config para IA completa.</p>
      </section>

      <!-- CONFIG TAB -->
      <section class="screen tabpage" id="tab-config">
        <h2>⚙️ Configuração</h2>
        <div id="configPanel"></div>
      </section>
    </main>

    <!-- RIGHT PANEL -->
    <aside class="panel right">
      <h3>▸ OBSERVAÇÕES</h3>
      <div class="orchestrator">
        <p><b>Pages:</b> ativo para acesso público.</p>
        <p><b>Página pública do JARVIS pronta.</b></p>
        <p>A voz local já pode ser testada.</p>
      </div>
      <h3>▸ ORQUESTRADOR</h3>
      <div id="orchestratorStatus" class="orchestrator">Verificando...</div>
      <h3>▸ APROVAÇÕES</h3>
      <div id="approvalsList" class="orchestrator">Nenhuma pendente.</div>
    </aside>
  </section>`;

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tabpage').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.add('active');
      if (tab.dataset.tab === 'config') renderConfigPanel();
    });
  });

  // Clock
  function tick() {
    const el = $('#clock');
    if (el) el.textContent = new Date().toLocaleTimeString('pt-BR');
  }
  setInterval(tick, 1000);
  tick();

  // Send command
  $('#sendCommand')?.addEventListener('click', () => {
    const input = $('#commandInput');
    if (input) { runCommand(input.value.trim()); input.value = ''; }
  });
  $('#commandInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = $('#commandInput');
      if (input) { runCommand(input.value.trim()); input.value = ''; }
    }
  });

  // Voice buttons
  $('#testVoice')?.addEventListener('click', () => {
    addMessage('<b>Você:</b> testar voz', 'user');
    const reply = 'Voz online. Estou respondendo diretamente do navegador, Senhor.';
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    speak(reply);
  });

  $('#startVoice')?.addEventListener('click', () => {
    startListening();
    $('#startVoice').style.display = 'none';
    $('#stopVoice').style.display = '';
  });

  $('#stopVoice')?.addEventListener('click', () => {
    stopListening();
    $('#startVoice').style.display = '';
    $('#stopVoice').style.display = 'none';
  });

  // Quick actions
  $('#openYouTube')?.addEventListener('click', () => {
    addMessage('<b>Você:</b> Abrir YouTube', 'user');
    window.open('https://www.youtube.com', '_blank');
    const reply = 'Abrindo YouTube, Senhor.';
    addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
    speak(reply);
  });

  $('#openBrowser')?.addEventListener('click', () => {
    const query = prompt('Pesquisar na internet:');
    if (query) {
      addMessage('<b>Você:</b> Pesquisar: ' + query, 'user');
      window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
      const reply = 'Pesquisando "' + query + '".';
      addMessage('<b>JARVIS:</b> ' + reply, 'assistant');
      speak(reply);
    }
  });

  // Check orchestrator status periodically
  updateOrchestratorStatus();
  setInterval(updateOrchestratorStatus, 30000);

  // Check due reminders periodically
  setInterval(() => {
    const due = dueReminders();
    if (due.length) {
      const text = 'Lembrete: ' + due[0].text;
      addMessage('<b>JARVIS:</b> ⏰ ' + text, 'assistant');
      speak(text);
      // Mark as done
      const r = loadReminders();
      const item = r.find(x => x.id === due[0].id);
      if (item) item.done = true;
      saveReminders(r);
    }
  }, 30000);

  // Update memory status periodically
  setInterval(() => {
    const el = $('#memoryStatus');
    if (el) el.textContent = loadMemory().length + ' entradas • ' + listReminders().length + ' lembretes';
  }, 10000);

  // Initial message
  addMessage('<b>JARVIS:</b> Página pública do JARVIS pronta. Voz local ativa. Configure uma API de IA em Config para respostas completas.', 'assistant');
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  renderApp();
});
