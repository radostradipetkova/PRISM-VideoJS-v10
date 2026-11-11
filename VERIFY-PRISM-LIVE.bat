@echo off
setlocal
cd /d "%~dp0"
echo.
echo PRISM - PUBLIC WEBSITE PREFLIGHT
 echo ----------------------------------
echo Paste the exact Cloudflare Pages address shown after deployment.
echo Example: https://your-project.pages.dev/
set /p "PRISM_URL=Public URL: "
if not defined PRISM_URL (
  echo No URL provided.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run the public checks.
  pause
  exit /b 1
)
node "scripts\verify-public.mjs" "%PRISM_URL%"
if errorlevel 1 (
 echo.
 echo Some HTTP checks failed. Check the exact URL or Cloudflare deployment.
) else (
 echo.
 echo HTTP checks passed. Now open the public site with ?qa=1 for live player checks.
)
pause
