# JARVIS Local Hub

> Versão preparada para subir no GitHub sem expor segredos nem estado local.

## Início rápido
1. Rode `INSTALAR-JARVIS.bat`
2. Depois rode `Ligar JARVIS.bat`
3. Se `.env` não existir, ele será criado a partir de `.env.example`

## O que vai para o GitHub
- código-fonte
- launchers `.bat`
- dashboard web
- testes e doctor

## O que fica fora do GitHub
- `.env`
- logs
- histórico/memória gerados em `system/`
- temporários em `runtime/tmp/`


Um assistente local estilo JARVIS para Windows: instalação simples, scripts de ligar/desligar/atualizar, interface no navegador, voz via Web Speech API, memória local, agentes auxiliares, logs e integração opcional com OpenAI e Obsidian.

## Instalação no Windows

1. Instale Node.js LTS.
2. Extraia a pasta.
3. Dê duplo clique em `INSTALAR-JARVIS.bat`.
4. Edite `.env` se quiser ativar IA:
   - `OPENAI_API_KEY=sua_chave`
   - `OPENAI_MODEL=gpt-4o-mini`
5. Dê duplo clique em `Ligar JARVIS.bat`.

A interface abre em `http://localhost:3000`.

## Voz e personalidade

O foco está em interação com o usuário:
- botão `🎙️ Falar`;
- resposta por voz local do navegador;
- botão para parar voz;
- estados visuais: LISTENING, THINKING, SPEAKING, IDLE;
- persona calma, elegante, objetiva e segura.

Use Chrome ou Edge para melhor suporte de reconhecimento de fala. A síntese de voz é amplamente suportada; reconhecimento de voz pode variar por navegador.

## Agentes

Arquivos em `agents/`:
- companion;
- diagnostic;
- developer;
- automation;
- memory.

O roteador escolhe agente por intenção. A automação começa segura: apenas checagem e comandos diagnósticos de baixo risco.

## Obsidian opcional

No `.env`, configure:

```env
OBSIDIAN_VAULT_PATH=C:\Users\SeuUsuario\Documents\SeuVault
```

As notas rápidas serão gravadas em `JARVIS/Inbox.md`.

## Scripts

- `INSTALAR-JARVIS.bat`: instala dependências e cria `.env`.
- `Ligar JARVIS.bat`: inicia servidor e interface.
- `Desligar JARVIS.bat`: para processos Node ligados ao server.
- `ATUALIZAR-JARVIS.bat`: roda atualização segura.
- `npm test`: testes mínimos.
- `npm run doctor`: diagnóstico local.

## Segurança

O backend bloqueia padrões destrutivos como `rm -rf`, `del /s`, `format`, `diskpart`, alteração crítica de registro e exclusão de usuários. A interface não executa automações perigosas por padrão.

## Logs

Eventos ficam em `logs/events.ndjson`. Instalação gera `logs/install-*.log`.

## Rollback

Como este pacote não apaga arquivos externos, o rollback é simples:
1. Feche com `Desligar JARVIS.bat`.
2. Restaure a pasta anterior ou remova esta pasta.
3. Preserve `system/JARVIS-MEMORY.md` se quiser manter memória.

## Limitações

- Não inclui avatar 3D pesado; usa uma esfera/HUD leve e estável.
- Voz local depende do navegador.
- OpenAI é opcional; sem chave usa fallback local.
- Automação real avançada, Hermes e OpenClaw ficam preparados como arquitetura/agentes, mas não são ativados sem instalação externa e permissões.


## Provedores de IA: local, OpenAI, OpenRouter e Codex

O projeto agora não depende de uma única API.

### Modo local

Funciona sem chave:

```env
AI_PROVIDER=local
```

### OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sua_chave
OPENAI_MODEL=gpt-4o-mini
```

### OpenRouter

OpenRouter usa uma API compatível com OpenAI Chat Completions.

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sua_chave_openrouter
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_SITE_NAME=JARVIS Local Hub
```

### Codex CLI opcional

O Codex é tratado como uma ponte local opcional para tarefas de desenvolvimento. Ele não é instalado automaticamente para evitar login inesperado e reduzir risco de supply chain.

Instalação manual recomendada:

```powershell
npm install -g @openai/codex
codex
```

Depois de autenticar no terminal:

```env
CODEX_ENABLED=true
CODEX_WORKDIR=C:\caminho\para\seu\projeto
CODEX_TIMEOUT_MS=120000
```

O painel mostra se o Codex foi encontrado. A rota local `/api/codex/run` só executa quando `CODEX_ENABLED=true`.

## Correção do erro npm ENOENT

Se aparecer erro parecido com `npm error code ENOENT`, rode a versão atualizada de `INSTALAR-JARVIS.bat`. O instalador agora procura `npm.cmd`, `npm.exe` ou `npm`, executa via `Start-Process` e grava o diagnóstico em `logs/install-*.log`.

Se ainda falhar:

1. Reinstale o Node.js LTS marcando `npm package manager`.
2. Feche e reabra o terminal.
3. Rode:
   ```cmd
   where node
   where npm
   npm -v
   ```
4. Execute `INSTALAR-JARVIS.bat` novamente.


## Atualização v1.0.2 — correção do erro npm ENOENT mkdir '\\?'

Esta versão removeu todas as dependências externas obrigatórias do npm. O JARVIS agora roda apenas com módulos nativos do Node.js 18+.

O instalador ainda detecta `npm`, mas só executa `npm install` se `package.json` tiver dependências. Também força um cache seguro em `runtime/npm-cache` para evitar o erro:

```text
npm error enoent ... mkdir '\?'
```

## OpenRouter

Edite `.env`:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sua_chave
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Depois execute `Ligar JARVIS.bat`.

## OpenAI

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sua_chave
OPENAI_MODEL=gpt-4o-mini
```

## Codex CLI opcional

1. Instale o Codex CLI, se quiser usar o modo programador:
   ```bat
   npm install -g @openai/codex
   ```
2. Faça login uma vez no PowerShell:
   ```bat
   codex
   ```
3. Ative no `.env`:
   ```env
   CODEX_ENABLED=true
   CODEX_TIMEOUT_MS=120000
   ```

Quando o pedido envolver código, bug, arquivos ou repositório, o JARVIS tenta acionar o Codex CLI localmente. Se não estiver instalado ou ativado, ele continua funcionando com OpenRouter, OpenAI ou modo local.


## v1.0.3 - Configuração de API pela interface

Abra `http://localhost:3000`, vá em **Config** e escolha:

- `local`: fallback sem API;
- `openai`: usa `OPENAI_API_KEY`;
- `openrouter`: usa `OPENROUTER_API_KEY`;
- `CODEX_ENABLED=true`: habilita Codex CLI para tarefas de código quando o comando `codex` estiver instalado.

As chaves ficam no arquivo `.env`. O painel mostra apenas se a chave está definida, sem revelar o valor.


## Correção v1.0.4 - OpenRouter/OpenAI

Depois de salvar a chave em Config, clique em **Testar API agora**. Se funcionar, as próximas mensagens do chat usarão o provider selecionado. Se falhar, o erro aparece no painel sem revelar a chave.

## v1.0.5 - Orquestrador Hermes / OpenClaw / MCP

Esta versão mantém a mesma interface cockpit/terminal e adiciona o painel **ORCHESTRATOR**.

### Voz contínua

Clique em **Falar** uma vez. O microfone continua ativo até clicar em **Parar voz**.
Use Chrome ou Edge, porque o reconhecimento de voz vem do navegador.

### Hermes Agent

Em **Config**, preencha uma das opções:

```env
HERMES_URL=http://localhost:8001
```

ou

```env
HERMES_COMMAND=hermes task
```

Depois use o painel lateral ou escreva no chat:

```text
hermes: planeje uma rotina de automação segura
```

### OpenClaw

Em **Config**, preencha uma das opções:

```env
OPENCLAW_URL=http://localhost:8675
```

ou

```env
OPENCLAW_COMMAND=openclaw run
```

Depois use:

```text
openclaw: abrir o navegador e verificar a página inicial
```

### MCP

O JARVIS procura arquivos MCP comuns:

- `.mcp.json`
- `mcp.json`
- `%USERPROFILE%\.mcp.json`
- `%USERPROFILE%\.cursor\mcp.json`
- `%APPDATA%\Claude\claude_desktop_config.json`
- `%APPDATA%\Code\User\mcp.json`

Para conexão real automática, configure um servidor MCP HTTP local:

```env
MCP_URL=http://localhost:3001/mcp
```

O JARVIS faz `initialize`, tenta `tools/list` e mostra ferramentas detectadas no painel.
Chamadas MCP HTTP são limitadas a `localhost`, `127.0.0.1` ou `::1` por segurança.

### Segurança

Comandos perigosos continuam bloqueados por padrão:
`rm -rf`, `del /s`, `format`, `diskpart`, `reg delete`, desligamento forçado e exclusão de usuário.



## Novidades v1.0.6 — Orquestrador + modo local sem IA

Esta versão adiciona execução local com Node e ponte Python opcional.

### Runtime

- Node.js continua sendo obrigatório para o servidor local.
- Python é detectado na instalação e na execução.
- Se Python não existir, o JARVIS continua funcionando com fallback Node para ações simples.

### Ferramentas locais sem IA

Mesmo sem OpenAI, OpenRouter, Codex, Hermes ou OpenClaw, o JARVIS agora consegue:

- abrir navegador;
- fazer pesquisa na internet;
- abrir calculadora;
- abrir Bloco de Notas;
- abrir Explorador, Paint, PowerShell, CMD, Terminal e VS Code quando disponíveis;
- criar lembretes por texto ou voz;
- listar compromissos/lembretes ativos;
- avisar lembretes vencidos pela interface e voz do navegador.

Exemplos de comandos:

```text
Jarvis, abrir calculadora
Jarvis, abrir navegador
Jarvis, pesquisar previsão do tempo em Fortaleza
Jarvis, me lembre de ligar para João em 10 minutos
Jarvis, me lembre de reunião às 15:30
Jarvis, listar lembretes
```

### Orquestração

Quando Hermes, OpenClaw ou MCP estiverem instalados/configurados, o JARVIS pode enviar comandos para eles:

```text
hermes: planeje esta tarefa
openclaw: abra o navegador e acesse meu dashboard local
mcp: nome_da_tool
```

A aba Config permite configurar:

- `HERMES_URL` ou `HERMES_COMMAND`;
- `OPENCLAW_URL` ou `OPENCLAW_COMMAND`;
- `MCP_URL` ou `MCP_COMMAND`;
- `LOCAL_TOOLS_ENABLED`.

### Segurança

As ferramentas locais bloqueiam padrões destrutivos e não executam comandos arbitrários livres. Elas usam uma lista controlada de ações: navegador, pesquisa, apps comuns e lembretes.


## Voz por comando

Clique em **Falar** uma vez. O microfone fica contínuo até você clicar em **Parar voz** ou dizer **Jarvis, parar voz**.

Comandos aceitos por voz:
- `Jarvis, abra a calculadora`
- `Jarvis, abra o bloco de notas`
- `Jarvis, abra o navegador`
- `Jarvis, pesquise inteligência artificial na internet`
- `Jarvis, me lembre de reunião amanhã às 9`
- `Jarvis, liste meus lembretes`
- `Jarvis, detecte MCP Hermes OpenClaw`
- `Jarvis, envie para Hermes: analise esta tarefa`
- `Jarvis, envie para OpenClaw: abra o navegador`
- `Jarvis, envie para MCP: liste as ferramentas`


## Comandos por voz adicionados na v1.0.8

Clique em `🎙️ Falar` uma vez. O microfone permanece ativo até `Parar voz`.

Exemplos:
- `Jarvis, pesquise IA na internet`
- `Jarvis, abra o YouTube`
- `Jarvis, quero ouvir Queen`
- `Jarvis, me dê uma opinião sobre automação local`
- `Jarvis, aprenda que eu prefiro respostas objetivas`
- `Jarvis, me lembre de reunião amanhã às 9`
- `Jarvis, envie para Hermes: planeje esta tarefa`
- `Jarvis, envie para OpenClaw: abra o navegador`
- `Jarvis, detecte MCP Hermes OpenClaw`

## Orquestrador Hermes / OpenClaw / MCP

O JARVIS tenta se comunicar com serviços locais quando estiverem ativos:
- Hermes: `HERMES_URL`, `HERMES_COMMAND`, ou CLI `hermes`/`hermes-agent`.
- OpenClaw: `OPENCLAW_URL`, `OPENCLAW_COMMAND`, ou CLI `openclaw`/`openclaw-cli`.
- MCP: `MCP_URL` para transporte HTTP local e descoberta de arquivos `.mcp.json` conhecidos.

Por segurança, chamadas HTTP do orquestrador são limitadas a `localhost`, `127.0.0.1` e `::1`.


## v1.0.9
- Corrige `EADDRINUSE` na porta 3000.
- Se a porta padrão estiver ocupada, tenta automaticamente 3001 até 3010.
- Mantém `Desligar JARVIS.bat` para encerrar sessões antigas do servidor.
