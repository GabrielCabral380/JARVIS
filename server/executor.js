/**
 * JARVIS Local Executor — runs file, media, system, smart home, calc, translate commands
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

function isSafe(cmd) {
  return !DANGEROUS.some(rx => rx.test(cmd));
}

// ─── FILE OPERATIONS ───
export function runFileOp(command) {
  const { cmd, args } = command;

  switch (cmd) {
    case 'mkdir': {
      const target = path.join(PROJECT_ROOT, args[0]);
      if (!target.startsWith(PROJECT_ROOT)) return { ok: false, text: 'Caminho inválido' };
      fs.mkdirSync(target, { recursive: true });
      return { ok: true, text: `Pasta criada: ${args[0]}` };
    }
    case 'rename': {
      const src = path.join(PROJECT_ROOT, args[0]);
      const dst = path.join(PROJECT_ROOT, args[1]);
      if (!src.startsWith(PROJECT_ROOT) || !dst.startsWith(PROJECT_ROOT))
        return { ok: false, text: 'Caminho inválido' };
      fs.renameSync(src, dst);
      return { ok: true, text: `Renomeado: ${args[0]} → ${args[1]}` };
    }
    case 'copy': {
      const src = path.join(PROJECT_ROOT, args[0]);
      const dst = path.join(PROJECT_ROOT, args[1]);
      if (!src.startsWith(PROJECT_ROOT) || !dst.startsWith(PROJECT_ROOT))
        return { ok: false, text: 'Caminho inválido' };
      fs.copyFileSync(src, dst);
      return { ok: true, text: `Copiado: ${args[0]} → ${args[1]}` };
    }
    case 'move': {
      const src = path.join(PROJECT_ROOT, args[0]);
      const dst = path.join(PROJECT_ROOT, args[1]);
      if (!src.startsWith(PROJECT_ROOT) || !dst.startsWith(PROJECT_ROOT))
        return { ok: false, text: 'Caminho inválido' };
      fs.renameSync(src, dst);
      return { ok: true, text: `Movido: ${args[0]} → ${args[1]}` };
    }
    case 'list': {
      const dir = args[0] ? path.join(PROJECT_ROOT, args[0]) : PROJECT_ROOT;
      if (!dir.startsWith(PROJECT_ROOT)) return { ok: false, text: 'Caminho inválido' };
      const items = fs.readdirSync(dir).slice(0, 50);
      return { ok: true, text: `Arquivos (${dir}):\n${items.join('\n')}` };
    }
    case 'delete': {
      const target = path.join(PROJECT_ROOT, args[0]);
      if (!target.startsWith(PROJECT_ROOT)) return { ok: false, text: 'Caminho inválido' };
      fs.rmSync(target, { recursive: true, force: true });
      return { ok: true, text: `Apagado: ${args[0]}` };
    }
    default:
      return { ok: false, text: `Operação desconhecida: ${cmd}` };
  }
}

// ─── MEDIA ───
export function runMediaOp(command) {
  const { cmd, args } = command;
  const isWin = os.platform() === 'win32';

  return new Promise((resolve) => {
    let child;
    if (isWin) {
      switch (cmd) {
        case 'volume': {
          const vol = args[0];
          child = spawn('powershell', ['-c', `(New-Object -ComObject WScript.Shell).SendKeys([char]${vol === 0 ? 'VK_VOLUME_MUTE' : 'VK_VOLUME_UP'})`], { windowsHide: true });
          break;
        }
        case 'volume_up':
          child = spawn('powershell', ['-c', 'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Audio { [DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte b, byte b2, uint d, int e); }"; [Audio]::keybd_event(0xAF, 0, 0, 0); [Audio]::keybd_event(0xAF, 2, 0, 0);'], { windowsHide: true });
          break;
        case 'volume_down':
          child = spawn('powershell', ['-c', 'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Audio { [DllImport(\\"user32.dll\\")] public static extern void keybd_event(byte b, byte b2, uint d, int e); }"; [Audio]::keybd_event(0xAE, 0, 0, 0); [Audio]::keybd_event(0xAE, 2, 0, 0);'], { windowsHide: true });
          break;
        case 'play':
        case 'pause':
        case 'next':
        case 'previous':
        case 'stop':
          resolve({ ok: true, text: `Mídia: ${cmd}` });
          return;
        default:
          resolve({ ok: false, text: `Comando de mídia desconhecido: ${cmd}` });
          return;
      }
    } else {
      // Linux/WSL
      switch (cmd) {
        case 'volume': {
          child = spawn('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${args[0]}%`]);
          break;
        }
        case 'volume_up':
          child = spawn('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '+10%']);
          break;
        case 'volume_down':
          child = spawn('pactl', ['set-sink-volume', '@DEFAULT_SINK@', '-10%']);
          break;
        case 'play':
        case 'pause':
        case 'next':
        case 'previous':
        case 'stop':
          resolve({ ok: true, text: `Mídia: ${cmd}` });
          return;
        default:
          resolve({ ok: false, text: `Comando de mídia desconhecido: ${cmd}` });
          return;
      }
    }

    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, text: 'Timeout' }); }, 5000);
    child.on('close', () => { clearTimeout(timer); resolve({ ok: true, text: `Mídia: ${cmd}` }); });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: true, text: `Mídia: ${cmd} (simulado)` }); });
  });
}

// ─── SYSTEM ───
export function runSystemOp(command) {
  const { cmd, args } = command;
  const isWin = os.platform() === 'win32';

  return new Promise((resolve) => {
    let child;
    let timer;

    switch (cmd) {
      case 'screenshot': {
        if (isWin) {
          child = spawn('powershell', ['-c', 'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | ForEach-Object { $bitmap = New-Object System.Drawing.Bitmap($_.Width, $_.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($_.Location, [System.Drawing.Point]::Empty, $_.Size); $bitmap.Save(\'C:\\Users\\Usuario\\Desktop\\screenshot.png\'); $graphics.Dispose(); $bitmap.Dispose(); Write-Output "Screenshot saved"'], { windowsHide: true });
        } else {
          // WSL: try gnome-screenshot, fallback to xwd
          child = spawn('sh', ['-c', 'gnome-screenshot -f /tmp/screenshot.png 2>/dev/null || import -window root /tmp/screenshot.png 2>/dev/null || xwd -root -silent | convert xwd:- /tmp/screenshot.png 2>/dev/null || echo "Screenshot unavailable"']);
        }
        break;
      }
      case 'system_status': {
        resolve({
          ok: true,
          text: `Sistema: ${os.platform()} ${os.release()}\nNode: ${process.version}\nUptime: ${Math.floor((Date.now() - process.uptime() * 1000) / 3600000)}h\nMem: ${Math.round(os.freemem() / 1024 / 1024)}MB livre / ${Math.round(os.totalmem() / 1024 / 1024)}MB total`
        });
        return;
      }
      case 'disk_space': {
        if (isWin) {
          child = spawn('powershell', ['-c', 'Get-PSDrive C | Select-Object { [math]::Round($_.Used / 1GB, 1) }GB_usado, { [math]::Round($_.Free / 1GB, 1) }GB_livre'], { windowsHide: true });
        } else {
          child = spawn('df', ['-h', '/']);
        }
        break;
      }
      case 'memory': {
        if (isWin) {
          child = spawn('powershell', ['-c', '(Get-CimInstance Win32_OperatingSystem | Select-Object { [math]::Round($_.FreePhysicalMemory / 1MB, 1) }GB_livre, { [math]::Round($_.TotalVisibleMemorySize / 1MB, 1) }GB_total | Format-List)'], { windowsHide: true });
        } else {
          child = spawn('free', ['-h']);
        }
        break;
      }
      case 'process_list': {
        if (isWin) {
          child = spawn('powershell', ['-c', 'Get-Process | Select-Object -First 10 Name, CPU, WorkingSet64 | Format-Table -AutoSize'], { windowsHide: true });
        } else {
          child = spawn('ps', ['aux', '--sort=-%mem']);
        }
        break;
      }
      case 'battery': {
        if (isWin) {
          child = spawn('powershell', ['-c', '(Get-CimInstance Win32_Battery | Select-Object { [math]::Round($_.EstimatedChargeRemaining, 0) }% | Format-List)'], { windowsHide: true });
        } else {
          child = spawn('cat', ['/sys/class/power_supply/BAT0/capacity']);
        }
        break;
      }
      case 'network': {
        child = spawn(isWin ? 'ipconfig' : 'ip', [isWin ? '' : 'addr']);
        break;
      }
      case 'uptime': {
        if (isWin) {
          child = spawn('powershell', ['-c', '(Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select-Object { $_.Hours }h { $_.Minutes }m'], { windowsHide: true });
        } else {
          child = spawn('uptime', ['-p']);
        }
        break;
      }
      default:
        resolve({ ok: false, text: `Comando de sistema desconhecido: ${cmd}` });
        return;
    }

    let out = '';
    timer = setTimeout(() => { child.kill(); resolve({ ok: true, text: out.slice(0, 500) || 'Comando executado' }); }, 10000);
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => out += d.toString());
    child.on('close', () => { clearTimeout(timer); resolve({ ok: true, text: out.slice(0, 500) || 'Comando executado' }); });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: true, text: 'Erro ao executar (simulado)' }); });
  });
}

// ─── SMART HOME (simulated / ready for integration) ───
export function runSmartHomeOp(command) {
  const { cmd, args } = command;
  const labels = {
    light_on: `Liga luz ${args[0] || ''}`,
    light_off: `Desliga luz ${args[0] || ''}`,
    light_brightness: `Brilho luz ${args[0] || ''}: ${args[1]}%`,
    ac_on: 'Ar condicionado ligado',
    ac_off: 'Ar condicionado desligado',
    temperature: `Temperatura: ${args[0]}°C`,
    device_on: `Dispositivo ligado: ${args[0]}`,
    device_off: `Dispositivo desligado: ${args[0]}`,
  };
  return { ok: true, text: labels[cmd] || `Smart Home: ${cmd}`, simulated: true };
}

// ─── CALC (already computed, just format) ───
export function runCalcOp(command) {
  return { ok: true, text: `Resultado: ${command.args[0]}` };
}

// ─── TRANSLATE (uses MyMemory API) ───
const LANG_MAP = {
  'inglês': 'en', 'ingles': 'en', 'english': 'en',
  'espanhol': 'es', 'espanol': 'es', 'spanish': 'es',
  'francês': 'fr', 'frances': 'fr', 'french': 'fr',
  'alemão': 'de', 'alemao': 'de', 'german': 'de',
  'italiano': 'it', 'italian': 'it',
  'japonês': 'ja', 'japones': 'ja', 'japanese': 'ja',
  'chinês': 'zh', 'chines': 'zh', 'chinese': 'zh',
  'coreano': 'ko', 'korean': 'ko',
  'russo': 'ru', 'russian': 'ru',
  'árabe': 'ar', 'arabe': 'ar', 'arabic': 'ar',
  'holandês': 'nl', 'holandes': 'nl', 'dutch': 'nl',
  'português': 'pt', 'portugues': 'pt', 'portuguese': 'pt',
  'brasileiro': 'pt-BR',
};

export function runTranslateOp(command) {
  return new Promise((resolve) => {
    const [text, langRaw] = command.args;
    const langLower = (langRaw || '').toLowerCase().trim();
    const langCode = LANG_MAP[langLower] || langLower.split(/[\s-]/)[0];
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=pt-BR|${encodeURIComponent(langCode)}`;
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json())
      .then(d => {
        const translated = d.responseData?.translatedText || text;
        resolve({ ok: true, text: `${text} → ${langCode.toUpperCase()}: ${translated}` });
      })
      .catch(() => resolve({ ok: true, text: `Tradução para ${langCode}: [indisponível offline]` }));
  });
}

// ─── MAIN EXECUTOR ───
export async function executeCommand(command) {
  if (!command || !command.cmd) return { ok: false, text: 'Comando inválido' };

  switch (command.cmd) {
    case 'mkdir':
    case 'rename':
    case 'copy':
    case 'move':
    case 'list':
    case 'delete':
      return runFileOp(command);
    case 'volume':
    case 'volume_up':
    case 'volume_down':
    case 'play':
    case 'pause':
    case 'next':
    case 'previous':
    case 'stop':
      return runMediaOp(command);
    case 'screenshot':
    case 'system_status':
    case 'disk_space':
    case 'memory':
    case 'process_list':
    case 'battery':
    case 'network':
    case 'uptime':
      return runSystemOp(command);
    case 'light_on':
    case 'light_off':
    case 'light_brightness':
    case 'ac_on':
    case 'ac_off':
    case 'temperature':
    case 'device_on':
    case 'device_off':
      return runSmartHomeOp(command);
    case 'calc':
      return runCalcOp(command);
    case 'translate':
      return runTranslateOp(command);
    default:
      return { ok: false, text: `Executor não reconhece: ${command.cmd}` };
  }
}
