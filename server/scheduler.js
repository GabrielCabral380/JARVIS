/**
 * JARVIS Scheduler — Cron Task Scheduler
 * Dedicated module for scheduling and managing recurring/one-shot tasks
 * Supports cron expressions, simple intervals, and natural language
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEDULER_FILE = path.join(PROJECT_ROOT, 'system', 'JARVIS-SCHEDULER.json');

// ─── PERSISTENCE ───
function loadTasks() {
  try {
    const data = JSON.parse(fs.readFileSync(SCHEDULER_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  fs.mkdirSync(path.dirname(SCHEDULER_FILE), { recursive: true });
  fs.writeFileSync(SCHEDULER_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

// ─── CRON PARSER (simplified) ───
export function parseCron(expr) {
  // Supports: "* * * * *" (min hour dom month dow)
  // And shortcuts: "@daily", "@hourly", "@every 5m"
  if (expr === '@daily') return { minute: 0, hour: 0, dom: '*', month: '*', dow: '*' };
  if (expr === '@hourly') return { minute: 0, hour: '*', dom: '*', month: '*', dow: '*' };
  if (expr === '@weekly') return { minute: 0, hour: 0, dom: '*', month: '*', dow: 0 };
  
  const everyMatch = expr.match(/@every\s+(\d+)([smh])/);
  if (everyMatch) {
    const n = parseInt(everyMatch[1]);
    const unit = everyMatch[2];
    if (unit === 'm') return { minute: `*/${n}`, hour: '*', dom: '*', month: '*', dow: '*' };
    if (unit === 'h') return { minute: 0, hour: `*/${n}`, dom: '*', month: '*', dow: '*' };
    if (unit === 's') return { minute: `*/${Math.ceil(n / 60)}`, hour: '*', dom: '*', month: '*', dow: '*' };
  }

  const parts = expr.trim().split(/\s+/);
  if (parts.length === 5) {
    return {
      minute: parts[0],
      hour: parts[1],
      dom: parts[2],
      month: parts[3],
      dow: parts[4],
    };
  }
  return null;
}

// ─── NEXT RUN CALCULATOR ───
export function getNextRun(cronExpr, from = new Date()) {
  const parsed = parseCron(cronExpr);
  if (!parsed) return null;

  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // Start from next minute

  // Simple calculation for common patterns
  if (parsed.minute.startsWith('*/')) {
    const interval = parseInt(parsed.minute.slice(2));
    const currentMin = d.getMinutes();
    const nextMin = Math.ceil((currentMin + 1) / interval) * interval;
    if (nextMin < 60) {
      d.setMinutes(nextMin);
    } else {
      d.setMinutes(0);
      d.setHours(d.getHours() + 1);
    }
    return d.toISOString();
  }

  if (parsed.minute === '0' && parsed.hour === '*') {
    // Every hour
    d.setMinutes(0);
    d.setHours(d.getHours() + 1);
    return d.toISOString();
  }

  if (parsed.hour === '0' && parsed.minute === '0') {
    // Daily at midnight
    d.setMinutes(0);
    d.setHours(0);
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  // Default: next minute
  return d.toISOString();
}

// ─── NATURAL LANGUAGE TO CRON ───
export function nlToCron(input) {
  const lower = input.toLowerCase();

  // "a cada X minutos/horas"
  let m = lower.match(/(?:a cada|cada)\s+(\d+)\s*(minuto|minutos|min|hora|horas|h)/);
  if (m) {
    const n = parseInt(m[1]);
    if (/hora|h/.test(m[2])) return `@every ${n}h`;
    return `@every ${n}m`;
  }

  // "todo dia às HH:MM"
  m = lower.match(/(?:todo[s]? dia[s]?|diariamente|daily)\s*(?:às|as|:)?\s*(\d{1,2}):(\d{2})?/);
  if (m) {
    const h = m[1].padStart(2, '0');
    const min = (m[2] || '0').padStart(2, '0');
    return `${min} ${h} * * *`;
  }

  // "toda semana(dia) às HH:MM"
  m = lower.match(/(?:toda[s]? semana[s]?|weekly|semanalmente)\s*(?:às|as|:)?\s*(\d{1,2}):(\d{2})?/);
  if (m) {
    const h = m[1].padStart(2, '0');
    const min = (m[2] || '0').padStart(2, '0');
    return `${min} ${h} * * 1`;
  }

  // "todo mês dia X às HH:MM"
  m = lower.match(/(?:todo[s]? m[eê]s|monthly)\s*(?:dia\s+)?(\d{1,2})\s*(?:às|as|:)?\s*(\d{1,2}):(\d{2})?/);
  if (m) {
    const dom = m[1].padStart(2, '0');
    const h = (m[2] || '0').padStart(2, '0');
    const min = (m[3] || '0').padStart(2, '0');
    return `${min} ${h} ${dom} * *`;
  }

  // "em X minutos" (one-shot)
  m = lower.match(/(?:em|daqui a)\s+(\d+)\s*(minuto|minutos|min)/);
  if (m) {
    const minutes = parseInt(m[1]);
    const when = new Date(Date.now() + minutes * 60000);
    return { type: 'oneshot', when: when.toISOString() };
  }

  return null;
}

// ─── TASK MANAGEMENT ───
export function createTask({ name, cron, action, description, enabled = true }) {
  const tasks = loadTasks();
  const task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    cron,
    action,
    description: description || '',
    enabled,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: getNextRun(cron),
    runCount: 0,
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function listTasks() {
  return loadTasks();
}

export function getTask(id) {
  return loadTasks().find(t => t.id === id) || null;
}

export function updateTask(id, patch) {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx < 0) return null;
  tasks[idx] = { ...tasks[idx], ...patch };
  saveTasks(tasks);
  return tasks[idx];
}

export function deleteTask(id) {
  const tasks = loadTasks();
  const filtered = tasks.filter(t => t.id !== id);
  saveTasks(filtered);
  return filtered.length < tasks.length;
}

export function getDueTasks() {
  const now = Date.now();
  return loadTasks().filter(t => {
    if (!t.enabled) return false;
    if (t.cron.type === 'oneshot' && t.cron.when) {
      return Date.parse(t.cron.when) <= now && !t.lastRun;
    }
    if (t.nextRun) {
      return Date.parse(t.nextRun) <= now;
    }
    return false;
  });
}

export function markTaskRun(id) {
  return updateTask(id, {
    lastRun: new Date().toISOString(),
    runCount: (getTask(id)?.runCount || 0) + 1,
    nextRun: getNextRun(getTask(id)?.cron),
  });
}
