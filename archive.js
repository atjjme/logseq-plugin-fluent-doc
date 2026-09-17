import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const distDir = path.resolve('dist');
const outputFile = path.resolve('logseq-plugin-fluent-doc.zip');

if (!fs.existsSync(distDir)) {
  console.error('[archive] 错误: dist 目录不存在，请先执行 npm run build！');
  process.exit(1);
}

if (fs.existsSync(outputFile)) {
  fs.unlinkSync(outputFile);
}

console.log('[archive] 正在打包 dist 目录为 logseq-plugin-fluent-doc.zip ...');

try {
  if (process.platform === 'win32') {
    // Windows 下使用 PowerShell Compress-Archive
    execSync(`powershell -Command "Compress-Archive -Path 'dist/*' -DestinationPath 'logseq-plugin-fluent-doc.zip' -Force"`, {
      stdio: 'inherit'
    });
  } else {
    // macOS / Linux 下使用 zip
    execSync(`cd dist && zip -r ../logseq-plugin-fluent-doc.zip ./*`, {
      stdio: 'inherit'
    });
  }
  console.log(`[archive] 成功生成: ${outputFile}`);
} catch (error) {
  console.error('[archive] 打包失败:', error);
  process.exit(1);
}
