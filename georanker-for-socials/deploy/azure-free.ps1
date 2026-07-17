<#
  Deploy GeoRanker for socials to a cheap Azure App Service (Linux, Node) as a
  *code* deployment built on the server by Oryx. Defaults to the B1 Basic SKU
  (~10 GBP/mo, always-on) which is comfortably covered by Visual Studio credits and
  avoids the F1 free-tier quota that many subscriptions have set to zero. Pass
  -Sku F1 to try the free tier if your subscription has F1 quota.

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
    * B1 is always-on, so no idle sleep or CPU-minute cap; the bot runs in
      WEBHOOK mode and stays responsive.
    * The app self-registers its Telegram webhook on startup from PUBLIC_URL.
#>
param(
  [Parameter(Mandatory = $true)] [string] $AppName,
  [string] $ResourceGroup = "georanker-rg",
  [string] $Location = "uksouth",
  [string] $PlanName = "georanker-free-plan",
  [string] $Runtime = "NODE:22-lts",
  [string] $Sku = "B1",
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

# -- Secret resolution: CLI param > .env file > environment variable ----------
# So you can keep GITHUB_TOKEN / ADMIN_TOKEN (etc.) in .env and just run the
# script with no tokens on the command line.
$envFile = Join-Path (Join-Path $PSScriptRoot "..") ".env"
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

Write-Host "==> Linux plan: $PlanName (SKU $Sku)" -ForegroundColor Cyan
az appservice plan create --name $PlanName --resource-group $ResourceGroup `
  --sku $Sku --is-linux --output none

Write-Host "==> Web app: $AppName ($Runtime)" -ForegroundColor Cyan
az webapp create --name $AppName --resource-group $ResourceGroup `
  --plan $PlanName --runtime $Runtime --output none

# Build on the server (Oryx runs `npm install` + `npm run build`) and start via `npm start`.
az webapp config set --name $AppName --resource-group $ResourceGroup `
  --startup-file "npm start" --output none
if ($Sku -ne "F1") {
  # Always-on keeps the webhook responsive (not available on the F1 free tier).
  az webapp config set --name $AppName --resource-group $ResourceGroup `
    --always-on true --output none
}

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

Write-Host "==> Packaging app for deployment..." -ForegroundColor Cyan
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("georanker-deploy-" + [guid]::NewGuid().ToString("N"))
$zipPath = "$staging.zip"
# Stage source only (Oryx installs deps + builds on the server). Exclude heavy
# / local-only stuff: node_modules, dist, data (local SQLite), .git, secrets.
robocopy $appRoot $staging /E /NFL /NDL /NJH /NJS /NP `
  /XD node_modules dist data .git .github `
  /XF .env "*.sqlite" "*.sqlite-*" "*.log" | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed staging deploy files (exit $LASTEXITCODE)" }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -Force

Write-Host "==> Deploying code (Oryx build on server)... this can take several minutes" -ForegroundColor Cyan
az webapp deploy --name $AppName --resource-group $ResourceGroup `
  --src-path $zipPath --type zip
$deployExit = $LASTEXITCODE

Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
if ($deployExit -ne 0) { throw "az webapp deploy failed (exit $deployExit) -- see output above." }

Write-Host ""
Write-Host "Done! Dashboard:  $publicUrl" -ForegroundColor Green
Write-Host "Health check:     $publicUrl/healthz" -ForegroundColor Green
if ($TelegramBotToken) {
  Write-Host "Telegram webhook: $publicUrl/telegram/webhook (auto-registered on startup)" -ForegroundColor Green
}
Write-Host "Tail logs:        az webapp log tail --name $AppName --resource-group $ResourceGroup"
