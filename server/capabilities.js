/**
 * JARVIS Capabilities Registry — 65+ actions across 15 categories
 * Complete action catalog with NL search
 */

const CAPABILITIES = [
  // ─── ARQUIVOS ───
  { id: 'file_mkdir', name: 'Criar pasta', keywords: ['criar pasta', 'novo diretório', 'mkdir', 'criar diretório'], category: 'arquivos' },
  { id: 'file_rename', name: 'Renomear arquivo', keywords: ['renomear', 'rename', 'mudar nome arquivo'], category: 'arquivos' },
  { id: 'file_copy', name: 'Copiar arquivo', keywords: ['copiar', 'copy', 'duplicar arquivo'], category: 'arquivos' },
  { id: 'file_move', name: 'Mover arquivo', keywords: ['mover', 'move', 'mudar arquivo'], category: 'arquivos' },
  { id: 'file_delete', name: 'Apagar arquivo', keywords: ['apagar', 'delete', 'remover', 'excluir arquivo'], category: 'arquivos' },
  { id: 'file_list', name: 'Listar arquivos', keywords: ['listar', 'mostrar', 'ver arquivos', 'list files'], category: 'arquivos' },
  { id: 'file_read', name: 'Ler arquivo', keywords: ['ler arquivo', 'ver conteúdo', 'read file', 'cat'], category: 'arquivos' },
  { id: 'file_write', name: 'Escrever arquivo', keywords: ['escrever arquivo', 'criar arquivo', 'write file', 'salvar'], category: 'arquivos' },
  { id: 'file_hash', name: 'Hash de arquivo', keywords: ['hash', 'checksum', 'md5', 'sha256'], category: 'arquivos' },

  // ─── MÍDIA ───
  { id: 'media_play', name: 'Tocar mídia', keywords: ['tocar', 'play', 'reproduzir', 'iniciar música'], category: 'mídia' },
  { id: 'media_pause', name: 'Pausar mídia', keywords: ['pausar', 'pause', 'parar música'], category: 'mídia' },
  { id: 'media_next', name: 'Próxima faixa', keywords: ['próxima', 'next', 'avançar', 'seguinte'], category: 'mídia' },
  { id: 'media_prev', name: 'Faixa anterior', keywords: ['anterior', 'previous', 'voltar música'], category: 'mídia' },
  { id: 'media_vol', name: 'Ajustar volume', keywords: ['volume', 'mudo', 'silenciar', 'mais alto', 'mais baixo'], category: 'mídia' },
  { id: 'media_stop', name: 'Parar reprodução', keywords: ['parar', 'stop', 'parar música'], category: 'mídia' },

  // ─── SMART HOME ───
  { id: 'light_on', name: 'Ligar luz', keywords: ['ligar luz', 'acender luz', 'ligar iluminação'], category: 'smart_home' },
  { id: 'light_off', name: 'Desligar luz', keywords: ['desligar luz', 'apagar luz'], category: 'smart_home' },
  { id: 'light_brightness', name: 'Ajustar brilho', keywords: ['brilho', 'iluminação', 'dimmer'], category: 'smart_home' },
  { id: 'ac_on', name: 'Ligar ar condicionado', keywords: ['ligar ar', 'ligar AC', 'ar condicionado'], category: 'smart_home' },
  { id: 'ac_off', name: 'Desligar ar condicionado', keywords: ['desligar ar', 'desligar AC'], category: 'smart_home' },
  { id: 'ac_temp', name: 'Ajustar temperatura', keywords: ['temperatura', 'graus', 'esfriar', 'aquecer', '°C'], category: 'smart_home' },
  { id: 'device_on', name: 'Ligar dispositivo', keywords: ['ligar', 'ativar', 'acionar dispositivo'], category: 'smart_home' },
  { id: 'device_off', name: 'Desligar dispositivo', keywords: ['desligar', 'desativar dispositivo'], category: 'smart_home' },

  // ─── SISTEMA ───
  { id: 'sys_screenshot', name: 'Screenshot', keywords: ['screenshot', 'captura de tela', 'foto da tela', 'capturar tela'], category: 'sistema' },
  { id: 'sys_status', name: 'Status do sistema', keywords: ['status', 'informações', 'info sistema', 'system info'], category: 'sistema' },
  { id: 'sys_disk', name: 'Espaço em disco', keywords: ['disco', 'espaço', 'storage', 'disk space'], category: 'sistema' },
  { id: 'sys_memory', name: 'Memória RAM', keywords: ['memória', 'ram', 'memoria ram', 'memory'], category: 'sistema' },
  { id: 'sys_process', name: 'Processos', keywords: ['processos', 'process', 'tarefas rodando', 'ps'], category: 'sistema' },
  { id: 'sys_battery', name: 'Bateria', keywords: ['bateria', 'battery', 'nível bateria'], category: 'sistema' },
  { id: 'sys_network', name: 'Rede', keywords: ['rede', 'network', 'wifi', 'internet', 'ethernet'], category: 'sistema' },
  { id: 'sys_uptime', name: 'Uptime', keywords: ['uptime', 'tempo de execução', 'há quanto tempo'], category: 'sistema' },

  // ─── NAVEGAÇÃO WEB ───
  { id: 'web_open', name: 'Abrir site', keywords: ['abrir', 'navegar', 'ir para', 'abrir site', 'open url'], category: 'web' },
  { id: 'web_search', name: 'Pesquisar na web', keywords: ['pesquisar', 'buscar', 'procurar', 'google', 'search'], category: 'web' },
  { id: 'web_fetch', name: 'Fetch URL', keywords: ['fetch', 'baixar página', 'web fetch', 'obter página'], category: 'web' },

  // ─── APPS ───
  { id: 'app_open', name: 'Abrir aplicativo', keywords: ['abrir app', 'executar', 'iniciar programa', 'abrir calculadora', 'abrir bloco'], category: 'apps' },
  { id: 'app_list', name: 'Listar aplicativos', keywords: ['listar apps', 'aplicativos', 'programas instalados'], category: 'apps' },

  // ─── LEMBRETES ───
  { id: 'reminder_add', name: 'Criar lembrete', keywords: ['lembra', 'lembrar', 'agendar lembrete', 'me lembra'], category: 'lembretes' },
  { id: 'reminder_list', name: 'Ver lembretes', keywords: ['ver lembretes', 'listar lembretes', 'meus lembretes'], category: 'lembretes' },
  { id: 'reminder_cancel', name: 'Cancelar lembrete', keywords: ['cancelar lembrete', 'remover lembrete'], category: 'lembretes' },

  // ─── AGENDAMENTO (CRON) ───
  { id: 'cron_add', name: 'Agendar tarefa', keywords: ['agendar', 'cron', 'recorrente', 'schedule', 'tarefa recorrente'], category: 'agendamento' },
  { id: 'cron_list', name: 'Ver tarefas agendadas', keywords: ['ver crons', 'listar agendamentos', 'tarefas agendadas'], category: 'agendamento' },
  { id: 'cron_cancel', name: 'Cancelar tarefa agendada', keywords: ['cancelar cron', 'remover agendamento'], category: 'agendamento' },

  // ─── CALCULADORA ───
  { id: 'calc_basic', name: 'Calculadora', keywords: ['quanto é', 'calcule', 'calcula', 'porcentagem', '% de', 'conta'], category: 'calculadora' },

  // ─── TRADUÇÃO ───
  { id: 'translate', name: 'Traduzir', keywords: ['traduzir', 'traduz', 'traduction', 'como diz', 'como fala', 'translate'], category: 'tradução' },

  // ─── EMAIL ───
  { id: 'email_list', name: 'Ver emails', keywords: ['ver emails', 'ler emails', 'caixa de entrada', 'correio'], category: 'email' },
  { id: 'email_send', name: 'Enviar email', keywords: ['enviar email', 'mandar email', 'mail', 'enviar mensagem'], category: 'email' },

  // ─── CALENDÁRIO ───
  { id: 'cal_list', name: 'Ver agenda', keywords: ['ver agenda', 'eventos', 'compromissos', 'reuniões'], category: 'calendário' },
  { id: 'cal_today', name: 'Eventos de hoje', keywords: ['hoje', 'eventos de hoje', 'agenda de hoje'], category: 'calendário' },
  { id: 'cal_add', name: 'Agendar evento', keywords: ['agendar', 'marcar', 'criar evento', 'reunião'], category: 'calendário' },

  // ─── NOTÍCIAS / CLIMA ───
  { id: 'news_general', name: 'Notícias', keywords: ['notícias', 'novidades', 'resumo', 'últimas notícias'], category: 'notícias' },
  { id: 'news_topic', name: 'Notícias sobre', keywords: ['notícias sobre', 'novidades sobre', 'notícia de'], category: 'notícias' },
  { id: 'weather', name: 'Clima', keywords: ['clima', 'tempo', 'weather', 'previsão', 'previsao'], category: 'notícias' },

  // ─── TTS / VOZ ───
  { id: 'tts_speak', name: 'Falar texto', keywords: ['falar', 'dizer', 'ler em voz', 'reproduzir áudio', 'speak'], category: 'voz' },
  { id: 'tts_voices', name: 'Listar vozes', keywords: ['vozes', 'vozes disponíveis', 'quais vozes', 'list voices'], category: 'voz' },

  // ─── MEMÓRIA ───
  { id: 'memory_save', name: 'Salvar memória', keywords: ['aprender', 'salvar', 'lembrar que', 'memorizar', 'guardar'], category: 'memória' },
  { id: 'memory_recall', name: 'Recuperar memória', keywords: ['lembrar', 'relembrar', 'o que você sabe', 'recall'], category: 'memória' },
  { id: 'memory_notes', name: 'Ver anotações', keywords: ['anotações', 'notas', 'o que eu anotei', 'my notes'], category: 'memória' },
  { id: 'memory_search', name: 'Buscar na memória', keywords: ['buscar memória', 'procurar lembrança', 'memory search'], category: 'memória' },

  // ─── AGENTES / PLANEJAMENTO ───
  { id: 'agent_plan', name: 'Planejar tarefa', keywords: ['planejar', 'plano', 'decompor', 'multi-step', 'plan'], category: 'agentes' },
  { id: 'agent_execute', name: 'Executar plano', keywords: ['executar plano', 'run plan', 'executar passos'], category: 'agentes' },
  { id: 'agent_install', name: 'Instalar software', keywords: ['instalar', 'install', 'setup', 'configurar'], category: 'agentes' },
  { id: 'agent_backup', name: 'Backup', keywords: ['backup', 'copiar segurança', 'salvar cópia'], category: 'agentes' },
  { id: 'agent_analyze', name: 'Analisar projeto', keywords: ['analisar', 'analisar projeto', 'revisar código', 'audit'], category: 'agentes' },

  // ─── DATA/HORA ───
  { id: 'datetime_now', name: 'Data/hora atual', keywords: ['que horas', 'que dia', 'data atual', 'hora atual', 'horas'], category: 'utilidades' },
  { id: 'datetime_tz', name: 'Fuso horário', keywords: ['fuso horário', 'timezone', 'hora de'], category: 'utilidades' },
];

export function findActions(query, limit = 10) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const scored = CAPABILITIES.map(cap => {
    let score = 0;
    for (const w of words) {
      if (w.length < 2) continue;
      if (cap.name.toLowerCase().includes(w)) score += 3;
      for (const kw of cap.keywords) {
        if (kw.includes(w) || w.includes(kw)) score += 2;
      }
      if (q.includes(cap.id.replace('_', ' '))) score += 5;
    }
    return { ...cap, score };
  });

  return scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getCapabilitiesList() {
  const categories = {};
  for (const cap of CAPABILITIES) {
    if (!categories[cap.category]) categories[cap.category] = [];
    categories[cap.category].push(cap);
  }
  return { total: CAPABILITIES.length, categories };
}

export function getAllActions() {
  return CAPABILITIES;
}
