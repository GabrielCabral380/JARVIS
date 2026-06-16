const app = document.querySelector('#app');
const defaultApi = 'https://jarvis-cloud.onrender.com';
const savedApi = localStorage.getItem('jarvis-pages-api') || '';
const urlApi = new URLSearchParams(location.search).get('api') || '';
const apiBase = (urlApi || savedApi || defaultApi).replace(/\/$/, '');

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
    <div id="status" class="orchestrator">Aguardando teste...</div>
    <h3>◉ LINKS</h3>
    <div class="quick vertical">
      <a class="linkbtn" href="https://github.com/GabrielCabral380/JARVIS" target="_blank" rel="noreferrer">Abrir repositório</a>
      <a class="linkbtn" href="${apiBase}" target="_blank" rel="noreferrer">Abrir backend</a>
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
      <div class="quick">
        <button id="testStatus">Testar /api/status</button>
        <button id="openBackend">Abrir backend</button>
      </div>
      <p class="muted">Esta página pública valida o acesso web do JARVIS. A execução completa depende do backend cloud responder em <code>/api/status</code>.</p>
    </section>
  </main>
  <aside class="panel right">
    <h3>▸ OBSERVAÇÕES</h3>
    <div class="orchestrator">
      <p><b>Pages:</b> ativo para acesso público.</p>
      <p><b>Backend padrão:</b> <span id="apiLabel"></span></p>
      <p><b>Objetivo:</b> eliminar o 404 e permitir teste web imediato.</p>
    </div>
  </aside>
</section>
`;

const $ = (s) => document.querySelector(s);
function tick(){ $('#clock').textContent = new Date().toLocaleTimeString('pt-BR'); }
setInterval(tick, 1000); tick();
$('#apiLabel').textContent = apiBase || 'não definido';

function addMessage(text, type='assistant') {
  const d = document.createElement('div');
  d.className = `msg ${type}`;
  d.textContent = text;
  $('#messages').appendChild(d);
}

async function fetchWithTimeout(url, ms=15000) {
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
    return;
  }
  $('#status').textContent = 'Testando backend...';
  $('#mode').textContent = 'CHECK';
  try {
    const result = await fetchWithTimeout(`${base}/api/status`);
    if (result.ok) {
      $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>${result.status}</b></div><div class="kv"><span>BACKEND</span><b>ONLINE</b></div>`;
      addMessage(`Backend respondeu ${result.status}.`, 'assistant');
      $('#mood').textContent = '◉';
    } else {
      $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>${result.status}</b></div><div class="kv"><span>BACKEND</span><b>ERRO</b></div>`;
      addMessage(`Backend respondeu ${result.status}.`, 'assistant');
      $('#mood').textContent = '○';
    }
  } catch (err) {
    $('#status').innerHTML = `<div class="kv"><span>HTTP</span><b>TIMEOUT</b></div><div class="kv"><span>BACKEND</span><b>OFFLINE</b></div>`;
    addMessage('Backend indisponível ou sem resposta.', 'assistant');
    $('#mood').textContent = '○';
  } finally {
    $('#mode').textContent = 'PAGES';
  }
}

$('#saveApi').addEventListener('click', () => {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  localStorage.setItem('jarvis-pages-api', base);
  location.search = base ? `?api=${encodeURIComponent(base)}` : '';
});
$('#testStatus').addEventListener('click', testStatus);
$('#openBackend').addEventListener('click', () => {
  const base = $('#apiUrl').value.trim().replace(/\/$/, '');
  if (base) window.open(base, '_blank', 'noopener,noreferrer');
});
addMessage('Página pública do JARVIS pronta para teste.', 'assistant');
if (apiBase) testStatus();
