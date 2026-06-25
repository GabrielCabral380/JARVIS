/**
 * JARVIS Short Memory — Fast short-term memory with pattern matching
 * Inspired by aiwaves-cn/agents long-short term memory architecture
 * 
 * Features:
 *  - Ring buffer for recent conversations (last 50 messages)
 *  - Key-value store for facts/preferences
 *  - Pattern-based recall
 *  - Auto-persist to disk
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SHORT_MEMORY_FILE = path.join(PROJECT_ROOT, 'system', 'JARVIS-SHORT-MEMORY.json');

const MAX_MESSAGES = 50;
const MAX_FACTS = 200;

// ─── LOAD/SAVE ───
function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SHORT_MEMORY_FILE, 'utf8'));
    return {
      messages: Array.isArray(data.messages) ? data.messages : [],
      facts: data.facts || {},
      context: data.context || {},
    };
  } catch {
    return { messages: [], facts: {}, context: {} };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(SHORT_MEMORY_FILE), { recursive: true });
  fs.writeFileSync(SHORT_MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── MESSAGES (Ring Buffer) ───
export function addMessage(role, content) {
  const mem = load();
  mem.messages.push({
    ts: new Date().toISOString(),
    role,
    content: String(content).slice(0, 2000),
  });
  if (mem.messages.length > MAX_MESSAGES) {
    mem.messages = mem.messages.slice(-MAX_MESSAGES);
  }
  save(mem);
  return mem.messages.length;
}

export function getRecentMessages(n = 10) {
  const mem = load();
  return mem.messages.slice(-n);
}

export function getContextSummary() {
  const messages = getRecentMessages(5);
  return messages.map(m => `${m.role}: ${m.content}`).join('\n');
}

// ─── FACTS (KV Store) ───
export function remember(key, value) {
  const mem = load();
  mem.facts[key] = {
    value,
    updatedAt: new Date().toISOString(),
    count: (mem.facts[key]?.count || 0) + 1,
  };
  const keys = Object.keys(mem.facts);
  if (keys.length > MAX_FACTS) {
    // Remove oldest
    const oldest = keys.sort((a, b) => 
      new Date(mem.facts[a].updatedAt) - new Date(mem.facts[b].updatedAt)
    )[0];
    delete mem.facts[oldest];
  }
  save(mem);
}

export function recall(key) {
  const mem = load();
  return mem.facts[key]?.value || null;
}

export function forget(key) {
  const mem = load();
  if (mem.facts[key]) {
    delete mem.facts[key];
    save(mem);
    return true;
  }
  return false;
}

export function listFacts() {
  const mem = load();
  return Object.entries(mem.facts).map(([k, v]) => ({
    key: k,
    value: v.value,
    updatedAt: v.updatedAt,
    count: v.count,
  }));
}

// ─── PATTERN RECALL ───
export function recallByPattern(query) {
  const mem = load();
  const q = query.toLowerCase();
  const results = [];
  
  // Search in messages
  for (const msg of mem.messages) {
    if (msg.content.toLowerCase().includes(q)) {
      results.push({ type: 'message', content: msg.content, ts: msg.ts });
    }
  }
  
  // Search in facts
  for (const [key, v] of Object.entries(mem.facts)) {
    if (key.toLowerCase().includes(q) || String(v.value).toLowerCase().includes(q)) {
      results.push({ type: 'fact', key, value: v.value, ts: v.updatedAt });
    }
  }
  
  return results.slice(0, 10);
}

// ─── CONTEXT WINDOW ───
export function contextWindow(topic) {
  const messages = getRecentMessages(20);
  const relevant = messages.filter(m => 
    m.content.toLowerCase().includes(topic.toLowerCase())
  );
  return relevant.slice(0, 10);
}

// ─── STATS ───
export function memoryStats() {
  const mem = load();
  return {
    messages: mem.messages.length,
    maxMessages: MAX_MESSAGES,
    facts: Object.keys(mem.facts).length,
    maxFacts: MAX_FACTS,
    lastActivity: mem.messages.length > 0 
      ? mem.messages[mem.messages.length - 1].ts 
      : null,
  };
}

// ─── CLEAR ───
export function clearMemory() {
  save({ messages: [], facts: {}, context: {} });
}

export function clearMessages() {
  const mem = load();
  mem.messages = [];
  save(mem);
}
