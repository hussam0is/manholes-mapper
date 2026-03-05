<#
.SYNOPSIS
    QA Automation Runner - Windows PowerShell
.DESCRIPTION
    Runs the complete QA suite: install deps, build, lint, test, and generate reports.
.PARAMETER Profile
    Test profile to run: 'pr', 'full', or 'nightly'. Default is 'full'.
.PARAMETER Suite
    Run a specific suite: 'smoke', 'unit', 'integration', 'api', 'e2e', 'security', 'performance'
.PARAMETER SkipInstall
    Skip npm install step
.PARAMETER SkipBuild
    Skip build step
.EXAMPLE
    .\run_qa.ps1 -Profile pr
    .\run_qa.ps1 -Suite unit
    .\run_qa.ps1 -Profile full -SkipInstall
#>

param(
    [ValidateSet('pr', 'full', 'nightly')]
    [string]$Profile = 'full',
    
    [ValidateSet('smoke', 'unit', 'integration', 'api', 'e2e', 'security', 'performance', '')]
    [string]$Suite = '',
    
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Continue"
$StartTime = Get-Date
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Colors for output
function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host "[FAIL] $Message" -ForegroundColor Red }
function Write-Skip { param([string]$Message) Write-Host "[SKIP] $Message" -ForegroundColor Yellow }

# Results tracking
$Results = @{
    passed = @()
    failed = @()
    skipped = @()
}

# Ensure reporting directory exists
$ReportingDir = Join-Path $ScriptDir "reporting"
if (-not (Test-Path $ReportingDir)) {
    New-Item -ItemType Directory -Path $ReportingDir -Force | Out-Null
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   QA AUTOMATION SUITE                      " -ForegroundColor Magenta
Write-Host "   Profile: $Profile                        " -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

Set-Location $ProjectRoot

# Step 1: Install dependencies
if (-not $SkipInstall) {
    Write-Step "Installing dependencies..."
    npm ci 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Dependencies installed"
    } else {
        Write-Fail "Failed to install dependencies"
        $Results.failed += "npm install"
    }
} else {
    Write-Skip "Dependency installation (--SkipInstall)"
}

# Step 2: Build (if needed)
if (-not $SkipBuild) {
    Write-Step "Building project..."
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Build completed"
    } else {
        Write-Fail "Build failed"
        $Results.failed += "build"
    }
} else {
    Write-Skip "Build step (--SkipBuild)"
}

# Define suite commands
function Run-Suite {
    param([string]$SuiteName)
    
    Write-Step "Running $SuiteName tests..."
    
    switch ($SuiteName) {
        "smoke" {
            # Lint
            Write-Host "  Running ESLint..." -ForegroundColor Gray
            npm run lint 2>&1 | Out-Null
            $lintResult = $LASTEXITCODE
            
            # TypeScript check
            Write-Host "  Running TypeScript check..." -ForegroundColor Gray
            npx tsc --noEmit 2>&1 | Out-Null
            $tscResult = $LASTEXITCODE
            
            # Quick unit tests
            Write-Host "  Running smoke tests..." -ForegroundColor Gray
            npm run test:run -- tests/api/validators.test.ts 2>&1 | Tee-Object -Variable testOutput | Out-Null
            $testResult = $LASTEXITCODE
            
            if ($lintResult -eq 0 -and $tscResult -eq 0 -and $testResult -eq 0) {
                Write-Success "Smoke tests passed"
                $Results.passed += "smoke"
            } else {
                Write-Fail "Smoke tests failed (lint: $lintResult, tsc: $tscResult, test: $testResult)"
                $Results.failed += "smoke"
            }
        }
        
        "unit" {
            npm run test:run -- --reporter=junit --outputFile="$ReportingDir/unit-junit.xml" 2>&1 | Tee-Object -Variable testOutput
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Unit tests passed"
                $Results.passed += "unit"
            } else {
                Write-Fail "Unit tests failed"
                $Results.failed += "unit"
            }
        }
        
        "integration" {
            if (-not $env:POSTGRES_URL) {
                Write-Skip "Integration tests (POSTGRES_URL not set)"
                $Results.skipped += "integration"
                return
            }
            npm run test:run -- --reporter=junit --outputFile="$ReportingDir/integration-junit.xml" tests/api/sketches.test.ts 2>&1 | Tee-Object -Variable testOutput
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Integration tests passed"
                $Results.passed += "integration"
            } else {
                Write-Fail "Integration tests failed"
                $Results.failed += "integration"
            }
        }
        
        "api" {
            npm run test:run -- --reporter=junit --outputFile="$ReportingDir/api-junit.xml" tests/api/ 2>&1 | Tee-Object -Variable testOutput
            if ($LASTEXITCODE -eq 0) {
                Write-Success "API tests passed"
                $Results.passed += "api"
            } else {
                Write-Fail "API tests failed"
                $Results.failed += "api"
            }
        }
        
        "e2e" {
            # Check if Playwright is installed
            if (-not (Test-Path "node_modules/@playwright")) {
                Write-Host "  Installing Playwright..." -ForegroundColor Gray
                npm install -D @playwright/test 2>&1 | Out-Null
                npx playwright install chromium 2>&1 | Out-Null
            }
            
            npx playwright test --reporter=junit 2>&1 | Tee-Object -Variable testOutput
            if ($LASTEXITCODE -eq 0) {
                Write-Success "E2E tests passed"
                $Results.passed += "e2e"
            } else {
                Write-Fail "E2E tests failed"
                $Results.failed += "e2e"
            }
        }
        
        "security" {
            Write-Host "  Running npm audit..." -ForegroundColor Gray
            $auditOutput = npm audit --json 2>&1
            $auditOutput | Out-File "$ReportingDir/npm-audit.json" -Encoding utf8
            
            $auditData = $auditOutput | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($auditData -and $auditData.metadata) {
                $highVulns = $auditData.metadata.vulnerabilities.high
                $criticalVulns = $auditData.metadata.vulnerabilities.critical
                
                if ($criticalVulns -gt 0) {
                    Write-Fail "Security audit found $criticalVulns critical vulnerabilities"
                    $Results.failed += "security"
                } elseif ($highVulns -gt 0) {
                    Write-Host "[WARN] Security audit found $highVulns high vulnerabilities" -ForegroundColor Yellow
                    $Results.passed += "security"
                } else {
                    Write-Success "Security audit passed"
                    $Results.passed += "security"
                }
            } else {
                Write-Success "Security audit completed"
                $Results.passed += "security"
            }
        }
        
        "performance" {
            Write-Skip "Performance tests (requires running server)"
            $Results.skipped += "performance"
        }
    }
}

# Determine which suites to run
if ($Suite) {
    $SuitesToRun = @($Suite)
} else {
    switch ($Profile) {
        "pr" { $SuitesToRun = @("smoke") }
        "full" { $SuitesToRun = @("smoke", "unit", "integration", "api", "security") }
        "nightly" { $SuitesToRun = @("smoke", "unit", "integration", "api", "e2e", "security", "performance") }
    }
}

# Run suites
foreach ($s in $SuitesToRun) {
    Run-Suite -SuiteName $s
}

# Generate summary report
$EndTime = Get-Date
$Duration = $EndTime - $StartTime

$SummaryContent = @"
# QA Run Summary

**Date:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Profile:** $Profile
**Duration:** $($Duration.TotalSeconds.ToString("F1")) seconds

## Results

### Passed ($($Results.passed.Count))
$($Results.passed | ForEach-Object { "- $_" } | Out-String)

### Failed ($($Results.failed.Count))
$($Results.failed | ForEach-Object { "- $_" } | Out-String)

### Skipped ($($Results.skipped.Count))
$($Results.skipped | ForEach-Object { "- $_" } | Out-String)

## Status

$(if ($Results.failed.Count -eq 0) { "**All tests passed!**" } else { "**Some tests failed. See details above.**" })
"@

$SummaryContent | Out-File "$ReportingDir/summary.md" -Encoding utf8

# Generate JSON results
$JsonResults = @{
    timestamp = (Get-Date -Format "o")
    profile = $Profile
    duration_seconds = $Duration.TotalSeconds
    results = $Results
    status = if ($Results.failed.Count -eq 0) { "passed" } else { "failed" }
} | ConvertTo-Json -Depth 5

$JsonResults | Out-File "$ReportingDir/results.json" -Encoding utf8

# Final summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   QA RUN COMPLETE                          " -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Duration: $($Duration.TotalSeconds.ToString('F1')) seconds"
Write-Host "Passed:   $($Results.passed.Count)" -ForegroundColor Green
Write-Host "Failed:   $($Results.failed.Count)" -ForegroundColor $(if ($Results.failed.Count -gt 0) { "Red" } else { "Green" })
Write-Host "Skipped:  $($Results.skipped.Count)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Reports generated in: $ReportingDir"
Write-Host ""

# Exit with appropriate code
if ($Results.failed.Count -gt 0) {
    exit 1
} else {
    exit 0
}
