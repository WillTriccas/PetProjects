#!/usr/bin/env bash
# Deploy GeoRanker for socials to the cheapest Azure App Service (Free F1, Linux,
# Node) as a *code* deployment built on the server by Oryx. See azure-free.ps1
# for the fully-commented Windows version. Run from georanker-for-socials/.
#
# Prereqs: `az login`, and config/roster.json created.
# Secrets (GITHUB_TOKEN, ADMIN_TOKEN, TELEGRAM_*) are read from .env if present,
# or from the environment. So the simplest run is just:
#   APP_NAME=georanker-you ./deploy/azure-free.sh
# Usage:
#   APP_NAME=georanker-you \
#   TELEGRAM_BOT_TOKEN=123:ABC TELEGRAM_CHAT_ID=-1001234567890 \
#   ./deploy/azure-free.sh
set -euo pipefail

# ── Load secrets from .env (if present) so they don't need to be exported ──────
# Precedence: existing environment variable > .env value. CLI/env always wins.
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  echo "==> Reading secrets from $ENV_FILE"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue;; esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | xargs)"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    # Only set if not already provided in the environment.
    if [ -z "${!key:-}" ]; then export "$key=$val"; fi
  done < "$ENV_FILE"
fi

APP_NAME="${APP_NAME:?set APP_NAME}"
RESOURCE_GROUP="${RESOURCE_GROUP:-georanker-rg}"
LOCATION="${LOCATION:-ukwest}"
PLAN_NAME="${PLAN_NAME:-georanker-free-plan}"
RUNTIME="${RUNTIME:-NODE:22-lts}"
SKU="${SKU:-B1}"
TIMEZONE="${TIMEZONE:-Europe/London}"
EXTRACTOR="${EXTRACTOR:-github-models}"
PUBLIC_URL="https://${APP_NAME}.azurewebsites.net"
WEBHOOK_SECRET="$(cat /proc/sys/kernel/random/uuid | tr -d '-')"

echo "==> Resource group: $RESOURCE_GROUP"
if [ "$(az group exists --name "$RESOURCE_GROUP")" = "true" ]; then
  echo "    (already exists; leaving its location as-is)"
else
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
fi

echo "==> Linux plan: $PLAN_NAME (SKU $SKU, $LOCATION)"
az appservice plan create --name "$PLAN_NAME" --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" --sku "$SKU" --is-linux --output none

echo "==> Web app: $APP_NAME ($RUNTIME)"
az webapp create --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --plan "$PLAN_NAME" --runtime "$RUNTIME" --output none

az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --startup-file "npm start" --output none
if [ "$SKU" != "F1" ]; then
  az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
    --always-on true --output none
fi

echo "==> App settings"
SETTINGS=(
  "SCM_DO_BUILD_DURING_DEPLOYMENT=true"
  "WEBSITES_PORT=8080"
  "NODE_ENV=production"
  "TIMEZONE=$TIMEZONE"
  "EXTRACTOR=$EXTRACTOR"
  "ROSTER_PATH=config/roster.json"
  "DB_PATH=/home/data/georanker.sqlite"
  "PUBLIC_URL=$PUBLIC_URL"
  "TELEGRAM_WEBHOOK_SECRET=$WEBHOOK_SECRET"
)
[ -n "${GITHUB_TOKEN:-}" ]       && SETTINGS+=("GITHUB_TOKEN=$GITHUB_TOKEN")
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] && SETTINGS+=("TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN")
[ -n "${TELEGRAM_CHAT_ID:-}" ]   && SETTINGS+=("TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID")
[ -n "${ADMIN_TOKEN:-}" ]        && SETTINGS+=("ADMIN_TOKEN=$ADMIN_TOKEN")

az webapp config appsettings set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --settings "${SETTINGS[@]}" --output none

echo "==> Packaging app for deployment…"
STAGING="$(mktemp -d)"
ZIP_PATH="$(mktemp -u).zip"
# Stage source only (Oryx installs deps + builds on the server).
rsync -a --exclude node_modules --exclude dist --exclude data --exclude .git \
  --exclude .github --exclude .env --exclude '*.sqlite*' --exclude '*.log' \
  ./ "$STAGING/" 2>/dev/null || cp -r ./ "$STAGING/"
( cd "$STAGING" && zip -qr "$ZIP_PATH" . )

echo "==> Deploying code (Oryx build on server)… this can take several minutes"
az webapp deploy --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --src-path "$ZIP_PATH" --type zip
rm -rf "$STAGING" "$ZIP_PATH"

echo ""
echo "Done! Dashboard:  $PUBLIC_URL"
echo "Health check:     $PUBLIC_URL/healthz"
echo "Tail logs:        az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
