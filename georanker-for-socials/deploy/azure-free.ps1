<#
  Deploy GeoRanker for socials to the CHEAPEST Azure App Service (Free F1, Linux,
  Node) as a *code* deployment built on the server by Oryx. No credit card burn:
  F1 is free. Structured so you can later `az webapp update --plan <B1 plan>` for
  always-on, or switch to the Dockerfile on Container Apps — with zero code change.

  Prereqs:
    - Azure CLI installed and logged in:  az login
    - config/roster.json created (copy config/roster.example.json)
    - Run from the georanker-for-socials/ folder.

  Secrets (GITHUB_TOKEN, ADMIN_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) are
  resolved as:  CLI parameter  >  .env file  >  environment variable.
  So the simplest flow is to put them in .env (already gitignored) and run:

    ./deploy/azure-free.ps1 -AppName georanker-<yourname>

  ...with no tokens on the command line. Pass a -GithubToken/-AdminToken param
  only to override what's in .env.

  Usage (PowerShell):
    ./deploy/azure-free.ps1 -AppName georanker-<yourname> `
        -TelegramBotToken "123:ABC" -TelegramChatId "-1001234567890"

  Notes:
    * SQLite persists under /home (survives restarts on App Service).
    * F1 sleeps when idle & has a 60 CPU-min/day quota, so the bot runs in
      WEBHOOK mode: any inbound Telegram message or dashboard hit wakes it.
    * The app self-registers its Telegram webhook on startup from PUBLIC_URL.
#>
param(
  [Parameter(Mandatory = $true)] [string] $AppName,
  [string] $ResourceGroup = "georanker-rg",
  [string] $Location = "uksouth",
  [string] $PlanName = "georanker-free-plan",
  [string] $Runtime = "NODE:22-lts",
  [string] $Timezone = "Europe/London",
  [string] $Extractor = "github-models",
  [string] $GithubToken = "",
  [string] $TelegramBotToken = "",
  [string] $TelegramChatId = "",
  [string] $AdminToken = ""
)

$ErrorActionPreference = "Stop"
$publicUrl = "https://$AppName.azurewebsites.net"
$webhookSecret = [guid]::NewGuid().ToString("N")

# ── Secret resolution: CLI param > .env file > environment variable ──────────
# So you can keep GITHUB_TOKEN / ADMIN_TOKEN (etc.) in .env and just run the
# script with no tokens on the command line.
$envFile = Join-Path $PSScriptRoot ".." ".env"
$dotenv = @{}
if (Test-Path $envFile) {
  Write-Host "==> Reading secrets from $envFile" -ForegroundColor Cyan
  foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $eq = $trimmed.IndexOf("=")
    if ($eq -lt 1) { continue }
    $key = $trimmed.Substring(0, $eq).Trim()
    $val = $trimmed.Substring($eq + 1).Trim().Trim('"').Trim("'")
    $dotenv[$key] = $val
  }
}
function Resolve-Secret([string]$current, [string]$name) {
  if ($current) { return $current }                 # explicit CLI param wins
  if ($dotenv.ContainsKey($name) -and $dotenv[$name]) { return $dotenv[$name] }  # then .env
  $fromEnv = [Environment]::GetEnvironmentVariable($name)
  if ($fromEnv) { return $fromEnv }                 # then process env var
  return ""
}
$GithubToken      = Resolve-Secret $GithubToken      "GITHUB_TOKEN"
$AdminToken       = Resolve-Secret $AdminToken       "ADMIN_TOKEN"
$TelegramBotToken = Resolve-Secret $TelegramBotToken "TELEGRAM_BOT_TOKEN"
$TelegramChatId   = Resolve-Secret $TelegramChatId   "TELEGRAM_CHAT_ID"

Write-Host "==> Resource group: $ResourceGroup ($Location)" -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --output none

Write-Host "==> Free (F1) Linux plan: $PlanName" -ForegroundColor Cyan
az appservice plan create --name $PlanName --resource-group $ResourceGroup `
  --sku F1 --is-linux --output none

Write-Host "==> Web app: $AppName ($Runtime)" -ForegroundColor Cyan
az webapp create --name $AppName --resource-group $ResourceGroup `
  --plan $PlanName --runtime $Runtime --output none

# Build on the server (Oryx runs `npm install` + `npm run build`) and start via `npm start`.
az webapp config set --name $AppName --resource-group $ResourceGroup `
  --startup-file "npm start" --output none

Write-Host "==> App settings" -ForegroundColor Cyan
$settings = @(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=true",
  "WEBSITES_PORT=8080",
  "NODE_ENV=production",
  "TIMEZONE=$Timezone",
  "EXTRACTOR=$Extractor",
  "ROSTER_PATH=config/roster.json",
  "DB_PATH=/home/data/georanker.sqlite",
  "PUBLIC_URL=$publicUrl",
  "TELEGRAM_WEBHOOK_SECRET=$webhookSecret"
)
if ($GithubToken)      { $settings += "GITHUB_TOKEN=$GithubToken" }
if ($TelegramBotToken) { $settings += "TELEGRAM_BOT_TOKEN=$TelegramBotToken" }
if ($TelegramChatId)   { $settings += "TELEGRAM_CHAT_ID=$TelegramChatId" }
if ($AdminToken)       { $settings += "ADMIN_TOKEN=$AdminToken" }

az webapp config appsettings set --name $AppName --resource-group $ResourceGroup `
  --settings $settings --output none

Write-Host "==> Deploying code (Oryx build)…" -ForegroundColor Cyan
az webapp up --name $AppName --resource-group $ResourceGroup `
  --plan $PlanName --sku F1 --runtime $Runtime --os-type Linux

Write-Host ""
Write-Host "Done! Dashboard:  $publicUrl" -ForegroundColor Green
Write-Host "Health check:     $publicUrl/healthz" -ForegroundColor Green
if ($TelegramBotToken) {
  Write-Host "Telegram webhook: $publicUrl/telegram/webhook (auto-registered on startup)" -ForegroundColor Green
}
Write-Host "Tail logs:        az webapp log tail --name $AppName --resource-group $ResourceGroup"
