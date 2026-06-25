/**
 * JARVIS Agents — Multi-step Task Planning & Execution
 * Inspired by OpenJarvis OrchestratorAgent / aiwaves-cn planning
 * 
 * Arquitetura:
 *  - Plan: decompor objetivo em sub-tarefas ordenadas
 *  - Execute: executar cada sub-tarefa com ferramentas
 *  - Monitor: verificar progresso e ajustar
 *  - Report: consolidar resultado final
 */
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── SAFETY ───
const DANGEROUS = [
  /rm\s+-rf/i, /del\s+\/s/i, /format\s+/i, /diskpart/i,
  /reg\s+delete/i, /shutdown/i, /net\s+user.*\/delete/i
];
function isSafe(cmd) { return !DANGEROUS.some(rx => rx.test(cmd)); }

// ─── PLAN PARSER ───
export function parsePlan(input) {
  const lines = input.split(/[;\n]/).map(l => l.trim()).filter(Boolean);
  return lines.map((line, i) => ({
    id: i + 1,
    task: line,
    status: 'pending',
    result: null,
  }));
}

// ─── TASK PLANNER ───
export function planTask(goal) {
  const lower = goal.toLowerCase();
  const steps = [];

  // Install software
  let m = lower.match(/instalar\s+(?:o\s+|a\s+|os\s+|as\s+)?(.+)/i);
  if (m) {
    const pkg = m[1].trim();
    steps.push({ id: 1, task: `Verificar se ${pkg} já está instalado`, tool: 'shell', args: ['which', pkg] });
    steps.push({ id: 2, task: `Instalar ${pkg}`, tool: 'shell', args: ['sudo', 'apt', 'install', '-y', pkg] });
    steps.push({ id: 3, task: `Verificar instalação`, tool: 'shell', args: ['which', pkg] });
    return { goal, steps, type: 'install' };
  }

  // Create project
  m = lower.match(/criar\s+(?:um\s+|uma\s+)?(?:projeto|project|aplica[cç][aã]o|app)\s*(.+)?/i);
  if (m) {
    const name = (m[1] || 'novo-projeto').trim();
    steps.push({ id: 1, task: `Criar diretório ${name}`, tool: 'file', args: ['mkdir', name] });
    steps.push({ id: 2, task: `Criar package.json`, tool: 'file', args: ['write', `${name}/package.json`, JSON.stringify({ name, version: '1.0.0' })] });
    steps.push({ id: 3, task: `Instalar dependências`, tool: 'shell', args: ['npm', 'install'], cwd: path.join(PROJECT_ROOT, name) });
    return { goal, steps, type: 'create_project' };
  }

  // Analyze directory
  m = lower.match(/analisar\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:diret[oó]rio|pasta|projeto|project)\s+(.+)/i);
  if (m) {
    const dir = m[1].trim();
    steps.push({ id: 1, task: `Listar arquivos de ${dir}`, tool: 'file', args: ['list', dir] });
    steps.push({ id: 2, task: `Contar linhas de código`, tool: 'shell', args: ['find', dir, '-name', '*.js', '-exec', 'wc', '-l', '{}', '+'] });
    steps.push({ id: 3, task: `Verificar estrutura`, tool: 'file', args: ['list', dir] });
    return { goal, steps, type: 'analyze' };
  }

  // Search web + summarize
  m = lower.match(/pesquisar\s+(?:sobre\s+|na internet\s+|no google\s+)?(.+)/i);
  if (m) {
    const query = m[1].trim();
    steps.push({ id: 1, task: `Pesquisar: ${query}`, tool: 'web_fetch', args: [`https://www.google.com/search?q=${encodeURIComponent(query)}`] });
    steps.push({ id: 2, task: `Resumir resultados`, tool: 'ai', args: ['Resuma os resultados da pesquisa'] });
    return { goal, steps, type: 'research' };
  }

  // Backup
  m = lower.match(/backup\s+(?:de|do|da)\s+(.+)/i);
  if (m) {
    const target = m[1].trim();
    const ts = new Date().toISOString().slice(0, 10);
    steps.push({ id: 1, task: `Verificar existência de ${target}`, tool: 'file', args: ['exists', target] });
    steps.push({ id: 2, task: `Criar backup ${target}.${ts}.tar.gz`, tool: 'shell', args: ['tar', '-czf', `${target}.${ts}.tar.gz`, target] });
    steps.push({ id: 3, task: `Verificar backup`, tool: 'file', args: ['exists', `${target}.${ts}.tar.gz`] });
    return { goal, steps, type: 'backup' };
  }

  // Generic plan
  steps.push({ id: 1, task: goal, tool: 'ai', args: [goal] });
  return { goal, steps, type: 'generic' };
}

// ─── STEP EXECUTOR ───
export async function executeStep(step) {
  try {
    switch (step.tool) {
      case 'shell': {
        const [cmd, ...args] = step.args;
        const result = await new Promise((resolve) => {
          const child = spawn(cmd, args, {
            cwd: step.cwd || PROJECT_ROOT,
            windowsHide: true,
            shell: false,
            env: { ...process.env, PATH: process.env.PATH }
          });
          let out = '', err = '';
          const timer = setTimeout(() => { child.kill(); resolve({ ok: false, text: 'Timeout' }); }, 30000);
          child.stdout.on('data', d => out += d.toString());
          child.stderr.on('data', d => err += d.toString());
          child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, text: (out || err || '').slice(0, 2000) }); });
          child.on('error', e => { clearTimeout(timer); resolve({ ok: false, text: e.message }); });
        });
        return { ...step, status: result.ok ? 'done' : 'failed', result: result.text };
      }
      case 'file': {
        const [op, ...args] = step.args;
        let result = { ok: false, text: '' };
        switch (op) {
          case 'mkdir': {
            const target = path.join(PROJECT_ROOT, args[0]);
            if (!target.startsWith(PROJECT_ROOT)) result = { ok: false, text: 'Caminho inválido' };
            else { fs.mkdirSync(target, { recursive: true }); result = { ok: true, text: `Pasta criada: ${args[0]}` }; }
            break;
          }
          case 'write': {
            const [filepath, content] = args;
            const full = path.join(PROJECT_ROOT, filepath);
            if (!full.startsWith(PROJECT_ROOT)) result = { ok: false, text: 'Caminho inválido' };
            else { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, content); result = { ok: true, text: `Arquivo criado: ${filepath}` }; }
            break;
          }
          case 'list': {
            const dir = args[0] ? path.join(PROJECT_ROOT, args[0]) : PROJECT_ROOT;
            if (!dir.startsWith(PROJECT_ROOT)) result = { ok: false, text: 'Caminho inválido' };
            else { const items = fs.readdirSync(dir).slice(0, 50); result = { ok: true, text: items.join('\n') }; }
            break;
          }
          case 'exists': {
            const target = path.join(PROJECT_ROOT, args[0]);
            result = { ok: fs.existsSync(target), text: fs.existsSync(target) ? 'Existe' : 'Não existe' };
            break;
          }
          default:
            result = { ok: false, text: `Operação desconhecida: ${op}` };
        }
        return { ...step, status: result.ok ? 'done' : 'failed', result: result.text };
      }
      case 'web_fetch': {
        try {
          const resp = await fetch(step.args[0], { signal: AbortSignal.timeout(10000) });
          const text = await resp.text();
          return { ...step, status: 'done', result: text.slice(0, 2000) };
        } catch (e) {
          return { ...step, status: 'failed', result: e.message };
        }
      }
      case 'ai':
        return { ...step, status: 'pending', result: step.args[0], needsAI: true };
      default:
        return { ...step, status: 'failed', result: `Tool desconhecida: ${step.tool}` };
    }
  } catch (e) {
    return { ...step, status: 'failed', result: e.message };
  }
}

// ─── PLAN EXECUTOR ───
export async function executePlan(goal) {
  const plan = planTask(goal);
  const results = [];

  for (const step of plan.steps) {
    const result = await executeStep(step);
    results.push(result);
    if (result.status === 'failed' && !result.needsAI) {
      // Stop on critical failure (unless it's an AI step)
      break;
    }
  }

  const completed = results.filter(r => r.status === 'done').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return {
    goal,
    type: plan.type,
    total: plan.steps.length,
    completed,
    failed,
    steps: results,
    summary: `${completed}/${plan.steps.length} passos concluídos${failed > 0 ? `, ${failed} falhas` : ''}`,
  };
}

// ─── AGENT TYPES ───
export const AGENT_TYPES = {
  'simple': 'Resposta direta sem ferramentas',
  'planner': 'Planejamento multi-step com ferramentas',
  'research': 'Pesquisa + síntese',
  'automation': 'Automação de tarefas',
  'diagnostic': 'Diagnóstico do sistema',
};

export function classifyAgent(text) {
  const t = text.toLowerCase();
  if (/instalar|criar\s+(?:projeto|app|aplica)|backup|analisar\s+(?:diret|proj)/i.test(t)) return 'planner';
  if (/pesquisar|buscar|procurar|google/i.test(t)) return 'research';
  if (/diagn[oó]stic|status|verificar|monitor/i.test(t)) return 'diagnostic';
  if (/automatizar|agendar|cron|recorrente/i.test(t)) return 'automation';
  return 'simple';
}
