import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(cmd, args) {
  console.log('>', [cmd, ...args].join(' '));
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${cmd} exited with ${result.status}`);
}

function packageHasDependencies() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return Object.keys(pkg.dependencies || {}).length > 0 || Object.keys(pkg.devDependencies || {}).length > 0;
}

fs.mkdirSync('logs', { recursive: true });
fs.mkdirSync('runtime/npm-cache', { recursive: true });

try {
  if (fs.existsSync('.git')) run('git', ['pull', '--ff-only']);
  if (packageHasDependencies()) {
    run('npm', ['install', '--no-audit', '--fund=false', '--cache', 'runtime/npm-cache']);
  } else {
    console.log('Sem dependências npm externas. Pulando npm install.');
  }
  run('node', ['--test']);
  run('node', ['scripts/doctor.mjs']);
  run('node', ['--check', 'server.js']);
  run('node', ['--check', 'public/app.js']);
  console.log('JARVIS atualizado com sucesso.');
} catch (e) {
  console.error('Atualização falhou. Nada crítico foi apagado. Veja logs/ e tente novamente.');
  console.error(e.message);
  process.exit(1);
}
