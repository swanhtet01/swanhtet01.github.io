@echo off
echo Deploying website to GitHub Pages...

:: Initialize git if not already done
git init

:: Configure git user
git config user.email "ai@supermega.inc"
git config user.name "Super Mega AI"

:: Add all files
git add .

:: Commit changes
git commit -m "Deploy simple professional website - Made by AI"

:: Add remote if not exists
git remote remove origin 2>nul
git remote add origin https://github.com/swanhtet01/swanhtet01.github.io.git

:: Set main branch
git branch -M main

:: Push to GitHub
git push -u origin main --force

echo.
echo Website deployed! 
echo Visit: https://supermega.dev
echo.
pause
