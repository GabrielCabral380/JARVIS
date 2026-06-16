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
    <div id="status" class="orchestrator">Backend não configurado.</div>
    <h3>◉ VOZ</h3>
    <div id="voiceStatus" class="orchestrator">Pronta para síntese de voz.</div>
    <h3>◉ LINKS</h3>
    <div class="quick vertical">
      <a class="linkbtn" href="https://github.com/GabrielCabral380/JARVIS" target="_blank" rel="noreferrer">Abrir repositório</a>
      <a class="linkbtn" href="${apiBase || 'https://render.com/'}" target="_blank" rel="noreferrer">Abrir backend</a>
    </div>
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
        <input id="commandInput" placeholder="Diga ou digite: Jarvis, testar voz" />
        <button id="sendCommand">Enviar</button>
      </div>
      <div class="quick">
        <button id="testStatus">Testar /api/status</button>
        <button id="testVoice">Testar voz</button>
        <button id="startVoice">Falar</button>
        <button id="openBackend">Abrir backend</button>
      </div>
      <p class="muted">Esta página pública já responde por voz no navegador. O backend cloud continua opcional e só é usado quando o Senhor informar uma URL válida.</p>
    </section>
  </main>
  <aside class="panel right">
    <h3>▸ OBSERVAÇÕES</h3>
    <div class="orchestrator">
      <p><b>Pages:</b> ativo para acesso público.</p>
      <p><b>Backend atual:</b> <span id="apiLabel"></span></p>
      <p><b>Modo:</b> voz local no navegador + teste opcional de backend.</p>
    </div>
  </aside>
</section>
`;

const $ = (s) => document.querySelector(s);
function tick(){ $('#clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
setInterval(tick, 1000); tick();
$('#apiLabel').textContent = apiBase || 'não configurado';

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

function buildReply(command) {
  const text = (command || '').toLowerCase().trim();
  if (!text) return 'Estou ouvindo, Senhor.';
  if (text.includes('testar voz') || text.includes('fala') || text.includes('voz')) {
    return 'Voz online. Estou respondendo diretamente do navegador, Senhor.';
  }
  if (text.includes('status')) {
    return apiBase
      ? `A URL configurada para backend é ${apiBase}. Posso testar o status agora.`
      : 'O backend cloud ainda não foi configurado nesta página. A voz local está ativa.';
  }
  if (text.includes('abrir repositório')) {
    window.open('https://github.com/GabrielCabral380/JARVIS', '_blank', 'noopener,noreferrer');
    return 'Abrindo o repositório do JARVIS.';
  }
  if (text.includes('abrir backend')) {
    if (apiBase) {
      window.open(apiBase, '_blank', 'noopener,noreferrer');
      return 'Abrindo a URL do backend configurado.';
    }
    return 'Ainda não existe uma URL de backend salva para abrir.';
  }
  if (text.includes('testar backend') || text.includes('api status')) {
    testStatus();
    return 'Iniciando teste do backend agora.';
  }
  return 'Comando recebido. Posso testar a voz, verificar o status do backend ou abrir o repositório.';
}

async function fetchWithTimeout(url, ms=12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
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

function runCommand(command, fromVoice=false) {
  const reply = buildReply(command);
  addMessage(command || 'Sem comando.', fromVoice ? 'user' : 'user');
  addMessage(reply, 'assistant');
  speak(reply);
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
$('#testVoice').addEventListener('click', () => runCommand('testar voz'));
$('#startVoice').addEventListener('click', toggleVoice);
$('#sendCommand').addEventListener('click', () => runCommand($('#commandInput').value.trim()));
$('#commandInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runCommand($('#commandInput').value.trim());
});
$('#openBackend').addEventListener('click', () => {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  if (base) {
    window.open(base, '_blank', 'noopener,noreferrer');
    addMessage('Abrindo backend configurado.', 'assistant');
    speak('Abrindo backend configurado.');
  } else {
    addMessage('Nenhum backend configurado.', 'assistant');
    speak('Nenhum backend configurado.');
  }
});

addMessage('Página pública do JARVIS pronta. A voz local já pode ser testada.', 'assistant');
