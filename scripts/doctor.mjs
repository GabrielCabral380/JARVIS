import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

for (const dir of ['logs', 'runtime', 'system']) fs.mkdirSync(dir, { recursive: true });

function findCmd(names) {
  const paths = String(process.env.PATH || '').split(path.delimiter);
  const pathext = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const name of names) {
    const candidates = path.extname(name) ? [name] : pathext.map(ext => name + ext.toLowerCase()).concat(pathext.map(ext => name + ext.toUpperCase()));
    for (const dir of paths) for (const c of candidates) {
      const full = path.join(dir, c);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function version(exe, args = ['--version']) {
  if (!exe) return null;
  try { return execFileSync(exe, args, { timeout: 3000, encoding: 'utf8' }).trim().split(/\r?\n/)[0]; }
  catch { return null; }
}

const python = process.platform === 'win32'
  ? findCmd(['py.exe', 'python.exe', 'python', 'py'])
  : findCmd(['python3', 'python', 'python.exe', 'py']);
const npm = process.platform === 'win32'
  ? findCmd(['npm.cmd', 'npm.exe', 'npm'])
  : findCmd(['npm', 'npm.cmd', 'npm.exe']);

const checks = [
  ['package.json', fs.existsSync('package.json')],
  ['server.js', fs.existsSync('server.js')],
  ['backend/local_tools.py', fs.existsSync(path.join('backend','local_tools.py'))],
  ['public/index.html', fs.existsSync(path.join('public','index.html'))],
  ['public/app.js', fs.existsSync(path.join('public','app.js'))],
  ['agents', fs.existsSync('agents')],
  ['system', fs.existsSync('system')],
  ['logs', fs.existsSync('logs')],
];

console.log('JARVIS Doctor');
console.log('Node:', process.version);
console.log('npm:', npm ? (version(npm, ['-v']) || 'detectado') : 'opcional/ausente');
console.log('Python:', python ? (version(python, ['--version']) || 'detectado') : 'opcional/ausente');
console.log('OS:', os.platform(), os.release());
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'OK ' : 'ERR'} ${name}`);
  ok = ok && pass;
}
console.log('Dependências externas npm: não obrigatórias nesta versão.');
console.log('Ferramentas locais: Node nativo + Python opcional com fallback.');
console.log('OpenRouter/OpenAI/Codex/Hermes/OpenClaw/MCP: opcionais via .env.');
process.exit(ok ? 0 : 1);
