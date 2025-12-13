@echo off
echo ========================================
echo   舞蹈学习 AI 系统 - Windows 启动脚本
echo ========================================
echo.

REM 检查 Docker 是否运行
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

echo [信息] Docker 运行正常

REM 检查镜像是否存在
echo [信息] 检查镜像...
docker images | findstr "dance-learning-ai-frontend:202510191115-amd64" >nul
if %errorlevel% neq 0 (
    echo [错误] 前端镜像不存在，请先构建镜像
    pause
    exit /b 1
)

docker images | findstr "dance-learning-ai-backend:202510191115-amd64" >nul
if %errorlevel% neq 0 (
    echo [错误] 后端镜像不存在，请先构建镜像
    pause
    exit /b 1
)

echo [信息] 镜像检查完成

REM 停止并删除现有容器
echo [信息] 清理现有容器...
docker stop dance-frontend-windows dance-backend-windows 2>nul
docker rm dance-frontend-windows dance-backend-windows 2>nul

REM 创建必要的目录
echo [信息] 创建数据目录...
if not exist "backend\data" mkdir backend\data
if not exist "backend\uploads" mkdir backend\uploads
if not exist "backend\temp" mkdir backend\temp
if not exist "backend\video_storage" mkdir backend\video_storage

REM 启动服务
echo [信息] 启动前端服务...
docker run -d ^
  --name dance-frontend-windows ^
  --platform linux/amd64 ^
  -p 3000:80 ^
  --restart unless-stopped ^
  dance-learning-ai-frontend:202510191115-amd64

if %errorlevel% neq 0 (
    echo [错误] 前端服务启动失败
    pause
    exit /b 1
)

echo [信息] 启动后端服务...
docker run -d ^
  --name dance-backend-windows ^
  --platform linux/amd64 ^
  -p 8128:8128 ^
  -v "%cd%\backend\data:/app/data" ^
  -v "%cd%\backend\uploads:/app/uploads" ^
  -v "%cd%\backend\temp:/app/temp" ^
  -v "%cd%\backend\video_storage:/app/video_storage" ^
  --restart unless-stopped ^
  dance-learning-ai-backend:202510191115-amd64

if %errorlevel% neq 0 (
    echo [错误] 后端服务启动失败
    docker stop dance-frontend-windows
    docker rm dance-frontend-windows
    pause
    exit /b 1
)

REM 等待服务启动
echo [信息] 等待服务启动...
timeout /t 10 /nobreak >nul

REM 检查服务状态
echo [信息] 检查服务状态...
docker ps | findstr "dance-frontend-windows" >nul
if %errorlevel% neq 0 (
    echo [错误] 前端服务未运行
    docker logs dance-frontend-windows
    pause
    exit /b 1
)

docker ps | findstr "dance-backend-windows" >nul
if %errorlevel% neq 0 (
    echo [错误] 后端服务未运行
    docker logs dance-backend-windows
    pause
    exit /b 1
)

echo.
echo ========================================
echo   服务启动成功！
echo ========================================
echo 前端地址: http://localhost:3000
echo 后端地址: http://localhost:8128
echo 健康检查: http://localhost:3000/health
echo.
echo 按任意键打开浏览器...
pause >nul

REM 打开浏览器
start http://localhost:3000

echo.
echo 服务管理命令:
echo   查看状态: docker ps
echo   查看日志: docker logs dance-frontend-windows
echo   停止服务: docker stop dance-frontend-windows dance-backend-windows
echo   删除容器: docker rm dance-frontend-windows dance-backend-windows
echo.
pause
