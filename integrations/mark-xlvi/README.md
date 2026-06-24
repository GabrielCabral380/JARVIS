# Mark-XLVI Integrations for JARVIS

Funcionalidades do projeto [Mark-XLVI-main](https://github.com/GabrielCabral380/JARVIS)
integradas como módulos no JARVIS Hub.

## 🚀 Funcionalidades Adicionadas

| Módulo | Comando | Descrição |
|--------|---------|-----------|
| `flight_finder` | voar de A para B | Busca voos e preços |
| `game_updater` | atualizar jogos | Atualiza jogos via Steam |
| `youtube_video` | youtube <url> | Transcrição, download, busca |
| `code_helper` | escrever código | Agente de código com IA |
| `dev_agent` | criar app | Agente multi-etapas (planeja + executa) |
| `reminder` | lembrar às 15h | Lembretes agendados |
| `weather_report` | clima em SP | Previsão do tempo |
| `file_processor` | analisar arquivo | PDF, DOCX, XLSX, PPTX, imagem, áudio, vídeo |
| `browser_control` | abrir site | Automação Playwright |
| `screen_processor` | ver tela | Visão computacional (OCR) |
| `computer_settings` | volume + | Controle do SO |
| `desktop_control` | executar | Automação desktop |
| `open_app` | abrir Chrome | Lança qualquer app |
| `web_search` | pesquisar | Gemini + DuckDuckGo |

## 🔧 Sistema Unificado de Providers

Os módulos usam automaticamente a configuração do JARVIS:

```
JARVIS .env → GEMINI_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY
```

### Como usar

1. **Via JARVIS Hub (UI)**: Configure o provider no painel de configuração
2. **Via .env**: Edite `JARVIS/.env`:
   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=sua-chave-aqui
   GEMINI_MODEL=gemini-2.0-flash
   ```
3. **Via api_keys.json**: Crie `integrations/mark-xlvi/config/api_keys.json`

### Providers suportados

| Provider | Variável | Modelo padrão |
|----------|----------|---------------|
| `gemini` | `GEMINI_API_KEY` | gemini-2.0-flash |
| `openai` | `OPENAI_API_KEY` | gpt-4o-mini |
| `openrouter` | `OPENROUTER_API_KEY` | openai/gpt-4o-mini |

### Trocar de provider

Basta editar o `.env` ou usar a UI:
```env
AI_PROVIDER=gemini    # ou openai, openrouter, local
```

## 📁 Estrutura

```
integrations/mark-xlvi/
├── README.md           # Este arquivo
├── router.py           # Router Python (chamável via subprocess)
├── call.py             # CLI wrapper / bridge
├── config/
│   └── api_keys.json.example
├── actions/
│   ├── config/__init__.py  # Unified API resolver
│   └── (16 módulos)
├── core/               # STT/TTS
└── memory/             # Memory manager
```

## ⚙️ Uso Direto (Python)

```bash
cd integrations/mark-xlvi
python call.py weather_report '{"city": "São Paulo"}'
python call.py flight_finder '{"origin": "GRU", "destination": "JFK"}'
python call.py code_helper '{"task": "write a quicksort in python"}'
```

## 🔗 Integração com server.js

O `server.js` invoca via subprocess:

```javascript
import { execFile } from 'child_process';
const result = await execFile('python', [
  'integrations/mark-xlvi/call.py', 'weather_report', JSON.stringify({city: 'SP'})
]);
```

## ⚠️ Dependências Opcionais

Alguns módulos requerem pacotes extras:
- `browser_control` → `playwright install`
- `screen_processor` → `opencv-python`, `mss`, `Pillow`
- `file_processor` → `python-pptx`, `PyPDF2`, etc.
- `computer_settings` → `pyautogui`, `pycaw` (Windows)

## 🔄 Rollback

Para desfazer esta integração:
```bash
git revert HEAD
# ou
git reset --hard main
```
