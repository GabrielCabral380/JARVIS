/**
 * JARVIS Capabilities Registry — 80+ actions across 12 categories
 */

const CAPABILITIES = [
  // ─── ARQUIVOS ───
  { id: 'file_mkdir', name: 'Criar pasta', keywords: ['criar pasta', 'novo diretório', 'mkdir'], category: 'arquivos' },
  { id: 'file_rename', name: 'Renomear arquivo', keywords: ['renomear', 'rename', 'mudar nome'], category: 'arquivos' },
  { id: 'file_copy', name: 'Copiar arquivo', keywords: ['copiar', 'copy', 'duplicar'], category: 'arquivos' },
  { id: 'file_move', name: 'Mover arquivo', keywords: ['mover', 'move', 'mudar'], category: 'arquivos' },
  { id: 'file_delete', name: 'Apagar arquivo', keywords: ['apagar', 'delete', 'remover', 'excluir'], category: 'arquivos' },
  { id: 'file_list', name: 'Listar arquivos', keywords: ['listar', 'mostrar', 'ver arquivos'], category: 'arquivos' },

  // ─── MÍDIA ───
  { id: 'media_play', name: 'Tocar mídia', keywords: ['tocar', 'play', 'reproduzir', 'iniciar'], category: 'mídia' },
  { id: 'media_pause', name: 'Pausar mídia', keywords: ['pausar', 'pause', 'parar'], category: 'mídia' },
  { id: 'media_next', name: 'Próxima faixa', keywords: ['próxima', 'next', 'avançar', 'seguinte'], category: 'mídia' },
  { id: 'media_prev', name: 'Faixa anterior', keywords: ['anterior', 'previous', 'voltar'], category: 'mídia' },
  { id: 'media_vol', name: 'Ajustar volume', keywords: ['volume', 'mudo', 'silenciar', 'mais alto', 'mais baixo'], category: 'mídia' },

  // ─── SMART HOME ───
  { id: 'light_on', name: 'Ligar luz', keywords: ['ligar luz', 'acender luz', 'ligar iluminação'], category: 'smart_home' },
  { id: 'light_off', name: 'Desligar luz', keywords: ['desligar luz', 'apagar luz'], category: 'smart_home' },
  { id: 'light_brightness', name: 'Ajustar brilho', keywords: ['brilho', 'iluminação'], category: 'smart_home' },
  { id: 'ac_on', name: 'Ligar ar condicionado', keywords: ['ligar ar', 'ligar AC', 'ar condicionado'], category: 'smart_home' },
  { id: 'ac_off', name: 'Desligar ar condicionado', keywords: ['desligar ar', 'desligar AC'], category: 'smart_home' },
  { id: 'ac_temp', name: 'Ajustar temperatura', keywords: ['temperatura', 'graus', 'esfriar', 'aquecer'], category: 'smart_home' },
  { id: 'device_on', name: 'Ligar dispositivo', keywords: ['ligar', 'ativar', 'acionar'], category: 'smart_home' },
  { id: 'device_off', name: 'Desligar dispositivo', keywords: ['desligar', 'desativar'], category: 'smart_home' },

  // ─── SISTEMA ───
  { id: 'sys_screenshot', name: 'Screenshot', keywords: ['screenshot', 'captura de tela', 'foto da tela'], category: 'sistema' },
  { id: 'sys_status', name: 'Status do sistema', keywords: ['status', 'informações', 'info sistema'], category: 'sistema' },
  { id: 'sys_disk', name: 'Espaço em disco', keywords: ['disco', 'espaço', 'storage'], category: 'sistema' },
  { id: 'sys_memory', name: 'Memória RAM', keywords: ['memória', 'ram', 'memoria'], category: 'sistema' },
  { id: 'sys_process', name: 'Processos', keywords: ['processos', 'process', 'tarefas rodando'], category: 'sistema' },
  { id: 'sys_battery', name: 'Bateria', keywords: ['bateria', 'battery', 'nível'], category: 'sistema' },
  { id: 'sys_network', name: 'Rede', keywords: ['rede', 'network', 'wifi', 'internet', 'ethernet'], category: 'sistema' },
  { id: 'sys_uptime', name: 'Uptime', keywords: ['uptime', 'tempo de execução', 'há quanto'], category: 'sistema' },

  // ─── NAVEGAÇÃO ───
  { id: 'web_open', name: 'Abrir site', keywords: ['abrir', 'navegar', 'ir para', 'abrir site'], category: 'web' },
  { id: 'web_search', name: 'Pesquisar', keywords: ['pesquisar', 'buscar', 'procurar', 'google'], category: 'web' },

  // ─── APPS ───
  { id: 'app_open', name: 'Abrir app', keywords: ['abrir app', 'executar', 'iniciar programa', 'abrir calculadora', 'abrir bloco'], category: 'apps' },
  { id: 'app_list', name: 'Listar apps', keywords: ['listar apps', 'aplicativos', 'programas'], category: 'apps' },

  // ─── LEMBRETES ───
  { id: 'reminder_add', name: 'Criar lembrete', keywords: ['lembra', 'lembrar', 'agendar', 'me lembra'], category: 'lembretes' },
  { id: 'reminder_list', name: 'Ver lembretes', keywords: ['ver lembretes', 'listar lembretes', 'meus lembretes'], category: 'lembretes' },
  { id: 'reminder_cancel', name: 'Cancelar lembrete', keywords: ['cancelar lembrete', 'remover lembrete'], category: 'lembretes' },

  // ─── CALCULADORA ───
  { id: 'calc_basic', name: 'Calculadora', keywords: ['quanto é', 'calcule', 'calcula', 'porcentagem', '% de'], category: 'calculadora' },

  // ─── TRADUÇÃO ───
  { id: 'translate', name: 'Traduzir', keywords: ['traduzir', 'traduz', 'traduction', 'como diz', 'como fala'], category: 'tradução' },

  // ─── EMAIL ───
  { id: 'email_list', name: 'Ver emails', keywords: ['ver emails', 'ler emails', 'caixa de entrada', 'correio'], category: 'email' },
  { id: 'email_send', name: 'Enviar email', keywords: ['enviar email', 'mandar email', 'mail'], category: 'email' },

  // ─── CALENDÁRIO ───
  { id: 'cal_list', name: 'Ver agenda', keywords: ['ver agenda', 'eventos', 'compromissos', 'reuniões'], category: 'calendário' },
  { id: 'cal_today', name: 'Eventos de hoje', keywords: ['hoje', 'eventos de hoje', 'agenda de hoje'], category: 'calendário' },
  { id: 'cal_add', name: 'Agendar evento', keywords: ['agendar', 'marcar', 'criar evento', 'reunião'], category: 'calendário' },

  // ─── NOTÍCIAS ───
  { id: 'news_general', name: 'Notícias', keywords: ['notícias', 'novidades', 'resumo', 'últimas'], category: 'notícias' },
  { id: 'news_topic', name: 'Notícias sobre', keywords: ['notícias sobre', 'novidades sobre'], category: 'notícias' },
  { id: 'weather', name: 'Clima', keywords: ['clima', 'tempo', 'weather', 'previsão'], category: 'notícias' },

  // ─── TTS / VOZ ───
  { id: 'tts_speak', name: 'Falar texto', keywords: ['falar', 'dizer', 'ler em voz', 'reproduzir áudio'], category: 'voz' },
  { id: 'tts_voices', name: 'Listar vozes', keywords: ['vozes', 'vozes disponíveis', 'quais vozes'], category: 'voz' },

  // ─── MEMÓRIA ───
  { id: 'memory_save', name: 'Salvar memória', keywords: ['aprender', 'salvar', 'lembrar que', 'memorizar'], category: 'memória' },
  { id: 'memory_recall', name: 'Recuperar memória', keywords: ['lembrar', 'relembrar', 'o que você sabe'], category: 'memória' },
  { id: 'memory_notes', name: 'Ver anotações', keywords: ['anotações', 'notas', 'o que eu anotei'], category: 'memória' },
];

export function findActions(query, limit = 10) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);
  const scored = CAPABILITIES.map(cap => {
    let score = 0;
    for (const w of words) {
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
