/**
 * JARVIS TTS Engine — EdgeTTS (Microsoft free, no API key)
 * High-quality PT-BR voice synthesis server-side
 * Falls back to Web Speech API on client if server TTS unavailable
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_VOICE = 'pt-BR-FranciscaNeural';
const DEFAULT_RATE = '-15%';

const VOICES = {
  'pt-BR': 'pt-BR-FranciscaNeural',
  'pt-BR-male': 'pt-BR-AntonioNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'en-US': 'en-US-GuyNeural',
  'en-US-female': 'en-US-JennyNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
};

let _ttsAvailable = null;

function isTtsAvailable() {
  if (_ttsAvailable !== null) return _ttsAvailable;
  try {
    const r = spawn('edge-tts', ['--version'], { stdio: 'ignore' });
    _ttsAvailable = true;
  } catch {
    _ttsAvailable = false;
  }
  return _ttsAvailable;
}

async function synthesize(text, options = {}) {
  const voice = options.voice || DEFAULT_VOICE;
  const rate = options.rate || DEFAULT_RATE;

  if (!text || !text.trim()) {
    throw new Error('Texto vazio para TTS');
  }

  if (!isTtsAvailable()) {
    throw new Error('edge-tts não instalado');
  }

  const tmpFile = path.join(os.tmpdir(), `jarvis-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);

  return new Promise((resolve, reject) => {
    const proc = spawn('edge-tts', ['--voice', voice, `--rate=${rate}`, '--write-media', tmpFile, '--text', text], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const errors = [];
    proc.stderr.on('data', c => errors.push(c));
    proc.on('close', code => {
      if (code !== 0) {
        try { fs.unlinkSync(tmpFile); } catch {}
        reject(new Error('edge-tts erro: ' + Buffer.concat(errors).toString().slice(0, 200)));
      } else {
        try {
          const data = fs.readFileSync(tmpFile);
          fs.unlinkSync(tmpFile);
          resolve(data);
        } catch (e) {
          reject(new Error('Falha ao ler áudio gerado: ' + e.message));
        }
      }
    });
  });
}

function listVoices() {
  return Object.entries(VOICES).map(([key, id]) => ({ key, id }));
}

export { synthesize, listVoices, DEFAULT_VOICE, VOICES };
