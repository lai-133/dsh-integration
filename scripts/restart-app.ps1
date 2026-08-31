# restart-app.ps1 — 延迟 180 秒后重启 dsh-desktop（杀掉旧 electron + dsh web，再拉起新实例）。
# 由 Start-Process 独立启动，脱离当前会话进程树，确保会话结束后仍会执行。
$ErrorActionPreference = 'SilentlyContinue'
Start-Sleep -Seconds 180

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] killing old instances…"
# 旧 dsh web 服务器 + electron cli 包装（命令行含 dsh-desktop 的 node 进程）
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dsh-desktop' } | ForEach-Object {
  Write-Output "  kill node $($_.ProcessId)"
  Stop-Process -Id $_.ProcessId -Force
}
# electron 主进程及其子进程（gpu/utility/renderer）
Get-Process -Name electron -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output "  kill electron $($_.Id)"
  Stop-Process -Id $_.Id -Force
}

Start-Sleep -Seconds 6

Write-Output "[$(Get-Date -Format 'HH:mm:ss')] starting app…"
Start-Process -FilePath "cmd.exe" -WorkingDirectory "D:\deepseek\dsh-desktop" -ArgumentList '/c', 'npm start -- --remote-debugging-port=9222 >> D:\deepseek\dsh-desktop\restart.log 2>&1'
Write-Output "[$(Get-Date -Format 'HH:mm:ss')] done"
