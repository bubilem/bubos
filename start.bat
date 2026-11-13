@echo off
rem Spusti lokalni web server pro BubOS a otevre prohlizec.
rem Poradi: PHP, Node, Python. Port lze zmenit: start.bat 9000. Ukonceni: Ctrl+C nebo zavrit okno.
setlocal
cd /d "%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"
set "URL=http://localhost:%PORT%/"

where php >nul 2>&1 && goto php
where node >nul 2>&1 && goto node
where python >nul 2>&1 && goto python
echo Nenalezen PHP, Node ani Python. Nainstalujte aspon jeden z nich.
pause
exit /b 1

:php
call :browser
echo BubOS bezi na %URL% (PHP)
php -S localhost:%PORT% -t .
goto end

:node
call :browser
echo BubOS bezi na %URL% (Node)
node tools\serve.mjs %PORT%
goto end

:python
call :browser
echo BubOS bezi na %URL% (Python)
python -m http.server %PORT% --bind 127.0.0.1
goto end

:browser
rem otevre prohlizec az po chvili, aby server stihl nabehnout
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%URL%'"
exit /b 0

:end
echo.
echo Server skoncil.
pause
