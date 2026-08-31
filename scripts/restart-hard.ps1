# restart-hard.ps1 — 彻底重启 dsh-desktop：杀掉全部 electron/dsh 实例，再启动唯一一个。
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds 150

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] killing ALL electron instances…"
taskkill /F /IM electron.exe /T | Out-Null
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] killing all dsh node servers…"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dsh|@deepseek-ai' } | ForEach-Object {
  Write-Output "  kill node $($_.ProcessId)"
  Stop-Process -Id $_.ProcessId -Force
}
Start-Sleep -Seconds 8

# 确认 3081 已释放
$portFree = $false
for ($i = 0; $i -lt 10; $i++) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort 3081 -ErrorAction SilentlyContinue
  if (-not $conn) { $portFree = $true; break }
  Start-Sleep -Seconds 2
}
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] port 3081 free: $portFree"

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] starting single app instance…"
Start-Process -FilePath "cmd.exe" -WorkingDirectory "D:\deepseek\dsh-desktop" -ArgumentList '/c', 'npm start >> D:\deepseek\dsh-desktop\restart-hard.log 2>&1'
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] done"
