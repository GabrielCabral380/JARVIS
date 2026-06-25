/**
 * JARVIS TTS Server — EdgeTTS via Python (Microsoft free TTS)
 * Uses Python edge-tts package (v7+) which is actively maintained
 * No API key required
 */
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve python3 with edge-tts: use absolute path to ensure module is found
const PYTHON3 = process.env.JARVIS_PYTHON3 || os.platform() === 'win32' ? 'python' : '/home/usuario/.hermes/hermes-agent/venv/bin/python3';

const PREFERRED_VOICES = {
  'pt-BR': 'pt-BR-FranciscaNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'en-US': 'en-US-GuyNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
};

const DEFAULT_VOICE = PREFERRED_VOICES['pt-BR'];

// Voice contexts — rate adjustments for different speaking styles
const VOICE_CONTEXTS = {
  default: { rate: '+0%', pitch: '+0Hz' },
  formal: { rate: '-5%', pitch: '-2Hz' },
  casual: { rate: '+10%', pitch: '+2Hz' },
  urgent: { rate: '+15%', pitch: '+5Hz' },
  calm: { rate: '-10%', pitch: '-3Hz' },
  excited: { rate: '+20%', pitch: '+5Hz' },
};

// Python script that synthesizes and writes MP3 to stdout
const TTS_SCRIPT = `
import sys, asyncio, edge_tts

async def main():
    text = sys.argv[1]
    voice = sys.argv[2] if len(sys.argv) > 2 else "pt-BR-FranciscaNeural"
    rate = sys.argv[3] if len(sys.argv) > 3 else "+0%"
    volume = sys.argv[4] if len(sys.argv) > 4 else "+0%"
    pitch = sys.argv[5] if len(sys.argv) > 5 else "+0Hz"
    c = edge_tts.Communicate(text, voice, rate=rate, volume=volume, pitch=pitch)
    import tempfile, os
    tmp = tempfile.mktemp(suffix=".mp3")
    await c.save(tmp)
    with open(tmp, "rb") as f:
        sys.stdout.buffer.write(f.read())
    os.unlink(tmp)

asyncio.run(main())
`;

const VOICES_SCRIPT = `
import sys, asyncio, json, edge_tts

async def main():
    voices = await edge_tts.list_voices()
    print(json.dumps(voices))

asyncio.run(main())
`;

/**
 * Synthesize text to MP3 Buffer using Python edge-tts
 * @param {string} text - Text to speak
 * @param {string} [voice] - Voice ID (e.g. 'pt-BR-FranciscaNeural')
 * @param {object} [opts] - { rate, pitch, volume }
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
export async function synthesize(text, voiceOrOpts = DEFAULT_VOICE, opts = {}) {
  if (!text || !text.trim()) {
    throw new Error('Texto vazio para síntese de voz');
  }

  let voice = DEFAULT_VOICE;
  let rate = '+0%';
  let volume = '+0%';
  let pitch = '+0Hz';
  let context = 'default';

  if (typeof voiceOrOpts === 'string') {
    voice = voiceOrOpts;
    if (opts) {
      rate = opts.rate || '+0%';
      volume = opts.volume || '+0%';
      pitch = opts.pitch || '+0Hz';
      if (opts.context && VOICE_CONTEXTS[opts.context]) context = opts.context;
    }
  } else if (voiceOrOpts && typeof voiceOrOpts === 'object') {
    voice = voiceOrOpts.voice || DEFAULT_VOICE;
    rate = voiceOrOpts.rate || '+0%';
    volume = voiceOrOpts.volume || '+0%';
    pitch = voiceOrOpts.pitch || '+0Hz';
    if (voiceOrOpts.context && VOICE_CONTEXTS[voiceOrOpts.context]) context = voiceOrOpts.context;
  }

  // Apply context adjustments
  const ctx = VOICE_CONTEXTS[context] || VOICE_CONTEXTS.default;
  if (!opts.rate && !voiceOrOpts?.rate) rate = ctx.rate;
  if (!opts.pitch && !voiceOrOpts?.pitch) pitch = ctx.pitch;

  return new Promise((resolve, reject) => {
    const args = ['-c', TTS_SCRIPT, text, voice, rate, volume, pitch];
    execFile(PYTHON3, args, { maxBuffer: 5 * 1024 * 1024, timeout: 30000, encoding: 'buffer' }, (err, stdout, stderr) => {
      if (err) {
        const errMsg = stderr ? stderr.toString('utf8').trim() : '';
        reject(new Error(`EdgeTTS failed: ${err.message}${errMsg ? ' — ' + errMsg : ''}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export function listPreferredVoices() {
  return Object.entries(PREFERRED_VOICES).map(([lang, id]) => ({ lang, id }));
}

export async function listAllVoices() {
  return new Promise((resolve) => {
    execFile(PYTHON3, ['-c', VOICES_SCRIPT], { maxBuffer: 5 * 1024 * 1024, timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(listPreferredVoices());
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve(listPreferredVoices());
      }
    });
  });
}

export { DEFAULT_VOICE, PREFERRED_VOICES, VOICE_CONTEXTS };
export const listVoices = listPreferredVoices;
