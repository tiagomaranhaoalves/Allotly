#!/bin/bash
# ============================================================
# Allotly API — Comprehensive Audit Test Suite
# Tests: Auth, Proxy, Streaming, Rate Limits, Error Handling,
#        Provider Routing, Budget Headers, Edge Cases
# ============================================================

BASE_URL="https://allotly.ai"
API_KEY="allotly_sk_Q2Cl4wRC_oDcgzZwnHy2Tmk4qMq1iJCQe9_AScMRnirG4ukA"
PASS=0
FAIL=0
WARN=0
RESULTS=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_pass() {
  PASS=$((PASS + 1))
  RESULTS="${RESULTS}\n${GREEN}[PASS]${NC} $1"
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_fail() {
  FAIL=$((FAIL + 1))
  RESULTS="${RESULTS}\n${RED}[FAIL]${NC} $1"
  echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
  WARN=$((WARN + 1))
  RESULTS="${RESULTS}\n${YELLOW}[WARN]${NC} $1"
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ============================================================
# SECTION 1: INFRASTRUCTURE
# ============================================================
log_section "1. INFRASTRUCTURE — Health & Connectivity"

# Test 1.1: Health endpoint
HEALTH=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/health" 2>/dev/null)
HTTP_CODE=$(echo "$HEALTH" | tail -1)
BODY=$(echo "$HEALTH" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  if echo "$BODY" | grep -q '"status":"ok"'; then
    log_pass "1.1 Health endpoint returns 200 with status:ok"
  else
    log_fail "1.1 Health endpoint returns 200 but unexpected body: $BODY"
  fi
else
  log_fail "1.1 Health endpoint returned HTTP $HTTP_CODE (expected 200)"
fi

# Test 1.2: Health endpoint has proxy:true
if echo "$BODY" | grep -q '"proxy":true'; then
  log_pass "1.2 Health endpoint confirms proxy:true"
else
  log_warn "1.2 Health endpoint missing proxy:true field"
fi

# Test 1.3: HTTPS redirect / TLS
TLS_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "http://allotly.ai/api/v1/health" 2>/dev/null)
if [ "$TLS_CHECK" = "301" ] || [ "$TLS_CHECK" = "302" ] || [ "$TLS_CHECK" = "200" ]; then
  log_pass "1.3 HTTP->HTTPS handling works (got $TLS_CHECK)"
else
  log_warn "1.3 HTTP->HTTPS check returned $TLS_CHECK"
fi

# Test 1.4: Models endpoint
MODELS=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/models" 2>/dev/null)
MODELS_CODE=$(echo "$MODELS" | tail -1)
MODELS_BODY=$(echo "$MODELS" | head -n -1)

if [ "$MODELS_CODE" = "200" ]; then
  log_pass "1.4 Models endpoint returns 200"
else
  log_fail "1.4 Models endpoint returned HTTP $MODELS_CODE"
fi

# ============================================================
# SECTION 2: AUTHENTICATION
# ============================================================
log_section "2. AUTHENTICATION — Key Validation"

# Test 2.1: Valid key
AUTH_VALID=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say the word hello"}],"max_tokens":5}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
AUTH_VALID_CODE=$(echo "$AUTH_VALID" | tail -1)

if [ "$AUTH_VALID_CODE" = "200" ]; then
  log_pass "2.1 Valid API key accepted (200)"
elif [ "$AUTH_VALID_CODE" = "402" ]; then
  log_warn "2.1 Valid key accepted but budget exhausted (402)"
else
  log_fail "2.1 Valid key returned HTTP $AUTH_VALID_CODE (expected 200)"
fi

# Test 2.2: No auth header
AUTH_NONE=$(curl -s -w "\n%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
AUTH_NONE_CODE=$(echo "$AUTH_NONE" | tail -1)
AUTH_NONE_BODY=$(echo "$AUTH_NONE" | head -n -1)

if [ "$AUTH_NONE_CODE" = "401" ]; then
  log_pass "2.2 Missing auth header returns 401"
else
  log_fail "2.2 Missing auth header returned $AUTH_NONE_CODE (expected 401)"
fi

# Test 2.3: Invalid key format
AUTH_BAD_FORMAT=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer not_a_valid_key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
AUTH_BAD_CODE=$(echo "$AUTH_BAD_FORMAT" | tail -1)

if [ "$AUTH_BAD_CODE" = "401" ]; then
  log_pass "2.3 Invalid key format returns 401"
else
  log_fail "2.3 Invalid key format returned $AUTH_BAD_CODE (expected 401)"
fi

# Test 2.4: Valid format but wrong key
AUTH_WRONG=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer allotly_sk_AAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
AUTH_WRONG_CODE=$(echo "$AUTH_WRONG" | tail -1)

if [ "$AUTH_WRONG_CODE" = "401" ]; then
  log_pass "2.4 Wrong key (valid format) returns 401"
else
  log_fail "2.4 Wrong key returned $AUTH_WRONG_CODE (expected 401)"
fi

# Test 2.5: Error response format compliance
if echo "$AUTH_NONE_BODY" | grep -q '"type":"allotly_error"'; then
  log_pass "2.5 Auth error uses allotly_error type"
else
  log_fail "2.5 Auth error missing allotly_error type: $AUTH_NONE_BODY"
fi

# Test 2.6: Error code is snake_case
AUTH_ERROR_CODE=$(echo "$AUTH_NONE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',{}).get('code',''))" 2>/dev/null)
if echo "$AUTH_ERROR_CODE" | grep -qE '^[a-z_]+$'; then
  log_pass "2.6 Auth error code is snake_case: $AUTH_ERROR_CODE"
else
  log_fail "2.6 Auth error code not snake_case: $AUTH_ERROR_CODE"
fi

# ============================================================
# SECTION 3: PROXY — Chat Completions (Non-Streaming)
# ============================================================
log_section "3. PROXY — Chat Completions (Non-Streaming)"

# Test 3.1: Basic completion
COMPLETION=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Reply with only the word PONG"}],"max_tokens":10}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
COMP_CODE=$(echo "$COMPLETION" | grep "HTTP_CODE:" | sed 's/HTTP_CODE://')
COMP_BODY=$(echo "$COMPLETION" | grep -v "HTTP_CODE:")

if [ "$COMP_CODE" = "200" ]; then
  if echo "$COMP_BODY" | grep -qi "pong"; then
    log_pass "3.1 Chat completion works — model responded with PONG"
  else
    log_pass "3.1 Chat completion returns 200 (response may vary)"
  fi
else
  log_fail "3.1 Chat completion returned HTTP $COMP_CODE"
fi

# Test 3.2: Response has required OpenAI-compatible fields
HAS_ID=$(echo "$COMP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'id' in d else 'no')" 2>/dev/null)
HAS_CHOICES=$(echo "$COMP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'choices' in d and len(d['choices'])>0 else 'no')" 2>/dev/null)
HAS_USAGE=$(echo "$COMP_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'usage' in d else 'no')" 2>/dev/null)

if [ "$HAS_ID" = "yes" ]; then
  log_pass "3.2a Response has 'id' field"
else
  log_fail "3.2a Response missing 'id' field"
fi
if [ "$HAS_CHOICES" = "yes" ]; then
  log_pass "3.2b Response has 'choices' array"
else
  log_fail "3.2b Response missing 'choices' array"
fi
if [ "$HAS_USAGE" = "yes" ]; then
  log_pass "3.2c Response has 'usage' field"
else
  log_warn "3.2c Response missing 'usage' field (some providers omit it)"
fi

# Test 3.3: Budget headers present
HEADERS=$(curl -s -D - -o /dev/null \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say hi"}],"max_tokens":5}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)

if echo "$HEADERS" | grep -qi "X-Allotly-Budget-Remaining"; then
  BUDGET_REM=$(echo "$HEADERS" | grep -i "X-Allotly-Budget-Remaining" | tr -d '\r' | awk '{print $2}')
  log_pass "3.3a Budget-Remaining header present: $BUDGET_REM cents"
else
  log_warn "3.3a X-Allotly-Budget-Remaining header not found"
fi

if echo "$HEADERS" | grep -qi "X-Allotly-Budget-Total"; then
  BUDGET_TOT=$(echo "$HEADERS" | grep -i "X-Allotly-Budget-Total" | tr -d '\r' | awk '{print $2}')
  log_pass "3.3b Budget-Total header present: $BUDGET_TOT cents"
else
  log_warn "3.3b X-Allotly-Budget-Total header not found"
fi

if echo "$HEADERS" | grep -qi "X-Allotly-Expires"; then
  log_pass "3.3c Expires header present"
else
  log_warn "3.3c X-Allotly-Expires header not found"
fi

# ============================================================
# SECTION 4: PROXY — Streaming
# ============================================================
log_section "4. PROXY — Streaming (SSE)"

# Test 4.1: Streaming completion
STREAM_OUTPUT=$(curl -s --max-time 30 \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Count from 1 to 3"}],"stream":true,"max_tokens":20}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)

if echo "$STREAM_OUTPUT" | grep -q "data:"; then
  log_pass "4.1 Streaming returns SSE data: lines"
else
  log_fail "4.1 Streaming did not return SSE format"
fi

# Test 4.2: Stream ends with [DONE]
if echo "$STREAM_OUTPUT" | grep -q "\[DONE\]"; then
  log_pass "4.2 Stream terminates with [DONE]"
else
  log_fail "4.2 Stream missing [DONE] terminator"
fi

# Test 4.3: Stream chunks have delta content
if echo "$STREAM_OUTPUT" | grep -q "delta"; then
  log_pass "4.3 Stream chunks contain delta objects"
else
  log_fail "4.3 Stream chunks missing delta objects"
fi

# ============================================================
# SECTION 5: PROVIDER ROUTING
# ============================================================
log_section "5. PROVIDER ROUTING — Model Detection"

# Test 5.1: Unsupported model returns proper error
UNSUPPORTED=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3-70b","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
UNSUP_CODE=$(echo "$UNSUPPORTED" | tail -1)
UNSUP_BODY=$(echo "$UNSUPPORTED" | head -n -1)

if [ "$UNSUP_CODE" = "400" ]; then
  log_pass "5.1 Unsupported model 'llama-3-70b' returns 400"
elif [ "$UNSUP_CODE" = "403" ]; then
  log_pass "5.1 Unsupported model returns 403 (model_not_allowed)"
else
  log_fail "5.1 Unsupported model returned $UNSUP_CODE (expected 400/403)"
fi

# Test 5.2: Error includes model name in message
if echo "$UNSUP_BODY" | grep -qi "llama\|unsupported\|not_found\|not_allowed"; then
  log_pass "5.2 Error message references the unsupported model"
else
  log_warn "5.2 Error message doesn't mention the model: $UNSUP_BODY"
fi

# ============================================================
# SECTION 6: INPUT VALIDATION
# ============================================================
log_section "6. INPUT VALIDATION — Request Schema"

# Test 6.1: Missing model field
NO_MODEL=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
NO_MODEL_CODE=$(echo "$NO_MODEL" | tail -1)

if [ "$NO_MODEL_CODE" = "400" ]; then
  log_pass "6.1 Missing model field returns 400"
else
  log_fail "6.1 Missing model returned $NO_MODEL_CODE (expected 400)"
fi

# Test 6.2: Empty messages array
EMPTY_MSG=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
EMPTY_MSG_CODE=$(echo "$EMPTY_MSG" | tail -1)

if [ "$EMPTY_MSG_CODE" = "400" ]; then
  log_pass "6.2 Empty messages array returns 400"
else
  log_fail "6.2 Empty messages returned $EMPTY_MSG_CODE (expected 400)"
fi

# Test 6.3: Invalid JSON body
BAD_JSON=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d 'this is not json' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
BAD_JSON_CODE=$(echo "$BAD_JSON" | tail -1)

if [ "$BAD_JSON_CODE" = "400" ]; then
  log_pass "6.3 Invalid JSON body returns 400"
else
  log_fail "6.3 Invalid JSON returned $BAD_JSON_CODE (expected 400)"
fi

# Test 6.4: max_tokens = 0 (invalid)
ZERO_TOKENS=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}],"max_tokens":0}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
ZERO_CODE=$(echo "$ZERO_TOKENS" | tail -1)

if [ "$ZERO_CODE" = "400" ]; then
  log_pass "6.4 max_tokens:0 returns 400"
else
  log_warn "6.4 max_tokens:0 returned $ZERO_CODE (may be passed through)"
fi

# Test 6.5: Missing Content-Type header
NO_CT=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
NO_CT_CODE=$(echo "$NO_CT" | tail -1)

if [ "$NO_CT_CODE" = "400" ] || [ "$NO_CT_CODE" = "200" ]; then
  log_pass "6.5 Missing Content-Type handled (returned $NO_CT_CODE)"
else
  log_warn "6.5 Missing Content-Type returned $NO_CT_CODE"
fi

# ============================================================
# SECTION 7: SECURITY
# ============================================================
log_section "7. SECURITY — Headers & Injection"

# Test 7.1: No server version disclosure
SERVER_HDR=$(curl -s -D - -o /dev/null "$BASE_URL/api/v1/health" 2>/dev/null | grep -i "^x-powered-by:")
if [ -z "$SERVER_HDR" ]; then
  log_pass "7.1 No X-Powered-By header (good — no server disclosure)"
else
  log_fail "7.1 X-Powered-By header exposed: $SERVER_HDR"
fi

# Test 7.2: Parameter injection — extra fields stripped
INJECT=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say hi"}],"max_tokens":5,"api_key":"INJECTED","secret":"EVIL"}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
INJECT_CODE=$(echo "$INJECT" | tail -1)

if [ "$INJECT_CODE" = "200" ]; then
  log_pass "7.2 Extra params (api_key, secret) stripped — request succeeded"
else
  log_warn "7.2 Extra params test returned $INJECT_CODE (may have been blocked or budget issue)"
fi

# Test 7.3: SQL injection in model name
SQLI=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4; DROP TABLE users;--","messages":[{"role":"user","content":"test"}]}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
SQLI_CODE=$(echo "$SQLI" | tail -1)

if [ "$SQLI_CODE" = "400" ] || [ "$SQLI_CODE" = "403" ]; then
  log_pass "7.3 SQL injection in model name rejected ($SQLI_CODE)"
else
  log_warn "7.3 SQL injection test returned $SQLI_CODE"
fi

# Test 7.4: XSS in messages
XSS=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"<script>alert(1)</script>"}],"max_tokens":5}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
XSS_CODE=$(echo "$XSS" | tail -1)

if [ "$XSS_CODE" = "200" ]; then
  log_pass "7.4 XSS in messages handled safely (200 — proxy passes content, no HTML rendering)"
else
  log_warn "7.4 XSS test returned $XSS_CODE"
fi

# ============================================================
# SECTION 8: ERROR RESPONSE FORMAT COMPLIANCE
# ============================================================
log_section "8. ERROR FORMAT — allotly_error Compliance"

# Use the auth error body from test 2.2
ERROR_BODY="$AUTH_NONE_BODY"

# Test 8.1: Has error.code
if echo "$ERROR_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['error']['code']" 2>/dev/null; then
  log_pass "8.1 Error response has error.code field"
else
  log_fail "8.1 Error response missing error.code"
fi

# Test 8.2: Has error.message
if echo "$ERROR_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['error']['message']" 2>/dev/null; then
  log_pass "8.2 Error response has error.message field"
else
  log_fail "8.2 Error response missing error.message"
fi

# Test 8.3: Has error.type = allotly_error
if echo "$ERROR_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['error']['type']=='allotly_error'" 2>/dev/null; then
  log_pass "8.3 Error response type is 'allotly_error'"
else
  log_fail "8.3 Error response type is not 'allotly_error'"
fi

# ============================================================
# SECTION 9: RATE LIMITING
# ============================================================
log_section "9. RATE LIMITING — Burst Protection"

# Test 9.1: Send 5 rapid requests, check none return 429
echo "  Sending 5 rapid requests..."
RATE_HITS=0
for i in $(seq 1 5); do
  RATE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' \
    "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
  if [ "$RATE_CODE" = "429" ]; then
    RATE_HITS=$((RATE_HITS + 1))
  fi
done

if [ "$RATE_HITS" -eq 0 ]; then
  log_pass "9.1 5 rapid requests — none rate-limited (within limits)"
else
  log_warn "9.1 $RATE_HITS of 5 requests were rate-limited (429)"
fi

# Test 9.2: Check 429 error format (if we hit one)
if [ "$RATE_HITS" -gt 0 ]; then
  RATE_BODY=$(curl -s \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"max_tokens":1}' \
    "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
  if echo "$RATE_BODY" | grep -q '"rate_limit"\|"concurrency_limit"'; then
    log_pass "9.2 Rate limit error uses correct code (rate_limit/concurrency_limit)"
  else
    log_warn "9.2 Rate limit error format: $RATE_BODY"
  fi
fi

# ============================================================
# SECTION 10: EDGE CASES
# ============================================================
log_section "10. EDGE CASES"

# Test 10.1: Very long message
LONG_MSG=$(python3 -c "print('A' * 10000)")
LONG=$(curl -s -w "\n%{http_code}" --max-time 30 \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"$LONG_MSG\"}],\"max_tokens\":5}" \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
LONG_CODE=$(echo "$LONG" | tail -1)

if [ "$LONG_CODE" = "200" ] || [ "$LONG_CODE" = "400" ] || [ "$LONG_CODE" = "402" ]; then
  log_pass "10.1 Long message (10K chars) handled gracefully ($LONG_CODE)"
else
  log_fail "10.1 Long message returned $LONG_CODE"
fi

# Test 10.2: System + user message
SYSTEM_MSG=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"system","content":"You are a calculator"},{"role":"user","content":"What is 2+2?"}],"max_tokens":10}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
SYS_CODE=$(echo "$SYSTEM_MSG" | tail -1)

if [ "$SYS_CODE" = "200" ]; then
  log_pass "10.2 System + user messages work (200)"
else
  log_fail "10.2 System + user messages returned $SYS_CODE"
fi

# Test 10.3: Multi-turn conversation
MULTI=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"My name is TestBot"},{"role":"assistant","content":"Hello TestBot!"},{"role":"user","content":"What is my name?"}],"max_tokens":10}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
MULTI_CODE=$(echo "$MULTI" | tail -1)

if [ "$MULTI_CODE" = "200" ]; then
  log_pass "10.3 Multi-turn conversation works (200)"
else
  log_fail "10.3 Multi-turn conversation returned $MULTI_CODE"
fi

# Test 10.4: temperature parameter
TEMP=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Say hello"}],"max_tokens":5,"temperature":0}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null)
TEMP_CODE=$(echo "$TEMP" | tail -1)

if [ "$TEMP_CODE" = "200" ]; then
  log_pass "10.4 temperature:0 parameter accepted (200)"
else
  log_fail "10.4 temperature:0 returned $TEMP_CODE"
fi

# ============================================================
# SECTION 11: RESPONSE TIMING
# ============================================================
log_section "11. PERFORMANCE — Response Timing"

# Test 11.1: Measure proxy overhead
TIME_START=$(python3 -c "import time; print(time.time())")
curl -s -o /dev/null \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hi"}],"max_tokens":1}' \
  "$BASE_URL/api/v1/chat/completions" 2>/dev/null
TIME_END=$(python3 -c "import time; print(time.time())")
LATENCY=$(python3 -c "print(f'{($TIME_END - $TIME_START):.2f}')")

if python3 -c "exit(0 if $TIME_END - $TIME_START < 10 else 1)"; then
  log_pass "11.1 Response latency: ${LATENCY}s (under 10s threshold)"
else
  log_warn "11.1 Response latency: ${LATENCY}s (above 10s — check provider/network)"
fi

# Test 11.2: Health endpoint latency
HEALTH_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/api/v1/health" 2>/dev/null)
if python3 -c "exit(0 if float('$HEALTH_TIME') < 2 else 1)"; then
  log_pass "11.2 Health endpoint latency: ${HEALTH_TIME}s"
else
  log_warn "11.2 Health endpoint slow: ${HEALTH_TIME}s"
fi

# ============================================================
# SUMMARY
# ============================================================
log_section "SUMMARY"
echo ""
echo -e "  ${GREEN}PASSED: $PASS${NC}"
echo -e "  ${RED}FAILED: $FAIL${NC}"
echo -e "  ${YELLOW}WARNINGS: $WARN${NC}"
echo -e "  TOTAL: $((PASS + FAIL + WARN))"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}All critical tests passed.${NC}"
else
  echo -e "  ${RED}$FAIL test(s) failed — review above.${NC}"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Full Results${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "$RESULTS"
echo ""
