# fix-server.mjs — 杀掉 3080 独立 dsh 服务器（rc.7，导致会话 seq 乱序的双写源），重启应用。
import { execSync, spawn } from 'node:child_process'
import { sleep } from 'node:timers/promises'

await sleep(120000) // 给当前回答留出交付时间

console.log('[fix] killing 3080 standalone dsh server…')
try {
  execSync('netstat -ano | findstr ":3080 "', { encoding: 'utf8' }).split('\n').forEach((line) => {
    const m = line.trim().match(/LISTENING\s+(\d+)$/)
    if (m) { try { process.kill(Number(m[1])) } catch {} }
  })
} catch {}
// 兜底：杀 npx dsh / dsh web 的 node 进程（排除应用自己的 3081 服务器）
try {
  execSync('wmic process where "name=\'node.exe\'" get processid,commandline', { encoding: 'utf8' }).split('\n').forEach((line) => {
    if (/dsh/.test(line) && !/--port 3081/.test(line)) {
      const m = line.trim().match(/^(\d+)/)
      if (m) { try { process.kill(Number(m[1])) } catch {} }
    }
  })
} catch {}

await sleep(5000)
console.log('[fix] restarting app…')
spawn('cmd.exe', ['/c', 'start.cmd'], { cwd: 'D:/deepseek/dsh-desktop', detached: true, stdio: 'ignore' }).unref()
console.log('[fix] done')
