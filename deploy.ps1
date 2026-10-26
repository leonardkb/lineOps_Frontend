# deploy.ps1 — build + deploy a Vite frontend to S3/CloudFront with correct cache headers
#
# Usage (run from the project folder that contains package.json and produces ./dist):
#   .\deploy.ps1 lineops
#   .\deploy.ps1 skyrina
#
# What it does, in order:
#   1. npm run build
#   2. upload hashed assets  -> cache forever (immutable)
#   3. upload index.html     -> no-cache (always revalidate)  <-- this is what kills the "Monday error"
#   4. invalidate /index.html and / at the CloudFront edge

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("lineops", "skyrina")]
    [string]$Target
)

$ErrorActionPreference = "Stop"

# --- per-frontend settings -------------------------------------------------
$config = @{
    lineops = @{
        Bucket         = "lineops-frontend"
        DistributionId = "E30TTE0NUFZOVJ"
        Dist           = "./dist"
    }
    skyrina = @{
        Bucket         = "skyrina-frontend-app-2026"
        DistributionId = "E3B5K3N56MP55P"
        Dist           = "./dist"   # adjust if the skyrina project builds elsewhere
    }
}

$c = $config[$Target]
$bucket = $c.Bucket
$distId = $c.DistributionId
$distDir = $c.Dist

Write-Host "==> Deploying '$Target' to s3://$bucket (CloudFront $distId)" -ForegroundColor Cyan

# --- 1. build --------------------------------------------------------------
Write-Host "==> npm run build" -ForegroundColor Cyan
npm run build

if (-not (Test-Path $distDir)) {
    throw "Build folder '$distDir' not found. Are you in the right project directory?"
}

# --- 2. hashed assets: cache forever --------------------------------------
Write-Host "==> Uploading assets (immutable, cache-forever)" -ForegroundColor Cyan
aws s3 sync $distDir "s3://$bucket" --exclude "*.html" `
    --cache-control "public, max-age=31536000, immutable"

# --- 3. index.html: never browser-cached ----------------------------------
Write-Host "==> Uploading index.html (no-cache)" -ForegroundColor Cyan
aws s3 sync $distDir "s3://$bucket" --exclude "*" --include "*.html" `
    --cache-control "no-cache, must-revalidate"

# --- 4. invalidate the edge ------------------------------------------------
Write-Host "==> Invalidating CloudFront (/index.html and /)" -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $distId --paths "/index.html" "/"

Write-Host "==> Done. index.html will now always revalidate; hashed assets cache forever." -ForegroundColor Green