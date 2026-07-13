#!/usr/bin/env bash
# Deploy GeoRanker for socials to the cheapest Azure App Service (Free F1, Linux,
# Node) as a *code* deployment built on the server by Oryx. See azure-free.ps1
# for the fully-commented Windows version. Run from georanker-for-socials/.
#
# Prereqs: `az login`, and config/roster.json created.
# Usage:
#   APP_NAME=georanker-you \
#   TELEGRAM_BOT_TOKEN=123:ABC TELEGRAM_CHAT_ID=-1001234567890 \
#   ./deploy/azure-free.sh
set -euo pipefail

APP_NAME="${APP_NAME:?set APP_NAME}"
RESOURCE_GROUP="${RESOURCE_GROUP:-georanker-rg}"
LOCATION="${LOCATION:-uksouth}"
PLAN_NAME="${PLAN_NAME:-georanker-free-plan}"
RUNTIME="${RUNTIME:-NODE:22-lts}"
TIMEZONE="${TIMEZONE:-Europe/London}"
EXTRACTOR="${EXTRACTOR:-github-models}"
PUBLIC_URL="https://${APP_NAME}.azurewebsites.net"
WEBHOOK_SECRET="$(cat /proc/sys/kernel/random/uuid | tr -d '-')"

echo "==> Resource group: $RESOURCE_GROUP ($LOCATION)"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Free (F1) Linux plan: $PLAN_NAME"
az appservice plan create --name "$PLAN_NAME" --resource-group "$RESOURCE_GROUP" \
  --sku F1 --is-linux --output none

echo "==> Web app: $APP_NAME ($RUNTIME)"
az webapp create --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --plan "$PLAN_NAME" --runtime "$RUNTIME" --output none

az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --startup-file "npm start" --output none

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

echo "==> Deploying code (Oryx build)…"
az webapp up --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" \
  --plan "$PLAN_NAME" --sku F1 --runtime "$RUNTIME" --os-type Linux

echo ""
echo "Done! Dashboard:  $PUBLIC_URL"
echo "Health check:     $PUBLIC_URL/healthz"
echo "Tail logs:        az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
