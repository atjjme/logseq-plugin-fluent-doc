# Logseq FluentDoc

> 极轻量、呼吸感的文档模式与划词格式工具栏 | Fluent document mode, floating formatting toolbar, and smart productivity booster for Logseq.

[![Release](https://img.shields.io/github/v/release/atjjme/logseq-plugin-fluent-doc?style=flat-square)](https://github.com/atjjme/logseq-plugin-fluent-doc/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 🌟 核心特性 (Features)

1. **浮动划词格式工具栏 (Selection Floating Toolbar)**：
   - 选中文本时自动在文字正上方弹出微型气泡菜单，顺手排版不遮挡视线。
   - **字号/标题等级**：一键切换 H1、H2、H3 或正文段落。
   - **文本强调**：加粗 (`Ctrl+B`)、斜体 (`Ctrl+I`)、行内代码、清除格式。
   - **优雅文本颜色**：暗红、橙黄、翠绿、深蓝、雅紫、低调灰等莫兰迪护眼色。
   - **背景高亮**：黄、淡绿、淡蓝、淡粉色高亮背景（或原生 `==` 高亮）。
   - **超链接与图片**：一键包裹并快捷输入。
   - **TODO 待办**：一键在行首插入或切换待办状态。
2. **沉浸文档模式视觉增强 (Fluent Document Mode)**：
   - 点击顶栏 `📄` 图标或使用快捷键 `Alt+D` 一键开启/退出。
   - 智能弱化大纲圆点与连接线，优化中西文字体行高与段间距，带来宛如 Notion / Typora 般的行云流水阅读体验。
   - **100% 无损原生图谱**：完全保留 Logseq 原生的双链关联、块引用和插件生态，不引入任何侵入式专有语法。
3. **极致轻量 & 零依赖**：
   - 零庞大富文本框架包袱，打包体积仅数十 KB。
   - 深度性能优化，平时几乎零 CPU 占用与极低内存开销。

---

## 🚀 安装方式 (Installation)

### 方式一：从 Logseq 官方插件商店安装（推荐）
1. 打开 Logseq，点击右上角 `···` $\to$ **Plugins (插件)** $\to$ **Marketplace (应用商店)**。
2. 搜索 `FluentDoc`。
3. 点击 **Install (安装)** 即可一键启用。

### 方式二：手动下载 Release ZIP 安装
1. 前往本仓库的 [Releases 页面](../../releases) 下载最新版本的 `logseq-plugin-fluent-doc.zip`。
2. 解压到本地任意固定目录。
3. 在 Logseq 中进入 **设置 (Settings)** $\to$ **高级 (Advanced)**，打开 **开发者模式 (Developer Mode)**。
4. 返回 **Plugins (插件)** 页面，点击右上角的 **"加载已解压的插件" (Load unpacked plugin)**，选择解压后的文件夹即可。

---

## 🎯 快捷键与使用提示 (Usage)

| 功能 | 快捷键 / 触发方式 | 说明 |
| :--- | :--- | :--- |
| **沉浸文档模式切换** | `Alt+D` 或 点击顶栏 `📄` 图标 | 一键在标准大纲树模式与连贯文档模式之间无缝切换 |
| **命令面板切换** | `Ctrl+K` $\to$ 输入 `切换沉浸文档增强模式` | 快速搜索并执行 |
| **划词排版工具栏** | 鼠标在编辑框内选中文本 | 自动在选中内容上方弹出悬浮工具条 |

---

## 🛠️ 本地开发与构建 (Development)

如果你想对插件进行二次开发或定制：

```bash
# 1. 克隆本仓库
git clone https://github.com/atjjme/logseq-plugin-fluent-doc.git
cd logseq-plugin-fluent-doc

# 2. 安装依赖
npm install

# 3. 开发模式 (实时编译)
npm run dev

# 4. 生产打包
npm run build
```

构建产物将输出在 `dist/` 目录下，在 Logseq 开发者模式下选择该目录即可实时调试。

---

## 📄 开源许可证 (License)

本项目遵循 [MIT License](LICENSE) 开源协议。
