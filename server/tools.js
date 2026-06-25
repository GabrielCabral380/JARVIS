/**
 * JARVIS Tools — 8 Essential Tools (OpenJarvis-style tool registry)
 * 
 * Tools disponíveis:
 *  1. web_fetch    — HTTP requests
 *  2. web_search   — Search engines
 *  3. shell        — Execute system commands
 *  4. file_read    — Read files
 *  5. file_write   — Write files
 *  6. calc         — Math expressions
 *  7. datetime     — Date/time utilities
 *  8. hash         — Cryptographic hashing
 */
import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DANGEROUS = [
  /rm\s+-rf/i, /del\s+\/s/i, /format\s+/i, /diskpart/i,
  /reg\s+delete/i, /shutdown/i, /net\s+user.*\/delete/i
];
function isSafe(cmd) { return !DANGEROUS.some(rx => rx.test(cmd)); }

export const TOOLS = {
  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch URL content (GET)',
    parameters: { url: 'string' },
    async execute({ url, method = 'GET', body }) {
      if (!url.startsWith('http')) return { ok: false, error: 'URL must start with http' };
      const opts = { method, headers: { 'user-agent': 'JARVIS/1.0' } };
      if (body) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
      const resp = await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
      const text = await resp.text();
      return { ok: true, status: resp.status, result: text.slice(0, 5000) };
    }
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web (DuckDuckGo instant answer)',
    parameters: { query: 'string' },
    async execute({ query }) {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await resp.json();
      const result = data.AbstractText || data.Answer || data.RelatedTopics?.map(t => t.Text).slice(0, 5).join('\n') || '';
      return { ok: true, result: result.slice(0, 3000) };
    }
  },

  shell: {
    name: 'shell',
    description: 'Execute safe system command',
    parameters: { command: 'string' },
    async execute({ command, cwd, timeout = 30000 }) {
      if (!isSafe(command)) return { ok: false, error: 'Command blocked by safety policy' };
      return new Promise((resolve) => {
        const child = spawn('/bin/bash', ['-c', command], {
          cwd: cwd || PROJECT_ROOT,
          env: { ...process.env, PATH: process.env.PATH },
          windowsHide: true,
        });
        let out = '', err = '';
        const timer = setTimeout(() => { child.kill(); resolve({ ok: false, error: 'Timeout' }); }, timeout);
        child.stdout.on('data', d => out += d.toString());
        child.stderr.on('data', d => err += d.toString());
        child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, result: (out || err || '').slice(0, 5000) }); });
        child.on('error', e => { clearTimeout(timer); resolve({ ok: false, error: e.message }); });
      });
    }
  },

  file_read: {
    name: 'file_read',
    description: 'Read file content',
    parameters: { path: 'string' },
    async execute({ path: filepath, lines }) {
      const full = path.resolve(PROJECT_ROOT, filepath);
      if (!full.startsWith(PROJECT_ROOT)) return { ok: false, error: 'Path outside project root' };
      if (!fs.existsSync(full)) return { ok: false, error: 'File not found' };
      const content = fs.readFileSync(full, 'utf8');
      const result = lines ? content.split('\n').slice(0, lines).join('\n') : content;
      return { ok: true, result: result.slice(0, 10000) };
    }
  },

  file_write: {
    name: 'file_write',
    description: 'Write file content',
    parameters: { path: 'string', content: 'string' },
    async execute({ path: filepath, content, append }) {
      const full = path.resolve(PROJECT_ROOT, filepath);
      if (!full.startsWith(PROJECT_ROOT)) return { ok: false, error: 'Path outside project root' };
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (append) fs.appendFileSync(full, content);
      else fs.writeFileSync(full, content);
      return { ok: true, result: `File written: ${filepath}` };
    }
  },

  calc: {
    name: 'calc',
    description: 'Evaluate mathematical expression',
    parameters: { expression: 'string' },
    async execute({ expression }) {
      const safe = expression.replace(/[^0-9+\-*/().%\s**Math.sqrtPI]/g, '');
      try {
        const result = Function(`"use strict"; return (${safe})`)();
        return { ok: true, result };
      } catch {
        return { ok: false, error: 'Invalid expression' };
      }
    }
  },

  datetime: {
    name: 'datetime',
    description: 'Get current date/time information',
    parameters: { timezone: 'string' },
    async execute({ timezone, format }) {
      const now = new Date();
      const result = {
        iso: now.toISOString(),
        local: now.toLocaleString('pt-BR', { timeZone: timezone }),
        date: now.toLocaleDateString('pt-BR'),
        time: now.toLocaleTimeString('pt-BR'),
        day: now.toLocaleDateString('pt-BR', { weekday: 'long' }),
        timestamp: now.getTime(),
      };
      return { ok: true, result };
    }
  },

  hash: {
    name: 'hash',
    description: 'Generate cryptographic hash',
    parameters: { input: 'string' },
    async execute({ input, algorithm = 'sha256' }) {
      const hash = crypto.createHash(algorithm).update(input).digest('hex');
      return { ok: true, result: hash, algorithm };
    }
  },
};

export async function executeTool(name, params) {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(params);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function listTools() {
  return Object.entries(TOOLS).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
