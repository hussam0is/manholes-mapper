#!/bin/bash
#
# QA Automation Runner - Linux/macOS
#
# Usage:
#   ./run_qa.sh                  # Run full profile
#   ./run_qa.sh --profile pr     # Run PR profile (smoke only)
#   ./run_qa.sh --suite unit     # Run specific suite
#   ./run_qa.sh --skip-install   # Skip npm install
#   ./run_qa.sh --skip-build     # Skip build step
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPORTING_DIR="$SCRIPT_DIR/reporting"
PROFILE="full"
SUITE=""
SKIP_INSTALL=false
SKIP_BUILD=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        --suite)
            SUITE="$2"
            shift 2
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Results tracking
PASSED=()
FAILED=()
SKIPPED=()
START_TIME=$(date +%s)

# Helper functions
step() { echo -e "\n${CYAN}==> $1${NC}"; }
success() { echo -e "${GREEN}[OK] $1${NC}"; }
fail() { echo -e "${RED}[FAIL] $1${NC}"; }
skip() { echo -e "${YELLOW}[SKIP] $1${NC}"; }

# Ensure reporting directory exists
mkdir -p "$REPORTING_DIR"

echo ""
echo -e "${MAGENTA}============================================${NC}"
echo -e "${MAGENTA}   QA AUTOMATION SUITE                      ${NC}"
echo -e "${MAGENTA}   Profile: $PROFILE                        ${NC}"
echo -e "${MAGENTA}============================================${NC}"

cd "$PROJECT_ROOT"

# Step 1: Install dependencies
if [ "$SKIP_INSTALL" = false ]; then
    step "Installing dependencies..."
    if npm ci > /dev/null 2>&1; then
        success "Dependencies installed"
    else
        fail "Failed to install dependencies"
        FAILED+=("npm install")
    fi
else
    skip "Dependency installation (--skip-install)"
fi

# Step 2: Build (if needed)
if [ "$SKIP_BUILD" = false ]; then
    step "Building project..."
    if npm run build > /dev/null 2>&1; then
        success "Build completed"
    else
        fail "Build failed"
        FAILED+=("build")
    fi
else
    skip "Build step (--skip-build)"
fi

# Suite runner
run_suite() {
    local suite_name=$1
    step "Running $suite_name tests..."
    
    case $suite_name in
        smoke)
            echo "  Running ESLint..."
            npm run lint > /dev/null 2>&1
            lint_result=$?
            
            echo "  Running TypeScript check..."
            npx tsc --noEmit > /dev/null 2>&1
            tsc_result=$?
            
            echo "  Running smoke tests..."
            npm run test:run -- tests/api/validators.test.ts > /dev/null 2>&1
            test_result=$?
            
            if [ $lint_result -eq 0 ] && [ $tsc_result -eq 0 ] && [ $test_result -eq 0 ]; then
                success "Smoke tests passed"
                PASSED+=("smoke")
            else
                fail "Smoke tests failed (lint: $lint_result, tsc: $tsc_result, test: $test_result)"
                FAILED+=("smoke")
            fi
            ;;
            
        unit)
            if npm run test:run -- --reporter=junit --outputFile="$REPORTING_DIR/unit-junit.xml" 2>&1; then
                success "Unit tests passed"
                PASSED+=("unit")
            else
                fail "Unit tests failed"
                FAILED+=("unit")
            fi
            ;;
            
        integration)
            if [ -z "$POSTGRES_URL" ]; then
                skip "Integration tests (POSTGRES_URL not set)"
                SKIPPED+=("integration")
                return
            fi
            if npm run test:run -- --reporter=junit --outputFile="$REPORTING_DIR/integration-junit.xml" tests/api/sketches.test.ts 2>&1; then
                success "Integration tests passed"
                PASSED+=("integration")
            else
                fail "Integration tests failed"
                FAILED+=("integration")
            fi
            ;;
            
        api)
            if npm run test:run -- --reporter=junit --outputFile="$REPORTING_DIR/api-junit.xml" tests/api/ 2>&1; then
                success "API tests passed"
                PASSED+=("api")
            else
                fail "API tests failed"
                FAILED+=("api")
            fi
            ;;
            
        e2e)
            # Check if Playwright is installed
            if [ ! -d "node_modules/@playwright" ]; then
                echo "  Installing Playwright..."
                npm install -D @playwright/test > /dev/null 2>&1
                npx playwright install chromium > /dev/null 2>&1
            fi
            
            if npx playwright test --reporter=junit 2>&1; then
                success "E2E tests passed"
                PASSED+=("e2e")
            else
                fail "E2E tests failed"
                FAILED+=("e2e")
            fi
            ;;
            
        security)
            echo "  Running npm audit..."
            npm audit --json > "$REPORTING_DIR/npm-audit.json" 2>&1 || true
            
            # Parse results
            if command -v jq &> /dev/null; then
                critical=$(jq '.metadata.vulnerabilities.critical // 0' "$REPORTING_DIR/npm-audit.json" 2>/dev/null || echo "0")
                high=$(jq '.metadata.vulnerabilities.high // 0' "$REPORTING_DIR/npm-audit.json" 2>/dev/null || echo "0")
                
                if [ "$critical" -gt 0 ]; then
                    fail "Security audit found $critical critical vulnerabilities"
                    FAILED+=("security")
                elif [ "$high" -gt 0 ]; then
                    echo -e "${YELLOW}[WARN] Security audit found $high high vulnerabilities${NC}"
                    PASSED+=("security")
                else
                    success "Security audit passed"
                    PASSED+=("security")
                fi
            else
                success "Security audit completed"
                PASSED+=("security")
            fi
            ;;
            
        performance)
            skip "Performance tests (requires running server)"
            SKIPPED+=("performance")
            ;;
    esac
}

# Determine which suites to run
if [ -n "$SUITE" ]; then
    SUITES_TO_RUN=("$SUITE")
else
    case $PROFILE in
        pr) SUITES_TO_RUN=("smoke") ;;
        full) SUITES_TO_RUN=("smoke" "unit" "integration" "api" "security") ;;
        nightly) SUITES_TO_RUN=("smoke" "unit" "integration" "api" "e2e" "security" "performance") ;;
    esac
fi

# Run suites
for suite in "${SUITES_TO_RUN[@]}"; do
    run_suite "$suite"
done

# Generate summary report
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

cat > "$REPORTING_DIR/summary.md" << EOF
# QA Run Summary

**Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Profile:** $PROFILE
**Duration:** ${DURATION} seconds

## Results

### Passed (${#PASSED[@]})
$(printf '- %s\n' "${PASSED[@]}")

### Failed (${#FAILED[@]})
$(printf '- %s\n' "${FAILED[@]}")

### Skipped (${#SKIPPED[@]})
$(printf '- %s\n' "${SKIPPED[@]}")

## Status

$(if [ ${#FAILED[@]} -eq 0 ]; then echo "**All tests passed!**"; else echo "**Some tests failed. See details above.**"; fi)
EOF

# Generate JSON results
cat > "$REPORTING_DIR/results.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "profile": "$PROFILE",
  "duration_seconds": $DURATION,
  "results": {
    "passed": [$(printf '"%s",' "${PASSED[@]}" | sed 's/,$//')]
,
    "failed": [$(printf '"%s",' "${FAILED[@]}" | sed 's/,$//')]
,
    "skipped": [$(printf '"%s",' "${SKIPPED[@]}" | sed 's/,$//')]

  },
  "status": "$(if [ ${#FAILED[@]} -eq 0 ]; then echo 'passed'; else echo 'failed'; fi)"
}
EOF

# Final summary
echo ""
echo -e "${MAGENTA}============================================${NC}"
echo -e "${MAGENTA}   QA RUN COMPLETE                          ${NC}"
echo -e "${MAGENTA}============================================${NC}"
echo ""
echo "Duration: ${DURATION} seconds"
echo -e "Passed:   ${GREEN}${#PASSED[@]}${NC}"
if [ ${#FAILED[@]} -gt 0 ]; then
    echo -e "Failed:   ${RED}${#FAILED[@]}${NC}"
else
    echo -e "Failed:   ${GREEN}${#FAILED[@]}${NC}"
fi
echo -e "Skipped:  ${YELLOW}${#SKIPPED[@]}${NC}"
echo ""
echo "Reports generated in: $REPORTING_DIR"
echo ""

# Exit with appropriate code
if [ ${#FAILED[@]} -gt 0 ]; then
    exit 1
else
    exit 0
fi
