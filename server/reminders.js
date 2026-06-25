/**
 * JARVIS Reminders & Scheduled Tasks (ESM)
 * Manage reminders, timers, and cron jobs from the hub
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = path.join(__dirname, '..', 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const TASKS_FILE = path.join(DATA_DIR, 'scheduled_tasks.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Storage helpers ──────────────────────────────────────────
function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── Reminders ────────────────────────────────────────────────
export function createReminder(time, message, recurring = false) {
  const reminders = loadJSON(REMINDERS_FILE, []);
  const r = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    time,
    message,
    recurring,
    created: new Date().toISOString(),
    status: 'active',
  };
  reminders.push(r);
  saveJSON(REMINDERS_FILE, reminders);
  return r;
}

export function getActiveReminders() {
  const reminders = loadJSON(REMINDERS_FILE, []);
  const now = Date.now();
  return reminders.filter(r => r.status === 'active' && parseTime(r.time) > now);
}

export function cancelReminder(id) {
  const reminders = loadJSON(REMINDERS_FILE, []);
  const idx = reminders.findIndex(r => r.id === id);
  if (idx >= 0) {
    reminders[idx].status = 'cancelled';
    saveJSON(REMINDERS_FILE, reminders);
    return true;
  }
  return false;
}

function parseTime(input) {
  if (typeof input === 'string' && input.startsWith('+')) {
    const match = input.match(/^\+(\d+)([smh])$/);
    if (!match) return Date.now();
    const n = parseInt(match[1]);
    const unit = match[2];
    const ms = unit === 's' ? n * 1000 : unit === 'm' ? n * 60000 : n * 3600000;
    return Date.now() + ms;
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

// ── Scheduled Tasks ──────────────────────────────────────────
export function scheduleTask(cronExpr, description, action) {
  const tasks = loadJSON(TASKS_FILE, []);
  const t = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    cron: cronExpr,
    description,
    action,
    created: new Date().toISOString(),
    status: 'active',
    lastRun: null,
  };
  tasks.push(t);
  saveJSON(TASKS_FILE, tasks);
  return t;
}

export function listScheduledTasks() {
  return loadJSON(TASKS_FILE, []).filter(t => t.status === 'active');
}

export function cancelScheduledTask(id) {
  const tasks = loadJSON(TASKS_FILE, []);
  const idx = tasks.findIndex(t => t.id === id);
  if (idx >= 0) {
    tasks[idx].status = 'cancelled';
    saveJSON(TASKS_FILE, tasks);
    return true;
  }
  return false;
}

export function checkCron(cronExpr, now = new Date()) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [min, hour, dom, month, dow] = parts;
  return matchCronPart(min, now.getMinutes()) &&
         matchCronPart(hour, now.getHours()) &&
         matchCronPart(dom, now.getDate()) &&
         matchCronPart(month, now.getMonth() + 1) &&
         matchCronPart(dow, now.getDay());
}

function matchCronPart(expr, value) {
  if (expr === '*') return true;
  if (!isNaN(parseInt(expr))) return parseInt(expr) === value;
  if (expr.includes(',')) return expr.split(',').some(p => matchCronPart(p.trim(), value));
  if (expr.includes('-')) {
    const [a, b] = expr.split('-').map(Number);
    return value >= a && value <= b;
  }
  if (expr.startsWith('*/')) {
    const n = parseInt(expr.slice(2));
    return value % n === 0;
  }
  return false;
}
