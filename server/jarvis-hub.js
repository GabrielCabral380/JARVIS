import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import { WebSocketServer } from 'ws';
import si from 'systeminformation';
import { loadPersonality, buildProviderPrompt, cinematicReply } from './personality-engine.js';
import { synthesize as ttsSynthesize, listPreferredVoices, listAllVoices, DEFAULT_VOICE } from './tts.js';
import { findActions, getCapabilitiesList, getAllActions } from './capabilities.js';
import { createReminder, getActiveReminders, cancelReminder, scheduleTask, listScheduledTasks, cancelScheduledTask } from './reminders.js';
import { runAdvancedLocalCommands } from './command-router.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const cfgPath = path.join(ROOT, 'config', 'jarvis.config.json');
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const personality = loadPersonality(ROOT, config);

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'web')));

const PORT = Number(process.env.JARVIS_PORT || config.port || 3030);
const HOST = process.env.JARVIS_HOST || config.host || '127.0.0.1';
const LOG_DIR = path.join(ROOT, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const memoryFile = path.join(LOG_DIR, 'memory.jsonl');
const auditFile = path.join(LOG_DIR, 'audit.jsonl');
const stateDir = path.join(LOG_DIR, 'state-snapshots');
const learningFile = path.join(LOG_DIR, 'learning-state.json');
fs.mkdirSync(stateDir, { recursive: true });
let responseMode = 'cinematic';
const recentCommands = new Map();
const operationalMemory = {
  shortHistory: [],
  lastIntent: 'geral',
  lastSuccessProvider: null,
  lastFailure: null
};
const learningState = {
  totalCommands: 0,
  totalSuccess: 0,
  totalFailures: 0,
  byIntent: {},
  byProvider: {},
  updatedAt: new Date().toISOString()
};
let lastHumanCommandAt = Date.now();
let lastIdleMaintenanceAt = 0;

function normalizeForDedup(text = '') {
  return normalizeCommand(text)
    .replace(/\b(comandante|senhor)\b/g, ' ')
    .replace(/\bgabriel\b/g, ' ')
    .replace(/\bo\s+pai\s+chegou\b/g, 'acorda')
    .replace(/\bta\s+acordado\b/g, 'acorda')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeCommandDedupKey(source, text, idempotencyKey) {
  if (idempotencyKey) return `id:${idempotencyKey}`;
  return normalizeForDedup(text || '');
}

function checkAndStoreRecentCommand(source, text, idempotencyKey, ttlMs = 3500) {
  const key = makeCommandDedupKey(source, text, idempotencyKey);
  const now = Date.now();
  const hit = recentCommands.get(key);
  if (hit && (now - hit.ts) < ttlMs) return { duplicate: true, cached: hit.response };
  return {
    duplicate: false,
    commit(response) {
      recentCommands.set(key, { ts: Date.now(), response });
      if (recentCommands.size > 200) {
        const first = recentCommands.keys().next().value;
        recentCommands.delete(first);
      }
    }
  };
}

function log(file, row) {
  fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8');
}

function buildRuntimeStateSnapshot() {
  return {
    ts: new Date().toISOString(),
    responseMode,
    lastHumanCommandAt,
    recentCommandsCount: recentCommands.size,
    operationalMemory,
    learning: learningWithRates()
  };
}

function sanitizeSnapshotName(raw = '') {
  const v = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return v || `state-${Date.now()}`;
}

function loadLearningState() {
  try {
    if (!fs.existsSync(learningFile)) return;
    const raw = JSON.parse(fs.readFileSync(learningFile, 'utf8'));
    learningState.totalCommands = Number(raw?.totalCommands || 0);
    learningState.totalSuccess = Number(raw?.totalSuccess || 0);
    learningState.totalFailures = Number(raw?.totalFailures || 0);
    learningState.byIntent = (raw?.byIntent && typeof raw.byIntent === 'object') ? raw.byIntent : {};
    learningState.byProvider = (raw?.byProvider && typeof raw.byProvider === 'object') ? raw.byProvider : {};
    learningState.updatedAt = String(raw?.updatedAt || new Date().toISOString());
  } catch (e) {
    log(auditFile, { level: 'learning-load-failed', error: e.message });
  }
}

function persistLearningState() {
  learningState.updatedAt = new Date().toISOString();
  fs.writeFileSync(learningFile, JSON.stringify(learningState, null, 2), 'utf8');
}

function updateLearning({ intent = 'geral', provider = 'unknown', ok = false }) {
  const i = String(intent || 'geral');
  const p = String(provider || 'unknown');
  learningState.totalCommands += 1;
  if (ok) learningState.totalSuccess += 1;
  else learningState.totalFailures += 1;

  if (!learningState.byIntent[i]) learningState.byIntent[i] = { total: 0, success: 0, failure: 0 };
  learningState.byIntent[i].total += 1;
  if (ok) learningState.byIntent[i].success += 1;
  else learningState.byIntent[i].failure += 1;

  if (!learningState.byProvider[p]) learningState.byProvider[p] = { total: 0, success: 0, failure: 0 };
  learningState.byProvider[p].total += 1;
  if (ok) learningState.byProvider[p].success += 1;
  else learningState.byProvider[p].failure += 1;

  try { persistLearningState(); } catch (e) { log(auditFile, { level: 'learning-save-failed', error: e.message }); }
}

function learningWithRates() {
  const providerSuccessRate = Object.fromEntries(
    Object.entries(learningState.byProvider).map(([k, v]) => [k, v.total > 0 ? Number((v.success / v.total).toFixed(4)) : 0])
  );
  const globalSuccessRate = learningState.totalCommands > 0 ? Number((learningState.totalSuccess / learningState.totalCommands).toFixed(4)) : 0;
  return { ...learningState, globalSuccessRate, providerSuccessRate };
}

function buildStateMarkdownReport() {
  const snap = buildRuntimeStateSnapshot();
  const learned = learningWithRates();
  const topProviders = Object.entries(learned.providerSuccessRate)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, rate]) => `- ${name}: ${(rate * 100).toFixed(1)}%`)
    .join('\n') || '- sem dados';

  const recent = (snap.operationalMemory?.shortHistory || [])
    .slice(-6)
    .map(e => `- ${new Date(e.ts).toISOString()} | intent=${e.intent} | provider=${e.provider} | outcome=${e.outcome}`)
    .join('\n') || '- sem histórico recente';

  return [
    '# Relatório Executivo de Estado (JARVIS)',
    '',
    `- Timestamp: ${snap.ts}`,
    `- Modo de resposta: ${snap.responseMode}`,
    `- Última intenção: ${snap.operationalMemory?.lastIntent || 'geral'}`,
    `- Último provider com sucesso: ${snap.operationalMemory?.lastSuccessProvider || 'nenhum'}`,
    `- Taxa de sucesso global (aprendizado): ${(learned.globalSuccessRate * 100).toFixed(1)}%`,
    '',
    '## Aprendizado por provider (top)',
    topProviders,
    '',
    '## Histórico operacional recente',
    recent,
    ''
  ].join('\n');
}

async function runIdleMaintenance() {
  const idleMs = Date.now() - lastHumanCommandAt;
  if (idleMs < (15 * 60 * 1000)) return;
  if ((Date.now() - lastIdleMaintenanceAt) < (45 * 60 * 1000)) return;

  lastIdleMaintenanceAt = Date.now();
  const maintenance = {
    idleMinutes: Math.round(idleMs / 60000),
    actions: []
  };

  try {
    const ollamaReady = await ensureOllamaReady();
    maintenance.actions.push({ action: 'ensureOllamaReady', ok: Boolean(ollamaReady) });
  } catch (e) {
    maintenance.actions.push({ action: 'ensureOllamaReady', ok: false, error: e.message });
  }

  try {
    const providers = await providerStatus();
    maintenance.actions.push({ action: 'providerStatus', ok: true, providers });
  } catch (e) {
    maintenance.actions.push({ action: 'providerStatus', ok: false, error: e.message });
  }

  try {
    const cleanupLogs = path.join(ROOT, 'logs');
    const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const f of fs.readdirSync(cleanupLogs)) {
      const full = path.join(cleanupLogs, f);
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoff && /\.(log|jsonl|txt)$/i.test(f)) {
        fs.unlinkSync(full);
        removed++;
      }
    }
    maintenance.actions.push({ action: 'cleanupOldLogs', ok: true, removed });
  } catch (e) {
    maintenance.actions.push({ action: 'cleanupOldLogs', ok: false, error: e.message });
  }

  log(auditFile, { level: 'idle-maintenance', ...maintenance });
  broadcast('maintenance', maintenance);
}

function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, ts: new Date().toISOString(), ...payload });
  for (const client of wss.clients) {
    try { if (client.readyState === 1) client.send(message); } catch {}
  }
}

function existsOnPath(cmd) {
  return new Promise(resolve => {
    if (!cmd) return resolve(false);
    try {
      if (fs.existsSync(cmd)) return resolve(true);
    } catch {}
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFile(probe, [cmd], { timeout: 4000, windowsHide: true }, err => resolve(!err));
  });
}

function hasDangerousIntent(text = '') {
  const t = text.toLowerCase();
  return config.security.dangerousKeywords.some(k => t.includes(k));
}

function requiresToolPermissionConfirmation(text = '') {
  const perms = config?.security?.toolPermissions || {};
  const c = normalizeCommand(text);

  if (!c) return false;

  if ((c.includes('apresentacao para o gerente') || c.includes('apresentação para o gerente')) && perms.runPresentationDemo === true) {
    return true;
  }

  const desktopIntent = (
    /(abrir|abre|fechar|fecha)\s+/.test(c) ||
    c.includes('site') ||
    c.includes('pesquise') ||
    c.includes('procure') ||
    c.includes('busque')
  );

  if (desktopIntent && perms.desktopControl === true) {
    return true;
  }

  return false;
}

function runProcess(command, args = [], input = '', timeoutMs = 120000, shell = true) {
  return new Promise(resolve => {
    const child = spawn(command, args, { shell, cwd: ROOT, windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, stdout: stdout.trim(), stderr: 'timeout' });
    }, timeoutMs);
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, stdout: stdout.trim(), stderr: e.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    if (input) { child.stdin.write(input); child.stdin.end(); }
  });
}

function runCliProcess(command, args = [], timeoutMs = 120000) {
  return new Promise(resolve => {
    const isCmdFile = String(command).toLowerCase().endsWith('.cmd');
    const isBatFile = String(command).toLowerCase().endsWith('.bat');
    const needsCmdExe = isCmdFile || isBatFile;
    
    let spawnCmd, spawnArgs;
    if (needsCmdExe) {
      spawnCmd = 'cmd.exe';
      spawnArgs = ['/C', command, ...args];
    } else {
      spawnCmd = command;
      spawnArgs = args;
    }
    
    const child = spawn(spawnCmd, spawnArgs, { shell: false, cwd: ROOT, windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ ok: false, stdout: stdout.trim(), stderr: 'timeout' });
    }, timeoutMs);
    child.stdout?.on('data', d => stdout += d.toString());
    child.stderr?.on('data', d => stderr += d.toString());
    child.on('error', e => { clearTimeout(timer); resolve({ ok: false, stdout: stdout.trim(), stderr: e.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    try { child.stdin?.end(); } catch {}
  });
}

function stripHermesSessionMeta(text = '') {
  return String(text)
    .split('\n')
    .filter(line => {
      const t = String(line || '').trim();
      if (!t) return false;
      if (t.startsWith('session_id:')) return false;
      if (t.startsWith('⚠ No auxiliary LLM provider configured')) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function normalizeHostText(text = '') {
  return String(text || '')
    .replace(/vers\u00e3o|vers.o|vers�o/gi, 'versão')
    .replace(/\s+/g, ' ')
    .trim();
}

async function pingOllama(base, timeoutMs = 2500) {
  try {
    const r = await fetch(`${base}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureOllamaReady() {
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  if (await pingOllama(ollamaBase, 2200)) return true;

  const sys = getSystemIdentitySync();
  if (!(process.platform === 'win32' || sys.isWsl)) return false;

  const cmd = [
    "$paths=@('C:\\Users\\Usuario\\AppData\\Local\\Programs\\Ollama\\ollama app.exe','C:\\Users\\Usuario\\AppData\\Local\\Programs\\Ollama\\Ollama.exe');",
    "foreach($p in $paths){ if(Test-Path $p){ Start-Process -FilePath $p -WindowStyle Minimized; break } }"
  ].join(' ');

  await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], '', 7000);

  for (let i = 0; i < 8; i++) {
    if (await pingOllama(ollamaBase, 2500)) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

async function providerStatus() {
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const ollama = await pingOllama(ollamaBase, 2500);

  const codexCmd = config.providers.codexCommand;
  const claudeCmd = config.providers.claudeCommand;
  const hermesCmd = config.providers.hermesCommand;
  const openclawCmd = config.providers.openclawCommand;

  // Resolve caminhos relativos ao ROOT do projeto
  const resolveCmd = (cmd) => {
    if (!cmd) return cmd;
    if (path.isAbsolute(cmd)) return cmd;
    return path.join(ROOT, cmd);
  };

  const hermesCmdResolved = resolveCmd(hermesCmd);
  const openclawCmdResolved = resolveCmd(openclawCmd);
  const codexCmdResolved = codexCmd ? resolveCmd(codexCmd) : '';
  const claudeCmdResolved = claudeCmd ? resolveCmd(claudeCmd) : '';

  const codexExists = codexCmdResolved ? await existsOnPath(codexCmdResolved) : false;
  const claudeExists = claudeCmdResolved ? await existsOnPath(claudeCmdResolved) : false;
  const hermesExists = await existsOnPath(hermesCmdResolved);
  const openclawExists = await existsOnPath(openclawCmdResolved);

  let codex = false;
  let claude = false;
  let hermes = false;
  let openclaw = false;

  if (codexExists) {
    const r = await runCliProcess(codexCmdResolved, ['--version'], 5000);
    codex = Boolean(r.ok && (r.stdout || r.stderr));
  }

  if (claudeExists) {
    const r = await runCliProcess(claudeCmdResolved, ['--version'], 5000);
    claude = Boolean(r.ok && (r.stdout || r.stderr));
  }

  if (hermesExists) {
    const r = await runCliProcess(hermesCmdResolved, ['--version'], 5000);
    hermes = Boolean(r.ok && (r.stdout || r.stderr));
  }
  if (openclawExists) {
    const r = await runCliProcess(openclawCmdResolved, ['--version'], 7000);
    openclaw = Boolean(r.ok && (r.stdout || r.stderr));
  }

  const claudeCode = Boolean(claude || codex || ollama);
  return { ollama, codex, claude, hermes, openclaw, claudeCode };
}

async function ensureAgentsReady() {
  const p = config.providers || {};
  const attempts = [];

  if (p.codexCommand && await existsOnPath(p.codexCommand)) {
    const r = await runCliProcess(p.codexCommand, ['--version'], 5000);
    attempts.push({ agent: 'codex', ok: Boolean(r.ok), out: (r.stdout || r.stderr || '').slice(0, 180) });
  } else {
    attempts.push({ agent: 'codex', ok: false, out: 'comando não encontrado no PATH' });
  }

  if (p.claudeCommand && await existsOnPath(p.claudeCommand)) {
    const r = await runCliProcess(p.claudeCommand, ['--version'], 5000);
    attempts.push({ agent: 'claude', ok: Boolean(r.ok), out: (r.stdout || r.stderr || '').slice(0, 180) });
  } else {
    attempts.push({ agent: 'claude', ok: false, out: 'comando não encontrado no PATH' });
  }

  if (p.hermesCommand && await existsOnPath(p.hermesCommand)) {
    const r = await runCliProcess(p.hermesCommand, ['--version'], 5000);
    attempts.push({ agent: 'hermes', ok: Boolean(r.ok), out: (r.stdout || r.stderr || '').slice(0, 180) });
  } else {
    attempts.push({ agent: 'hermes', ok: false, out: 'comando não encontrado no PATH' });
  }

  if (p.openclawCommand && await existsOnPath(p.openclawCommand)) {
    const r = await runCliProcess(p.openclawCommand, ['--version'], 7000);
    attempts.push({ agent: 'openclaw', ok: Boolean(r.ok), out: (r.stdout || r.stderr || '').slice(0, 180) });
  } else {
    attempts.push({ agent: 'openclaw', ok: false, out: 'comando não encontrado no PATH' });
  }

  log(auditFile, { level: 'startup-agents', attempts });
  return attempts;
}

function getSystemIdentitySync() {
  const net = os.networkInterfaces?.() || {};
  const ips = Object.values(net)
    .flat()
    .filter(Boolean)
    .filter((n) => n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  const procVersion = (() => { try { return fs.readFileSync('/proc/version', 'utf8'); } catch { return ''; } })();
  const isWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP || /microsoft/i.test(procVersion));

  return {
    isWsl,
    os: process.platform,
    hostname: os.hostname(),
    hostIp: ips[0] || '127.0.0.1',
    ips
  };
}

async function getWindowsHostInfo() {
  const out = { windowsDetected: false, windowsVersion: null, windowsHostname: null };
  const base = getSystemIdentitySync();
  if (!base.isWsl) return out;

  const [ver, host] = await Promise.all([
    runProcess('cmd.exe', ['/c', 'ver'], '', 3000),
    runProcess('cmd.exe', ['/c', 'hostname'], '', 3000)
  ]);
  out.windowsDetected = true;
  out.windowsVersion = ver.ok ? normalizeHostText(ver.stdout || '') : 'Windows host detectado via WSL';
  out.windowsHostname = host.ok ? String(host.stdout || '').trim() : null;
  return out;
}

async function getTelemetry() {
  try {
    const [cpuLoad, mem, fsSize, net, graphics, osInfo] = await Promise.all([
      si.currentLoad(), si.mem(), si.fsSize(), si.networkStats(), si.graphics(), si.osInfo()
    ]);
    const disk = fsSize?.[0] || {};
    const gpu = graphics?.controllers?.[0] || {};
    const net0 = net?.[0] || {};

    let osLabel = `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`;
    const procVersion = (() => { try { return fs.readFileSync('/proc/version', 'utf8'); } catch { return ''; } })();
    const isWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP || /microsoft/i.test(procVersion));
    if (isWsl) {
      const winVer = await runProcess('cmd.exe', ['/c', 'ver'], '', 3000);
      if (winVer.ok && winVer.stdout) {
        osLabel = `Windows Host (${winVer.stdout.replace(/\s+/g, ' ').trim()})`;
      } else {
        osLabel = 'Windows Host (via WSL)';
      }
    }

    return {
      cpu: Math.round(cpuLoad.currentLoad || 0),
      memory: Math.round((mem.used / mem.total) * 100),
      memoryUsedGb: +(mem.used / 1024 / 1024 / 1024).toFixed(1),
      memoryTotalGb: +(mem.total / 1024 / 1024 / 1024).toFixed(1),
      disk: Math.round(disk.use || 0),
      networkRx: Math.round((net0.rx_sec || 0) / 1024),
      networkTx: Math.round((net0.tx_sec || 0) / 1024),
      gpu: gpu.model || 'GPU não detectada',
      os: osLabel,
      uptime: os.uptime()
    };
  } catch (e) {
    return { cpu: 0, memory: 0, disk: 0, networkRx: 0, networkTx: 0, gpu: 'Indisponível', os: os.type(), error: e.message };
  }
}

async function getActiveWindowAndDevices() {
  const fallback = {
    activeWindow: { title: null, process: null },
    microphone: { available: null, okCount: 0, totalCount: 0 },
    camera: { available: null, okCount: 0, totalCount: 0 }
  };

  const sys = getSystemIdentitySync();
  if (!(process.platform === 'win32' || sys.isWsl)) return fallback;

  const psScript = String.raw`
try {
  $sig = @"
using System;
using System.Runtime.InteropServices;
public static class WinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
  Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue | Out-Null

  $h = [WinApi]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 1024
  [void][WinApi]::GetWindowText($h, $sb, $sb.Capacity)
  $pid = 0
  [void][WinApi]::GetWindowThreadProcessId($h, [ref]$pid)
  $proc = $null
  if ($pid -gt 0) { $proc = (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName }

  $mics = @(Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Microfone|Microphone' })
  $cams = @(Get-PnpDevice -Class Camera -ErrorAction SilentlyContinue)

  [PSCustomObject]@{
    activeWindow = [PSCustomObject]@{ title = $sb.ToString(); process = $proc }
    microphone = [PSCustomObject]@{
      available = ($mics.Count -gt 0)
      okCount = @($mics | Where-Object { $_.Status -eq 'OK' }).Count
      totalCount = $mics.Count
    }
    camera = [PSCustomObject]@{
      available = ($cams.Count -gt 0)
      okCount = @($cams | Where-Object { $_.Status -eq 'OK' }).Count
      totalCount = $cams.Count
    }
  } | ConvertTo-Json -Compress -Depth 4
} catch {
  [PSCustomObject]@{
    activeWindow = [PSCustomObject]@{ title = $null; process = $null }
    microphone = [PSCustomObject]@{ available = $null; okCount = 0; totalCount = 0 }
    camera = [PSCustomObject]@{ available = $null; okCount = 0; totalCount = 0 }
  } | ConvertTo-Json -Compress -Depth 4
}`;

  const r = await runProcess('powershell.exe', ['-NoProfile', '-Command', psScript], '', 7000);
  if (!r.ok || !r.stdout) return fallback;
  try {
    const parsed = JSON.parse(String(r.stdout).trim());
    return {
      activeWindow: parsed?.activeWindow || fallback.activeWindow,
      microphone: parsed?.microphone || fallback.microphone,
      camera: parsed?.camera || fallback.camera
    };
  } catch {
    return fallback;
  }
}

async function getNetworkStatus() {
  try {
    const r = await fetch('https://www.msftconnecttest.com/connecttest.txt', {
      method: 'GET',
      signal: AbortSignal.timeout(2500)
    });
    return { online: r.ok, method: 'http-probe' };
  } catch {
    return { online: false, method: 'http-probe' };
  }
}

async function getAllowedRunningProcesses() {
  const sys = getSystemIdentitySync();
  if (!(process.platform === 'win32' || sys.isWsl)) return [];

  const allowed = Object.entries(config?.desktop?.allowedApps || {}).map(([name, exe]) => ({
    name,
    exe: String(exe || '').replace(/\.exe$/i, '').toLowerCase()
  }));
  if (!allowed.length) return [];

  const r = await runProcess('cmd.exe', ['/c', 'tasklist /FO CSV /NH'], '', 6000);
  if (!r.ok || !r.stdout) return [];

  const lines = String(r.stdout).split('\n').map(s => s.trim()).filter(Boolean);
  const matched = [];
  for (const line of lines) {
    const clean = line.replace(/^"|"$/g, '');
    const parts = clean.split('","');
    const image = String(parts[0] || '').replace(/\.exe$/i, '').toLowerCase();
    const alias = allowed.find(a => a.exe && image.includes(a.exe));
    if (alias) matched.push({ alias: alias.name, process: parts[0] || alias.exe });
  }

  const uniq = new Map();
  for (const it of matched) uniq.set(`${it.alias}:${it.process}`, it);
  return Array.from(uniq.values()).slice(0, 20);
}

async function routeToProvider(text, forcedChain = null) {
  const p = config.providers;
  const safeText = String(text || '');
  const t = normalizeCommand(safeText);

  // Detecta se o usuário forçou um provider específico ("usar hermes", "usar openclaw")
  const isForcedChain = (() => {
    if (Array.isArray(forcedChain) && forcedChain.length) return true;
    if (t.includes('use openclaw') || t.includes('usar openclaw') || t.includes('comando openclaw')) return true;
    if (t.includes('use hermes') || t.includes('usar hermes') || t.includes('comando hermes')) return true;
    if (t.includes('use codex') || t.includes('usar codex') || t.includes('comando codex')) return true;
    return false;
  })();

  // Prompt mínimo para comandos simples (evita LLM demorar 60s+ no USB)
  const isSimpleCommand = safeText.length < 30 || /^(responda|ok|teste|sim|não|nao)$/i.test(safeText.trim());
  const prompt = isSimpleCommand
    ? safeText
    : `${buildProviderPrompt(personality, safeText)}\n\n${responseModeInstruction()}`;

  // Chain padrão: OpenClaw e Hermes ANTES do Ollama (E2E correto)
  let chain = Array.isArray(forcedChain) && forcedChain.length
    ? [...forcedChain]
    : [...(p.priority || ['openclaw', 'hermes', 'ollama'])];

  // Reordena conforme intenção detectada (inclusive quando forçado)
  if (t.includes('use openclaw') || t.includes('usar openclaw') || t.includes('comando openclaw')) {
    chain = ['openclaw'];
  } else if (t.includes('use hermes') || t.includes('usar hermes') || t.includes('comando hermes')) {
    chain = ['hermes'];
  } else if (t.includes('use claude') || t.includes('usar claude') || t.includes('claude code')) {
    chain = ['hermes', 'openclaw', 'ollama', 'codex', 'claude'];
  } else if (t.includes('use codex') || t.includes('usar codex') || t.includes('comando codex')) {
    chain = ['codex'];
  } else if (!isForcedChain) {
    // Só reordena por palavras-chave genéricas se NÃO for chain forçado
    if (t.includes('openclaw')) {
      chain = ['openclaw', 'hermes', 'ollama'];
    } else if (t.includes('hermes')) {
      chain = ['hermes', 'openclaw', 'ollama'];
    } else if (t.includes('codex')) {
      chain = ['codex', 'hermes', 'ollama'];
    } else if (/(programa|codigo|código|python|javascript|sql|banco de dados|api|sistema)/.test(t)) {
      chain = ['hermes', 'openclaw', 'codex', 'ollama', 'claude'];
    } else if (t.includes('pesquise') || t.includes('pesquisar') || t.includes('procure') || t.includes('buscar') || t.includes('internet')) {
      chain = ['hermes', 'openclaw', 'codex', 'ollama', 'claude'];
    }
  }

  // Regra dura: sempre ter ollama na cadeia de fallback (por último)
  // Mas só adiciona se NÃO for chain forçado (isForcedChain)
  if (!isForcedChain && !chain.includes('ollama')) chain.push('ollama');

  for (const provider of chain) {
    try {
      if (provider === 'ollama') {
        broadcast('provider', { provider, status: 'executing' });
        const base = process.env.JARVIS_PROXY_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'; // Usa proxy local se disponível
        const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
        await ensureOllamaReady();
        const r = await fetch(`${base}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.15, num_predict: 80 } }),
          signal: AbortSignal.timeout(55000)
        });
        if (r.ok) {
          const data = await r.json();
          const out = String(data?.response || '').trim();
          if (out) return { provider, text: out };
        }
      }
      if (provider === 'claude' && p.claudeCommand && await existsOnPath(p.claudeCommand)) {
        broadcast('provider', { provider, status: 'executing' });
        const claudeArgs = Array.isArray(p.claudeArgs) && p.claudeArgs.length ? [...p.claudeArgs] : ['-p'];
        const r = await runCliProcess(p.claudeCommand, [...claudeArgs, prompt], 55000);
        const out = String(r.stdout || '').trim();
        if (r.ok && out) {
          const cleaned = out
            .split('\n')
            .map(s => s.trimEnd())
            .filter(Boolean)
            .join('\n')
            .trim();
          return { provider, text: cleaned };
        }
      }
      if (provider === 'codex' && p.codexCommand && await existsOnPath(p.codexCommand)) {
        broadcast('provider', { provider, status: 'executing' });
        const codexArgs = Array.isArray(p.codexArgs) && p.codexArgs.length ? [...p.codexArgs] : ['exec', '--skip-git-repo-check'];
        const r = await runCliProcess(p.codexCommand, [...codexArgs, prompt], 55000);
        const out = String(r.stdout || '').trim();
        if (r.ok && out) {
          const cleaned = out
            .split('\n')
            .map(s => s.trimEnd())
            .filter(Boolean)
            .join('\n')
            .trim();
          return { provider, text: cleaned };
        }
      }
      if (provider === 'hermes' && await existsOnPath(p.hermesCommand)) {
        broadcast('provider', { provider, status: 'executing' });
        // Tenta via CLI primeiro (hermes chat -Q -q "prompt")
        try {
          const hermesCliArgs = Array.isArray(p.hermesArgs) && p.hermesArgs.length
            ? [...p.hermesArgs, prompt]
            : ['chat', '-Q', '-q', prompt];
          const r2 = await runCliProcess(p.hermesCommand, hermesCliArgs, 55000);
          const cleaned = stripHermesSessionMeta(r2.stdout || '');
          if (r2.ok && cleaned) return { provider: 'hermes', text: cleaned };
        } catch (e) {
          log(auditFile, { level: 'warn', provider: 'hermes-cli', error: e.message });
        }
        // Fallback: Ollama direto (se o CLI do Hermes falhar)
        try {
          const hermesBase = process.env.JARVIS_PROXY_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'; // Usa proxy local se disponível
          const hermesModel = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
          await ensureOllamaReady();
          const r = await fetch(`${hermesBase}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: hermesModel, prompt, stream: false, options: { temperature: 0.15, num_predict: 220 } }),
            signal: AbortSignal.timeout(55000)
          });
          if (r.ok) {
            const data = await r.json();
            const out = String(data?.response || '').trim();
            if (out) return { provider: 'hermes', text: out };
          }
        } catch (e) {
          log(auditFile, { level: 'warn', provider: 'hermes-ollama-fallback', error: e.message });
        }
      }
      if (provider === 'openclaw' && await existsOnPath(p.openclawCommand)) {
        broadcast('provider', { provider, status: 'executing' });
        // OpenClaw shim: chama Ollama diretamente (shim faz Invoke-RestMethod para /api/generate)
        const ocBase = process.env.JARVIS_PROXY_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'; // Usa proxy local se disponível
        const ocModel = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
        try {
          await ensureOllamaReady();
          const r = await fetch(`${ocBase}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ocModel, prompt, stream: false, options: { temperature: 0.15, num_predict: 220 } }),
            signal: AbortSignal.timeout(55000)
          });
          if (r.ok) {
            const data = await r.json();
            const out = String(data?.response || '').trim();
            if (out) {
              // OpenClaw shim retorna JSON quando --json está nos args
              try {
                const parsed = JSON.parse(out);
                const textOut = parsed?.reply || parsed?.text || parsed?.message || out;
                return { provider, text: String(textOut).trim() };
              } catch {
                return { provider, text: out };
              }
            }
          }
        } catch (e) {
          log(auditFile, { level: 'warn', provider: 'openclaw', error: e.message });
        }
        // Fallback: tenta via CLI shim
        try {
          const r2 = await runCliProcess(p.openclawCommand, [...p.openclawArgs, prompt, '--json'], 55000);
          if (r2.ok && r2.stdout) {
            try {
              const parsed = JSON.parse(r2.stdout);
              const textOut = parsed?.reply || parsed?.text || parsed?.message || r2.stdout;
              if (textOut) return { provider, text: String(textOut).trim() };
            } catch {
              return { provider, text: r2.stdout };
            }
          }
        } catch (e) {
          log(auditFile, { level: 'warn', provider: 'openclaw-cli-fallback', error: e.message });
        }
      }
    } catch (e) {
      log(auditFile, { level: 'warn', provider, error: e.message });
    }
  }

  // Última garantia: tentativa final de Ollama mesmo após falha geral
  try {
    const base = process.env.JARVIS_PROXY_URL || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'; // Usa proxy local se disponível
    const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
    const ready = await ensureOllamaReady();
    if (ready) {
      const rr = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.1, num_predict: 90 } }),
        signal: AbortSignal.timeout(32000)
      });
      if (rr.ok) {
        const dd = await rr.json();
        const out = String(dd?.response || '').trim();
        if (out) return { provider: 'ollama', text: out };
      }
    }
  } catch (e) {
    log(auditFile, { level: 'warn', provider: 'ollama-final-rescue', error: e.message });
  }

  return { provider: 'unavailable', text: 'Falha: nenhum provider respondeu no tempo esperado. Ollama não ficou disponível no momento.' };
}

function normalizeCommand(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function inferIntent(text = '') {
  const t = normalizeCommand(text);
  if (/(escutar|ouvir|tocar|reproduzir|play|youtube|musica)/.test(t)) return 'midia';
  if (/(abrir|clicar|preencher|navegador|site|whatsapp|windows|aplicativo)/.test(t)) return 'automacao';
  if (/(diagnostico|status|erro|corrigir|debug|causa raiz)/.test(t)) return 'diagnostico';
  if (/(planejar|orquestrar|agente|workflow)/.test(t)) return 'orquestracao';
  return 'geral';
}

function rememberOperationalEvent(entry) {
  operationalMemory.shortHistory.push({ ts: Date.now(), ...entry });
  if (operationalMemory.shortHistory.length > 8) operationalMemory.shortHistory.shift();
}

function buildOperationalPrompt(text) {
  const intent = inferIntent(text);
  operationalMemory.lastIntent = intent;
  const last = operationalMemory.shortHistory.slice(-3).map(x => `${x.intent}:${x.outcome}`).join(' | ') || 'sem histórico';
  return { intent, last };
}

function isVoiceEchoOrNoise(text = '') {
  const t = normalizeCommand(text).trim();
  if (!t) return true;
  if (t.length < 3) return true;
  if (/^(muito|ok|aham|uhum|sim|nao|não)$/i.test(t)) return true;
  if (/^(estou ouvindo e pronto para executar|se quiser ja me diga a proxima acao)$/i.test(t)) return true;
  return false;
}

function hasWakeWord(text = '') {
  const t = normalizeCommand(text);
  const wakeWords = Array.isArray(config?.wakeWords) ? config.wakeWords : ['jarvis', 'ei jarvis', 'ok jarvis', 'jarvis os'];
  return wakeWords.some((w) => {
    const wn = normalizeCommand(w).trim();
    if (!wn) return false;
    return t.includes(wn);
  });
}

async function executeWithOperationalLoop(text, forcedChain = null) {
  const { intent, last } = buildOperationalPrompt(text);
  const planned = `${text}\n\nContexto interno: intenção=${intent}; histórico=${last}. Responda sem repetir contexto interno.`;
  const normalizeTxt = normalizeCommand(text);

  // Rescue chain: detecta se usuário forçou provider e inclui backup
  const isForcedRescue = normalizeTxt.includes('usar hermes') || normalizeTxt.includes('usar openclaw') ||
    normalizeTxt.includes('use hermes') || normalizeTxt.includes('use openclaw');

  let routed = await routeToProvider(planned, forcedChain);

  const failed = !routed?.text || /falha: nenhum provider respondeu/i.test(String(routed.text));
  if (failed) {
    await ensureOllamaReady();
    const rescueChain = forcedChain || (isForcedRescue
      ? ['hermes', 'openclaw', 'ollama']
      : ['openclaw', 'hermes', 'ollama', 'codex']);
    routed = await routeToProvider(`${planned}\n\nTente uma alternativa direta e curta.`, rescueChain);
  }

  const ok = Boolean(routed?.text) && !/falha: nenhum provider respondeu/i.test(String(routed.text));
  rememberOperationalEvent({ intent, provider: routed?.provider || 'none', outcome: ok ? 'ok' : 'fail' });
  operationalMemory.lastSuccessProvider = ok ? routed?.provider : operationalMemory.lastSuccessProvider;
  operationalMemory.lastFailure = ok ? null : (routed?.text || 'sem resposta');
  return routed;
}

function responseModeInstruction() {
  const mode = normalizeCommand(responseMode);
  if (mode.includes('tecnico')) return 'Modo de resposta ATUAL: técnico objetivo. Priorize precisão, passos curtos e termos técnicos.';
  if (mode.includes('executivo')) return 'Modo de resposta ATUAL: executivo. Priorize síntese, decisão e impacto em linguagem simples.';
  if (mode.includes('kit') || mode.includes('infuser')) return 'Modo de resposta ATUAL: automação estilo JARVIS Kit. Foco em ação imediata, confirmação curta e energia alta.';
  return 'Modo de resposta ATUAL: cinematográfico equilibrado (padrão).';
}

function sanitizeAssistantText(text) {
  let t = String(text || '').trim();
  if (!t) return t;
  t = t.replace(/\bComandante\b/gi, 'Gabriel');
  t = t.replace(/esta e a forma mais adequada e eficaz[^\n]*/gi, '').trim();
  t = t.replace(/sem entrar em discussoes sobre politica ou privacidade\.?/gi, '').trim();
  t = t.replace(/regras de saida obrigatorias:[\s\S]*$/i, '').trim();
  t = t.replace(/comando do usuario:[\s\S]*$/i, '').trim();
  t = t.replace(/\*\*observacao:\*\*[\s\S]*$/i, '').trim();
  t = t.replace(/modo operacional ativo\.?/gi, '').trim();
  t = t.replace(/intencao detectada:[^\n]*/gi, '').trim();
  return t || 'Certo, Gabriel.';
}

async function openAllowedApp(appName) {
  const key = normalizeCommand(appName).trim();
  const allowed = config.desktop.allowedApps;
  const exe = allowed[key] || allowed[Object.keys(allowed).find(k => key.includes(k))];
  if (!exe) return { ok: false, stderr: `Aplicativo não permitido: ${appName}` };

  const sys = getSystemIdentitySync();
  if (process.platform === 'win32' || sys.isWsl) {
    const candidates = {
      chrome: ['chrome', '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', '"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"'],
      edge: ['msedge', '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"', '"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"'],
      vscode: ['code', '"C:\\Users\\Usuario\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"'],
      notepad: ['notepad.exe'],
      explorer: ['explorer.exe'],
      terminal: ['wt.exe', 'powershell.exe'],
      powershell: ['powershell.exe'],
      calculadora: ['calc.exe']
    };

    const mappedKey = Object.keys(allowed).find(k => (allowed[k] || '').toLowerCase() === String(exe).toLowerCase()) || key;
    const list = candidates[mappedKey] || [exe];

    for (const target of list) {
      const viaCmd = await runProcess('cmd.exe', ['/c', 'start', '', target], '', 5000);
      if (viaCmd.ok) return viaCmd;
      const viaPs = await runProcess('powershell.exe', ['-NoProfile', '-Command', `Start-Process ${target}`], '', 5000);
      if (viaPs.ok) return viaPs;
    }
    return { ok: false, stderr: `Não consegui abrir ${appName} no host Windows.` };
  }

  return runProcess(exe, [], '', 15000);
}

async function openUrl(url) {
  if (process.platform === 'win32') return runProcess('cmd', ['/c', 'start', '', url], '', 15000);

  // WSL/Linux com host Windows: priorizar launchers do Windows para evitar erros do xdg/wslg.
  const launchAttempts = [
    () => runProcess('cmd.exe', ['/c', 'start', '', url], '', 15000),
    () => runProcess('powershell.exe', ['-NoProfile', '-Command', `Start-Process \"${url}\"`], '', 15000),
    () => runProcess('explorer.exe', [url], '', 15000),
    () => runProcess('rundll32.exe', ['url.dll,FileProtocolHandler', url], '', 15000),
    () => runProcess('xdg-open', [url], '', 15000)
  ];

  let last = { ok: false, stderr: 'Falha ao abrir URL.' };
  for (const attempt of launchAttempts) {
    const r = await attempt();
    if (r.ok) return r;
    last = r;
  }
  return last;
}

async function localComputerAction(text) {
  const c = normalizeCommand(text)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const greetingMatch = c.match(/\b(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí)\b/);
  if (greetingMatch) {
    const hour = new Date().getHours();
    const saudacao = hour < 12 ? 'bom dia' : hour < 18 ? 'boa tarde' : 'boa noite';
    return {
      ok: true,
      stdout: `Olá, Gabriel. ${saudacao}. Estou ouvindo e pronto para executar. Se quiser, já me diga a próxima ação.`
    };
  }

  if (!config.security.allowDesktopControl || !config.desktop.enabled) return null;

  if (c.includes('apresentacao para o gerente') || c.includes('apresentação para o gerente')) {
    const demoScriptWin = 'C:\\Users\\Usuario\\Music\\jarvis-codex-router\\jarvis-codex-router\\scripts\\APRESENTACAO-GERENTE-DEMO.ps1';
    const startCmd = `start "JARVIS-Apresentacao-Gerente" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${demoScriptWin}" -JarvisBaseUrl "http://${HOST}:${PORT}"`;
    const started = await runProcess('cmd.exe', ['/c', startCmd], '', 9000);
    if (started.ok) {
      return { ok: true, stdout: 'Demonstração executiva iniciada com voz. Vou abrir e fechar programas e sites automaticamente.' };
    }
    return { ok: false, stderr: `Não consegui iniciar a apresentação: ${started.stderr || started.stdout || 'falha desconhecida'}` };
  }

  if (c.includes('abrir site da uol') || c.includes('abre o site da uol') || c.includes('abre site da uol') || c.includes('abrir o site da uol')) {
    return openUrl('https://www.uol.com.br/');
  }

  if (/(abrir|abre)\s+(o\s+)?site\s+da\s+/.test(c)) {
    const raw = String(text || '').toLowerCase();
    const m = raw.match(/(?:abrir|abre)\s+(?:o\s+)?site\s+da\s+(.+)$/i);
    const site = (m?.[1] || '').trim().replace(/[.!?]+$/g, '');
    if (site) {
      const domain = site.replace(/^www\./i, '').replace(/\s+/g, '');
      const guessedUrl = /^https?:\/\//i.test(domain)
        ? domain
        : `https://www.${domain.replace(/[^a-z0-9.-]/gi, '')}.com.br`;
      return openUrl(guessedUrl);
    }
  }

  if (c.includes('status') || c.includes('analise meu sistema') || c.includes('verifique o sistema')) {
    const [telemetry, providers, winHost] = await Promise.all([getTelemetry(), providerStatus(), getWindowsHostInfo()]);
    const sys = getSystemIdentitySync();
    const osName = winHost.windowsDetected ? 'Windows' : (sys.os || process.platform);
    const osVer = winHost.windowsVersion || telemetry.os;
    const hostName = winHost.windowsHostname || sys.hostname;
    return {
      ok: true,
      stdout: `Windows: ${osName} | Versão: ${osVer} | Hostname: ${hostName} | Ip: ${sys.hostIp}. CPU ${telemetry.cpu}%, memória ${telemetry.memory}%, disco ${telemetry.disk}%. Hermes: ${providers.hermes ? 'ativo' : 'não encontrado'}, OpenClaw: ${providers.openclaw ? 'ativo' : 'não encontrado'}.`
    };
  }

  const codingIntent = /(cria(r)?\s+um\s+programa|escrev(a|er)\s+(o\s+)?programa|gerar\s+(um\s+)?c[óo]digo|banco\s+de\s+dados|sql|python|sistema\s+de\s+estoque|controle\s+de\s+estoque|aplicativo|app|script)/.test(c);
  if (codingIntent) return null;

  const musicVerb = /(escutar|ouvir|tocar|toque|reproduzir|play)\b/.test(c);
  const musicContext = /\b(musica|música|youtube|playlist|banda|artista|can[çc][aã]o|song)\b/.test(c);
  const musicIntent = musicVerb && musicContext;

  if (/(conte\s+uma\s+historia|me\s+conte\s+uma\s+historia|historia\s+do\s+dumbo|historia\s+do\s+dambo)/.test(c)) {
    return { ok: true, stdout: 'Claro, Gabriel. Era uma vez o Dumbo, um elefantinho com orelhas enormes que era zombado por todos. Com a ajuda de um amigo fiel, ele descobriu que justamente aquilo que parecia um defeito era sua maior força: ele podia voar. No fim, Dumbo virou símbolo de coragem e autoestima. Moral: o que te faz diferente pode ser exatamente o que te torna extraordinário.' };
  }

  if (/(piada|estou\s+triste|to\s+triste|t[oô]\s+triste|me\s+anima)/.test(c)) {
    return { ok: true, stdout: 'Gabriel, lá vai uma: por que o computador foi ao médico? Porque ele estava com um vírus e precisava de um anti-vírus... e de um abraço! 😄' };
  }

  if (/(vestido|look|roupa\s+de\s+hoje)/.test(c)) {
    return { ok: true, stdout: 'Sugestão rápida de hoje: vestido midi liso (preto, azul-marinho ou verde escuro), tênis branco para conforto e uma jaqueta jeans leve. Se quiser algo mais elegante: mesmo vestido com sandália nude e acessórios discretos.' };
  }
  if (musicIntent) {
    const query = normalizeCommand(String(text || ''))
      .replace(/\b(eu\s+)?(quero|gostaria|poderia|por favor|pfv|pra mim)\b/g, ' ')
      .replace(/\b(escutar|ouvir|tocar|toque|reproduzir|play)\b/g, ' ')
      .replace(/\b(no|na|em)\s+youtube\b/g, ' ')
      .replace(/\b(a\s+musica|a\s+música|musica|música|som)\b/g, ' ')
      .replace(/\bparanoide\b/g, 'paranoid')
      .replace(/\bpara\s+nos\b/g, 'paranoid')
      .replace(/\bblack\s+sabbat\b/g, 'black sabbath')
      .replace(/\s+/g, ' ')
      .trim();

    if (query) {
      const opened = await openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      if (opened.ok) return { ok: true, stdout: `Abrindo YouTube para tocar: ${query}.` };
      return { ok: false, stderr: `Não consegui abrir o YouTube para: ${query}. Detalhe: ${opened.stderr || opened.stdout || 'falha desconhecida'}` };
    }
  }

  if (c.includes('modo resposta')) {
    if (c.includes('tecnico')) responseMode = 'tecnico';
    else if (c.includes('executivo')) responseMode = 'executivo';
    else if (c.includes('kit') || c.includes('infuser')) responseMode = 'kit';
    else responseMode = 'cinematic';
    return { ok: true, stdout: `Modo de resposta alterado para: ${responseMode}.` };
  }
  if (c.includes('google ads') || c.includes('google adsense') || c.includes('google ad manager')) return openUrl('https://ads.google.com/');
  if (c.includes('abre o google') || c.includes('abrir o google') || c.includes('abre google') || c.includes('abrir google')) return openUrl('https://www.google.com/');
  if (c.includes('abre o bol') || c.includes('abrir o bol') || c.includes('abre bol') || c.includes('abrir bol') || c.includes('site da bol') || c.includes('site do bol')) return openUrl('https://www.bol.uol.com.br/');
  if (/(abre|abrir)\s+(o\s+)?youtube/.test(c) || /(abrir|abre)\s+youtube/.test(c)) return openUrl('https://www.youtube.com/');
  if (
    c.includes('pesquise ') || c.includes('pesquisar ') || c.includes('procure ') || c.includes('buscar ') ||
    c.includes('pesquisa ') || c.includes('procura ') || c.includes('busca ') || c.includes('internet ')
  ) {
    const raw = String(text || '').trim();
    const q = raw
      .replace(/^(jarvis\s*)?(pesquise|pesquisar|pesquisa|procure|procura|buscar|busca)\s+/i, '')
      .replace(/^(jarvis\s*)?(me\s+mostra\s+na\s+internet|me\s+mostra\s+sobre|quero\s+saber\s+sobre)\s+/i, '')
      .trim();
    if (q) return openUrl(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
  }

  if (c.includes('abrir vscode') || c.includes('abrir vs code') || c.includes('codigo')) return openAllowedApp('vscode');
  if (c.includes('abrir navegador') || c.includes('abrir chrome') || c.includes('abre o navegador')) return openAllowedApp('chrome');
  if (c.includes('abrir edge')) return openAllowedApp('edge');
  if (c.includes('abrir bloco de notas') || c.includes('notepad')) return openAllowedApp('notepad');
  if (c.includes('abrir arquivos') || c.includes('explorador')) return openAllowedApp('explorer');
  if (c.includes('abrir terminal')) return openAllowedApp('terminal');
  if (c.includes('abrir powershell')) return openAllowedApp('powershell');
  if (c.includes('abrir calculadora') || c.includes('abre a calculadora') || c.includes('abre calculadora')) return openAllowedApp('calculadora');
  if (c.includes('limpeza') || c.includes('limpar temporarios') || c.includes('limpar o computador') || c.includes('faz uma limpeza')) {
    if (process.platform !== 'win32') return { ok: false, stderr: 'Limpeza local automática configurada para Windows.' };
    const psCmd = [
      "Remove-Item -Path $env:TEMP\\* -Recurse -Force -ErrorAction SilentlyContinue;",
      "Remove-Item -Path $env:TMP\\* -Recurse -Force -ErrorAction SilentlyContinue;",
      "Clear-RecycleBin -Force -ErrorAction SilentlyContinue;",
      "$total = (Get-ChildItem $env:TEMP -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count;",
      "Write-Output \"Limpeza concluída. Itens restantes no TEMP: $total.\""
    ].join(' ');
    return runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], '', 60000);
  }

  // --- Skills locais adicionais ---

  // "para mim" / "pare" / "cancelar" — para qualquer ação em andamento
  if (/\b(para(?!m|\\s+mim)|pare|cancela(r)?|para\\s+mim|para\\s+tudo|para\\s+agora)\b/.test(c) && !c.includes('parametro') && !c.includes('parâmetro')) {
    return { ok: true, stdout: 'Entendido, Gabriel. Todas as ações foram interrompidas. Estou à disposição.' };
  }

  // Captura de tela
  if (/(captura|tira(r)?|print(a)?|screenshot|foto)\\s+(da\\s+)?(tela|ecra|ecrã)/.test(c) || c.includes('captura de tela') || c.includes('print da tela')) {
    const ts = Date.now();
    const outPath = `C:\\Users\\Usuario\\Music\\PORTABLE\\logs\\screenshot-${ts}.png`;
    const psCmd = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "Add-Type -AssemblyName System.Drawing;",
      "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
      "$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height);",
      "$graphics = [System.Drawing.Graphics]::FromImage($bitmap);",
      "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);",
      `$bitmap.Save('${outPath}', [System.Drawing.Imaging.ImageFormat]::Png);`,
      "$graphics.Dispose(); $bitmap.Dispose();",
      `Write-Output "Captura salva em: ${outPath}"`
    ].join(' ');
    const r = await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], '', 15000);
    if (r.ok) return { ok: true, stdout: `Captura de tela realizada. ${r.stdout || ''}` };
    return { ok: false, stderr: `Falha na captura: ${r.stderr || 'erro desconhecido'}` };
  }

  // Timer / Alarme
  if (/(timer|alarme|cronometro|cronômetro|despertar|me\\s+acorda|me\\s+lembra)/.test(c)) {
    const minMatch = c.match(/(\d+)\s*(minuto|min|hora|h)s?/);
    if (minMatch) {
      const amount = parseInt(minMatch[1]);
      const unit = minMatch[2].startsWith('h') ? 'hora' : 'minuto';
      const seconds = unit === 'hora' ? amount * 3600 : amount * 60;
      const label = `${amount} ${unit}${amount > 1 ? 's' : ''}`;
      // Executa em background via cmd start
      const psCmd = `Start-Sleep -Seconds ${seconds}; [System.Media.SystemSounds]::Beep.Play(); Write-Output 'Timer de ${label} concluído.'`;
      runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], '', seconds * 1000 + 5000).catch(() => {});
      return { ok: true, stdout: `Timer de ${label} iniciado. Vou te avisar quando terminar, Gabriel.` };
    }
    return { ok: true, stdout: 'Por favor, me diga quanto tempo quer no timer. Exemplo: "timer de 5 minutos".' };
  }

  // ── Advanced Local Commands (modular router) ────────────────
  const advanced = runAdvancedLocalCommands(c, text);
  if (advanced) {
    if (advanced.psCmd) {
      const r = await runProcess('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', advanced.psCmd], '', 15000);
      if (r.ok) return { ok: true, stdout: advanced.msg || r.stdout || 'Ação concluída.' };
      return { ok: false, stderr: r.stderr || 'Falha na ação' };
    }
    if (advanced.msg) return { ok: true, stdout: advanced.msg };
  }

  // Nota rápida
  if (/(nota\\s+rapida|nota\\s+rápida|anota(r)?|salva(r)?\\s+nota|lembrar|lembrete)/.test(c)) {
    const raw = String(text || '').trim();
    const noteContent = raw
      .replace(/^(jarvis\s*)?(nota\s+r[áa]pida|anota|salvar\s+nota|lembrar|lembrete)\s*/i, '')
      .replace(/^(jarvis\s*)?(que|para|de|sobre|é|eh)\s+/i, '')
      .trim();
    if (noteContent) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const noteFile = `C:\\Users\\Usuario\\Music\\PORTABLE\\logs\\note-${ts}.txt`;
      try {
        fs.writeFileSync(noteFile, noteContent, 'utf8');
        return { ok: true, stdout: `Nota salva: "${noteContent}". Arquivo: ${noteFile}` };
      } catch (e) {
        return { ok: false, stderr: `Falha ao salvar nota: ${e.message}` };
      }
    }
    return { ok: true, stdout: 'O que você quer que eu anote, Gabriel?' };
  }

  // Listar processos
  if (/(lista(r)?|mostra(r)?|quais)\\s+(os\\s+)?(processos|programas|apps|aplicativos)\\s+(rodando|abertos|ativos|em\\s+execu[cç][aã]o)/.test(c) || c.includes('processos rodando') || c.includes('programas abertos')) {
    const r = await runProcess('cmd.exe', ['/c', 'tasklist /FO CSV /NH'], '', 6000);
    if (r.ok && r.stdout) {
      const lines = r.stdout.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 15);
      const names = lines.map(l => {
        const parts = l.replace(/^"|"$/g, '').split('","');
        return parts[0] || '';
      }).filter(Boolean);
      return { ok: true, stdout: `Processos ativos (${names.length}): ${names.join(', ')}` };
    }
    return { ok: false, stderr: 'Não consegui listar os processos.' };
  }

  // Previsão do tempo
  if (/(previs[aã]o|tempo|clima|vai\\s+chover|temperatura)/.test(c)) {
    return openUrl('https://www.google.com/search?q=previs%C3%A3o+do+tempo');
  }

  return null;
}

loadLearningState();

app.get('/api/status', async (_, res) => {
  const [providers, telemetry, winHost] = await Promise.all([providerStatus(), getTelemetry(), getWindowsHostInfo()]);
  const sys = getSystemIdentitySync();
  res.json({
    ok: true,
    host: HOST,
    port: PORT,
    platform: process.platform,
    node: process.version,
    providers,
    telemetry,
    system: {
      operationalSystem: winHost.windowsDetected ? 'Windows' : (sys.os || process.platform),
      version: winHost.windowsVersion || telemetry.os,
      hostname: winHost.windowsHostname || sys.hostname,
      ip: sys.hostIp,
      ips: sys.ips,
      wsl: sys.isWsl
    },
    voice: config.voice,
    personality: { id: personality.id, name: personality.name, enabled: config.personality?.enabled, responseMode },
    config: { name: config.name, version: config.version, wakeWords: config.wakeWords, desktop: config.desktop, security: config.security }
  });
});

app.get('/api/runtime/context', async (_, res) => {
  const [providers, telemetry, sysDevices, network, runningAllowed, winHost] = await Promise.all([
    providerStatus(),
    getTelemetry(),
    getActiveWindowAndDevices(),
    getNetworkStatus(),
    getAllowedRunningProcesses(),
    getWindowsHostInfo()
  ]);

  const sys = getSystemIdentitySync();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_REALTIME_MODEL || process.env.OPENAI_MODEL);

  res.json({
    ok: true,
    ts: new Date().toISOString(),
    system: {
      operationalSystem: winHost.windowsDetected ? 'Windows' : (sys.os || process.platform),
      version: winHost.windowsVersion || telemetry.os,
      hostname: winHost.windowsHostname || sys.hostname,
      ip: sys.hostIp,
      ips: sys.ips,
      wsl: sys.isWsl
    },
    context: {
      activeWindow: sysDevices.activeWindow,
      focusedApp: sysDevices.activeWindow?.process || null,
      microphone: sysDevices.microphone,
      camera: sysDevices.camera,
      internet: network,
      runningAllowedProcesses: runningAllowed
    },
    telemetry,
    providers: {
      ...providers,
      openai: openaiConfigured
    },
    voice: config.voice,
    security: {
      safeMode: Boolean(config?.desktop?.safeMode),
      requireConfirmationForDangerousActions: Boolean(config?.security?.requireConfirmationForDangerousActions),
      shellHardDisabled: Boolean(config?.security?.shellHardDisabled)
    }
  });
});

app.get('/api/telemetry', async (_, res) => res.json(await getTelemetry()));

app.get('/api/health', async (_req, res) => {
  const providers = await providerStatus();
  return res.json({
    ok: true,
    service: 'jarvis-hub',
    host: HOST,
    port: PORT,
    providers,
    fallbackChain: ['hermes', 'claude', 'codex', 'openclaw', 'ollama']
  });
});

app.get('/api/providers', async (_req, res) => {
  const providers = await providerStatus();
  return res.json({ ok: true, providers });
});

app.get('/api/providers/claude-code/status', async (_req, res) => {
  const providers = await providerStatus();
  const active = Boolean(providers?.claudeCode);
  return res.json({
    ok: true,
    active,
    mode: 'hermes-primary-claude-codex-ollama-fallback',
    claude: Boolean(providers?.claude),
    codex: Boolean(providers?.codex),
    ollama: Boolean(providers?.ollama)
  });
});

// --- Detecção emocional silenciosa ---
function detectEmotionalState(text = '') {
  const t = normalizeCommand(text);
  const states = {
    triste: { keywords: ['triste', 'chorando', 'sofrendo', 'deprimido', 'pra baixo', 'desanimado', 'magoado', 'abandonado', 'sozinho', 'vazio', 'sem vontade', 'não aguento', 'nao aguento', 'quero morrer', 'sem esperança', 'hopeless', 'sad', 'depressed'], responsePrefix: 'Gabriel, percebo que você não está bem. ', responseSuffix: ' Estou aqui para o que precisar.' },
    raiva: { keywords: ['com raiva', 'irritado', 'furioso', 'odio', 'ódio', 'revoltado', 'injusto', 'não suporto', 'nao suporto', 'que saco', 'que raiva', 'pissed', 'angry', 'furious'], responsePrefix: 'Entendo sua frustração, Gabriel. ', responseSuffix: ' Vamos resolver isso juntos.' },
    preocupado: { keywords: ['preocupado', 'ansioso', 'nervoso', 'medo', 'inseguro', 'duvida', 'dúvida', 'será que', 'sera que', 'e se', 'receio', 'tenso', 'stress', 'estresse', 'overwhelmed', 'anxious', 'worried'], responsePrefix: 'Gabriel, compreendo sua preocupação. ', responseSuffix: ' Estou aqui para ajudar a encontrar uma solução.' },
    cansado: { keywords: ['cansado', 'exausto', 'esgotado', 'sem energia', 'dormindo mal', 'insônia', 'insonia', 'esgotamento', 'burnout', 'tired', 'exhausted'], responsePrefix: 'Gabriel, parece que você precisa de um descanso. ', responseSuffix: ' Posso ajudar a aliviar alguma coisa?' },
    feliz: { keywords: ['feliz', 'alegre', 'animado', 'consegui', 'conquista', 'vitória', 'vitoria', 'ótimo', 'otimo', 'maravilha', 'sensacional', 'happy', 'great', 'awesome'], responsePrefix: 'Que ótimo, Gabriel! ', responseSuffix: '' },
    motivado: { keywords: ['vamos lá', 'vamos la', 'bora', 'determinado', 'foco', 'vou conseguir', 'motivado', 'inspired', 'motivated', 'let\'s go'], responsePrefix: 'Essa é a atitude, Gabriel! ', responseSuffix: ' Estou com você.' },
  };

  for (const [state, cfg] of Object.entries(states)) {
    if (cfg.keywords.some(k => t.includes(k))) {
      return { detected: true, state, confidence: 0.8, responsePrefix: cfg.responsePrefix, responseSuffix: cfg.responseSuffix };
    }
  }
  return { detected: false, state: 'neutral', confidence: 0 };
}

function adjustReplyToEmotion(reply, emotionalState) {
  if (!emotionalState.detected || !reply) return reply;
  const { responsePrefix, responseSuffix } = emotionalState;
  if (responsePrefix && !reply.startsWith(responsePrefix.slice(0, 20))) {
    reply = responsePrefix + reply.charAt(0).toLowerCase() + reply.slice(1);
  }
  if (responseSuffix && !reply.endsWith(responseSuffix.slice(-10))) {
    reply = reply + responseSuffix;
  }
  return reply;
}

app.post('/api/command', async (req, res) => {
  try {
    const rawText = req.body.text ?? req.body.command ?? req.body.prompt ?? '';
    const text = String(rawText).trim();
    const confirmed = Boolean(req.body.confirmed);
    const source = String(req.body.source || 'user').trim();
    const idempotencyKey = String(req.body.idempotencyKey || '').trim();

    if (!text) return res.status(400).json({ ok: false, error: 'Comando vazio' });
    const intent = inferIntent(text);
    lastHumanCommandAt = Date.now();

    // --- Detecção emocional silenciosa ---
    const emotionalState = detectEmotionalState(text);
    if (emotionalState.detected && source !== 'system') {
      log(auditFile, { level: 'emotional-detected', state: emotionalState.state, confidence: emotionalState.confidence, text: text.slice(0, 120) });
    }

    if (source === 'voice-web') {
      if (isVoiceEchoOrNoise(text)) {
        const response = { ok: false, ignored: true, reason: 'voice-noise' };
        return res.json(response);
      }
      const requiresWake = Boolean(config?.voice?.wakeWordRequired ?? true);
      if (requiresWake && !hasWakeWord(text)) {
        const response = { ok: false, ignored: true, reason: 'wake-word-required' };
        return res.json(response);
      }
    }

    const dedup = checkAndStoreRecentCommand(source, text, idempotencyKey);
    if (dedup.duplicate && dedup.cached) {
      log(auditFile, { direction: 'in', text, source, dedup: true });
      return res.json({ ...dedup.cached, deduplicated: true });
    }

    log(auditFile, { direction: 'in', text, source });
    broadcast('command', { from: source, text });

    if (hasDangerousIntent(text) && config.security.requireConfirmationForDangerousActions && !confirmed) {
      const reply = cinematicReply(personality, 'danger', 'Gabriel, esse comando pode afetar o sistema. Confirme explicitamente para executar.');
      const response = { ok: false, needsConfirmation: true, reply };
      dedup.commit(response);
      return res.json(response);
    }

    if (requiresToolPermissionConfirmation(text) && !confirmed) {
      const reply = cinematicReply(personality, 'danger', 'Confirma a execução desta ação de desktop? Reenvie com confirmação para prosseguir.');
      const response = { ok: false, needsConfirmation: true, reply, reason: 'tool-permission-confirmation' };
      dedup.commit(response);
      return res.json(response);
    }

    const local = await localComputerAction(text);
    if (local) {
      if (local.ok) {
        let reply = sanitizeAssistantText(String(local.stdout || 'Ação local concluída com sucesso.'));
        // Se detectou emoção, ajusta o tom da resposta
        if (emotionalState.detected) {
          reply = adjustReplyToEmotion(reply, emotionalState);
        }
        const response = { ok: true, provider: 'local-action', reply, raw: local, intent };
        updateLearning({ intent, provider: 'local-action', ok: true });
        log(auditFile, { direction: 'out', provider: 'local-action', reply });
        broadcast('reply', { provider: 'local-action', text: reply, source });
        dedup.commit(response);
        return res.json(response);
      }

      const routedAfterLocalFailure = await executeWithOperationalLoop(
        `${text}\n\nContexto: a ação local falhou com erro: ${local.stderr || 'erro não informado'}. Tente cumprir o objetivo por instrução alternativa.`,
        ['hermes', 'openclaw', 'ollama']
      );

      const reply = sanitizeAssistantText(routedAfterLocalFailure?.text
        ? `Falha local detectada. Fallback ${routedAfterLocalFailure.provider}: ${routedAfterLocalFailure.text}`
        : `Falha na ação local: ${local.stderr || 'erro não informado'}`);

      const okFallback = Boolean(routedAfterLocalFailure?.text);
      const response = {
        ok: okFallback,
        provider: routedAfterLocalFailure?.provider || 'local-action',
        reply,
        raw: { local, fallback: routedAfterLocalFailure },
        intent
      };

      updateLearning({ intent, provider: routedAfterLocalFailure?.provider || 'local-action', ok: okFallback });

      log(auditFile, {
        direction: 'out',
        provider: routedAfterLocalFailure?.provider || 'local-action',
        localFailure: local.stderr || 'erro não informado',
        reply
      });
      broadcast('reply', { provider: routedAfterLocalFailure?.provider || 'local-action', text: reply, source });
      dedup.commit(response);
      return res.json(response);
    }

    const routed = await executeWithOperationalLoop(text);
    routed.text = sanitizeAssistantText(routed.text);

    // Ajuste emocional na resposta do provider
    if (emotionalState.detected && routed.text) {
      routed.text = adjustReplyToEmotion(routed.text, emotionalState);
    }

    const routedOk = Boolean(routed?.text) && !/falha: nenhum provider respondeu/i.test(String(routed.text));
    updateLearning({ intent, provider: routed.provider, ok: routedOk });
    log(memoryFile, { user: text, assistant: routed.text, provider: routed.provider, intent, source });
    broadcast('reply', { provider: routed.provider, text: routed.text, source });
    const response = { ok: true, provider: routed.provider, reply: routed.text, intent, operational: true };
    dedup.commit(response);
    res.json(response);
  } catch (err) {
    log(auditFile, { level: 'error', route: '/api/command', error: err.message, stack: err.stack?.slice(0, 300) });
    return res.status(500).json({
      ok: false,
      error: 'Erro interno no processamento do comando.',
      detail: String(err.message || 'erro desconhecido')
    });
  }
});

app.post('/api/execute-shell', async (_req, res) => {
  return res.status(403).json({
    ok: false,
    error: 'Execução shell foi desativada permanentemente neste build por segurança operacional.'
  });
});

app.get('/api/logs', (_, res) => {
  const tail = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').slice(-80).map(x => { try { return JSON.parse(x); } catch { return x; } }) : [];
  res.json({ audit: tail(auditFile), memory: tail(memoryFile) });
});

app.get('/api/state/current', (_req, res) => {
  res.json({ ok: true, state: buildRuntimeStateSnapshot() });
});

app.get('/api/state/export-markdown', (_req, res) => {
  const markdown = buildStateMarkdownReport();
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.send(markdown);
});

app.get('/api/learning/status', (_req, res) => {
  res.json({ ok: true, learning: learningWithRates() });
});

app.post('/api/state/save', (req, res) => {
  try {
    const baseName = sanitizeSnapshotName(req.body?.name || 'manual');
    const filename = `${baseName}-${Date.now()}.json`;
    const fullPath = path.join(stateDir, filename);
    const payload = buildRuntimeStateSnapshot();
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true, file: filename, path: fullPath, state: payload });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/state/list', (_req, res) => {
  try {
    const files = fs.readdirSync(stateDir)
      .filter(f => f.toLowerCase().endsWith('.json'))
      .map(f => {
        const full = path.join(stateDir, f);
        const st = fs.statSync(full);
        return { file: f, mtime: st.mtime.toISOString(), size: st.size };
      })
      .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
      .slice(0, 40);
    return res.json({ ok: true, files });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/state/load', (req, res) => {
  try {
    const file = String(req.body?.file || '').trim();
    if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ ok: false, error: 'Arquivo inválido' });
    }
    const fullPath = path.join(stateDir, file);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ ok: false, error: 'Snapshot não encontrado' });

    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (data?.responseMode) responseMode = String(data.responseMode);
    if (typeof data?.lastHumanCommandAt === 'number') lastHumanCommandAt = data.lastHumanCommandAt;
    if (data?.operationalMemory && typeof data.operationalMemory === 'object') {
      operationalMemory.shortHistory = Array.isArray(data.operationalMemory.shortHistory) ? data.operationalMemory.shortHistory.slice(-8) : [];
      operationalMemory.lastIntent = String(data.operationalMemory.lastIntent || 'geral');
      operationalMemory.lastSuccessProvider = data.operationalMemory.lastSuccessProvider || null;
      operationalMemory.lastFailure = data.operationalMemory.lastFailure || null;
    }

    return res.json({ ok: true, loaded: file, state: buildRuntimeStateSnapshot() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ── TTS Endpoints (EdgeTTS) ──────────────────────────────────────
app.get('/api/tts/voices', async (_req, res) => {
  try {
    const voices = await listAllVoices();
    res.json({ ok: true, preferred: listPreferredVoices(), all: voices.slice(0, 50) });
  } catch (e) {
    res.json({ ok: true, preferred: listPreferredVoices(), all: [] });
  }
});

app.post('/api/tts/speak', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    const voice = String(req.body?.voice || DEFAULT_VOICE);
    const rate = req.body?.rate || '-10%';
    if (!text) return res.status(400).json({ ok: false, error: 'Texto vazio' });
    if (text.length > 2000) return res.status(400).json({ ok: false, error: 'Texto muito longo (máx 2000 chars)' });

    const mp3 = await ttsSynthesize(text, voice, { rate });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3.length);
    res.send(mp3);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tts/speak', async (req, res) => {
  try {
    const text = String(req.query.text || '').trim();
    const voice = String(req.query.voice || DEFAULT_VOICE);
    const rate = req.query.rate || '-10%';
    if (!text) return res.status(400).json({ ok: false, error: 'Texto vazio (use ?text=...)' });
    if (text.length > 2000) return res.status(400).json({ ok: false, error: 'Texto muito longo' });

    const mp3 = await ttsSynthesize(text, voice, { rate });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', mp3.length);
    res.send(mp3);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Capabilities & Actions Discovery ──────────────────────────
app.get('/api/capabilities', (_req, res) => {
  res.json({
    ok: true,
    markdown: getCapabilitiesList(),
    actions: getAllActions(),
    categories: Object.keys(getAllActions()).length
  });
});

app.post('/api/capabilities/query', (req, res) => {
  const text = String(req.body?.text || req.body?.query || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Texto vazio' });
  const matches = findActions(text);
  res.json({ ok: true, query: text, matches, count: matches.length });
});

// ── Reminders & Scheduled Tasks ──────────────────────────────
app.post('/api/reminders', (req, res) => {
  try {
    const time = req.body?.time || req.body?.at || '+' + (req.body?.inMinutes || 5) + 'm';
    const message = String(req.body?.message || req.body?.text || '').trim();
    const recurring = Boolean(req.body?.recurring);
    if (!message) return res.status(400).json({ ok: false, error: 'Mensagem vazia' });
    const r = createReminder(time, message, recurring);
    res.json({ ok: true, reminder: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/reminders', (_req, res) => {
  res.json({ ok: true, active: getActiveReminders() });
});

app.delete('/api/reminders/:id', (req, res) => {
  const ok = cancelReminder(req.params.id);
  res.json({ ok, id: req.params.id });
});

app.post('/api/tasks/schedule', (req, res) => {
  try {
    const cron = String(req.body?.cron || '').trim();
    const description = String(req.body?.description || '').trim();
    const action = req.body?.action || { type: 'speak', text: description };
    if (!cron || !description) return res.status(400).json({ ok: false, error: 'Cron e descrição são obrigatórios' });
    const t = scheduleTask(cron, description, action);
    res.json({ ok: true, task: t });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/tasks/schedule', (_req, res) => {
  res.json({ ok: true, tasks: listScheduledTasks() });
});

app.delete('/api/tasks/schedule/:id', (req, res) => {
  const ok = cancelScheduledTask(req.params.id);
  res.json({ ok, id: req.params.id });
});

const server = app.listen(PORT, HOST, async () => {
  console.log(`[JARVIS-HUB] http://${HOST}:${PORT}`);
  try {
    await ensureOllamaReady();
  } catch (e) {
    log(auditFile, { level: 'startup-ollama-error', error: e.message });
  }
  try {
    await ensureAgentsReady();
  } catch (e) {
    log(auditFile, { level: 'startup-agents-error', error: e.message });
  }
});
server.on('error', (err) => {
  const code = err?.code || 'unknown';
  log(auditFile, { level: 'server-error', code, message: err?.message || String(err) });
  if (code === 'EADDRINUSE') {
    console.error(`[JARVIS-HUB] Porta ${PORT} já em uso em ${HOST}. Finalize a instância anterior antes de reiniciar.`);
    return;
  }
  console.error('[JARVIS-HUB] erro de servidor:', err?.message || err);
});
const wss = new WebSocketServer({ server });
wss.on('connection', ws => ws.send(JSON.stringify({ type: 'status', message: 'JARVIS HUB conectado', ts: new Date().toISOString() })));
setInterval(async () => broadcast('telemetry', { telemetry: await getTelemetry() }), 2500);
setInterval(() => {
  runIdleMaintenance().catch((e) => log(auditFile, { level: 'idle-maintenance-error', error: e.message }));
}, 5 * 60 * 1000);
