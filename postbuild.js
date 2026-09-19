import fs from 'node:fs';
import path from 'node:path';

// 复制 icon.svg
if (fs.existsSync('icon.svg')) {
  fs.copyFileSync('icon.svg', 'dist/icon.svg');
}

// 复制 README.md
if (fs.existsSync('README.md')) {
  fs.copyFileSync('README.md', 'dist/README.md');
}

// 复制 CHANGELOG.md
if (fs.existsSync('CHANGELOG.md')) {
  fs.copyFileSync('CHANGELOG.md', 'dist/CHANGELOG.md');
}

// 复制 LICENSE
if (fs.existsSync('LICENSE')) {
  fs.copyFileSync('LICENSE', 'dist/LICENSE');
}

// 复制并转换 package.json
if (fs.existsSync('package.json')) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  pkg.main = 'index.html';
  fs.writeFileSync('dist/package.json', JSON.stringify(pkg, null, 2), 'utf-8');
}

console.log('[postbuild] 插件静态清单及文档已同步生成至 dist 目录！');

