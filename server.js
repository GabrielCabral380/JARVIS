import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { synthesize as ttsSynthesize, listVoices as ttsVoices } from './server/tts.js';
import { runFileOp, runMediaOp, runSystemOp, runSmartHomeOp, runTranslateOp, runCalcOp, executeCommand } from './server/executor.js';
import { findActions, getCapabilitiesList, getAllActions } from './server/capabilities.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || readEnvFile().PORT || 3000);
const SYSTEM_DIR = path.join(__dirname, 'system');
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const LOG_DIR = path.join(__dirname, 'logs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MEMORY_FILE = path.join(SYSTEM_DIR, 'JARVIS-MEMORY.md');
const HISTORY_FILE = path.join(SYSTEM_DIR, 'JARVIS-HISTORY.json');
const EVENTS_FILE = path.join(LOG_DIR, 'events.ndjson');
const REMINDERS_FILE = path.join(SYSTEM_DIR, 'JARVIS-REMINDERS.json');
const APPROVALS_FILE = path.join(SYSTEM_DIR, 'JARVIS-APPROVALS.json');
const BACKEND_DIR = path.join(__dirname, 'backend');
const startedAt = new Date();
const sseClients = new Set();

for (const dir of [SYSTEM_DIR, RUNTIME_DIR, LOG_DIR]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, '# JARVIS Memory\n\n', 'utf8');
if (!fs.existsSync(HISTORY_FILE)) fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
if (!fs.existsSync(REMINDERS_FILE)) fs.writeFileSync(REMINDERS_FILE, '[]', 'utf8');
if (!fs.existsSync(APPROVALS_FILE)) fs.writeFileSync(APPROVALS_FILE, JSON.stringify({ trusted: [], pending: [] }, null, 2), 'utf8');

const env = { ...process.env, ...readEnvFile() };

function refreshEnv() {
  const fileEnv = readEnvFile();
  for (const key of CONFIG_KEYS || []) delete env[key];
  Object.assign(env, process.env, fileEnv);
  return env;
}

function readEnvFile() {
  const envPath = path.join(__dirname, '.env');
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

function configuredProvider() {
  const fileEnv = readEnvFile();
  Object.assign(env, process.env, fileEnv);
  const requested = String(env.AI_PROVIDER || '').toLowerCase().trim();
  if (requested === 'openrouter' || env.OPENROUTER_API_KEY) return 'openrouter';
  if (requested === 'openai' || env.OPENAI_API_KEY) return 'openai';
  return 'local';
}

function mask(s = '') {
  return String(s)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/(api[_-]?key|token|password|senha)=\S+/gi, '$1=***');
}

const CONFIG_KEYS = [
  'AI_PROVIDER',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_SITE_URL',
  'OPENROUTER_SITE_NAME',
  'CODEX_ENABLED',
  'CODEX_TIMEOUT_MS',
  'PORT',
  'AUTO_OPEN_BROWSER',
  'HERMES_ENABLED',
  'HERMES_URL',
  'HERMES_COMMAND',
  'OPENCLAW_ENABLED',
  'OPENCLAW_URL',
  'OPENCLAW_COMMAND',
  'MCP_ENABLED',
  'MCP_URL',
  'MCP_COMMAND',
  'LOCAL_TOOLS_ENABLED',
  'LOCAL_TOOLS_REQUIRE_CONFIRMATION',
  'APPROVAL_POLICY'
];

function publicConfig() {
  const provider = configuredProvider();
  return {
    AI_PROVIDER: env.AI_PROVIDER || provider,
    OPENAI_API_KEY_SET: Boolean(env.OPENAI_API_KEY),
    OPENAI_MODEL: env.OPENAI_MODEL || 'gpt-4o-mini',
    OPENAI_BASE_URL: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    OPENROUTER_API_KEY_SET: Boolean(env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    OPENROUTER_SITE_URL: env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`,
    OPENROUTER_SITE_NAME: env.OPENROUTER_SITE_NAME || 'JARVIS Local Hub',
    CODEX_ENABLED: String(env.CODEX_ENABLED || 'false').toLowerCase() === 'true',
    CODEX_TIMEOUT_MS: String(env.CODEX_TIMEOUT_MS || '120000'),
    PORT: String(env.PORT || PORT),
    AUTO_OPEN_BROWSER: String(env.AUTO_OPEN_BROWSER || 'false'),
    HERMES_ENABLED: String(env.HERMES_ENABLED || 'true').toLowerCase() === 'true',
    HERMES_URL: env.HERMES_URL || '',
    HERMES_COMMAND: env.HERMES_COMMAND || '',
    OPENCLAW_ENABLED: String(env.OPENCLAW_ENABLED || 'true').toLowerCase() === 'true',
    OPENCLAW_URL: env.OPENCLAW_URL || '',
    OPENCLAW_COMMAND: env.OPENCLAW_COMMAND || '',
    MCP_ENABLED: String(env.MCP_ENABLED || 'true').toLowerCase() === 'true',
    MCP_URL: env.MCP_URL || '',
    MCP_COMMAND: env.MCP_COMMAND || '',
    LOCAL_TOOLS_ENABLED: String(env.LOCAL_TOOLS_ENABLED || 'true').toLowerCase() === 'true',
    LOCAL_TOOLS_REQUIRE_CONFIRMATION: String(env.LOCAL_TOOLS_REQUIRE_CONFIRMATION || 'false').toLowerCase() === 'true',
    APPROVAL_POLICY: String(env.APPROVAL_POLICY || 'once').toLowerCase()
  };
}

function quoteEnvValue(value) {
  const v = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (!v) return '';
  if (/[\s#"'=]/.test(v)) return JSON.stringify(v);
  return v;
}

function writeEnvConfig(patch = {}) {
  const envPath = path.join(__dirname, '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const current = readEnvFile();

  for (const [key, value] of Object.entries(patch)) {
    if (!CONFIG_KEYS.includes(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'boolean' && typeof value !== 'number') continue;
    const normalized = String(value).trim();

    if ((key === 'OPENAI_API_KEY' || key === 'OPENROUTER_API_KEY') && normalized === '') {
      continue; // campo vazio não apaga chave existente por acidente
    }

    if (normalized === '__CLEAR__') delete current[key];
    else current[key] = normalized;
  }

  const lines = [
    '# JARVIS Local Hub - configuração local',
    '# Edite pela interface em Config ou diretamente aqui.',
    ''
  ];
  for (const key of CONFIG_KEYS) {
    if (current[key] !== undefined && current[key] !== '') lines.push(`${key}=${quoteEnvValue(current[key])}`);
  }
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');

  const refreshed = readEnvFile();
  for (const key of CONFIG_KEYS) delete env[key];
  Object.assign(env, process.env, refreshed);
  return publicConfig();
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of [...sseClients]) {
    try { res.write(data); } catch { sseClients.delete(res); }
  }
}

function log(event, data = {}) {
  const row = { ts: new Date().toISOString(), event, ...data };
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(row).replace(/\n/g, ' ') + '\n', 'utf8');
  broadcast({ type: 'event', ...row });
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  };
}

function sendJson(res, status, obj) {
  const text = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders() });
  res.end(text);
}


function loadApprovalStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8'));
    const trusted = Array.isArray(parsed?.trusted) ? parsed.trusted.map(String) : [];
    const pending = Array.isArray(parsed?.pending) ? parsed.pending : [];
    return { trusted, pending };
  } catch {
    return { trusted: [], pending: [] };
  }
}

function saveApprovalStore(store) {
  const trusted = Array.from(new Set((store?.trusted || []).map(String))).sort();
  const pending = Array.isArray(store?.pending) ? store.pending.slice(-50) : [];
  fs.writeFileSync(APPROVALS_FILE, JSON.stringify({ trusted, pending }, null, 2), 'utf8');
  return { trusted, pending };
}

function approvalPolicy() {
  const policy = String(env.APPROVAL_POLICY || 'once').toLowerCase();
  return ['off', 'always', 'once'].includes(policy) ? policy : 'once';
}

function describeApprovalScope(kind, payload = {}) {
  if (kind === 'local-tool') {
    const action = String(payload.action || '').toLowerCase();
    if (action === 'open_app') return `abrir aplicativo ${String(payload.app || '').toLowerCase() || 'local'}`;
    if (action === 'search_web') return 'pesquisar na internet';
    if (action === 'youtube_search') return 'pesquisar no YouTube';
    if (action === 'open_browser') return 'abrir navegador';
    if (action === 'open_url') {
      try { return `abrir ${new URL(String(payload.url || '')).hostname}`; }
      catch { return 'abrir link externo'; }
    }
    return `executar ação local ${action || 'desconhecida'}`;
  }
  if (kind === 'orchestrator') {
    const target = String(payload.target || '').toLowerCase();
    if (target === 'mcp') return `executar ferramenta MCP ${String(payload.tool || payload.command || '').trim() || 'sem nome'}`;
    return `enviar comando para ${target || 'orquestrador'}`;
  }
  return 'executar ação sensível';
}

function approvalScope(kind, payload = {}) {
  if (kind === 'local-tool') {
    const action = String(payload.action || '').toLowerCase();
    if (action === 'open_app') return `local-tool:open_app:${String(payload.app || '').toLowerCase() || 'generic'}`;
    if (action === 'open_url') {
      try { return `local-tool:open_url:${new URL(String(payload.url || '')).hostname.toLowerCase()}`; }
      catch { return 'local-tool:open_url:generic'; }
    }
    return `local-tool:${action || 'unknown'}`;
  }
  if (kind === 'orchestrator') {
    const target = String(payload.target || '').toLowerCase();
    if (target === 'mcp') return `orchestrator:mcp:${String(payload.tool || payload.command || 'generic').toLowerCase()}`;
    return `orchestrator:${target || 'unknown'}`;
  }
  return `${kind}:generic`;
}

function createApprovalRequest(kind, payload = {}) {
  const store = loadApprovalStore();
  const scope = approvalScope(kind, payload);
  const policy = approvalPolicy();
  if (policy === 'off') return null;
  if (policy === 'once' && store.trusted.includes(scope)) return null;
  const existing = store.pending.find(item => item.scope === scope);
  if (existing) return existing;
  const approval = {
    token: `apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    kind,
    scope,
    payload,
    createdAt: new Date().toISOString(),
    message: `Aprovação necessária para ${describeApprovalScope(kind, payload)}.`,
    label: describeApprovalScope(kind, payload)
  };
  store.pending.push(approval);
  saveApprovalStore(store);
  log('approval.pending', { kind, scope });
  return approval;
}

function consumeApproval(token, { trust = true } = {}) {
  const store = loadApprovalStore();
  const index = store.pending.findIndex(item => item.token === token);
  if (index < 0) return null;
  const approval = store.pending.splice(index, 1)[0];
  if (trust && approvalPolicy() !== 'off') store.trusted.push(approval.scope);
  saveApprovalStore(store);
  log('approval.approved', { kind: approval.kind, scope: approval.scope, trust });
  return approval;
}

function currentApprovals() {
  const store = loadApprovalStore();
  return {
    policy: approvalPolicy(),
    trusted: store.trusted,
    pending: store.pending.map(item => ({
      token: item.token,
      kind: item.kind,
      scope: item.scope,
      createdAt: item.createdAt,
      message: item.message,
      label: item.label
    }))
  };
}

function approvalResponse(approval) {
  return {
    ok: false,
    requiresApproval: true,
    action: approval?.payload?.action,
    target: approval?.payload?.target,
    text: approval?.message || 'Aprovação necessária.',
    approval: approval ? {
      token: approval.token,
      kind: approval.kind,
      scope: approval.scope,
      createdAt: approval.createdAt,
      message: approval.message,
      label: approval.label
    } : null
  };
}

function ensureApproved(kind, payload = {}) {
  const approval = createApprovalRequest(kind, payload);
  return approval ? approvalResponse(approval) : null;
}

function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { return []; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-40), null, 2), 'utf8');
}

function appendMemory(user, assistant) {
  const entry = `\n## ${new Date().toISOString()}\nUser: ${String(user).slice(0, 1200)}\nJARVIS: ${String(assistant).slice(0, 1200)}\n`;
  fs.appendFileSync(MEMORY_FILE, entry, 'utf8');
}

function agentManifest() {
  const dir = path.join(__dirname, 'agents');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; }
    })
    .filter(Boolean);
}

function classifyAgent(text) {
  const t = String(text).toLowerCase();
  if (/diagn[oó]stic|status|rodando|running|sistema|health/.test(t)) return 'diagnostic';
  if (/nota|anotar|obsidian|memor|lembr/.test(t)) return 'memory';
  if (/abrir|executar|comando|autom[aá]ç/.test(t)) return 'automation';
  if (/c[oó]digo|program|bug|repo|arquivo|teste|codex/.test(t)) return 'developer';
  return 'companion';
}

const blocked = [
  /rm\s+-rf/i, /del\s+\/s/i, /format\s+[a-z]:/i, /diskpart/i,
  /reg\s+delete/i, /shutdown\s+\/[sr]/i, /net\s+user.*\/delete/i
];

function safetyCheck(command = '') {
  const hit = blocked.find(rx => rx.test(command));
  return { allowed: !hit, risk: hit ? 'blocked' : 'low', reason: hit ? 'Comando bloqueado por segurança.' : 'Permitido.' };
}

function findCmd(names) {
  const paths = String(process.env.PATH || '').split(path.delimiter);
  const pathext = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const name of names) {
    const candidates = path.extname(name) ? [name] : pathext.map(ext => name + ext.toLowerCase()).concat(pathext.map(ext => name + ext.toUpperCase()));
    for (const dir of paths) {
      for (const c of candidates) {
        const full = path.join(dir, c);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  return null;
}

function execVersion(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    if (!cmd) return resolve(null);
    const raw = String(cmd);
    if (process.platform === 'win32' && /^(\/home\/|\/mnt\/|\/usr\/|\\\\wsl\.)/i.test(raw)) return resolve(null);
    const base = path.basename(raw).toLowerCase();
    const runCmd = process.platform === 'win32' && (base.endsWith('.cmd') || base.endsWith('.bat'))
      ? 'cmd.exe'
      : raw;
    const runArgs = process.platform === 'win32' && (base.endsWith('.cmd') || base.endsWith('.bat'))
      ? ['/d', '/s', '/c', '"' + raw + '" ' + args.map(a => String(a)).join(' ')]
      : args;
    try {
      execFile(runCmd, runArgs, { timeout: 3500, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve(null);
        resolve(String(stdout || stderr).trim().split(/\r?\n/)[0] || 'detectado');
      });
    } catch {
      resolve(null);
    }
  });
}



async function runtimeInfo() {
  const npmExe = findCmd(['npm.cmd', 'npm']);
  const pyExe = findCmd(['py.exe', 'python.exe', 'python', 'py']);
  const [npm, python] = await Promise.all([
    execVersion(npmExe, ['-v']),
    pyExe ? (path.basename(pyExe).toLowerCase().startsWith('py') ? execVersion(pyExe, ['--version']) : execVersion(pyExe, ['--version'])) : Promise.resolve(null)
  ]);
  return {
    node: { available: true, version: process.version, path: process.execPath },
    npm: { available: Boolean(npmExe), version: npm, path: npmExe },
    python: { available: Boolean(pyExe), version: python, path: pyExe }
  };
}

function pythonLauncherArgs() {
  const pyExe = findCmd(['py.exe', 'py', 'python.exe', 'python']);
  if (!pyExe) return null;
  const script = path.join(BACKEND_DIR, 'local_tools.py');
  if (!fs.existsSync(script)) return null;
  const base = path.basename(pyExe).toLowerCase();
  if (base === 'py.exe' || base === 'py') return { exe: pyExe, args: ['-3', script] };
  return { exe: pyExe, args: [script] };
}

function loadReminders() {
  try {
    const rows = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveReminders(rows) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(rows.slice(-500), null, 2), 'utf8');
}

function addReminder(text, whenIso) {
  const rows = loadReminders();
  const row = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text: String(text || '').trim(),
    when: whenIso,
    done: false,
    createdAt: new Date().toISOString()
  };
  rows.push(row);
  saveReminders(rows);
  log('reminder.created', { id: row.id, when: row.when, text: row.text.slice(0, 120) });
  return row;
}


function cleanSearchQuery(q = '') {
  return String(q || '')
    .replace(/\s+(na internet|no google|na web)$/i, '')
    .replace(/^(sobre|por)\s+/i, '')
    .trim();
}

function parseReminderRequest(input = '') {
  const text = String(input).trim();
  const lower = text.toLowerCase();
  if (!/(lembr|agenda|compromisso|alarme)/i.test(text)) return null;

  let minutes = null;
  let m = lower.match(/(?:em|daqui a)\s+(\d{1,4})\s*(minuto|minutos|min|hora|horas|h)\b/);
  if (m) {
    const n = Number(m[1]);
    minutes = /hora|horas|h/.test(m[2]) ? n * 60 : n;
  }

  let when = null;
  if (minutes !== null) when = new Date(Date.now() + minutes * 60000);

  const time = lower.match(/\b(?:às|as|para|pra)\s*(\d{1,2})(?::|h)?(\d{2})?\b/);
  if (!when && time) {
    const h = Math.min(23, Number(time[1]));
    const min = Math.min(59, Number(time[2] || 0));
    when = new Date();
    when.setHours(h, min, 0, 0);
    if (when.getTime() < Date.now() - 60000) when.setDate(when.getDate() + 1);
  }

  if (!when) return null;

  let task = text
    .replace(/jarvis[, ]*/i, '')
    .replace(/(me\s+)?lembre\s+(de|para)?/i, '')
    .replace(/agende|agendar|compromisso|alarme/ig, '')
    .replace(/(?:em|daqui a)\s+\d{1,4}\s*(minuto|minutos|min|hora|horas|h)\b/i, '')
    .replace(/\b(?:às|as|para|pra)\s*\d{1,2}(?::|h)?\d{0,2}\b/i, '')
    .trim();
  if (!task) task = 'compromisso';
  return { task, when: when.toISOString() };
}

function dueReminders() {
  const now = Date.now();
  const rows = loadReminders();
  const due = [];
  let changed = false;
  for (const row of rows) {
    if (!row.done && row.when && Date.parse(row.when) <= now) {
      row.done = true;
      row.doneAt = new Date().toISOString();
      due.push(row);
      changed = true;
    }
  }
  if (changed) saveReminders(rows);
  return due;
}

function listReminders() {
  return loadReminders().filter(r => !r.done).sort((a, b) => String(a.when).localeCompare(String(b.when)));
}


function normalizeVoiceCommand(message = '') {
  return String(message || '')
    .trim()
    .replace(/^[\s,.;:!?]*(jarvis|j[aá]rvis|astra|assistente)\b[\s,.;:!?]*/i, '')
    .replace(/\bpor favor\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferOrchestratorVoiceCommand(message = '') {
  const t = normalizeVoiceCommand(message);
  const lower = t.toLowerCase();

  if (/(detectar|diagnosticar|verificar).*(hermes|openclaw|open claw|mcp)/i.test(lower) || /status.*(hermes|openclaw|mcp)/i.test(lower)) {
    return { target: 'status', command: 'detect' };
  }

  let m = t.match(/^(?:envie|enviar|mande|mandar|pe[çc]a|passar|passa)\s+(?:para|ao|a|no|na)?\s*(hermes|openclaw|open claw|mcp)\s*(?:o comando|a tarefa|para)?\s*[:,-]?\s*(.+)$/i);
  if (m) return { target: m[1].replace(/\s+/g, '').toLowerCase(), command: m[2].trim() };

  m = t.match(/^(hermes|openclaw|open claw|mcp)\s*(?:comando|tarefa)?\s*[:,-]?\s*(.+)$/i);
  if (m) return { target: m[1].replace(/\s+/g, '').toLowerCase(), command: m[2].trim() };

  if (/^(?:usar|use|acionar|acione)\s+hermes\b/i.test(t)) return { target: 'hermes', command: t.replace(/^(?:usar|use|acionar|acione)\s+hermes\b\s*/i, '').trim() };
  if (/^(?:usar|use|acionar|acione)\s+(?:openclaw|open claw)\b/i.test(t)) return { target: 'openclaw', command: t.replace(/^(?:usar|use|acionar|acione)\s+(?:openclaw|open claw)\b\s*/i, '').trim() };
  if (/^(?:usar|use|acionar|acione)\s+mcp\b/i.test(t)) return { target: 'mcp', command: t.replace(/^(?:usar|use|acionar|acione)\s+mcp\b\s*/i, '').trim() };

  return null;
}

function inferLocalSkill(message = '') {
  const t = normalizeVoiceCommand(message);
  const lower = t.toLowerCase();

  const reminder = parseReminderRequest(t);
  if (reminder) return { action: 'reminder_create', task: reminder.task, when: reminder.when };

  if (/^(listar\s+)?(lembretes|compromissos|agenda)\b/i.test(lower) || /quais.*(lembretes|compromissos|agenda)/i.test(lower)) {
    return { action: 'reminders_list' };
  }

  const learn = t.match(/^(?:aprenda|memorize|guarde|lembre que|anote que)\s+(.+)$/i);
  if (learn) return { action: 'learn', text: learn[1].trim() };

  const opinion = t.match(/^(?:me\s+)?(?:d[eê]|de|dar|dá)\s+(?:uma\s+)?opini[aã]o(?:\s+sobre|\s+de)?\s*(.*)$/i)
    || t.match(/^(?:o que voc[eê] acha|qual sua opini[aã]o)(?:\s+sobre|\s+de)?\s*(.*)$/i);
  if (opinion) return { action: 'opinion', topic: (opinion[1] || '').trim() };

  const music = t.match(/^(?:quero\s+ouvir|tocar|toque|procure\s+no\s+youtube|pesquise\s+no\s+youtube)\s+(.+)$/i);
  if (music) return { action: 'youtube_search', query: music[1].trim() };

  if (/(abrir|abra|abre|iniciar|inicie).*(youtube|you tube)/i.test(lower)) {
    return { action: 'open_url', url: 'https://www.youtube.com', label: 'YouTube' };
  }

  const yt = t.match(/^(?:abrir|abra|abre)\s+(?:o\s+)?youtube\s+(?:com|e pesquise|pesquisando)?\s*(.*)$/i);
  if (yt && yt[1]) return { action: 'youtube_search', query: yt[1].trim() };

  const search = t.match(/(?:pesquise|pesquisar|busque|buscar|procure|procurar|google|pesquisa)\s+(?:na internet\s+|no google\s+|sobre\s+|por\s+)?(.+)/i);
  if (search) return { action: 'search_web', query: cleanSearchQuery(search[1]) };

  if (/^(?:pesquise|pesquisar|busque|buscar|procure|procurar)\s+(?:na internet|no google)$/i.test(t)) {
    return { action: 'search_web', query: '' };
  }

  if (/(abrir|abra|abre|iniciar|inicie).*(navegador|browser|chrome|edge|firefox)/i.test(lower)) {
    const browser = /firefox/i.test(lower) ? 'firefox' : /edge/i.test(lower) ? 'edge' : /chrome/i.test(lower) ? 'chrome' : 'default';
    return { action: 'open_browser', browser };
  }

  if (/(abrir|abra|abre|iniciar|inicie).*calculadora|\bcalculadora\b|\bcalcular\b/i.test(lower)) return { action: 'open_app', app: 'calculator' };

  const app = lower.match(/(?:abrir|abra|abre|iniciar|inicie)\s+(?:o\s+|a\s+)?(bloco de notas|notepad|explorer|explorador|paint|terminal|powershell|cmd|vscode|visual studio code|chrome|edge|firefox)/i);
  if (app) return { action: 'open_app', app: app[1] };

  // ─── FILE OPERATIONS ───
  let m;
  m = lower.match(/^(?:criar|crie|nova?)\s+(?:pasta|diret[oó]rio|folder)\s+(?:em\s+)?(.+)/i);
  if (m) return { action: 'file', command: 'mkdir', args: [m[1].trim()] };

  m = lower.match(/^(?:renomear|rename)\s+(?:o\s+|a\s+)?(?:arquivo\s+)?(.+?)\s+(?:para|como)\s+(.+)/i);
  if (m) return { action: 'file', command: 'rename', args: [m[1].trim(), m[2].trim()] };

  m = lower.match(/^(?:copiar|copy)\s+(?:o\s+|a\s+)?(?:arquivo\s+)?(.+?)\s+(?:para|to)\s+(.+)/i);
  if (m) return { action: 'file', command: 'copy', args: [m[1].trim(), m[2].trim()] };

  m = lower.match(/^(?:mover|move)\s+(?:o\s+|a\s+)?(?:arquivo\s+)?(.+?)\s+(?:para|to)\s+(.+)/i);
  if (m) return { action: 'file', command: 'move', args: [m[1].trim(), m[2].trim()] };

  m = lower.match(/^(?:listar|list|mostrar)\s+(?:arquivos?|ficheiros?)\s+(?:de|da|em)\s+(.+)/i);
  if (m) return { action: 'file', command: 'list', args: [m[1].trim()] };

  // ─── MEDIA ───
  m = lower.match(/^volume\s+(?:para\s+)?(\d{1,3})\s*%/i);
  if (m) return { action: 'media', command: 'volume', args: [Math.min(100, parseInt(m[1]))] };
  if (/(?:mudo|mutar|silenciar)/i.test(lower)) return { action: 'media', command: 'volume', args: [0] };
  if (/(?:aumentar|subir)\s+volume/i.test(lower)) return { action: 'media', command: 'volume_up', args: [] };
  if (/(?:diminuir|baixar)\s+volume/i.test(lower)) return { action: 'media', command: 'volume_down', args: [] };
  if (/^(?:tocar|play|reproduzir)\s+(?:m[uú]sica|faixa|v[ií]deo)?/i.test(lower)) return { action: 'media', command: 'play', args: [] };
  if (/^(?:pausar|pause)\s+(?:m[uú]sica|faixa)?/i.test(lower)) return { action: 'media', command: 'pause', args: [] };
  if (/(?:pr[oó]xim[ao]|next|avan[cc]ar|seguinte)/i.test(lower)) return { action: 'media', command: 'next', args: [] };
  if (/(?:anterior|previous|voltar)/i.test(lower)) return { action: 'media', command: 'previous', args: [] };
  if (/^(?:parar|stop)\s+(?:m[uú]sica|reprodu[cc][cç][aã]o)?/i.test(lower)) return { action: 'media', command: 'stop', args: [] };

  // ─── SMART HOME ───
  m = lower.match(/^(?:ligar|acender)\s+(?:a\s+)?luz(?:es)?\s+(?:do|da|de|no|na)?\s*([\w\s]+)?/i);
  if (m) return { action: 'smart_home', command: 'light_on', args: [m[1] || 'geral'] };
  m = lower.match(/^(?:desligar|apagar)\s+(?:a\s+)?luz(?:es)?\s+(?:do|da|de|no|na)?\s*([\w\s]+)?/i);
  if (m) return { action: 'smart_home', command: 'light_off', args: [m[1] || 'geral'] };
  m = lower.match(/^(?:temperatura|ar\s+condicionado|ac)\s+(?:para\s+|em\s+)?(\d{1,2})\s*[°º]?c?/i);
  if (m) return { action: 'smart_home', command: 'temperature', args: [Math.min(30, Math.max(16, parseInt(m[1])))] };
  if (/^(?:ligar|ativar)\s+(?:ar\s+condicionado|ac|ar)/i.test(lower)) return { action: 'smart_home', command: 'ac_on', args: [] };
  if (/^(?:desligar|desativar)\s+(?:ar\s+condicionado|ac|ar)/i.test(lower)) return { action: 'smart_home', command: 'ac_off', args: [] };

  // ─── SYSTEM ───
  if (/^(?:capturar|tirar|fazer|capture)\s+(?:screenshot|captura\s+de\s+tela|foto\s+da\s+tela|tela|screenshot)/i.test(lower) || /^screenshot$/i.test(lower)) return { action: 'system', command: 'screenshot', args: [] };
  if (/(?:status|info)\s+(?:do\s+)?sistema/i.test(lower)) return { action: 'system', command: 'system_status', args: [] };
  if (/(?:disco|espa[cc]o)\s+(?:livre|dispon[ií]vel)/i.test(lower)) return { action: 'system', command: 'disk_space', args: [] };
  if (/(?:mem[oó]ria|ram)\s+(?:livre|uso)/i.test(lower)) return { action: 'system', command: 'memory', args: [] };
  if (/(?:processos|process)\s+(?:rodando|ativos)/i.test(lower)) return { action: 'system', command: 'process_list', args: [] };
  if (/(?:bateria|battery)/i.test(lower)) return { action: 'system', command: 'battery', args: [] };
  if (/(?:rede|network|wi-?fi|internet)/i.test(lower)) return { action: 'system', command: 'network', args: [] };
  if (/(?:uptime|tempo\s+de\s+execu[cc][cç][aã]o|h[aá]\s+quanto)/i.test(lower)) return { action: 'system', command: 'uptime', args: [] };

  // ─── CALCULATOR ───
  m = lower.match(/(?:quanto [eé]\s+)?(\d{1,4})\s*%\s+(?:de|do|da)\s+(\d{1,6})/i);
  if (m) {
    const pct = parseInt(m[1]);
    const val = parseInt(m[2]);
    return { action: 'calc', command: 'calc', args: [(pct / 100) * val] };
  }
  m = lower.match(/(?:quanto\s+[eé]\s+|calcule\s+|calcula\s+)?(\d{1,10})\s*(?:mais|\+|menos\s*|subtrai|vezes|x|\*|\/|\u00f7|dividido\s+por)\s*(\d{1,10})/i);
  if (m) {
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    let res = 0;
    if (lower.includes('mais') || lower.includes('+')) res = a + b;
    else if (lower.includes('menos') || lower.includes('subtrai') || lower.includes('-')) res = a - b;
    else if (lower.includes('vezes') || lower.includes('x ') || lower.includes('*')) res = a * b;
    else if (lower.includes('/') || lower.includes('\u00f7') || lower.includes('dividido')) res = b !== 0 ? a / b : 0;
    return { action: 'calc', command: 'calc', args: [res] };
  }

  // ─── TRANSLATE ───
  m = lower.match(/^(?:traduzir|traduz|translate)\s+(?:o\s+|a\s+)?["""]?(.+?)["""]?\s+(?:para|em|in)\s+(.+)/i);
  if (m) return { action: 'translate', command: 'translate', args: [m[1].trim(), m[2].trim()] };
  m = lower.match(/como\s+(?:se\s+)?(?:diz|fala)\s+(.+?)\s+(?:em|in|no)\s+(.+)/i);
  if (m) return { action: 'translate', command: 'translate', args: [m[1].trim(), m[2].trim()] };

  return null;
}

async function runNativeLocalSkill(skill) {
  if (skill.action === 'open_url') {
    openUrlWithSystem(skill.url || 'https://www.google.com');
    return { ok: true, text: `${skill.label || 'Página'} aberta no navegador.`, action: skill.action };
  }
  if (skill.action === 'youtube_search') {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(skill.query || '')}`;
    openUrlWithSystem(url);
    return { ok: true, text: `Abrindo YouTube para: ${skill.query}`, action: skill.action };
  }
  if (skill.action === 'search_web') {
    const url = `https://www.google.com/search?q=${encodeURIComponent(skill.query || '')}`;
    openUrlWithSystem(url);
    return { ok: true, text: `Pesquisa aberta no navegador: ${skill.query}`, action: skill.action };
  }
  if (skill.action === 'open_browser') {
    openUrlWithSystem('https://www.google.com');
    return { ok: true, text: 'Navegador aberto.', action: skill.action };
  }
  if (skill.action === 'open_app') {
    const app = String(skill.app || '').toLowerCase();
    const map = {
      'calculator': process.platform === 'win32' ? 'calc.exe' : 'gnome-calculator',
      'calculadora': process.platform === 'win32' ? 'calc.exe' : 'gnome-calculator',
      'bloco de notas': 'notepad.exe',
      'notepad': 'notepad.exe',
      'explorer': 'explorer.exe',
      'explorador': 'explorer.exe',
      'paint': 'mspaint.exe',
      'terminal': process.platform === 'win32' ? 'wt.exe' : 'x-terminal-emulator',
      'powershell': 'powershell.exe',
      'cmd': 'cmd.exe',
      'vscode': 'code.cmd',
      'visual studio code': 'code.cmd'
    };
    const exe = map[app] || app;
    try {
      const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false, shell: false });
      child.unref();
      return { ok: true, text: `Programa aberto: ${app}.`, action: skill.action };
    } catch (e) {
      return { ok: false, text: `Não consegui abrir ${app}: ${mask(e.message)}`, action: skill.action };
    }
  }

  // ─── NEW ACTIONS ───
  if (skill.action === 'file') {
    const r = runFileOp(skill);
    return { ...r, action: skill.action };
  }
  if (skill.action === 'media') {
    const r = await runMediaOp(skill);
    return { ...r, action: skill.action };
  }
  if (skill.action === 'system') {
    const r = await runSystemOp(skill);
    return { ...r, action: skill.action };
  }
  if (skill.action === 'smart_home') {
    const r = runSmartHomeOp(skill);
    return { ...r, action: skill.action };
  }
  if (skill.action === 'calc') {
    const val = skill.args ? skill.args[0] : null;
    return { ok: true, text: `Resultado: ${val}`, action: skill.action };
  }
  if (skill.action === 'translate') {
    const r = await runTranslateOp(skill);
    return { ...r, action: skill.action };
  }

  return { ok: false, text: 'Skill local não suportada.', action: skill.action };
}

function spawnDetachedSafe(command, args = []) {
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.on('error', (e) => log('spawn.detached.failed', { command, error: mask(e.message) }));
    child.unref();
    return true;
  } catch (e) {
    log('spawn.detached.failed', { command, error: mask(e.message) });
    return false;
  }
}

function openUrlWithSystem(url) {
  if (process.platform === 'win32') return spawnDetachedSafe('cmd', ['/c', 'start', '', url]);
  if (process.platform === 'darwin') return spawnDetachedSafe('open', [url]);
  return spawnDetachedSafe('xdg-open', [url]);
}


function localOpinion(topic = '') {
  const t = String(topic || '').trim();
  if (!t) {
    return 'Minha opinião: vale seguir pelo caminho mais prático, com passos pequenos, validação constante e sem depender de uma única IA. Eu priorizaria o que funciona localmente primeiro, depois conectaria Hermes, OpenClaw e MCP como camadas superiores.';
  }
  return `Minha opinião sobre ${t}: eu analisaria com calma, separando o que é útil agora do que é apenas complexo. Se o objetivo é resultado, eu começaria por uma versão simples, testável e reversível; depois aumentaria a autonomia com segurança.`;
}

async function runLocalSkill(skill = {}, options = {}) {
  if (String(env.LOCAL_TOOLS_ENABLED || 'true').toLowerCase() !== 'true') {
    return { ok: false, text: 'Ferramentas locais estão desabilitadas em Config.', action: skill.action };
  }
  const bypassApproval = options && options.skipApproval === true;
  const sensitiveLocalActions = ['open_url', 'youtube_search', 'search_web', 'open_browser', 'open_app', 'file'];
  if (!bypassApproval && sensitiveLocalActions.includes(String(skill.action || '').toLowerCase())) {
    const gated = ensureApproved('local-tool', skill);
    if (gated) return gated;
  }
  const nativeActions = ['file', 'system', 'media', 'smart_home', 'calc', 'translate'];
  if (nativeActions.includes(skill.action)) {
    // Normalize: ensure skill has cmd and args for the executor
    const execSkill = {
      ...skill,
      cmd: skill.cmd || skill.command,
      args: skill.args || skill.command?.args || [],
    };
    const native = await runNativeLocalSkill(execSkill);
    if (native.ok || !native.requiresApproval) return native;
  }
  if (skill.action === 'learn') {
    const value = String(skill.text || '').trim();
    if (!value) return { ok: false, text: 'Não identifiquei o que devo aprender.', action: skill.action };
    fs.appendFileSync(MEMORY_FILE, `- [${new Date().toISOString()}] Aprendido: ${value}\n`, 'utf8');
    return { ok: true, text: `Aprendido. Vou considerar isso nas próximas respostas: ${value}`, action: skill.action };
  }
  if (skill.action === 'opinion') {
    const topic = String(skill.topic || '').trim();
    return { ok: true, text: localOpinion(topic), action: skill.action };
  }
  if (['open_url', 'youtube_search', 'search_web', 'open_browser'].includes(skill.action)) {
    return runNativeLocalSkill(skill);
  }
  if (skill.action === 'reminder_create') {
    const row = addReminder(skill.task, skill.when);
    return { ok: true, text: `Lembrete agendado: ${row.text} em ${new Date(row.when).toLocaleString('pt-BR')}.`, action: skill.action, reminder: row };
  }
  if (skill.action === 'reminders_list') {
    const rows = listReminders();
    const text = rows.length
      ? 'Lembretes ativos:\n' + rows.slice(0, 10).map(r => `• ${new Date(r.when).toLocaleString('pt-BR')} — ${r.text}`).join('\n')
      : 'Não há lembretes ativos.';
    return { ok: true, text, action: skill.action, reminders: rows };
  }

  const launcher = pythonLauncherArgs();
  if (launcher) {
    const payload = JSON.stringify(skill);
    const result = await new Promise((resolve) => {
      const child = spawn(launcher.exe, launcher.args.concat([payload]), {
        cwd: __dirname,
        windowsHide: true,
        shell: false,
        env: process.env
      });
      let out = '', err = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve({ ok: false, text: 'Tempo limite da ferramenta Python excedido.', action: skill.action });
      }, 12000);
      child.stdout.on('data', d => out += d.toString());
      child.stderr.on('data', d => err += d.toString());
      child.on('close', code => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(out || '{}');
          resolve({ ok: code === 0 && parsed.ok !== false, ...parsed, action: skill.action });
        } catch {
          resolve({ ok: code === 0, text: mask((out || err || '').trim()) || `Python finalizou com código ${code}.`, action: skill.action });
        }
      });
      child.on('error', e => {
        clearTimeout(timer);
        resolve({ ok: false, text: mask(e.message), action: skill.action });
      });
    });
    if (result.ok) return result;
    // fallback nativo quando Python não consegue abrir algo simples
    const native = runNativeLocalSkill(skill);
    return native.ok ? native : result;
  }

  return runNativeLocalSkill(skill);
}


function parseCommandLine(input = '') {
  const out = [];
  const rx = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
  let m;
  while ((m = rx.exec(String(input)))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function localUrlOnly(url = '') {
  try {
    const u = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  } catch {
    return false;
  }
}

async function httpJson(url, payload = null, timeoutMs = 6000, headers = {}) {
  if (!localUrlOnly(url)) throw new Error('Por segurança, o orquestrador só chama URLs locais neste modo.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const options = payload === null
      ? { method: 'GET', signal: controller.signal, headers }
      : { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) };
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { text }; }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}


async function tryLocalJsonEndpoints(baseUrls = [], paths = [], payload = {}, timeoutMs = 6000) {
  const errors = [];
  for (const base of baseUrls.filter(Boolean)) {
    const clean = String(base).replace(/\/$/, '');
    if (!localUrlOnly(clean)) continue;
    for (const p of paths) {
      try {
        const r = await httpJson(clean + p, payload, timeoutMs);
        if (r.ok) return { ...r, baseUrl: clean, path: p };
        errors.push(`${clean}${p} HTTP ${r.status}`);
      } catch (e) {
        errors.push(`${clean}${p}: ${mask(e.message)}`);
      }
    }
  }
  return { ok: false, error: errors.slice(0, 6).join(' | ') || 'Nenhum endpoint local respondeu.' };
}

function defaultHermesUrls() {
  return [
    env.HERMES_URL,
    'http://localhost:8000',
    'http://localhost:8001',
    'http://localhost:8765',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8765'
  ].filter(Boolean);
}

function defaultOpenClawUrls() {
  return [
    env.OPENCLAW_URL,
    'http://localhost:3001',
    'http://localhost:7331',
    'http://localhost:8766',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:7331'
  ].filter(Boolean);
}

async function detectLocalHttpService(urls = []) {
  for (const base of urls.filter(Boolean)) {
    const clean = String(base).replace(/\/$/, '');
    if (!localUrlOnly(clean)) continue;
    for (const p of ['/health', '/status', '/api/health', '/api/status']) {
      try {
        const r = await httpJson(clean + p, null, 1800);
        if (r.ok) return { ok: true, baseUrl: clean, path: p, status: r.status };
      } catch {}
    }
  }
  return { ok: false };
}


function runLocalCommand(commandLine, payloadText, timeoutMs = 30000) {
  const parts = parseCommandLine(commandLine);
  if (!parts.length) return Promise.resolve({ ok: false, text: 'Comando local não configurado.' });
  const safe = safetyCheck(parts.join(' ') + ' ' + payloadText);
  if (!safe.allowed) return Promise.resolve({ ok: false, text: safe.reason });
  return new Promise((resolve) => {
    const child = spawn(parts[0], parts.slice(1).concat(payloadText ? [payloadText] : []), {
      cwd: __dirname,
      windowsHide: true,
      shell: false,
      env: process.env
    });
    let out = '', err = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, text: 'Tempo limite excedido.' });
    }, timeoutMs);
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, text: mask((out || err || '').trim()).slice(0, 8000) });
    });
    child.on('error', e => {
      clearTimeout(timer);
      resolve({ ok: false, text: mask(e.message) });
    });
  });
}

async function hermesInfo() {
  const enabled = String(env.HERMES_ENABLED || 'true').toLowerCase() === 'true';
  const cmdPath = findCmd(['hermes', 'hermes-agent']);
  const http = enabled ? await detectLocalHttpService(defaultHermesUrls()) : { ok: false };
  const version = await execVersion(cmdPath);
  return {
    available: enabled && Boolean(http.ok || cmdPath || env.HERMES_COMMAND),
    enabled,
    url: env.HERMES_URL || (http.ok ? http.baseUrl : ''),
    http: http.ok ? { ok: true, status: http.status, baseUrl: http.baseUrl, healthPath: http.path } : null,
    commandConfigured: Boolean(env.HERMES_COMMAND),
    cliAvailable: Boolean(cmdPath),
    version,
    path: cmdPath
  };
}

async function openclawInfo() {
  const enabled = String(env.OPENCLAW_ENABLED || 'true').toLowerCase() === 'true';
  const cmdPath = findCmd(['openclaw', 'openclaw-cli']);
  const http = enabled ? await detectLocalHttpService(defaultOpenClawUrls()) : { ok: false };
  const version = await execVersion(cmdPath);
  return {
    available: enabled && Boolean(http.ok || cmdPath || env.OPENCLAW_COMMAND),
    enabled,
    url: env.OPENCLAW_URL || (http.ok ? http.baseUrl : ''),
    http: http.ok ? { ok: true, status: http.status, baseUrl: http.baseUrl, healthPath: http.path } : null,
    commandConfigured: Boolean(env.OPENCLAW_COMMAND),
    cliAvailable: Boolean(cmdPath),
    version,
    path: cmdPath
  };
}

function discoverMcpConfigs() {
  const candidates = [
    path.join(__dirname, '.mcp.json'),
    path.join(__dirname, 'mcp.json'),
    path.join(os.homedir(), '.mcp.json'),
    path.join(os.homedir(), '.cursor', 'mcp.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'mcp.json')
  ];
  return candidates.filter(p => fs.existsSync(p)).map(p => {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw);
      const servers = parsed.mcpServers || parsed.servers || parsed;
      return { path: p, servers: Object.keys(servers || {}).slice(0, 50) };
    } catch {
      return { path: p, servers: [], warning: 'Arquivo encontrado, mas não foi possível ler JSON.' };
    }
  });
}

async function mcpInfo() {
  const enabled = String(env.MCP_ENABLED || 'true').toLowerCase() === 'true';
  const url = env.MCP_URL || '';
  let http = null;
  let tools = [];
  if (enabled && url) {
    try {
      const init = await httpJson(url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'JARVIS Local Hub', version: '1.0.8' } } }, 5000, { accept: 'application/json, text/event-stream' });
      const list = await httpJson(url, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 5000, { accept: 'application/json, text/event-stream' });
      http = { ok: init.ok || list.ok, status: list.status || init.status };
      tools = list.data?.result?.tools || list.data?.tools || [];
    } catch (e) {
      http = { ok: false, error: mask(e.message) };
    }
  }
  return { enabled, url, commandConfigured: Boolean(env.MCP_COMMAND), configs: discoverMcpConfigs(), http, tools: tools.slice(0, 25).map(t => ({ name: t.name, description: t.description || '' })) };
}

async function orchestratorStatus() {
  const [hermes, openclaw, mcp] = await Promise.all([hermesInfo(), openclawInfo(), mcpInfo()]);
  return { hermes, openclaw, mcp };
}

async function sendToHermes(command) {
  if (String(env.HERMES_ENABLED || 'true').toLowerCase() !== 'true') return { ok: false, target: 'hermes', text: 'Hermes está desabilitado na configuração.' };
  const safe = safetyCheck(command);
  if (!safe.allowed) return { ok: false, target: 'hermes', text: safe.reason };

  const http = await tryLocalJsonEndpoints(
    defaultHermesUrls(),
    ['/api/task', '/task', '/api/message', '/message', '/run'],
    { task: command, command, message: command, source: 'jarvis-local-hub' },
    60000
  );
  if (http.ok) {
    return { ok: true, target: 'hermes', text: mask(JSON.stringify(http.data)).slice(0, 8000), status: http.status, endpoint: http.baseUrl + http.path };
  }

  if (env.HERMES_COMMAND) {
    const r = await runLocalCommand(env.HERMES_COMMAND, command, 60000);
    return { ...r, target: 'hermes' };
  }
  const cli = findCmd(['hermes', 'hermes-agent']);
  if (cli) {
    const r = await runLocalCommand(`"${cli}"`, command, 60000);
    return { ...r, target: 'hermes' };
  }
  return { ok: false, target: 'hermes', text: 'Hermes não respondeu via HTTP local e CLI não foi encontrado. Configure HERMES_URL ou HERMES_COMMAND em Config.' };
}

async function sendToOpenClaw(command) {
  if (String(env.OPENCLAW_ENABLED || 'true').toLowerCase() !== 'true') return { ok: false, target: 'openclaw', text: 'OpenClaw está desabilitado na configuração.' };
  const safe = safetyCheck(command);
  if (!safe.allowed) return { ok: false, target: 'openclaw', text: safe.reason };

  const http = await tryLocalJsonEndpoints(
    defaultOpenClawUrls(),
    ['/api/command', '/command', '/api/execute', '/execute', '/run'],
    { command, task: command, message: command, source: 'jarvis-local-hub' },
    60000
  );
  if (http.ok) {
    return { ok: true, target: 'openclaw', text: mask(JSON.stringify(http.data)).slice(0, 8000), status: http.status, endpoint: http.baseUrl + http.path };
  }

  if (env.OPENCLAW_COMMAND) {
    const r = await runLocalCommand(env.OPENCLAW_COMMAND, command, 60000);
    return { ...r, target: 'openclaw' };
  }
  const cli = findCmd(['openclaw', 'openclaw-cli']);
  if (cli) {
    const r = await runLocalCommand(`"${cli}"`, command, 60000);
    return { ...r, target: 'openclaw' };
  }
  return { ok: false, target: 'openclaw', text: 'OpenClaw não respondeu via HTTP local e CLI não foi encontrado. Configure OPENCLAW_URL ou OPENCLAW_COMMAND em Config.' };
}

async function callMcpTool(tool, args = {}) {
  if (String(env.MCP_ENABLED || 'true').toLowerCase() !== 'true') return { ok: false, target: 'mcp', text: 'MCP está desabilitado na configuração.' };
  if (!env.MCP_URL) return { ok: false, target: 'mcp', text: 'Nenhum MCP_URL configurado. O JARVIS detecta configs, mas só conecta automaticamente a servidor MCP HTTP local configurado.' };
  const safe = safetyCheck(JSON.stringify({ tool, args }));
  if (!safe.allowed) return { ok: false, target: 'mcp', text: safe.reason };
  try {
    await httpJson(env.MCP_URL, { jsonrpc: '2.0', id: 10, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'JARVIS Local Hub', version: '1.0.8' } } }, 5000, { accept: 'application/json, text/event-stream' });
    const r = await httpJson(env.MCP_URL, { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: tool, arguments: args || {} } }, 60000, { accept: 'application/json, text/event-stream' });
    return { ok: r.ok, target: 'mcp', text: mask(JSON.stringify(r.data)).slice(0, 10000), status: r.status };
  } catch (e) {
    return { ok: false, target: 'mcp', text: mask(e.message) };
  }
}

async function orchestratorCommand(body = {}, options = {}) {
  const target = String(body.target || '').toLowerCase();
  const command = String(body.command || '').trim();
  const tool = String(body.tool || '').trim();
  const args = body.args && typeof body.args === 'object' ? body.args : {};
  if (!options.skipApproval && ['hermes', 'openclaw', 'mcp'].includes(target)) {
    const gated = ensureApproved('orchestrator', { target, command, tool, args });
    if (gated) return gated;
  }
  if (target === 'hermes') return sendToHermes(command);
  if (target === 'openclaw') return sendToOpenClaw(command);
  if (target === 'mcp') return callMcpTool(tool || command, args);
  return { ok: false, target, text: 'Destino inválido. Use hermes, openclaw ou mcp.' };
}


async function codexInfo() {
  const exe = findCmd(['codex']);
  const version = await execVersion(exe);
  return { available: Boolean(exe), enabled: String(env.CODEX_ENABLED || '').toLowerCase() === 'true', version, path: exe };
}

function localPersonality(message, agent) {
  if (agent === 'diagnostic') {
    return 'Diagnóstico local pronto. O núcleo está rodando, a interface web está ativa e os logs estão sendo gravados. Provedor de IA: ' + configuredProvider() + '. Codex é opcional e aparece no painel quando instalado.';
  }
  if (agent === 'memory') return 'Memória local preparada. Posso registrar notas, preferências e contexto no arquivo system/JARVIS-MEMORY.md.';
  if (agent === 'automation') return 'Modo local ativo. Posso abrir navegador, pesquisar na internet, abrir calculadora e programas comuns, além de criar lembretes mesmo sem Hermes, OpenClaw ou API configurada.';
  if (agent === 'developer') return 'Modo desenvolvedor ativo. Posso orientar código localmente; com CODEX_ENABLED=true e Codex CLI instalado, encaminho tarefas de programação para o Codex.';
  return 'Estou online. Posso conversar, registrar memória, diagnosticar o sistema e usar OpenAI, OpenRouter ou Codex quando configurados.';
}

async function callChatProvider(message, history) {
  const provider = configuredProvider();
  if (provider === 'local') return null;
  const isOpenRouter = provider === 'openrouter';
  const key = isOpenRouter ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
  if (!key) return null;
  const baseURL = isOpenRouter ? 'https://openrouter.ai/api/v1' : (env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
  const model = isOpenRouter ? (env.OPENROUTER_MODEL || 'openai/gpt-4o-mini') : (env.OPENAI_MODEL || 'gpt-4o-mini');
  const system = [
    'Você é JARVIS, um assistente local elegante, calmo e prático.',
    'Responda em português quando o usuário falar português.',
    'Seja direto, útil e seguro. Não invente execução local; descreva limites.',
    'Nunca peça ou revele chaves de API.'
  ].join(' ');
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8).flatMap(h => [
      { role: 'user', content: h.user },
      { role: 'assistant', content: h.assistant }
    ]),
    { role: 'user', content: message }
  ];
  const headers = {
    'authorization': `Bearer ${key}`,
    'content-type': 'application/json'
  };
  if (isOpenRouter) {
    headers['HTTP-Referer'] = env.OPENROUTER_SITE_URL || `http://localhost:${PORT}`;
    headers['X-OpenRouter-Title'] = env.OPENROUTER_SITE_NAME || 'JARVIS Local Hub';
  }
  const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.7 })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${provider} HTTP ${response.status}: ${mask(text).slice(0, 500)}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

async function callCodex(message) {
  const info = await codexInfo();
  if (!info.available || !info.enabled) return null;
  const safe = safetyCheck(message);
  if (!safe.allowed) return 'Codex não foi acionado: ' + safe.reason;
  return new Promise((resolve) => {
    const child = spawn(info.path, ['exec', '--skip-git-repo-check', message], {
      cwd: __dirname,
      windowsHide: true,
      shell: false,
      env: process.env
    });
    let out = '', err = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve('Codex excedeu o tempo limite local. A tarefa não foi aplicada.');
    }, Number(env.CODEX_TIMEOUT_MS || 120000));
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', code => {
      clearTimeout(timer);
      const text = (out || err || '').trim();
      log('codex.finished', { code, bytes: text.length });
      resolve(text ? text.slice(0, 6000) : `Codex finalizou com código ${code}.`);
    });
    child.on('error', e => {
      clearTimeout(timer);
      resolve('Codex falhou ao iniciar: ' + e.message);
    });
  });
}

async function handleChat(message) {
  const user = String(message || '').trim();
  const agent = classifyAgent(user);
  const history = loadHistory();
  let text = null;
  let provider = configuredProvider();

  if (/^(hermes|openclaw|mcp)\s*:/i.test(user)) {
    const [, rawTarget, rawCommand] = user.match(/^(hermes|openclaw|mcp)\s*:\s*([\s\S]*)$/i) || [];
    const result = await orchestratorCommand({ target: rawTarget, command: rawCommand, tool: rawCommand });
    text = result.ok
      ? `Orquestrador enviou para ${result.target}: ${result.text || 'comando aceito.'}`
      : `Orquestrador não conseguiu enviar para ${result.target}: ${result.text}`;
    provider = `orchestrator:${String(rawTarget || '').toLowerCase()}`;
  }

  if (!text) {
    const orchVoice = inferOrchestratorVoiceCommand(user);
    if (orchVoice) {
      if (orchVoice.target === 'status') {
        const st = await orchestratorStatus();
        text = `Detecção concluída. Hermes: ${st.hermes.available ? 'ativo' : 'não encontrado'}. OpenClaw: ${st.openclaw.available ? 'ativo' : 'não encontrado'}. MCP: ${st.mcp.available ? 'ativo' : 'não encontrado'}.`;
        provider = 'orchestrator:status';
      } else if (!orchVoice.command) {
        text = `Diga o comando depois do nome do alvo. Exemplo: Jarvis, envie para Hermes: analise esta tarefa.`;
        provider = `orchestrator:${orchVoice.target}`;
      } else {
        const result = await orchestratorCommand({ target: orchVoice.target, command: orchVoice.command, tool: orchVoice.command });
        text = result.ok
          ? `Orquestrador enviou para ${result.target}: ${result.text || 'comando aceito.'}`
          : `Orquestrador não conseguiu enviar para ${result.target}: ${result.text}`;
        provider = `orchestrator:${orchVoice.target}`;
      }
    }
  }

  if (!text) {
    const localSkill = inferLocalSkill(user);
    if (localSkill) {
      const result = await runLocalSkill(localSkill);
      text = result.text || (result.ok ? 'Ação local executada.' : 'Ação local falhou.');
      provider = 'local-tools';
    }
  }

  if (!text && agent === 'developer' && String(env.CODEX_ENABLED || '').toLowerCase() === 'true' && /codex|corrija|implemente|arquivo|repo|c[oó]digo|bug/i.test(user)) {
    text = await callCodex(user);
    provider = text ? 'codex' : provider;
  }

  let providerError = '';
  if (!text) {
    try { text = await callChatProvider(user, history); }
    catch (e) {
      providerError = mask(e.message);
      log('ai.error', { provider, error: providerError });
    }
  }

  if (!text && providerError) {
    text = `A API ${provider} foi detectada, mas a chamada falhou: ${providerError}. Abra Config, confira a chave/modelo e use o botão Testar API.`;
  }
  if (!text) text = localPersonality(user, agent);

  const response = {
    text,
    state: agent === 'diagnostic' ? 'DIAGNOSTIC' : 'SPEAKING',
    emotion: agent === 'developer' ? 'focused' : 'calm',
    confidence: provider === 'local' ? 0.62 : 0.86,
    mode: agent,
    voice: { enabled: true, provider: 'browser', speed: 1.0, bargeIn: true },
    safety: { allowed: true, reason: text && /Aprovação necessária/i.test(text) ? 'Ação aguardando aprovação.' : 'Resposta sem ação sensível.', requiresUserApproval: Boolean(text && /Aprovação necessária/i.test(text)) },
    requiresApproval: Boolean(text && /Aprovação necessária/i.test(text)),
    provider
  };

  history.push({ ts: new Date().toISOString(), user, assistant: text, provider, agent });
  saveHistory(history);
  appendMemory(user, text);
  log('chat', { agent, provider, message: user.slice(0, 120) });
  return response;
}


async function testProvider() {
  const provider = configuredProvider();
  if (provider === 'local') return { ok: false, provider, error: 'Provider está em modo local. Selecione OpenRouter ou OpenAI em Config.' };
  try {
    const text = await callChatProvider('Responda somente: JARVIS API OK', []);
    return { ok: Boolean(text), provider, reply: text || '' };
  } catch (e) {
    return { ok: false, provider, error: mask(e.message) };
  }
}

async function statusPayload() {
  const node = process.version;
  const provider = configuredProvider();
  const [codexRes, orchestratorRes, runtimeRes] = await Promise.allSettled([
    codexInfo(),
    orchestratorStatus(),
    runtimeInfo()
  ]);
  const codex = codexRes.status === 'fulfilled' ? codexRes.value : { available: false, enabled: String(env.CODEX_ENABLED || '').toLowerCase() === 'true', version: null, path: null, error: mask(codexRes.reason?.message || String(codexRes.reason || 'unknown')) };
  const orchestrator = orchestratorRes.status === 'fulfilled' ? orchestratorRes.value : { hermes: { available: false }, openclaw: { available: false }, mcp: { enabled: String(env.MCP_ENABLED || 'true').toLowerCase() === 'true' }, error: mask(orchestratorRes.reason?.message || String(orchestratorRes.reason || 'unknown')) };
  const runtime = runtimeRes.status === 'fulfilled' ? runtimeRes.value : { node: { available: true, version: process.version, path: process.execPath }, npm: { available: false, version: null, path: null }, python: { available: false, version: null, path: null }, error: mask(runtimeRes.reason?.message || String(runtimeRes.reason || 'unknown')) };
  return {
    name: 'JARVIS Local Hub',
    uptimeSec: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    platform: `${os.platform()} ${os.release()}`,
    node,
    runtime,
    ai: provider,
    openai: Boolean(env.OPENAI_API_KEY),
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    codex,
    orchestrator,
    localTools: { enabled: String(env.LOCAL_TOOLS_ENABLED || 'true').toLowerCase() === 'true', pythonBridge: Boolean(pythonLauncherArgs()) },
    approvals: currentApprovals(),
    voice: 'browser SpeechRecognition + speechSynthesis',
    memory: {
      freeGb: Math.round(os.freemem() / 1024 / 1024 / 1024),
      totalGb: Math.round(os.totalmem() / 1024 / 1024 / 1024)
    },
    agents: agentManifest(),
    logs: EVENTS_FILE
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname || '/';

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (req.method === 'GET' && pathname === '/api/local-tools/reminders') return sendJson(res, 200, { ok: true, reminders: listReminders() });

    if (req.method === 'GET' && pathname === '/api/local-tools/reminders/due') return sendJson(res, 200, { ok: true, due: dueReminders() });

    if (req.method === 'POST' && pathname === '/api/local-tools') {
      const body = await readJsonBody(req);
      const result = await runLocalSkill(body || {});
      log('local-tools.command', { action: result.action || body.action, ok: result.ok });
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === 'GET' && pathname === '/api/orchestrator') return sendJson(res, 200, await orchestratorStatus());

    if (req.method === 'GET' && pathname === '/api/approvals') return sendJson(res, 200, { ok: true, approvals: currentApprovals() });

    if (req.method === 'POST' && pathname === '/api/approvals/approve') {
      const body = await readJsonBody(req);
      const approval = consumeApproval(String(body.token || '').trim(), { trust: true });
      if (!approval) return sendJson(res, 404, { ok: false, text: 'Solicitação de aprovação não encontrada ou já consumida.' });
      let result = { ok: true, text: `Ação aprovada: ${approval.label}.`, approval: { scope: approval.scope, kind: approval.kind } };
      if (body.execute !== false) {
        if (approval.kind === 'local-tool') result = await runLocalSkill(approval.payload || {}, { skipApproval: true });
        else if (approval.kind === 'orchestrator') result = await orchestratorCommand(approval.payload || {}, { skipApproval: true });
      }
      return sendJson(res, result.ok ? 200 : 400, { ...result, approval: { token: approval.token, scope: approval.scope, kind: approval.kind, trusted: true } });
    }

    if (req.method === 'POST' && pathname === '/api/orchestrator/command') {
      const body = await readJsonBody(req);
      const result = await orchestratorCommand(body || {});
      log('orchestrator.command', { target: result.target, ok: result.ok, status: result.status });
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === 'GET' && pathname === '/api/status') return sendJson(res, 200, await statusPayload());

    if (req.method === 'GET' && pathname === '/api/config') return sendJson(res, 200, publicConfig());

    if (req.method === 'GET' && pathname === '/api/test-provider') return sendJson(res, 200, await testProvider());

    if (req.method === 'POST' && pathname === '/api/config') {
      const body = await readJsonBody(req);
      const saved = writeEnvConfig(body || {});
      log('config.saved', {
        provider: saved.AI_PROVIDER,
        openai: saved.OPENAI_API_KEY_SET,
        openrouter: saved.OPENROUTER_API_KEY_SET,
        codex: saved.CODEX_ENABLED
      });
      return sendJson(res, 200, { ok: true, config: saved, restartRecommended: false });
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ type: 'event', ts: new Date().toISOString(), event: 'events.connected' })}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/chat') {
      const body = await readJsonBody(req);
      if (!body.message) return sendJson(res, 400, { error: 'Mensagem ausente.' });
      return sendJson(res, 200, await handleChat(body.message));
    }

    if (req.method === 'POST' && pathname === '/api/note') {
      const body = await readJsonBody(req);
      const note = String(body.note || '').trim();
      if (!note) return sendJson(res, 400, { error: 'Nota ausente.' });
      fs.appendFileSync(MEMORY_FILE, `\n## Nota ${new Date().toISOString()}\n${note}\n`, 'utf8');
      log('note.saved', { size: note.length });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/capabilities') {
      const list = getCapabilitiesList();
      return sendJson(res, 200, { ok: true, ...list });
    }

    if (req.method === 'POST' && pathname === '/api/capabilities/query') {
      const body = await readJsonBody(req);
      const results = findActions(body.query || '');
      return sendJson(res, 200, { ok: true, query: body.query, results });
    }

    if (req.method === 'POST' && pathname === '/api/execute') {
      const body = await readJsonBody(req);
      const result = await executeCommand(body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }

    if (req.method === 'GET' && pathname === '/api/tts/voices') {
      return sendJson(res, 200, { ok: true, voices: ttsVoices() });
    }

    if (req.method === 'POST' && pathname === '/api/tts/speak') {
      const body = await readJsonBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { ok: false, error: 'Texto ausente.' });
      const voice = String(body.voice || '');
      const rate = String(body.rate || '');
      try {
        const audio = await ttsSynthesize(text, { voice, rate });
        res.writeHead(200, {
          'content-type': 'audio/mpeg',
          'cache-control': 'no-cache',
          'content-length': audio.length,
        });
        res.end(audio);
      } catch (e) {
        log('tts.error', { error: e.message });
        return sendJson(res, 500, { ok: false, error: 'Falha na síntese de voz: ' + e.message });
      }
      return;
    }

    return serveStatic(req, res, pathname);
  } catch (e) {
    log('server.error', { error: mask(e.message) });
    return sendJson(res, 500, { error: mask(e.message) });
  }
});

function openBrowser(port) {
  if (String(env.AUTO_OPEN_BROWSER || 'false').toLowerCase() !== 'true') return;
  const target = `http://localhost:${port}`;
  const ok = openUrlWithSystem(target);
  if (!ok) log('browser.open.failed', { error: 'spawn failed', target });
}

function tryListen(port, attemptsLeft = 10) {
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log('server.port_busy', { port, message: `Porta ${port} ocupada. Tentando ${port + 1}.` });
      console.log(`Porta ${port} ocupada. Tentando http://localhost:${port + 1}`);
      if (attemptsLeft <= 0) {
        console.error(`Nenhuma porta livre encontrada a partir de ${PORT}. Use Desligar JARVIS.bat ou altere PORT no .env.`);
        process.exitCode = 1;
        return;
      }
      setTimeout(() => tryListen(port + 1, attemptsLeft - 1), 250);
      return;
    }

    log('server.listen_error', { code: err?.code || 'UNKNOWN', error: mask(err?.message || String(err)) });
    console.error('Falha ao iniciar o servidor:', err?.message || err);
    process.exitCode = 1;
  });

  server.listen(port, () => {
    env.PORT = String(port);
    log('server.started', { port, provider: configuredProvider() });
    console.log(`JARVIS Local Hub online: http://localhost:${port}`);
    if (port !== PORT) {
      console.log(`Aviso: a porta ${PORT} estava ocupada. Esta sessão está usando a porta ${port}.`);
    }
    openBrowser(port);
  });
}

tryListen(PORT);
