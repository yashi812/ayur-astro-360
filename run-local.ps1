param([int]$Port = 8000)

# Ensure Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found in PATH. Install Python or use VS Code Live Server extension."
    exit 1
}

# Start a simple HTTP server in a new command window
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "python -m http.server $Port" -WindowStyle Minimized
Start-Sleep -Seconds 1

# Open Microsoft Edge (msedge) — fallback to microsoft-edge: if needed
try {
    Start-Process msedge "http://localhost:$Port"
} catch {
    Start-Process "microsoft-edge:http://localhost:$Port" -ErrorAction SilentlyContinue
}

# Open Chrome if available
try {
    Start-Process chrome "http://localhost:$Port"
} catch {
    Write-Output "Chrome not found in PATH; open manually: http://localhost:$Port"
}

Write-Output "Serving on http://localhost:$Port"