#!/usr/bin/env bash
# Test key OASIS API endpoints (used by MCP) against local API.
# Usage: ./MCP/scripts/test-local-endpoints.sh [BASE_URL]
# Default BASE_URL: http://127.0.0.1:5003

set -e
BASE="${1:-http://127.0.0.1:5003}"
PASS=0
FAIL=0

test_route() {
  local method="$1"
  local path="$2"
  local data="$3"
  local desc="$4"
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o /tmp/oasis_test_out.json -w "%{http_code}" "$BASE$path" 2>/dev/null || echo "000")
  else
    code=$(curl -s -o /tmp/oasis_test_out.json -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$BASE$path" 2>/dev/null || echo "000")
  fi
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "  OK $desc ($code)"
    PASS=$((PASS+1))
    return 0
  else
    echo "  FAIL $desc (HTTP $code)"
    FAIL=$((FAIL+1))
    return 1
  fi
}

echo "Testing OASIS API at $BASE"
echo "---"

test_route GET "/api/health" "" "Health"
test_route GET "/api/wallet/supported-chains" "" "Supported chains"

# Register a unique test user (API requires FirstName, LastName, AvatarType, etc.)
UN="mcp_test_$(date +%s)"
test_route POST "/api/avatar/register" "{\"username\":\"$UN\",\"email\":\"$UN@test.local\",\"password\":\"TestPass123!\",\"confirmPassword\":\"TestPass123!\",\"acceptTerms\":true,\"firstName\":\"Mcp\",\"lastName\":\"Tester\",\"avatarType\":\"User\"}" "Register avatar ($UN)" || true

# Authenticate (local API may require email verification; endpoint still works)
AUTH_RESP=$(curl -s -X POST -H "Content-Type: application/json" -d "{\"username\":\"$UN\",\"password\":\"TestPass123!\"}" "$BASE/api/avatar/authenticate" 2>/dev/null || echo "{}")
if echo "$AUTH_RESP" | grep -q '"jwtToken"'; then
  echo "  OK Authenticate ($UN) - got JWT"
  PASS=$((PASS+1))
  TOKEN=$(echo "$AUTH_RESP" | sed -n 's/.*"jwtToken":"\([^"]*\)".*/\1/p' || echo "")
  if [ -n "$TOKEN" ]; then
    test_route GET "/api/wallet/avatar/username/$UN/wallets" "" "Get wallets (auth)" 2>/dev/null || true
  fi
elif echo "$AUTH_RESP" | grep -q "not been verified\|check your email"; then
  echo "  OK Authenticate ($UN) - endpoint works (email verification required)"
  PASS=$((PASS+1))
else
  echo "  FAIL Authenticate ($UN) - $(echo "$AUTH_RESP" | head -c 120)"
  FAIL=$((FAIL+1))
fi

echo "---"
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
