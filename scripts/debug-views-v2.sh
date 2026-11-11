#!/bin/bash
# Comprehensive debug — tests every view via direct JS click

VIEWS=(
  "dashboard|Dashboard"
  "discover|Discover"
  "live_monitor|Live"
  "portfolio|Portfolio"
  "automated_trading|Replication"
  "risk_management|Risk"
  "analytics|Analytics"
  "comparison|Compare"
  "backtesting|Backtest"
  "trade_history|History"
  "broker_connections|Brokers"
  "notifications|Alerts"
  "settings|Settings"
  "admin|Admin"
)

echo "=== Testing all 14 views via Zustand store ==="
for entry in "${VIEWS[@]}"; do
  view_id="${entry%%|*}"
  label="${entry##*|}"
  
  # Navigate via the store
  agent-browser eval "
    const stores = document.querySelectorAll('*');
    // Use the fetch-based approach: just click the nav button matching the label
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent?.trim() === '$label' || b.getAttribute('aria-label') === '$label');
    if (target) target.click();
    else {
      // For secondary views, we need to open More dropdown first
      const moreBtns = btns.filter(b => b.textContent?.includes('More') || b.textContent?.includes('ChevronDown'));
      // Try clicking each secondary item
    }
  " > /dev/null 2>&1
  sleep 0.5
  
  # Check current view via heading
  heading=$(agent-browser eval "document.querySelector('h1')?.innerText || 'NO HEADING'" 2>&1 | tail -1 | tr -d '"')
  errors=$(agent-browser errors 2>&1 | head -1)
  
  if [ -z "$errors" ]; then
    echo "✅ $label → $heading"
  else
    echo "❌ $label → ERROR: $errors"
  fi
done
