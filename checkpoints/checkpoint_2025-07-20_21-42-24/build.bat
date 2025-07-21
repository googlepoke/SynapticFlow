@echo off
echo ========================================
echo Building Voice-to-LLM Desktop Assistant
echo ========================================
echo.

echo Checking if dependencies are installed...
if not exist "node_modules" (
    echo Installing dependencies first...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo.
echo Building application...
npm run build

if %errorlevel% neq 0 (
    echo ERROR: Build failed
    echo Check the error messages above
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
echo.
echo The executable can be found in the 'dist' folder
echo.
echo To run the application:
echo 1. Navigate to the 'dist' folder
echo 2. Run the .exe file
echo.
pause 