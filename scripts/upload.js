/**
 * 一键：暂存 → 提交 → 推送到远程仓库
 *
 * 用法：
 *   npm run upload
 *   npm run upload -- "本次改动说明"
 */
const { execSync } = require('child_process')

function run(cmd) {
  return execSync(cmd, {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim()
}

function runInherit(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

function main() {
  const args = process.argv.slice(2)
  const message =
    args.join(' ').trim() ||
    `chore: update ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`

  try {
    run('git rev-parse --is-inside-work-tree')
  } catch {
    console.error('❌ 当前目录不是 git 仓库')
    process.exit(1)
  }

  runInherit('git add -A')

  const status = run('git status --porcelain')
  if (!status) {
    console.log('ℹ️  没有需要提交的改动，尝试推送本地已有提交…')
  } else {
    console.log('📦 暂存文件：\n' + status)
    // Windows 下用简单引号包装；消息内的双引号转义
    const safeMsg = message.replace(/"/g, '\\"')
    runInherit(`git commit -m "${safeMsg}"`)
    console.log(`✅ 已提交：${message}`)
  }

  runInherit('git push -u origin HEAD')
  console.log('🚀 已推送到远程仓库')
}

main()
