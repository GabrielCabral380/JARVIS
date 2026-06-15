$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

New-Item -ItemType Directory -Force -Path logs,runtime,system | Out-Null
$log = "logs\install-$(Get-Date -Format yyyyMMdd-HHmmss).log"

function Log($m){
  $line = "[$(Get-Date -Format HH:mm:ss)] $m"
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

function Find-Cmd($names) {
  foreach ($name in $names) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  return $null
}

function Run-Cmd($exe, $arguments) {
  Log "Executando: $exe $($arguments -join ' ')"
  $outFile = Join-Path $env:TEMP "jarvis-out.txt"
  $errFile = Join-Path $env:TEMP "jarvis-err.txt"
  $p = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory (Get-Location) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
  $out = Get-Content $outFile -Raw -ErrorAction SilentlyContinue
  $err = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
  if ($out) { Add-Content -Path $log -Value $out -Encoding UTF8; Write-Host $out }
  if ($err) { Add-Content -Path $log -Value $err -Encoding UTF8; Write-Host $err }
  if ($p.ExitCode -ne 0) { throw "Comando falhou com código $($p.ExitCode): $exe $($arguments -join ' ')" }
}

function Package-HasDependencies {
  try {
    $pkg = Get-Content "package.json" -Raw -Encoding UTF8 | ConvertFrom-Json
    $depCount = 0
    if ($pkg.dependencies) { $depCount += ($pkg.dependencies.PSObject.Properties | Measure-Object).Count }
    if ($pkg.devDependencies) { $depCount += ($pkg.devDependencies.PSObject.Properties | Measure-Object).Count }
    return ($depCount -gt 0)
  } catch {
    return $true
  }
}

Log "Verificando Node.js..."
$nodeExe = Find-Cmd @("node.exe","node")
if (-not $nodeExe) {
  Log "Node.js não encontrado. Instale o Node.js LTS e rode novamente."
  exit 1
}
$nodeVersion = & $nodeExe -v
Log "Node encontrado: $nodeVersion"

Log "Verificando Python..."
$pythonExe = Find-Cmd @("py.exe","python.exe","python","py")
if ($pythonExe) {
  try {
    $pythonVersion = & $pythonExe --version 2>&1
    Log "Python encontrado: $pythonVersion em $pythonExe"
  } catch {
    Log "Python detectado, mas não respondeu a --version. Ferramentas locais usarão fallback Node."
  }
} else {
  Log "Python não encontrado. O JARVIS ainda roda com Node, mas automações locais avançadas usarão fallback limitado."
}

Log "Verificando npm..."
$npmExe = Find-Cmd @("npm.cmd","npm.exe","npm")
if ($npmExe) {
  $npmVersion = & $npmExe -v
  Log "npm encontrado: $npmVersion em $npmExe"
} else {
  Log "npm não encontrado. Esta versão roda sem dependências npm, então vou continuar."
}

# Corrige ambientes onde npm tenta usar cache inválido como '\\?'.
$cachePath = Join-Path (Get-Location) "runtime\npm-cache"
$tmpPath = Join-Path (Get-Location) "runtime\tmp"
New-Item -ItemType Directory -Force -Path $cachePath,$tmpPath | Out-Null
$env:npm_config_cache = $cachePath
$env:npm_config_tmp = $tmpPath
$env:TEMP = $tmpPath
$env:TMP = $tmpPath
Log "Cache npm seguro: $cachePath"

if (Package-HasDependencies) {
  if (-not $npmExe) {
    Log "package.json possui dependências, mas npm não foi encontrado."
    exit 1
  }
  Log "Instalando dependências npm..."
  Run-Cmd $npmExe @("install","--no-audit","--fund=false","--cache",$cachePath)
} else {
  Log "Nenhuma dependência npm externa encontrada. Instalação npm ignorada."
}

if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Log ".env criado a partir de .env.example"
} else {
  Log ".env já existe; preservado."
}

Log "Verificando Codex CLI opcional..."
$codexExe = Find-Cmd @("codex.cmd","codex.exe","codex")
if ($codexExe) {
  $codexVersion = (& $codexExe --version 2>$null)
  Log "Codex CLI encontrado: $codexVersion"
} else {
  Log "Codex CLI não encontrado. Opcional: npm install -g @openai/codex"
}

Log "Rodando teste de diagnóstico..."
Run-Cmd $nodeExe @("scripts/doctor.mjs")

Log "Instalação concluída. Use 'Ligar JARVIS.bat'."
