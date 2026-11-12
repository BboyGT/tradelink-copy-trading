#!/bin/bash
# Debug script - tests every view via agent-browser and reports issues

VIEWS=("dashboard" "discover" "live_monitor" "portfolio" "automated_trading" "risk_management")
SECONDARY=("analytics" "comparison" "backtesting" "trade_history" "broker_connections" "notifications" "settings" "admin")

# Get all nav button refs
echo "=== Testing primary nav ==="
agent-browser snapshot -i --json > /tmp/snap.json 2>/dev/null

# Get refs for each nav button by label
get_ref_by_label() {
  local label="$1"
  agent-browser snapshot -i 2>&1 | grep -i "button \"$label\"" | head -1 | sed -n 's/.*ref=\([^]]*\)].*/\1/p'
}

for view_label in "Dashboard" "Discover" "Live" "Portfolio" "Replication" "Risk"; do
  ref=$(get_ref_by_label "$view_label")
  if [ -z "$ref" ]; then
    echo "❌ $view_label: NOT FOUND"
    continue
  fi
  echo "Testing $view_label (ref=$ref)..."
  agent-browser click "@$ref" > /dev/null 2>&1
  sleep 3
  errors=$(agent-browser errors 2>&1 | head -3)
  if [ -z "$errors" ]; then
    heading=$(agent-browser eval "document.querySelector('h1')?.innerText || 'no heading'" 2>&1 | tail -1)
    echo "  ✅ OK - heading: $heading"
  else
    echo "  ❌ ERROR: $errors"
  fi
done

echo ""
echo "=== Testing secondary nav (via More dropdown) ==="
for view_label in "Analytics" "Compare" "Backtest" "History" "Brokers" "Alerts" "Settings" "Admin"; do
  # Open More dropdown
  more_ref=$(get_ref_by_label "More")
  if [ -z "$more_ref" ]; then
    # Try finding the current-item variant
    more_ref=$(agent-browser snapshot -i 2>&1 | grep -E "expanded=false.*ref=" | head -1 | sed -n 's/.*ref=\([^]]*\)].*/\1/p')
  fi
  agent-browser click "@$more_ref" > /dev/null 2>&1
  sleep 1
  # Click the item
  item_ref=$(agent-browser snapshot -i 2>&1 | grep -i "menuitem \"$view_label\"" | head -1 | sed -n 's/.*ref=\([^]]*\)].*/\1/p')
  if [ -z "$item_ref" ]; then
    echo "❌ $view_label: NOT FOUND in dropdown"
    agent-browser press Escape > /dev/null 2>&1
    continue
  fi
  echo "Testing $view_label (ref=$item_ref)..."
  agent-browser click "@$item_ref" > /dev/null 2>&1
  sleep 3
  errors=$(agent-browser errors 2>&1 | head -3)
  if [ -z "$errors" ]; then
    heading=$(agent-browser eval "document.querySelector('h1')?.innerText || 'no heading'" 2>&1 | tail -1)
    echo "  ✅ OK - heading: $heading"
  else
    echo "  ❌ ERROR: $errors"
  fi
done

echo ""
echo "=== Done ==="
