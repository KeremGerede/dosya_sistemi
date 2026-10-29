@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Dosya Sistemi - Baslatici

rem Dosya Sistemi'ni bu dosyanın bulunduğu klasörden başlatır: PostgreSQL (Docker), FastAPI backend ve Vite frontend.
rem Veritabanı, Docker volume'u, backend\.env ve Git durumu değiştirilmez. Migration, bağımlılık kurulumu, git pull
rem ve deploy yapılmaz; başka uygulamalar durdurulmaz. Zaten çalışan backend veya frontend ikinci kez açılmaz.

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "PY=%BACKEND_DIR%\.venv\Scripts\python.exe"
set "PG_CONTAINER=dosya-sistemi-postgres"
set "BACKEND_URL=http://127.0.0.1:8000"
set "FRONTEND_URL=http://localhost:5173"

cd /d "%ROOT%" || goto err_root

echo.
echo === Dosya Sistemi başlatılıyor ===
echo Proje klasörü: %ROOT%

rem --- 1. Ön kontroller ---------------------------------------------------------------------------------------------
echo.
echo [1/5] Ön kontroller yapılıyor...
where docker >nul 2>&1 || goto err_docker_missing
docker info >nul 2>&1 || goto err_docker_down
where node >nul 2>&1 || goto err_node
where npm >nul 2>&1 || goto err_node
where curl.exe >nul 2>&1 || goto err_curl
if not exist "%BACKEND_DIR%\.env" goto err_env
if not exist "%PY%" goto err_venv
if not exist "%FRONTEND_DIR%\node_modules\" goto err_node_modules
rem Bağlantı adresi yalnız kalıpla karşılaştırılır; değeri (parola dahil) ekrana yazılmaz (D-051: 127.0.0.1:5434).
findstr /r /c:"^DATABASE_URL=.*@127\.0\.0\.1:5434/" "%BACKEND_DIR%\.env" >nul || goto err_database_url
echo       Tamam.

rem --- 2. PostgreSQL --------------------------------------------------------------------------------------------------
echo.
echo [2/5] PostgreSQL başlatılıyor (Docker)...
docker compose up -d
if errorlevel 1 goto err_compose
set /a WAIT=0
:wait_pg
set "PGSTATE="
for /f "delims=" %%s in ('docker inspect -f "{{.State.Health.Status}}" %PG_CONTAINER% 2^>nul') do set "PGSTATE=%%s"
if /i "%PGSTATE%"=="healthy" goto pg_ready
set /a WAIT+=1
if %WAIT% geq 30 goto err_pg_timeout
ping -n 3 127.0.0.1 >nul
goto wait_pg
:pg_ready
echo       PostgreSQL hazır (127.0.0.1:5434).

rem --- 3. Veritabanı şeması (yalnız okunur; migration uygulanmaz) ----------------------------------------------------
echo.
echo [3/5] Veritabanı şeması kontrol ediliyor...
set "ALEMBIC_OUT=%TEMP%\dosya_sistemi_alembic_%RANDOM%.txt"
pushd "%BACKEND_DIR%"
"%PY%" -m alembic current >"%ALEMBIC_OUT%" 2>nul
set "ALEMBIC_RC=%ERRORLEVEL%"
popd
if not "%ALEMBIC_RC%"=="0" goto err_db_connect
findstr /c:"(head)" "%ALEMBIC_OUT%" >nul
set "HEAD_RC=%ERRORLEVEL%"
del "%ALEMBIC_OUT%" >nul 2>&1
if not "%HEAD_RC%"=="0" goto err_migration
echo       Şema güncel.

rem --- 4. Backend ve frontend -----------------------------------------------------------------------------------------
rem İki port da servis başlatılmadan önce kontrol edilir: çakışma varsa hiçbir pencere açılmadan durulur.
echo.
echo [4/5] Backend (%BACKEND_URL%) ve frontend (%FRONTEND_URL%) kontrol ediliyor...
set "BACKEND_RUNNING=0"
set "FRONTEND_RUNNING=0"
call :port_in_use 8000
if errorlevel 1 goto check_frontend_port
call :is_backend
if errorlevel 1 goto err_port_8000
set "BACKEND_RUNNING=1"
:check_frontend_port
call :port_in_use 5173
if errorlevel 1 goto ports_checked
call :is_frontend
if errorlevel 1 goto err_port_5173
set "FRONTEND_RUNNING=1"
:ports_checked

if "%BACKEND_RUNNING%"=="1" goto backend_already
start "Dosya Sistemi - Backend" /D "%BACKEND_DIR%" cmd /k ""%PY%" -m uvicorn app.main:app --reload"
set /a WAIT=0
:wait_backend
call :is_backend
if not errorlevel 1 goto backend_ready
set /a WAIT+=1
if %WAIT% geq 30 goto err_backend_timeout
ping -n 3 127.0.0.1 >nul
goto wait_backend
:backend_already
echo       Backend zaten çalışıyor; yeni pencere açılmadı.
goto frontend_step
:backend_ready
echo       Backend hazır.

:frontend_step
if "%FRONTEND_RUNNING%"=="1" goto frontend_already
start "Dosya Sistemi - Frontend" /D "%FRONTEND_DIR%" cmd /k "npm run dev"
set /a WAIT=0
:wait_frontend
call :is_frontend
if not errorlevel 1 goto frontend_ready
set /a WAIT+=1
if %WAIT% geq 30 goto err_frontend_timeout
ping -n 3 127.0.0.1 >nul
goto wait_frontend
:frontend_already
echo       Frontend zaten çalışıyor; yeni pencere açılmadı.
goto open_browser
:frontend_ready
echo       Frontend hazır.

rem --- 5. Tarayıcı ----------------------------------------------------------------------------------------------------
:open_browser
echo.
echo [5/5] Tarayıcı açılıyor: %FRONTEND_URL%
start "" "%FRONTEND_URL%"
echo.
echo Dosya Sistemi hazır.
echo Backend ve frontend kendi pencerelerinde çalışıyor; durdurmak için o pencereleri kapatın.
echo PostgreSQL Docker içinde çalışmaya devam eder.
goto end_ok

rem --- Yardımcılar ----------------------------------------------------------------------------------------------------
rem Port dinleniyor mu: yerel adresi ":<port>", karşı adresi ":0" olan TCP satırı aranır. Dinleyen soketin karşı portu
rem 0'dır; TIME_WAIT gibi kapanmış bağlantılar sayılmaz. Durum metni (LISTENING) dile göre değiştiği için kullanılmaz.
:port_in_use
netstat -ano | findstr /r /c:"^ *TCP  *[^ ]*:%~1  *[^ ]*:0 " >nul
exit /b %ERRORLEVEL%

rem Çalışan backend bu projeninki mi: /health ve /api/catalogs birlikte yanıt vermeli.
:is_backend
curl.exe -s -m 3 "%BACKEND_URL%/health" 2>nul | findstr /c:"ok" >nul || exit /b 1
curl.exe -s -m 3 "%BACKEND_URL%/api/catalogs" 2>nul | findstr /c:"document_types" >nul || exit /b 1
exit /b 0

rem Çalışan frontend bu projeninki mi: sayfa başlığı "Belge Sınıflandırma" ile başlamalı.
:is_frontend
curl.exe -s -m 3 "%FRONTEND_URL%/" 2>nul | findstr /c:"<title>Belge" >nul || exit /b 1
exit /b 0

rem --- Hatalar --------------------------------------------------------------------------------------------------------
:err_root
echo HATA: Proje klasörüne geçilemedi.
goto fail
:err_docker_missing
echo HATA: Docker bulunamadı. Docker Desktop'ı kurup yeniden deneyin.
goto fail
:err_docker_down
echo HATA: Docker çalışmıyor. Docker Desktop'ı açın, motorun çalışmasını bekleyin ve bu dosyayı yeniden çalıştırın.
goto fail
:err_node
echo HATA: Node.js veya npm bulunamadı. Node.js'i kurup yeniden deneyin.
goto fail
:err_curl
echo HATA: curl.exe bulunamadı (Windows 10 ve üstünde yerleşiktir). Servis kontrolü yapılamıyor.
goto fail
:err_env
echo HATA: backend\.env bulunamadı. backend\.env.example dosyasını kopyalayıp değerleri doldurun (README, Kurulum).
goto fail
:err_venv
echo HATA: Backend sanal ortamı bulunamadı: backend\.venv. README'deki Kurulum adımlarıyla oluşturun.
goto fail
:err_node_modules
echo HATA: frontend\node_modules bulunamadı. frontend klasöründe "npm install" çalıştırın.
goto fail
:err_database_url
echo HATA: backend\.env içindeki DATABASE_URL 127.0.0.1:5434 adresini göstermiyor (D-051).
echo       Değeri README'deki Kurulum bölümüne göre güncelleyin (laptop için TODOS.md, T-13). Docker başlatılmadı.
goto fail
:err_compose
echo HATA: PostgreSQL container'ı başlatılamadı. Yukarıdaki Docker çıktısına bakın.
echo       5434 portu başka bir uygulama tarafından kullanılıyor olabilir. Veritabanına dokunulmadı.
goto fail
:err_pg_timeout
echo HATA: PostgreSQL 60 saniye içinde hazır olmadı. "docker compose ps" ve "docker compose logs postgres" ile kontrol edin.
goto fail
:err_db_connect
del "%ALEMBIC_OUT%" >nul 2>&1
echo HATA: Veritabanına bağlanılamadı ya da şema okunamadı. backend\.env içindeki DATABASE_URL'i ve container'ı kontrol edin.
goto fail
:err_migration
echo HATA: Veritabanı en güncel migration'da değil. Başlatıcı veritabanını değiştirmez.
echo       Önce yedek alın, sonra backend klasöründe şu komutu kendiniz çalıştırın:
echo       .venv\Scripts\python.exe -m alembic upgrade head
goto fail
:err_port_8000
echo HATA: 8000 portu kullanımda, ancak Dosya Sistemi backend'i yanıt vermiyor.
echo       Portu kullanan uygulamayı kapatın ya da başlamakta olan backend'i bekleyip yeniden deneyin. Başlatıcı başka uygulamaları kapatmaz.
goto fail
:err_port_5173
echo HATA: 5173 portu kullanımda, ancak Dosya Sistemi arayüzü yanıt vermiyor.
echo       Portu kullanan uygulamayı kapatın ya da başlamakta olan frontend'i bekleyip yeniden deneyin. Başlatıcı başka uygulamaları kapatmaz.
goto fail
:err_backend_timeout
echo HATA: Backend 60 saniye içinde yanıt vermedi. "Dosya Sistemi - Backend" penceresindeki hata mesajına bakın.
echo       Tarayıcı açılmadı.
goto fail
:err_frontend_timeout
echo HATA: Frontend 60 saniye içinde yanıt vermedi. "Dosya Sistemi - Frontend" penceresindeki hata mesajına bakın.
echo       Tarayıcı açılmadı.
goto fail

:fail
echo.
echo Başlatma tamamlanamadı. Sorunu giderip bu dosyayı yeniden çalıştırın.
pause
exit /b 1

:end_ok
echo.
pause
exit /b 0
