# Mark-XLVI Integrations for JARVIS

Funcionalidades do projeto [Mark-XLVI-main](https://github.com/GabrielCabral380/JARVIS)
integradas como módulos no JARVIS Hub.

## 🚀 Funcionalidades Adicionadas

| Módulo | Comando | Descrição |
|--------|---------|-----------|
| `flight_finder` | voar de A para B | Busca voos e preços |
| `game_updater` | atualizar jogos | Atualiza jogos via Steam |
| `youtube_video` | youtube <url> | Transcrição, download, busca |
| `code_helper` | escrever código | Agente de código com Gemini |
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

## 📁 Estrutura

```
integrations/mark-xlvi/
├── README.md           # Este arquivo
├── router.py           # Router Python (chamável via subprocess)
├── call.py             # CLI wrapper / bridge
├── config/
│   └── api_keys.json.example
├── actions/            # 16 módulos de ação
├── core/               # STT/TTS
└── memory/             # Memory manager
```

## ⚙️ Configuração

1. Copie `config/api_keys.json.example` → `config/api_keys.json`
2. Adicione sua Gemini API key
3. O JARVIS Hub invoca via `router.py` ou `call.py`

## 🔧 Uso Direto (Python)

```bash
cd integrations/mark-xlvi
python call.py weather_report '{"city": "São Paulo"}'
python call.py flight_finder '{"origin": "GRU", "destination": "JFK"}'
python call.py code_helper '{"task": "write a quicksort in python"}'
```

## 🔗 Integração com server.js

O `server.js` pode invocar via subprocess:

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
git revert <commit-hash>
# ou
git reset --hard main
```
