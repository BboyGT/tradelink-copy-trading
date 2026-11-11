#!/usr/bin/env bash
# TRADE LINK — Live Data Setup Validator
# Run this script to check if everything is configured for real Deriv data.
#
# Usage: bash scripts/check-live-setup.sh

set -e

echo "============================================"
echo "  TRADE LINK — Live Data Setup Checker"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

pass() { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

echo "--- Checking environment variables ---"
if grep -q "DERIV_APP_ID" .env 2>/dev/null; then
  APP_ID=$(grep "DERIV_APP_ID" .env | cut -d'=' -f2 | tr -d '"')
  if [ "$APP_ID" != "" ] && [ "$APP_ID" != "your_app_id" ]; then
    pass "DERIV_APP_ID is set: $APP_ID"
  else
    fail "DERIV_APP_ID is set but empty or placeholder"
  fi
else
  fail "DERIV_APP_ID is not set in .env"
  echo ""
  echo "  To fix:"
  echo "  1. Go to https://api.deriv.com"
  echo "  2. Click 'Register Application'"
  echo "  3. Fill in the form:"
  echo "     - App name: TRADE LINK"
  echo "     - Description: Multi-broker copy trading platform"
  echo "     - Redirect URL: http://localhost:3000/api/brokers/deriv/callback"
  echo "     - Verification URL: http://localhost:3000"
  echo "  4. Copy the App ID (a number like 12345)"
  echo "  5. Add to .env:"
  echo '     DERIV_APP_ID=12345'
fi

echo ""

if grep -q "DERIV_CLIENT_SECRET" .env 2>/dev/null; then
  pass "DERIV_CLIENT_SECRET is set"
else
  warn "DERIV_CLIENT_SECRET is not set (optional — only needed for server-side OAuth token exchange)"
  echo "  If you set up an OAuth client in Deriv, add the secret to .env"
fi

echo ""

if grep -q "DERIV_REDIRECT_URI" .env 2>/dev/null; then
  REDIRECT=$(grep "DERIV_REDIRECT_URI" .env | cut -d'=' -f2 | tr -d '"')
  pass "DERIV_REDIRECT_URI is set: $REDIRECT"
else
  warn "DERIV_REDIRECT_URI is not set — will default to http://localhost:3000/api/brokers/deriv/callback"
fi

echo ""
echo "--- Checking database ---"
if [ -f "db/custom.db" ]; then
  pass "Database exists"
else
  fail "Database does not exist — run: npm run db:push"
fi

echo ""
echo "--- Checking dev server ---"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -q "200"; then
  pass "Dev server is running on port 3000"
else
  fail "Dev server is not running — run: npm run dev"
fi

echo ""
echo "--- Checking WebSocket service ---"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/ 2>/dev/null | grep -qE "200|400"; then
  pass "WebSocket service is running on port 3003"
else
  warn "WebSocket service may not be running — check: npm run dev:events"
fi

echo ""
echo "--- Checking OAuth callback route ---"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/brokers/deriv/oauth-url 2>/dev/null | grep -q "401\|200\|500"; then
  pass "OAuth URL route is accessible"
else
  fail "OAuth URL route is not responding"
fi

echo ""
echo "============================================"
echo "  Summary"
echo "============================================"

if grep -q "DERIV_APP_ID" .env 2>/dev/null; then
  APP_ID=$(grep "DERIV_APP_ID" .env | cut -d'=' -f2 | tr -d '"')
  if [ "$APP_ID" != "" ] && [ "$APP_ID" != "your_app_id" ]; then
    echo -e "${GREEN}✅ Ready for live Deriv data!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Start the dev stack: npm run dev:stack"
    echo "  3. Sign in to TRADE LINK"
    echo "  4. Go to Brokers → click Connect on Deriv"
    echo "  5. You'll be redirected to Deriv to log in"
    echo "  6. After authorization, your real Deriv account will be linked"
    echo "  7. Go to Admin → click 'Import Deriv Providers' to fetch real trader data"
    echo ""
    echo "To import real providers: POST /api/providers/import-deriv"
  else
    echo -e "${RED}❌ Not ready — DERIV_APP_ID needs a real value${NC}"
  fi
else
  echo -e "${RED}❌ Not ready — you need to set DERIV_APP_ID${NC}"
  echo ""
  echo "Step-by-step guide:"
  echo ""
  echo "  STEP 1: Register a Deriv app"
  echo "    → Go to https://api.deriv.com"
  echo "    → Click 'Register Application' (or login if you have an account)"
  echo "    → Fill in:"
  echo "       App name: TRADE LINK"
  echo "       Description: Multi-broker copy trading platform"
  echo "       Redirect URL: http://localhost:3000/api/brokers/deriv/callback"
  echo "       Verification URL: http://localhost:3000"
  echo "    → Submit the form"
  echo "    → Copy your App ID (looks like: 12345)"
  echo ""
  echo "  STEP 2: Add the App ID to TRADE LINK"
  echo "    → Open the file: /home/z/my-project/.env"
  echo "    → Add this line (replace 12345 with your real App ID):"
  echo "       DERIV_APP_ID=12345"
  echo "       DERIV_REDIRECT_URI=http://localhost:3000/api/brokers/deriv/callback"
  echo "    → Save the file"
  echo ""
  echo "  STEP 3: Restart the dev server"
  echo "    → Run: npm run dev:stack"
  echo ""
  echo "  STEP 4: Connect your Deriv account"
  echo "    → Sign in to TRADE LINK"
  echo "    → Go to Brokers → click Connect on Deriv"
  echo "    → You'll be redirected to Deriv's login page"
  echo "    → Log in with your Deriv account"
  echo "    → Click 'Authorize' to grant TRADE LINK access"
  echo "    → You'll be redirected back — your real account is now linked"
  echo ""
  echo "  STEP 5: Import real providers"
  echo "    → Go to Admin → scroll to Deriv Import section"
  echo "    → Click 'Import Deriv Providers'"
  echo "    → Real Deriv copy traders will appear in Discover"
fi

echo ""
