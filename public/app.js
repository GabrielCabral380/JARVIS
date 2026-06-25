
const $ = (s) => document.querySelector(s);
const app = $('#app');
let status = {};
let config = {};
let voiceActive = false;
let recognitionStarting = false;
let approvalState = { policy: 'once', trusted: [], pending: [] };
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = SpeechRecognition ? new SpeechRecognition() : null;
if (recognition) {
  recognition.lang = 'pt-BR';
  recognition.continuous = true;
  recognition.interimResults = true;
  window._voiceBuffer = '';
  window._voiceFinalTimer = null;
}

app.innerHTML = `
<header class="topbar">
  <div class="brand">J·A·R·V·I·S</div>
  <nav>
    <button class="tab active" data-tab="cockpit">Cockpit</button>
    <button class="tab" data-tab="terminal">Terminal</button>
    <button class="tab" data-tab="files">Arquivos</button>
    <button class="tab" data-tab="config">Config</button>
  </nav>
  <div class="clock" id="clock">00:00:00</div>
</header>

<section class="layout">
  <aside class="panel left">
    <h3>◉ SYSTEMS</h3>
    <div id="status"></div>
    <div class="mini-grid">
      <div><b id="cpu">--%</b><span>CPU</span></div>
      <div><b id="ram">-- GB</b><span>RAM livre</span></div>
      <div><b id="uptime">--:--</b><span>SYS UPTIME</span></div>
      <div><b id="voice">OFF</b><span>VOZ</span></div>
    </div>
    <h3>◉ AI MODELS</h3>
    <ul class="model-list">
      <li id="model-openai">OpenAI</li>
      <li id="model-openrouter">OpenRouter</li>
      <li id="model-codex">Codex CLI</li>
      <li>Browser voice</li>
    </ul>
    <h3>◉ AIOX-CORE</h3>
    <div id="agents"></div>
  </aside>

  <main class="center">
    <section class="screen tabpage active" id="tab-cockpit">
      <div class="orb-wrap">
        <div class="orb"><div class="face"><h1 id="mood">◎</h1><p id="mode">IDLE</p></div></div>
      </div>
      <div class="quick">
        <button id="diagnose">Diagnosticar sistema</button>
        <button id="mic">🎙️ Falar</button>
        <button id="stopVoice">Parar voz</button>
      </div>
      <div class="chatbox" id="messages"></div>
      <div class="composer">
        <input id="input" placeholder="Fale ou digite: Jarvis, explique o que está rodando..."/>
        <button id="send">Enviar</button>
      </div>
    </section>

    <section class="screen tabpage" id="tab-terminal">
      <h2>JARVIS · TERMINAL</h2>
      <div id="logs" class="log">[BOOT] [system] JARVIS inicializado. Pronto para uso.</div>
    </section>

    <section class="screen tabpage" id="tab-files">
      <h2>Documents & Projects</h2>
      <p class="muted">Notas rápidas e memória local ficam em <code>system/JARVIS-MEMORY.md</code>.</p>
      <input id="note" placeholder="anotar preferência, ideia ou tarefa"/>
      <button id="saveNote">Salvar nota</button>
      <div class="note-help">O Obsidian pode usar a pasta <code>obsidian-template</code> como base.</div>
    </section>

    <section class="screen tabpage" id="tab-config">
      <h2>Configuration</h2>
      <p class="muted">Adicione sua API sem editar arquivo manualmente. As chaves não aparecem no painel depois de salvas.</p>
      <label>Provider</label>
      <select id="cfg-provider">
        <option value="local">Local / fallback</option>
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
      </select>
      <label>OpenAI API Key <span id="openai-set" class="pill">não definida</span></label>
      <input id="cfg-openai-key" type="password" placeholder="cole sua chave OpenAI ou deixe vazio"/>
      <label>OpenAI Model</label>
      <input id="cfg-openai-model" placeholder="gpt-4o-mini"/>
      <label>OpenRouter API Key <span id="openrouter-set" class="pill">não definida</span></label>
      <input id="cfg-openrouter-key" type="password" placeholder="cole sua chave OpenRouter ou deixe vazio"/>
      <label>OpenRouter Model</label>
      <input id="cfg-openrouter-model" placeholder="openai/gpt-4o-mini"/>
      <label class="check"><input id="cfg-codex" type="checkbox"/> Habilitar Codex CLI para tarefas de código</label>
      <h3>Orquestrador local</h3>
      <p class="muted">Configure URL local ou comando CLI se Hermes/OpenClaw/MCP já estiverem instalados. URLs externas são bloqueadas por segurança.</p>
      <label class="check"><input id="cfg-hermes-enabled" type="checkbox"/> Hermes ativo</label>
      <input id="cfg-hermes-url" placeholder="Hermes URL local, ex: http://localhost:8001"/>
      <input id="cfg-hermes-command" placeholder="Hermes comando CLI opcional, ex: hermes task"/>
      <label class="check"><input id="cfg-openclaw-enabled" type="checkbox"/> OpenClaw ativo</label>
      <input id="cfg-openclaw-url" placeholder="OpenClaw URL local, ex: http://localhost:8675"/>
      <input id="cfg-openclaw-command" placeholder="OpenClaw comando CLI opcional"/>
      <label class="check"><input id="cfg-mcp-enabled" type="checkbox"/> MCP ativo</label>
      <input id="cfg-mcp-url" placeholder="MCP HTTP local, ex: http://localhost:3001/mcp"/>
      <input id="cfg-mcp-command" placeholder="MCP comando stdio opcional para referência"/>
      <h3>Ferramentas locais offline</h3>
      <label class="check"><input id="cfg-local-tools-enabled" type="checkbox"/> Ativar ferramentas locais sem IA</label>
      <label class="check"><input id="cfg-local-tools-confirm" type="checkbox"/> Exigir confirmação manual para ferramentas locais</label>
      <label>Política de aprovação</label>
      <select id="cfg-approval-policy">
        <option value="once">Aprovar só na primeira execução</option>
        <option value="always">Aprovar sempre</option>
        <option value="off">Não exigir aprovação</option>
      </select>
      <button id="saveConfig">Salvar Configuração</button>
      <button id="testApi">Testar API agora</button>
      <div id="configResult" class="muted"></div>
      <h3>◉ VOZ PT-BR (EdgeTTS)</h3>
      <p class="muted">Teste a síntese de voz em português. Sem API key necessário.</p>
      <textarea id="ttsText" rows="2" placeholder="Digite texto para ouvir...">Olá, Gabriel. Sistema de voz JARVIS online. Posso ajudar?</textarea>
      <label>Voz</label>
      <select id="ttsVoice">
        <option value="pt-BR-FranciscaNeural">Francisca (PT-BR feminina)</option>
        <option value="pt-BR-AntonioNeural">Antonio (PT-BR masculino)</option>
        <option value="pt-PT-RaquelNeural">Raquel (PT-PT)</option>
        <option value="en-US-GuyNeural">Guy (EN-US)</option>
      </select>
      <div class="quick">
        <button id="ttsSpeak">🔊 Falar</button>
        <button id="ttsStop">⏹ Parar</button>
      </div>
      <audio id="ttsAudio" style="display:none"></audio>
    </section>
  </main>

  <aside class="panel right">
    <h3>▸ METRICS</h3>
    <div class="metric"><span>TASKS</span><b id="tasks">0</b></div>
    <div class="metric"><span>PROVIDER</span><b id="provider">local</b></div>
    <div class="metric"><span>CODEX</span><b id="codexState">idle</b></div>
    <h3>▸ ORCHESTRATOR</h3>
    <div id="orchestrator" class="orchestrator">Carregando...</div>
    <input id="orchCommand" placeholder="comando para Hermes/OpenClaw"/>
    <div class="quick vertical">
      <button id="sendHermes">Enviar Hermes</button>
      <button id="sendOpenClaw">Enviar OpenClaw</button>
      <button id="refreshOrch">Detectar MCP/Hermes/OpenClaw</button>
    </div>
    <h3>▸ LOCAL TOOLS</h3>
    <div id="localRuntime" class="orchestrator">Carregando runtime...</div>
    <div id="approvalBox" class="orchestrator">Aprovações: carregando...</div>
    <div class="voice-hint">
      Voz ativa aceita: “Jarvis, abra a calculadora”, “pesquise IA na internet”,
      “liste meus lembretes”, “envie para Hermes: ...”, “detecte MCP Hermes OpenClaw”.
    </div>
    <input id="localQuery" placeholder="pesquisar na internet..."/>
    <div class="quick vertical">
      <button id="openBrowser">Abrir navegador</button>
      <button id="searchWeb">Pesquisar internet</button>
      <button id="openCalc">Abrir calculadora</button>
      <button id="openNotepad">Abrir bloco de notas</button>
      <button id="listReminders">Lembretes ativos</button>
    </div>
    <h3>▸ QUICK</h3>
    <div class="quick vertical">
      <button data-goto="cockpit">Cockpit</button>
      <button data-goto="terminal">Terminal</button>
      <button data-goto="files">Projetos</button>
      <button data-goto="config">Config</button>
    </div>
    <h3>Notas rápidas</h3>
    <p class="muted">A interface mantém o estilo cockpit/terminal do repositório, com API configurável e núcleo local leve.</p>
  </aside>
</section>
`;

function add(role, text) {
  const d = document.createElement('div');
  d.className = `msg ${role}`;
  d.textContent = text;
  $('#messages').appendChild(d);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

function setMode(mode, mood = '◉') {
  $('#mode').textContent = mode;
  $('#mood').textContent = mood;
}

async function speak(text, opts = {}) {
  if (!text) return;

  // Try server-side EdgeTTS first (higher quality, PT-BR)
  try {
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice: opts.voice || '', rate: opts.rate || '' }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onplay = () => setMode('SPEAKING', '◉');
      audio.onended = () => { setMode('IDLE', '◎'); URL.revokeObjectURL(url); };
      audio.onerror = () => { URL.revokeObjectURL(url); fallbackSpeak(text); };
      await audio.play();
      return;
    }
  } catch (e) {
    // fallback to browser TTS
  }

  // Fallback: Web Speech API
  fallbackSpeak(text);
}

function fallbackSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = navigator.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
  u.rate = 1.02;
  u.pitch = .92;
  u.volume = 1;
  u.onstart = () => setMode('SPEAKING', '◉');
  u.onend = () => setMode('IDLE', '◎');
  window.speechSynthesis.speak(u);
}

function formatUptime(sec = 0) {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

async function refresh() {
  status = await fetch('/api/status').then(r => r.json());
  $('#status').innerHTML = Object.entries({
    SERVER: 'OK',
    API: status.ai,
    NODE: status.runtime?.node?.version || status.node,
    PYTHON: status.runtime?.python?.available ? 'OK' : 'AUSENTE',
    VOZ: 'OK',
    CODEX: status.codex?.available ? (status.codex.enabled ? 'ATIVO' : 'INSTALADO') : 'OPCIONAL'
  }).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
  $('#ram').textContent = `${status.memory.freeGb}/${status.memory.totalGb}`;
  $('#uptime').textContent = formatUptime(status.uptimeSec);
  $('#voice').textContent = recognition ? 'ON' : 'TEXT';
  $('#provider').textContent = status.ai;
  $('#codexState').textContent = status.codex?.enabled ? 'ativo' : (status.codex?.available ? 'off' : 'opcional');
  $('#model-openai').className = status.openai ? 'ok' : '';
  $('#model-openrouter').className = status.openrouter ? 'ok' : '';
  $('#model-codex').className = status.codex?.available ? 'ok' : '';
  $('#agents').innerHTML = status.agents.map(a => `<p><span class="badge">${a.name}</span> <span class="small">${a.risk}</span></p>`).join('');
  renderOrchestrator(status.orchestrator || {});
  renderLocalRuntime(status.runtime || {}, status.localTools || {});
  renderApprovals(status.approvals || {});
}

function renderOrchestrator(orch = {}) {
  const h = orch.hermes || {};
  const o = orch.openclaw || {};
  const m = orch.mcp || {};
  const mcpTools = (m.tools || []).map(t => t.name).slice(0, 5).join(', ');
  $('#orchestrator').innerHTML = `
    <div class="kv"><span>Hermes</span><b>${h.enabled ? (h.http?.ok ? 'HTTP OK' : h.cliAvailable ? 'CLI OK' : h.commandConfigured ? 'CMD' : 'OFF') : 'OFF'}</b></div>
    <div class="kv"><span>OpenClaw</span><b>${o.enabled ? (o.http?.ok ? 'HTTP OK' : o.cliAvailable ? 'CLI OK' : o.commandConfigured ? 'CMD' : 'OFF') : 'OFF'}</b></div>
    <div class="kv"><span>MCP</span><b>${m.enabled ? (m.http?.ok ? 'HTTP OK' : (m.configs?.length ? 'CONFIG' : 'OFF')) : 'OFF'}</b></div>
    <p class="small">${mcpTools ? 'Tools: ' + mcpTools : (m.configs?.length ? 'Configs MCP detectadas: ' + m.configs.length : 'Nenhum MCP conectado.')}</p>
  `;
}

function renderLocalRuntime(runtime = {}, localTools = {}) {
  const py = runtime.python || {};
  const npm = runtime.npm || {};
  $('#localRuntime').innerHTML = `
    <div class="kv"><span>Node</span><b>${runtime.node?.version || 'OK'}</b></div>
    <div class="kv"><span>Python</span><b>${py.available ? (py.version || 'OK') : 'AUSENTE'}</b></div>
    <div class="kv"><span>npm</span><b>${npm.available ? (npm.version || 'OK') : 'OPCIONAL'}</b></div>
    <div class="kv"><span>Local Skills</span><b>${localTools.enabled ? 'ON' : 'OFF'}</b></div>
    <p class="small">${localTools.pythonBridge ? 'Ponte Python ativa para automações locais.' : 'Sem Python: usando fallback Node para ações simples.'}</p>
  `;
}

function renderApprovals(approvals = {}) {
  approvalState = { policy: approvals.policy || 'once', trusted: approvals.trusted || [], pending: approvals.pending || [] };
  const pending = approvalState.pending || [];
  $('#approvalBox').innerHTML = `
    <div class="kv"><span>Política</span><b>${approvalState.policy}</b></div>
    <div class="kv"><span>Confiadas</span><b>${approvalState.trusted.length}</b></div>
    <div class="kv"><span>Pendentes</span><b>${pending.length}</b></div>
    ${pending.length ? pending.slice(0, 3).map(item => `<div class="small">• ${item.label}</div>`).join('') : '<div class="small">Nenhuma aprovação pendente.</div>'}
  `;
}

async function approvePending(token, execute = true) {
  const r = await fetch('/api/approvals/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, execute })
  }).then(x => x.json()).catch(e => ({ ok: false, text: e.message }));
  await refresh();
  return r;
}

async function handleApprovalResult(result) {
  if (!result?.requiresApproval || !result.approval?.token) return result;
  const go = window.confirm(`${result.text}\n\nDeseja aprovar agora?\nDepois disso, esta ação fica liberada conforme a política atual.`);
  if (!go) return result;
  const approved = await approvePending(result.approval.token, true);
  const msg = approved.text || (approved.ok ? 'Ação aprovada e executada.' : 'Aprovação falhou.');
  add('assistant', msg);
  speak(msg);
  return approved;
}

async function loadConfig() {
  config = await fetch('/api/config').then(r => r.json());
  $('#cfg-provider').value = config.AI_PROVIDER || 'local';
  $('#cfg-openai-model').value = config.OPENAI_MODEL || 'gpt-4o-mini';
  $('#cfg-openrouter-model').value = config.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  $('#cfg-codex').checked = Boolean(config.CODEX_ENABLED);
  $('#cfg-hermes-enabled').checked = Boolean(config.HERMES_ENABLED);
  $('#cfg-hermes-url').value = config.HERMES_URL || '';
  $('#cfg-hermes-command').value = config.HERMES_COMMAND || '';
  $('#cfg-openclaw-enabled').checked = Boolean(config.OPENCLAW_ENABLED);
  $('#cfg-openclaw-url').value = config.OPENCLAW_URL || '';
  $('#cfg-openclaw-command').value = config.OPENCLAW_COMMAND || '';
  $('#cfg-mcp-enabled').checked = Boolean(config.MCP_ENABLED);
  $('#cfg-mcp-url').value = config.MCP_URL || '';
  $('#cfg-mcp-command').value = config.MCP_COMMAND || '';
  $('#cfg-local-tools-enabled').checked = config.LOCAL_TOOLS_ENABLED !== false;
  $('#cfg-local-tools-confirm').checked = Boolean(config.LOCAL_TOOLS_REQUIRE_CONFIRMATION);
  $('#cfg-approval-policy').value = config.APPROVAL_POLICY || 'once';
  $('#openai-set').textContent = config.OPENAI_API_KEY_SET ? 'definida' : 'não definida';
  $('#openrouter-set').textContent = config.OPENROUTER_API_KEY_SET ? 'definida' : 'não definida';
}

async function saveConfig() {
  const payload = {
    AI_PROVIDER: $('#cfg-provider').value,
    OPENAI_API_KEY: $('#cfg-openai-key').value.trim(),
    OPENAI_MODEL: $('#cfg-openai-model').value.trim(),
    OPENROUTER_API_KEY: $('#cfg-openrouter-key').value.trim(),
    OPENROUTER_MODEL: $('#cfg-openrouter-model').value.trim(),
    CODEX_ENABLED: String($('#cfg-codex').checked),
    HERMES_ENABLED: String($('#cfg-hermes-enabled').checked),
    HERMES_URL: $('#cfg-hermes-url').value.trim(),
    HERMES_COMMAND: $('#cfg-hermes-command').value.trim(),
    OPENCLAW_ENABLED: String($('#cfg-openclaw-enabled').checked),
    OPENCLAW_URL: $('#cfg-openclaw-url').value.trim(),
    OPENCLAW_COMMAND: $('#cfg-openclaw-command').value.trim(),
    MCP_ENABLED: String($('#cfg-mcp-enabled').checked),
    MCP_URL: $('#cfg-mcp-url').value.trim(),
    MCP_COMMAND: $('#cfg-mcp-command').value.trim(),
    LOCAL_TOOLS_ENABLED: String($('#cfg-local-tools-enabled').checked),
    LOCAL_TOOLS_REQUIRE_CONFIRMATION: String($('#cfg-local-tools-confirm').checked),
    APPROVAL_POLICY: $('#cfg-approval-policy').value
  };
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());
  $('#cfg-openai-key').value = '';
  $('#cfg-openrouter-key').value = '';
  $('#configResult').textContent = res.ok ? 'Configuração salva. O provedor já será usado nas próximas mensagens.' : 'Falha ao salvar configuração.';
  await loadConfig();
  await refresh();
}


function normalizeSpokenCommand(text = '') {
  return String(text || '')
    .trim()
    .replace(/^[\s,.;:!?]*(jarvis|j[aá]rvis|astra|assistente)\b[\s,.;:!?]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleVoiceTranscript(text) {
  const raw = String(text || '').trim();
  const cmd = normalizeSpokenCommand(raw);
  const lower = cmd.toLowerCase();

  if (/^(parar voz|pare a voz|desligar microfone|desative o microfone|sil[êe]ncio)$/.test(lower)) {
    voiceActive = false;
    try { recognition?.stop(); } catch {}
    setMode('IDLE', '◎');
    add('assistant', 'Voz contínua pausada.');
    return;
  }

  if (/^(diagnosticar sistema|diagnostique o sistema|verificar sistema)$/.test(lower)) {
    $('#diagnose').click();
    return;
  }

  if (/^(detectar|diagnosticar|verificar).*(mcp|hermes|openclaw|open claw)/.test(lower)) {
    await send('Jarvis, detecte MCP Hermes OpenClaw');
    return;
  }

  // Comandos diretos de abrir (auto-aprova, não precisa do chat)
  const openMatch = lower.match(/^(abrir|abre|abra)\s+(o|a|os|as|um|uma)?\s*(.+)$/);
  if (openMatch) {
    let target = openMatch[3].trim();
    // Normalizar artigos
    target = target.replace(/^(o|a|os|as|um|uma)\s+/i, '').trim();
    if (!target) {
      add('assistant', 'O que devo abrir? Diga o nome do app ou site.');
      return;
    }
    const sendBtn = document.querySelector('#send');
    if (sendBtn) sendBtn.disabled = true;
    const r = await fetch('/api/local-tools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'open_app', app: target })
    }).then(x => x.json()).catch(e => ({ ok: false, text: e.message }));
    if (sendBtn) sendBtn.disabled = false;
    if (r?.requiresApproval) {
      const approved = await approvePending(r.approval.token, true);
      const msg = approved.text || (approved.ok ? `${target} aberto.` : 'Aprovação rejeitada.');
      add('assistant', msg);
      speak(msg);
      return;
    }
    if (r?.ok === false) {
      await send(raw);
    } else {
      const msg = r.text || `${target} aberto.`;
      add('assistant', msg);
      speak(msg);
    }
    return;
  }

  await send(raw);
}

async function send(text) {
  text = (text || $('#input').value).trim();
  if (!text) return;
  $('#input').value = '';
  add('user', text);
  setMode('THINKING', '◌');
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text })
  }).then(r => r.json());
  if (res?.requiresApproval) {
    add('assistant', res.text || 'Aprovação necessária.');
    await handleApprovalResult(res);
    return;
  }
  const reply = res.text || res.error || 'Sem resposta.';
  add('assistant', reply);
  setMode(res.state || 'IDLE', res.emotion === 'focused' ? '◈' : '◉');
  speak(reply);
}

function activateTab(name) {
  document.querySelectorAll('.tabpage').forEach(el => el.classList.toggle('active', el.id === `tab-${name}`));
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
}


async function runLocalTool(payload) {
  setMode('EXECUTING', '◈');
  const r = await fetch('/api/local-tools', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(x => x.json()).catch(e => ({ ok: false, text: e.message }));
  if (r?.requiresApproval) {
    add('assistant', r.text || 'Aprovação necessária.');
    await handleApprovalResult(r);
    return r;
  }
  const msg = r.text || (r.ok ? 'Ação local executada.' : 'Ação local falhou.');
  add('assistant', msg);
  speak(msg);
  await refresh();
  return r;
}

async function checkDueReminders() {
  const r = await fetch('/api/local-tools/reminders/due').then(x => x.json()).catch(() => ({ due: [] }));
  for (const item of (r.due || [])) {
    const msg = `Lembrete: ${item.text}`;
    add('assistant', msg);
    speak(msg);
  }
}

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => activateTab(b.dataset.tab));
document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => activateTab(b.dataset.goto));
$('#send').onclick = () => send();
$('#input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
$('#diagnose').onclick = () => send('JARVIS, diagnostique o sistema e diga o que está rodando.');
$('#stopVoice').onclick = () => {
  voiceActive = false;
  window.speechSynthesis?.cancel();
  try { recognition?.stop(); } catch {}
  $('#voice').textContent = recognition ? 'ON' : 'TEXT';
  setMode('IDLE', '◎');
};
$('#saveConfig').onclick = saveConfig;
$('#testApi').onclick = async () => {
  $('#configResult').textContent = 'Testando API...';
  const r = await fetch('/api/test-provider').then(x => x.json());
  $('#configResult').textContent = r.ok
    ? `API reconhecida: ${r.provider}. Resposta: ${r.reply}`
    : `API não funcionou: ${r.provider || 'local'} - ${r.error || 'erro desconhecido'}`;
  await refresh();
};
$('#saveNote').onclick = async () => {
  const note = $('#note').value.trim();
  if (!note) return;
  await fetch('/api/note', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note }) });
  $('#note').value = '';
  add('assistant', 'Nota salva na memória local.');
};
function startContinuousVoice() {
  if (!recognition || recognitionStarting) return;
  recognitionStarting = true;
  window.speechSynthesis?.cancel();
  setMode('LISTENING', '◍');
  $('#voice').textContent = 'LIVE';
  try { recognition.start(); } catch {}
  setTimeout(() => { recognitionStarting = false; }, 600);
}


async function sendOrchestrator(target) {
  const command = $('#orchCommand').value.trim();
  if (!command) return add('assistant', 'Digite um comando para enviar ao orquestrador.');
  add('user', `${target}: ${command}`);
  setMode('EXECUTING', '◈');
  const r = await fetch('/api/orchestrator/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target, command })
  }).then(x => x.json()).catch(e => ({ ok: false, text: e.message }));
  if (r?.requiresApproval) {
    add('assistant', r.text || 'Aprovação necessária.');
    await handleApprovalResult(r);
    return;
  }
  const msg = r.ok ? `Comando enviado para ${target}: ${r.text || 'aceito.'}` : `Falha ao enviar para ${target}: ${r.text || 'sem detalhes'}`;
  add('assistant', msg);
  speak(msg);
  await refresh();
}

$('#sendHermes').onclick = () => sendOrchestrator('hermes');
$('#sendOpenClaw').onclick = () => sendOrchestrator('openclaw');
$('#refreshOrch').onclick = async () => { await refresh(); add('assistant', 'Detecção de Hermes, OpenClaw e MCP atualizada.'); };
$('#openBrowser').onclick = () => runLocalTool({ action: 'open_browser', browser: 'default' });
$('#searchWeb').onclick = () => {
  const query = $('#localQuery').value.trim() || $('#input').value.trim();
  if (!query) return add('assistant', 'Digite uma pesquisa primeiro.');
  runLocalTool({ action: 'search_web', query });
};
$('#openCalc').onclick = () => runLocalTool({ action: 'open_app', app: 'calculator' });
$('#openNotepad').onclick = () => runLocalTool({ action: 'open_app', app: 'notepad' });
$('#listReminders').onclick = () => send('listar lembretes');

$('#mic').onclick = () => {
  if (!recognition) {
    add('assistant', 'Reconhecimento de voz não disponível neste navegador. Use Chrome ou Edge.');
    return;
  }
  voiceActive = true;
  add('assistant', 'Microfone contínuo ativo. Fale normalmente; clique em Parar voz para encerrar.');
  startContinuousVoice();
};
if (recognition) {
  recognition.onresult = e => {
    let interim = '';
    let final = '';
    for (let i = 0; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    if (interim) {
      add('user', interim.trim());
      $('#input').value = interim.trim();
    }
    if (final) {
      window._voiceBuffer = (window._voiceBuffer + ' ' + final.trim()).trim();
      clearTimeout(window._voiceFinalTimer);
      window._voiceFinalTimer = setTimeout(() => {
        if (window._voiceBuffer) {
          handleVoiceTranscript(window._voiceBuffer);
          window._voiceBuffer = '';
        }
      }, 1200);
    }
    const last = e.results[e.results.length - 1];
    if (last?.isFinal && !final) {
      clearTimeout(window._voiceFinalTimer);
      handleVoiceTranscript(last[0].transcript);
    }
  };
  recognition.onerror = e => {
    if (voiceActive && !['aborted', 'no-speech'].includes(e.error)) add('assistant', 'Microfone: ' + e.error);
  };
  recognition.onend = () => {
    recognitionStarting = false;
    if (voiceActive) setTimeout(startContinuousVoice, 450);
    else setMode('IDLE', '◎');
  };
}

const events = new EventSource('/api/events');
events.onmessage = ev => {
  try {
    const data = JSON.parse(ev.data);
    if (data.type === 'event') {
      $('#logs').textContent = `[${data.ts?.slice(11, 19)}] ${data.event}\n` + $('#logs').textContent.slice(0, 3000);
    }
  } catch {}
};
events.onerror = () => {
  $('#logs').textContent = `[local] aguardando eventos...\n` + $('#logs').textContent.slice(0, 3000);
};

// --- TTS Controls ---
$('#ttsSpeak').onclick = async () => {
  const text = $('#ttsText').value.trim();
  if (!text) return;
  const voice = $('#ttsVoice').value;
  const audio = $('#ttsAudio');
  try {
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (res.ok) {
      const blob = await res.blob();
      audio.src = URL.createObjectURL(blob);
      audio.onended = () => URL.revokeObjectURL(audio.src);
      await audio.play();
    } else {
      add('assistant', 'Erro no TTS: ' + res.status);
    }
  } catch (e) {
    add('assistant', 'Falha ao conectar TTS. Usando navegador.');
    fallbackSpeak(text);
  }
};
$('#ttsStop').onclick = () => {
  const audio = $('#ttsAudio');
  if (audio) { audio.pause(); audio.currentTime = 0; }
  window.speechSynthesis?.cancel();
};

setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString('pt-BR'), 1000);
refresh();
loadConfig();
setInterval(refresh, 10000);
setInterval(checkDueReminders, 15000);
add('assistant', 'Sistema local iniciado. Clique em Falar uma vez e diga: Jarvis, pesquise IA na internet; quero ouvir Queen; abra o YouTube; me dê uma opinião; envie para Hermes; detecte MCP Hermes OpenClaw. O microfone fica ativo até você dizer ou clicar em Parar voz.');
