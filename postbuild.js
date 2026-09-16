import fs from 'node:fs';
import path from 'node:path';

// 复制 icon.svg
if (fs.existsSync('icon.svg')) {
  fs.copyFileSync('icon.svg', 'dist/icon.svg');
}

// 复制并转换 package.json
if (fs.existsSync('package.json')) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  pkg.main = 'index.html';
  fs.writeFileSync('dist/package.json', JSON.stringify(pkg, null, 2), 'utf-8');
}

console.log('[postbuild] 插件静态清单已同步生成至 dist 目录！');
