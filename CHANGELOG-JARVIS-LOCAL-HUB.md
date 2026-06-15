# v1.0.8

- Voz agora entende comandos mais naturais: pesquisar assunto na internet, opinião, abrir YouTube e tocar música/banda.
- Adicionado aprendizado simples por voz com `aprenda/memorize/guarde`.
- Orquestrador Hermes/OpenClaw tenta HTTP local, comando configurado e CLI detectada.
- Detecção Hermes/OpenClaw agora retorna `available` quando há HTTP/CLI/configuração.
- Mantida a interface cockpit/terminal.


## v1.0.7
- Local Tools agora são acionáveis por voz contínua.
- Adicionado roteamento por voz para Hermes, OpenClaw e MCP.
- Adicionados comandos falados para diagnóstico/detecção, pesquisa, navegador, calculadora, programas e lembretes.
- Adicionado comando falado `Jarvis, parar voz`.
- Mantida a interface cockpit/terminal do repositório.


## v1.0.5
- Adicionado orquestrador local para Hermes Agent, OpenClaw e MCP.
- Adicionado painel lateral ORCHESTRATOR sem trocar a interface cockpit/terminal.
- Adicionada configuração de HERMES_URL/HERMES_COMMAND, OPENCLAW_URL/OPENCLAW_COMMAND e MCP_URL/MCP_COMMAND.
- Adicionado endpoint `/api/orchestrator` para descoberta/status.
- Adicionado endpoint `/api/orchestrator/command` para envio seguro de comandos.
- Adicionado suporte a comandos no chat: `hermes: ...`, `openclaw: ...`, `mcp: ...`.
- Voz alterada para modo contínuo: Falar mantém o microfone ativo até Parar voz.
- MCP detecta arquivos comuns de configuração e conecta a MCP HTTP local configurado.

# Changelog

## v1.0.4
- Corrige reconhecimento real da API OpenRouter/OpenAI após salvar em Config.
- Backend recarrega `.env` antes de cada chamada/status.
- Adiciona botão `Testar API agora` na aba Config.
- Quando a API falha, o chat mostra o erro mascarado em vez de responder como fallback local silenciosamente.
- Mantém a mesma interface cockpit/terminal.


## v1.0.3
- Corrigido aviso Node DEP0169: removido `url.parse()` e adotada WHATWG `URL`.
- Restaurada experiência visual tipo cockpit/terminal do repositório original: Cockpit, Terminal, Arquivos e Config.
- Adicionado painel Config para salvar OpenAI API Key, OpenRouter API Key, modelo e Codex sem editar `.env`.
- Adicionados endpoints nativos `/api/config` GET/POST.
- Chaves de API são mascaradas e campo vazio não apaga chave existente.

# CHANGELOG — JARVIS Local Hub

## v1.0.2

- Corrigido erro de instalação `npm error ENOENT mkdir '\\?'`.
- Removidas dependências npm obrigatórias: servidor agora usa apenas módulos nativos do Node.js.
- `install.ps1` agora:
  - detecta Node;
  - detecta npm sem depender dele;
  - cria cache seguro em `runtime/npm-cache`;
  - ignora `npm install` quando não há dependências;
  - preserva `.env`;
  - detecta Codex CLI opcional.
- UI trocada de WebSocket para Server-Sent Events, removendo dependência `ws`.
- OpenRouter implementado via `fetch` nativo.
- OpenAI implementado via `fetch` nativo.
- Codex CLI opcional com `CODEX_ENABLED=true`.
- `Ligar JARVIS.bat` não exige `node_modules`.
- `doctor.mjs` cria pastas necessárias e valida estrutura.

## v1.0.1

- Correção inicial de detecção `npm.cmd`.
- Suporte básico OpenRouter/Codex.

## v1.0.0

- Primeira versão local com interface web, voz do navegador, agentes, memória e scripts Windows.


## v1.0.6
- Adicionado runtime Node/Python no status e instalador.
- Adicionada ponte `backend/local_tools.py`.
- Adicionadas ferramentas offline: abrir navegador, pesquisar, abrir calculadora/programas comuns.
- Adicionado sistema local de lembretes e compromissos.
- Adicionado polling de lembretes vencidos na interface com fala.
- Mantida interface cockpit/terminal do projeto.
- Mantida orquestração Hermes/OpenClaw/MCP.


## v1.0.9
- Corrige `EADDRINUSE` na porta 3000.
- Se a porta padrão estiver ocupada, tenta automaticamente 3001 até 3010.
- Mantém `Desligar JARVIS.bat` para encerrar sessões antigas do servidor.
