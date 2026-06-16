const app = document.querySelector('#app');
const defaultApi = '';
const savedApi = localStorage.getItem('jarvis-pages-api') || '';
const urlApi = new URLSearchParams(location.search).get('api') || '';
const apiBase = (urlApi || savedApi || defaultApi).replace(/\/$/, '');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

app.innerHTML = `
<header class="topbar">
  <div class="brand">J·A·R·V·I·S</div>
  <nav>
    <button class="tab active">Pages</button>
  </nav>
  <div class="clock" id="clock">--:--:--</div>
</header>
<section class="layout">
  <aside class="panel left">
    <h3>◉ STATUS</h3>
    <div id="status" class="orchestrator">${apiBase ? 'Backend configurado. Pronto para testar.' : 'Backend não configurado.'}</div>
    <h3>◉ VOZ</h3>
    <div id="voiceStatus" class="orchestrator">Pronta para síntese de voz.</div>
  </aside>
  <main class="center">
    <section class="screen tabpage active">
      <div class="orb-wrap">
        <div class="orb"><div class="face"><h1 id="mood">◎</h1><p id="mode">PAGES</p></div></div>
      </div>
      <div class="chatbox" id="messages"></div>
      <div class="composer">
        <input id="apiUrl" placeholder="https://seu-backend.onrender.com" value="${apiBase}" />
        <button id="saveApi">Salvar URL</button>
      </div>
      <div class="composer">
        <input id="commandInput" placeholder="Diga ou digite seu comando para o JARVIS" />
        <button id="sendCommand">Enviar</button>
      </div>
      <div class="quick">
        <button id="testStatus">Testar /api/status</button>
        <button id="testVoice">Testar voz</button>
        <button id="startVoice">Falar</button>
      </div>
      <p class="muted">A voz local está ativa. Use os botões abaixo para interagir.</p>
    </section>
  </main>
  <aside class="panel right">
    <h3>▸ OBSERVAÇÕES</h3>
    <div class="orchestrator">
      <p><b>Pages:</b> ativo para acesso público.</p>
      <p><b>Página pública do JARVIS pronta.</b></p>
      <p>A voz local já pode ser testada.</p>
    </div>
  </aside>
</section>
`;

const $ = (s) => document.querySelector(s);
function tick(){ $('#clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
setInterval(tick, 1000); tick();


function setMode(mode, mood='◎') {
  $('#mode').textContent = mode;
  $('#mood').textContent = mood;
}

function addMessage(text, type='assistant') {
  const d = document.createElement('div');
  d.className = `msg ${type}`;
  d.textContent = text;
  $('#messages').appendChild(d);
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

function speak(text) {
  if (!('speechSynthesis' in window)) {
    $('#voiceStatus').textContent = 'Este navegador não suporta síntese de voz.';
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.0;
  utterance.pitch = 0.95;
  utterance.onstart = () => {
    $('#voiceStatus').textContent = 'Falando agora.';
    setMode('SPEAKING', '◉');
  };
  utterance.onend = () => {
    $('#voiceStatus').textContent = listening ? 'Ouvindo...' : 'Pronta para síntese de voz.';
    setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎');
  };
  window.speechSynthesis.speak(utterance);
}

function localReply(command) {
  const text = (command || '').toLowerCase().trim();
  if (!text) return 'Estou ouvindo, Senhor.';
  if (text.includes('testar voz') || text.includes('fala') || text.includes('voz')) {
    return 'Voz online. Estou respondendo diretamente do navegador, Senhor.';
  }
  if (text.includes('status')) {
    return 'Sistema operacional. Voz local ativa e pronta.';
  }
  return 'Recebi seu comando.';
}

async function fetchWithTimeout(url, options = {}, ms = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(id);
  }
}

async function testStatus() {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  if (!base) {
    $('#status').textContent = 'Informe uma URL de backend.';
    addMessage('Informe uma URL de backend para testar.', 'assistant');
    speak('Informe uma URL de backend para testar.');
    return;
  }
  $('#status').textContent = 'Testando backend...';
  setMode('CHECK', '◉');
  try {
    const result = await fetchWithTimeout(`${base}/api/status`);
    if (result.ok) {
      $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>${result.status}</b></div><div class="kv"><span>BACKEND</span><b>ONLINE</b></div>`;
      addMessage(`Backend respondeu ${result.status}.`, 'assistant');
      speak(`Backend online com status ${result.status}.`);
    } else {
      $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>${result.status}</b></div><div class="kv"><span>BACKEND</span><b>ERRO</b></div>`;
      addMessage(`Backend respondeu ${result.status}.`, 'assistant');
      speak(`O backend respondeu com erro ${result.status}.`);
    }
  } catch (err) {
    $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>TIMEOUT</b></div><div class="kv"><span>BACKEND</span><b>OFFLINE</b></div>`;
    addMessage('Backend indisponível ou sem resposta.', 'assistant');
    speak('O backend está offline ou sem resposta.');
  } finally {
    setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎');
  }
}

async function remoteChat(command) {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  const result = await fetchWithTimeout(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: command })
  }, 30000);
  if (!result.ok) throw new Error(`HTTP ${result.status}`);
  const data = JSON.parse(result.text || '{}');
  return data.text || 'Sem resposta do backend.';
}

async function runCommand(command, fromVoice=false) {
  const prompt = String(command || '').trim();
  addMessage(prompt || 'Sem comando.', 'user');
  if (!prompt) {
    const reply = 'Estou ouvindo, Senhor.';
    addMessage(reply, 'assistant');
    speak(reply);
    return;
  }
  setMode('THINKING', '◌');
  try {
    const base = $('#apiUrl').value.trim().replace(/\/$/, '');
    const reply = base ? await remoteChat(prompt) : localReply(prompt);
    addMessage(reply, 'assistant');
    speak(reply);
  } catch (err) {
    const reply = `O backend não respondeu. ${localReply(prompt)}`;
    addMessage(reply, 'assistant');
    speak(reply);
  } finally {
    setMode(listening ? 'LISTENING' : 'PAGES', listening ? '◉' : '◎');
  }
}

function toggleVoice() {
  if (!SpeechRecognition) {
    $('#voiceStatus').textContent = 'Reconhecimento de voz não suportado neste navegador.';
    speak('Este navegador não suporta reconhecimento de voz.');
    return;
  }
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      listening = true;
      $('#voiceStatus').textContent = 'Ouvindo...';
      setMode('LISTENING', '◉');
    };
    recognition.onend = () => {
      listening = false;
      $('#voiceStatus').textContent = 'Pronta para síntese de voz.';
      setMode('PAGES', '◎');
    };
    recognition.onerror = () => {
      listening = false;
      $('#voiceStatus').textContent = 'Falha ao capturar a voz.';
      setMode('PAGES', '◎');
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript || '';
      $('#commandInput').value = transcript;
      runCommand(transcript, true);
    };
  }
  recognition.start();
}

$('#saveApi').addEventListener('click', () => {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  localStorage.setItem('jarvis-pages-api', base);
  location.search = base ? `?api=${encodeURIComponent(base)}` : '';
});
$('#testStatus').addEventListener('click', testStatus);
$('#testVoice').addEventListener('click', () => {
  addMessage('testar voz', 'user');
  const reply = 'Voz online. Estou respondendo diretamente do navegador, Senhor.';
  addMessage(reply, 'assistant');
  speak(reply);
});
$('#startVoice').addEventListener('click', toggleVoice);
$('#sendCommand').addEventListener('click', () => runCommand($('#commandInput').value.trim()));
$('#commandInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runCommand($('#commandInput').value.trim());
});

addMessage('Página pública do JARVIS pronta.', 'assistant');
