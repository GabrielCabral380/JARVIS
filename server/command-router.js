/**
 * JARVIS Command Router — Expanded NL Command Router (PT-BR)
 * Handles: files, media, email, calendar, smart home, screenshot, system, news, calc, translate
 */

const SAFE_BLOCK = [
  /rm\s+-rf/i, /del\s+\/s/i, /format\s+[a-z]:/i, /diskpart/i,
  /reg\s+delete/i, /shutdown\s+\/[sr]/i, /net\s+user.*\/delete/i,
  /rmdir\s+\/s\s+\//i, /del\s+\/f\s+\/s\s+/i
];

function safetyCheck(cmd) {
  const hit = SAFE_BLOCK.find(rx => rx.test(cmd));
  return { allowed: !hit, reason: hit ? 'Comando bloqueado por segurança.' : 'OK' };
}

// ─── FILE OPERATIONS ───
export function runFileCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'file', ok: false, text: '' };

  // Criar pasta/diretório
  let m = lower.match(/(?:criar|crie|nova?)\s+(?:pasta|diret[oó]rio|folder)\s+(?:em\s+)?(.+)/i);
  if (m) {
    const target = m[1].trim().replace(/['"]/g, '');
    const safe = safetyCheck(target);
    if (!safe.allowed) return { ...result, text: safe.reason };
    return { ...result, ok: true, text: `Pasta criada: ${target}`, command: { cmd: 'mkdir', args: [target] } };
  }

  // Renomear arquivo
  m = lower.match(/(?:renomear|rename)\s+(?:o\s+|a\s+)?(?:arquivo\s+|ficheiro\s+)?(.+?)\s+(?:para|como|to)\s+(.+)/i);
  if (m) {
    const src = m[1].trim().replace(/['"]/g, '');
    const dst = m[2].trim().replace(/['"]/g, '');
    const safe = safetyCheck(src + ' ' + dst);
    if (!safe.allowed) return { ...result, text: safe.reason };
    return { ...result, ok: true, text: `Renomeado: ${src} → ${dst}`, command: { cmd: 'rename', args: [src, dst] } };
  }

  // Copiar arquivo
  m = lower.match(/(?:copiar|copy)\s+(?:o\s+|a\s+)?(?:arquivo\s+|ficheiro\s+)?(.+?)\s+(?:para|to)\s+(.+)/i);
  if (m) {
    const src = m[1].trim().replace(/['"]/g, '');
    const dst = m[2].trim().replace(/['"]/g, '');
    const safe = safetyCheck(src + ' ' + dst);
    if (!safe.allowed) return { ...result, text: safe.reason };
    return { ...result, ok: true, text: `Copiado: ${src} → ${dst}`, command: { cmd: 'copy', args: [src, dst] } };
  }

  // Mover arquivo
  m = lower.match(/(?:mover|move|mudar)\s+(?:o\s+|a\s+)?(?:arquivo\s+|ficheiro\s+)?(.+?)\s+(?:para|to)\s+(.+)/i);
  if (m) {
    const src = m[1].trim().replace(/['"]/g, '');
    const dst = m[2].trim().replace(/['"]/g, '');
    const safe = safetyCheck(src + ' ' + dst);
    if (!safe.allowed) return { ...result, text: safe.reason };
    return { ...result, ok: true, text: `Movido: ${src} → ${dst}`, command: { cmd: 'move', args: [src, dst] } };
  }

  // Listar arquivos
  m = lower.match(/(?:listar|list|mostrar|ver)\s+(?:os\s+|as\s+)?(?:arquivos?|ficheiros?|conte[uú]do)\s+(?:de|da|do|em)\s+(.+)/i);
  if (m) {
    const dir = m[1].trim().replace(/['"]/g, '');
    return { ...result, ok: true, text: `Listando: ${dir}`, command: { cmd: 'list', args: [dir] } };
  }

  // Apagar arquivo (com confirmação)
  m = lower.match(/(?:apagar|delete|remover|excluir)\s+(?:o\s+|a\s+)?(?:arquivo\s+|ficheiro\s+)?(.+)/i);
  if (m) {
    const target = m[1].trim().replace(/['"]/g, '');
    return { ...result, ok: false, requiresApproval: true, text: `Aprovação necessária para apagar: ${target}`, command: { cmd: 'delete', args: [target] } };
  }

  return result;
}

// ─── MEDIA COMMANDS ───
export function runMediaCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'media', ok: false, text: '' };

  // Volume
  let m = lower.match(/(?:volume|vol)\s+(?:para\s+)?(\d{1,3})\s*%/i);
  if (m) {
    const vol = Math.min(100, Math.max(0, parseInt(m[1])));
    return { ...result, ok: true, text: `Volume ajustado para ${vol}%`, command: { cmd: 'volume', args: [vol] } };
  }

  if (/(?:mudo|mutar|silenciar)/i.test(lower)) {
    return { ...result, ok: true, text: 'Mudo ativado', command: { cmd: 'volume', args: [0] } };
  }

  if (/(?:aumentar\s+volume|subir\s+volume|mais\s+alto)/i.test(lower)) {
    return { ...result, ok: true, text: 'Volume aumentado +20%', command: { cmd: 'volume_up', args: [] } };
  }

  if (/(?:diminuir\s+volume|baixar\s+volume|mais\s+baixo)/i.test(lower)) {
    return { ...result, ok: true, text: 'Volume diminuído -20%', command: { cmd: 'volume_down', args: [] } };
  }

  // Player controls
  if (/(?:tocar|play|reproduzir|iniciar)\s+(?:m[uú]sica|faixa|v[ií]deo)?/i.test(lower)) {
    return { ...result, ok: true, text: 'Reproduzindo', command: { cmd: 'play', args: [] } };
  }

  if (/(?:pausar|pause|parar)\s+(?:m[uú]sica|faixa|v[ií]deo)?/i.test(lower)) {
    return { ...result, ok: true, text: 'Pausado', command: { cmd: 'pause', args: [] } };
  }

  if (/(?:pr[oó]xim[ao]|next|avan[cc]ar|seguinte)/i.test(lower)) {
    return { ...result, ok: true, text: 'Próxima faixa', command: { cmd: 'next', args: [] } };
  }

  if (/(?:anterior|previous|voltar)/i.test(lower)) {
    return { ...result, ok: true, text: 'Faixa anterior', command: { cmd: 'previous', args: [] } };
  }

  if (/(?:parar|stop)\s+(?:m[uú]sica|faixa|v[ií]deo|reprodu[cc][cç][aã]o)?/i.test(lower)) {
    return { ...result, ok: true, text: 'Reprodução parada', command: { cmd: 'stop', args: [] } };
  }

  return result;
}

// ─── SMART HOME ───
export function runSmartHomeCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'smart_home', ok: false, text: '' };

  // Luzes
  let m = lower.match(/(?:ligar|acender|ativar)\s+(?:a\s+)?luz(?:es)?\s+(?:do|da|de|no|na)?\s*([\w\s]+)?/i);
  if (m) {
    const room = (m[1] || 'geral').trim();
    return { ...result, ok: true, text: `Luz ${room} ligada`, command: { cmd: 'light_on', args: [room] } };
  }

  m = lower.match(/(?:desligar|apagar|desativar)\s+(?:a\s+)?luz(?:es)?\s+(?:do|da|de|no|na)?\s*([\w\s]+)?/i);
  if (m) {
    const room = (m[1] || 'geral').trim();
    return { ...result, ok: true, text: `Luz ${room} desligada`, command: { cmd: 'light_off', args: [room] } };
  }

  // Brilho
  m = lower.match(/(?:brilho|brightness)\s+(?:da\s+)?luz\s+(?:do|da)?\s*([\w\s]+)?\s+(?:para\s+)?(\d{1,3})\s*%/i);
  if (m) {
    const room = (m[1] || 'geral').trim();
    const brightness = Math.min(100, Math.max(0, parseInt(m[2])));
    return { ...result, ok: true, text: `Brilho luz ${room}: ${brightness}%`, command: { cmd: 'light_brightness', args: [room, brightness] } };
  }

  // Temperatura
  m = lower.match(/(?:temperatura|ar\s+condicionado|ac|ar)\s+(?:para\s+|em\s+)?(\d{1,2})\s*[°º]?c?/i);
  if (m) {
    const temp = Math.min(30, Math.max(16, parseInt(m[1])));
    return { ...result, ok: true, text: `Temperatura ajustada para ${temp}°C`, command: { cmd: 'temperature', args: [temp] } };
  }

  m = lower.match(/(?:ligar|ativar)\s+(?:ar\s+condicionado|ac|ar)/i);
  if (m) {
    return { ...result, ok: true, text: 'Ar condicionado ligado', command: { cmd: 'ac_on', args: [] } };
  }

  m = lower.match(/(?:desligar|desativar)\s+(?:ar\s+condicionado|ac|ar)/i);
  if (m) {
    return { ...result, ok: true, text: 'Ar condicionado desligado', command: { cmd: 'ac_off', args: [] } };
  }

  // Dispositivo genérico
  m = lower.match(/(?:ligar|ativar)\s+(?:o\s+|a\s+)?([\w\s]+)/i);
  if (m) {
    const device = m[1].trim();
    return { ...result, ok: true, text: `Dispositivo ligado: ${device}`, command: { cmd: 'device_on', args: [device] } };
  }

  m = lower.match(/(?:desligar|desativar)\s+(?:o\s+|a\s+)?([\w\s]+)/i);
  if (m) {
    const device = m[1].trim();
    return { ...result, ok: true, text: `Dispositivo desligado: ${device}`, command: { cmd: 'device_off', args: [device] } };
  }

  return result;
}

// ─── SYSTEM COMMANDS ───
export function runSystemCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'system', ok: false, text: '' };

  if (/(?:capturar|tirar|fazer)\s+(?:screenshot|captura\s+de\s+tela|foto\s+da\s+tela)/i.test(lower)) {
    return { ...result, ok: true, text: 'Screenshot capturado', command: { cmd: 'screenshot', args: [] } };
  }

  if (/(?:status|info)\s+(?:do\s+)?sistema/i.test(lower)) {
    return { ...result, ok: true, text: 'Status do sistema', command: { cmd: 'system_status', args: [] } };
  }

  if (/(?:disco|espa[cc]o)\s+(?:livre|dispon[ií]vel)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando espaço em disco', command: { cmd: 'disk_space', args: [] } };
  }

  if (/(?:mem[oó]ria|ram)\s+(?:livre|dispon[ií]vel|uso)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando memória', command: { cmd: 'memory', args: [] } };
  }

  if (/(?:processos|process)\s+(?:rodando|ativos|em\s+execu[cc][cç][aã]o)/i.test(lower)) {
    return { ...result, ok: true, text: 'Listando processos', command: { cmd: 'process_list', args: [] } };
  }

  if (/(?:bateria|battery)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando bateria', command: { cmd: 'battery', args: [] } };
  }

  if (/(?:rede|network|internet|wi-?fi|ethernet)/i.test(lower)) {
    return { ...result, ok: true, text: 'Status da rede', command: { cmd: 'network', args: [] } };
  }

  if (/(?:uptime|tempo\s+de\s+execu[cc][cç][aã]o|h[aá]\s+quanto)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando uptime', command: { cmd: 'uptime', args: [] } };
  }

  return result;
}

// ─── CALCULATOR ───
export function runCalcCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'calc', ok: false, text: '' };

  // Expressões matemáticas
  const mathExpr = lower
    .replace(/quanto\s+[eé]\s+/i, '')
    .replace(/calcule|calcula|calcular/i, '')
    .replace(/mais|somado?\s+a?/i, '+')
    .replace(/menos|subtra[ií]do?\s+de?/i, '-')
    .replace(/vezes|multiplicado\s+por|x|\*/i, '*')
    .replace(/dividido\s+por|\//i, '/')
    .replace(/por\s+cento\s+de/i, '* 0.01 *')
    .replace(/ra[ií]z\s+quadrada\s+de/i, 'Math.sqrt')
    .replace(/ao\s+quadrado|elevado\s+a\s+2/i, '**2')
    .replace(/%/g, '/100')
    .replace(/[^\d+\-*/().%\s**Math.sqrtpi]/g, '')
    .replace(/pi/g, 'Math.PI')
    .trim();

  if (mathExpr && /[0-9]/.test(mathExpr) && /[+\-*/]/.test(mathExpr)) {
    try {
      const safeExpr = mathExpr.replace(/[^0-9+\-*/().%\s*Math.sqrtPI]/g, '');
      const evalResult = Function(`"use strict"; return (${safeExpr})`)();
      const display = mathExpr.replace(/\*\*/g, '²').replace(/\*/g, '×').replace(/\//g, '÷');
      return { ...result, ok: true, text: `${display} = ${evalResult}`, command: { cmd: 'calc', args: [evalResult] } };
    } catch {
      return { ...result, text: 'Expressão inválida. Ex: "quanto é 15% de 200"' };
    }
  }

  // Porcentagem simples
  let m = lower.match(/(\d{1,4})\s*%\s+(?:de|do|da)\s+(\d{1,6})/i);
  if (m) {
    const pct = parseInt(m[1]);
    const val = parseInt(m[2]);
    const res = (pct / 100) * val;
    return { ...result, ok: true, text: `${pct}% de ${val} = ${res}`, command: { cmd: 'calc', args: [res] } };
  }

  return result;
}

// ─── TRANSLATE ───
export function runTranslateCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'translate', ok: false, text: '' };

  let m = lower.match(/(?:traduzir|traduz|translate|tradu[cc][aã]o)\s+(?:o\s+|a\s+|o\s+texto\s+)?["""]?(.+?)["""]?\s+(?:para|to|em|in)\s+(.+)/i);
  if (m) {
    const text = m[1].trim();
    const lang = m[2].trim();
    return { ...result, ok: true, text: `Traduzindo "${text}" para ${lang}`, command: { cmd: 'translate', args: [text, lang] } };
  }

  m = lower.match(/(?:como\s+(?:se\s+)?(?:diz|fala|falo))\s+(.+?)\s+(?:em|in|no)\s+(.+)/i);
  if (m) {
    const text = m[1].trim();
    const lang = m[2].trim();
    return { ...result, ok: true, text: `Em ${lang}: [tradução de "${text}"]`, command: { cmd: 'translate', args: [text, lang] } };
  }

  return result;
}

// ─── EMAIL ───
export function runEmailCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'email', ok: false, text: '' };

  if (/(?:ver|ler|checar|verificar)\s+(?:os\s+)?(?:emails?|correio|caixa\s+de\s+entrada)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando emails...', command: { cmd: 'email_list', args: [] } };
  }

  let m = lower.match(/(?:enviar|envie|manda[ar]?)\s+(?:um[ao]?\s+)?(?:email|mensagem|mail)\s+(?:para|to|@)\s+(.+?)\s+(?:com\s+|com\s+)?(?:assunto\s+)?(.+?)(?:\s+(?:e\s+)?(?:corpo|conte[uú]do|mensagem)\s+(.+))?$/i);
  if (m) {
    const to = m[1].trim();
    const subject = (m[2] || 'Sem assunto').trim();
    const body = (m[3] || '').trim();
    return { ...result, ok: true, text: `Email para ${to}: ${subject}`, command: { cmd: 'email_send', args: [to, subject, body] } };
  }

  return result;
}

// ─── CALENDAR ───
export function runCalendarCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'calendar', ok: false, text: '' };

  if (/(?:ver|mostrar|quais?)\s+(?:os\s+)?(?:eventos|compromissos|agenda|reuni[oõ]es)/i.test(lower)) {
    return { ...result, ok: true, text: 'Verificando agenda...', command: { cmd: 'calendar_list', args: [] } };
  }

  if (/(?:hoje|today)/i.test(lower) && /(?:eventos|compromissos|agenda)/i.test(lower)) {
    return { ...result, ok: true, text: 'Eventos de hoje:', command: { cmd: 'calendar_today', args: [] } };
  }

  let m = lower.match(/(?:agendar|agende|marcar|criar)\s+(?:um[ao]?\s+)?(?:evento|compromisso|reuni[aã]o)\s+(.+?)\s+(?:para|em|no|na)\s+(.+)/i);
  if (m) {
    const title = m[1].trim();
    const when = m[2].trim();
    return { ...result, ok: true, text: `Agendado: ${title} para ${when}`, command: { cmd: 'calendar_add', args: [title, when] } };
  }

  return result;
}

// ─── NEWS ───
export function runNewsCommand(input) {
  const lower = input.toLowerCase();
  const result = { action: 'news', ok: false, text: '' };

  if (/(?:not[ií]cias|news|resumo|novidades|[uú]ltimas?)/i.test(lower)) {
    let topic = '';
    const m = lower.match(/(?:not[ií]cias|novidades|resumo)\s+(?:de|sobre|do|da)\s+(.+)/i);
    if (m) topic = m[1].trim();
    return { ...result, ok: true, text: topic ? `Notícias sobre: ${topic}` : 'Últimas notícias', command: { cmd: 'news', args: [topic] } };
  }

  if (/(?:clima|tempo|weather|previs[aã]o)/i.test(lower)) {
    let city = '';
    const m = lower.match(/(?:clima|tempo|previs[aã]o)\s+(?:de|em|da|do)?\s*(.+)/i);
    if (m) city = m[1].trim();
    return { ...result, ok: true, text: city ? `Clima: ${city}` : 'Clima atual', command: { cmd: 'weather', args: [city] } };
  }

  return result;
}

// ─── MAIN ROUTER ───
export function runAdvancedLocalCommands(input) {
  const normalized = input.trim();

  // Try each sub-router in priority order
  const routers = [
    { name: 'calc', fn: runCalcCommand, patterns: [/quanto\s+[eé]\s/i, /calcule|calcula/i, /%\s+de/i, /quanto\s+/i] },
    { name: 'file', fn: runFileCommand, patterns: [/criar\s+(?:pasta|diret)/i, /renomear/i, /copiar/i, /mover/i, /apagar\s+(?:o\s+|a\s+)?(?:arquivo|ficheiro)/i, /listar\s+(?:os\s+|as\s+)?(?:arquivos?|ficheiros?)/i] },
    { name: 'media', fn: runMediaCommand, patterns: [/volume/i, /tocar|play/i, /pausar|pause/i, /pr[oó]xim[ao]|next/i, /anterior/i, /parar|stop/i] },
    { name: 'smart', fn: runSmartHomeCommand, patterns: [/luz|brilho|temperatura|ar\s+condicionado|ligar\s+(?:o\s+|a\s+)/i, /desligar\s+(?:o\s+|a\s+)/i] },
    { name: 'system', fn: runSystemCommand, patterns: [/screenshot|capturar/i, /status\s+(?:do\s+)?sistema/i, /disco/i, /mem[oó]ria/i, /processos/i, /bateria/i, /rede|network|wi-?fi/i, /uptime/i] },
    { name: 'translate', fn: runTranslateCommand, patterns: [/traduzir|traduz|translate/i, /como\s+(?:se\s+)?(?:diz|fala)/i] },
    { name: 'email', fn: runEmailCommand, patterns: [/email|correio|caixa\s+de\s+entrada/i, /enviar\s+(?:um\s+)?(?:email|mensagem)/i] },
    { name: 'calendar', fn: runCalendarCommand, patterns: [/eventos|compromissos|agenda|reuni[oõ]es/i, /agendar|agende|marcar/i] },
    { name: 'news', fn: runNewsCommand, patterns: [/not[ií]cias|novidades|resumo/i, /clima|tempo|weather|previs[aã]o/i] },
  ];

  for (const router of routers) {
    const matches = router.patterns.some(p => p.test(normalized));
    if (matches) {
      const result = router.fn(normalized);
      if (result.ok !== undefined) return { ...result, category: router.name };
    }
  }

  return { ok: false, text: 'Comando não reconhecido.', action: 'unknown' };
}
