import '@logseq/libs';
import styleCss from './style.css?inline';
import docModeCss from './doc-mode.css?inline';

// 14x14 紧凑矢量内联图标（自包含，零外部依赖，100% 稳定）
const ICONS = {
  link: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  todo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  image: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  clear: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
};

interface SelectionState {
  text: string;
  blockUuid: string | null;
  start?: number;
  end?: number;
}

let currentSelection: SelectionState | null = null;
let isDocModeEnhanced = false;
let isDockedToolbarOpen = false;
let isFloatingToolbarOpen = false;
let lastShownCoords: { x: number; y: number } | null = null;
let lastInputSelectionTime = 0;
let toolbarMode: 'normal' | 'link' | 'image' = 'normal';
let inputUrlValue = '';

// Settings schema definition (Logseq standard useSettingsSchema)
const SETTINGS_SCHEMA = [
  {
    key: 'toolbarDisplayMode',
    type: 'enum',
    title: 'Toolbar Display Mode',
    description: 'Select toolbar appearance: floating bubble on selection, top docked bar, both, or disabled.',
    enumChoices: [
      'Floating Bubble (Default)',
      'Top Docked Bar',
      'Both',
      'None (Disable Toolbar)',
    ],
    default: 'Floating Bubble (Default)',
  },
  {
    key: 'blockClickMode',
    type: 'enum',
    title: 'Block Click Mode',
    description: 'Interaction behavior in document mode: Protected (click to view, double-click to edit) or Native (click to edit).',
    enumChoices: [
      'Protected (Default)',
      'Native',
    ],
    default: 'Protected (Default)',
  },
  {
    key: 'autoInheritTodo',
    type: 'boolean',
    title: 'Auto-inherit TODO on Enter',
    description: 'Press Enter on a TODO block to inherit TODO; press Enter again on an empty TODO block to clear it back to normal text.',
    default: true,
  },
  {
    key: 'autoSpacingCjk',
    type: 'boolean',
    title: 'Auto-format Chinese-English Spacing',
    description: 'Automatically insert spaces between Chinese and English/numbers on blur or Enter.',
    default: true,
  },
];

function isAutoInheritTodoEnabled(): boolean {
  const val = (logseq.settings as any)?.autoInheritTodo;
  return val !== false; // Default enabled
}

function isAutoSpacingCjkEnabled(): boolean {
  const val = (logseq.settings as any)?.autoSpacingCjk;
  return val !== false; // Default enabled
}

function getToolbarDisplayMode(): 'floating' | 'docked' | 'both' | 'none' {
  const mode = String((logseq.settings as any)?.toolbarDisplayMode || '');
  if (mode.includes('None') || mode.includes('Disable') || mode.includes('无') || mode.includes('禁用') || mode.includes('none')) return 'none';
  if (mode.includes('Docked') || mode.includes('Top') || mode.includes('仅顶部固定栏') || mode.includes('docked')) return 'docked';
  if (mode.includes('Both') || mode.includes('两者皆显示') || mode.includes('both')) return 'both';
  return 'floating'; // Default floating bubble
}

function getBlockClickMode(): 'native' | 'readonly' {
  const mode = String((logseq.settings as any)?.blockClickMode || '');
  if (mode.includes('Native') || mode.includes('原生') || mode.includes('平滑聚焦过渡') || mode.includes('smooth')) return 'native';
  return 'readonly'; // Default protected
}

function shouldProtectBlockClick(): boolean {
  return getBlockClickMode() === 'readonly';
}

function updateProtectedModeClass(targetDoc?: Document) {
  const d = targetDoc || parent.document;
  if (!d || !d.body) return;
  if (shouldProtectBlockClick()) {
    d.body.classList.add('doc-protected-mode');
  } else {
    d.body.classList.remove('doc-protected-mode');
  }
}

/**
 * 智能中英文/数字盘古间距排版（保护 Markdown 语法、代码、公式与链接）
 */
function formatCjkSpacing(content: string): string {
  if (!content || typeof content !== 'string') return content;

  // 1. 保护代码块、行内代码、公式、URL、双链等特殊语法结构
  const placeholders: string[] = [];
  const placeholderPrefix = '\uE000_FLUENT_PANGU_';
  const placeholderSuffix = '_\uE001';

  let masked = content;

  // 1.1 块级代码与行内代码
  masked = masked.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.2 LaTeX 数学公式
  masked = masked.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+\$)/g, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.3 属性行 (property:: value)
  masked = masked.replace(/^([a-zA-Z0-9_\-]+::\s*.*)$/gm, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.4 图片与普通链接的 URL 部分：![alt](url) 或 [text](url)
  // 保护 (url) 部分，允许对 [text] 中的中英文进行排版
  masked = masked.replace(/(!?\[[^\]\n]*\])(\([^\)\n]+\))/g, (_match, linkText, linkUrl) => {
    placeholders.push(linkUrl);
    return `${linkText}${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.5 裸 URL
  masked = masked.replace(/(https?:\/\/[^\s\u4e00-\u9fa5]+)/g, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.6 Logseq 双链与块引用：#[[...]], [[...]], ((uuid))
  masked = masked.replace(/(#?\[\[[^\]\n]+\]\]|\(\([a-f0-9\-]+\)\))/g, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 1.7 标签：#tag
  masked = masked.replace(/(?<!\w)#([^\s#,.:;!?\(\)\[\]{}]+)/g, (match) => {
    placeholders.push(match);
    return `${placeholderPrefix}${placeholders.length - 1}${placeholderSuffix}`;
  });

  // 2. 执行排版格式化：中文字符与英文字符/数字之间插入半角空格
  // CJK 汉字范围：\u4e00-\u9fa5\u3400-\u4dbf
  // 英文/数字：[A-Za-z0-9]
  const cjk = '[\u4e00-\u9fa5\u3400-\u4dbf]';
  const alnum = '[A-Za-z0-9]';

  // 中文后接英文/数字：中文A -> 中文 A
  masked = masked.replace(new RegExp(`(${cjk})(${alnum})`, 'g'), '$1 $2');

  // 英文/数字后接中文：A中文 -> A 中文
  masked = masked.replace(new RegExp(`(${alnum})(${cjk})`, 'g'), '$1 $2');

  // 特殊符号后接中文，如 100%的几率 -> 100% 的几率
  masked = masked.replace(new RegExp(`([0-9]%)((${cjk}))`, 'g'), '$1 $2');

  // 3. 还原占位符
  masked = masked.replace(new RegExp(`${placeholderPrefix}(\\d+)${placeholderSuffix}`, 'g'), (_match, index) => {
    return placeholders[Number(index)] ?? _match;
  });

  return masked;
}

/**
 * 智能纯文本清洗：剥除所有 Markdown 符号、Logseq Hiccup 向量代码与任何 HTML 标签
 */
function cleanMarkdownAndHiccup(rawText: string): string {
  return rawText
    .replace(/\[:(?:span|mark)[^\]]*"([^"]+)"\s*\]/g, '$1')
    .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
    .replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '$1')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
    .replace(/<s[^>]*>(.*?)<\/s>/gi, '$1')
    .replace(/<del[^>]*>(.*?)<\/del>/gi, '$1')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '$1')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/==(.*?)==/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#\[\[(.*?)\]\]/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/(?<!\w)#([^\s#]+)/g, '$1')
    .replace(/^(?:TODO|DONE|NOW|LATER)\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '');
}

/**
 * 智能富文本 HTML 转换：将 Markdown / Hiccup 语法转换为标准富文本 HTML
 * 强化带有内联 style 声明，保证跨软件（Word、飞书、语雀、微信等）复制粘贴 100% 保持样式
 */
function convertToStandardHtml(rawText: string): string {
  let html = rawText;

  // 1. Hiccup 语法转标准 HTML
  html = html.replace(
    /\[:span\s*\{:style\s*(?:"([^"]+)"|\{:(?:color|background-color)\s*"([^"]+)"\})\}\s*"([^"]+)"\s*\]/g,
    (_m, sStr, sColor, content) => {
      const finalStyle = sStr || (sColor ? `color: ${sColor};` : '');
      return `<span style="${finalStyle}">${content}</span>`;
    }
  );
  html = html.replace(
    /\[:mark\s*\{:style\s*(?:"([^"]+)"|\{:background-color\s*"([^"]+)"\})\}\s*"([^"]+)"\s*\]/g,
    (_m, sStr, bgColor, content) => {
      const finalStyle = sStr || (bgColor ? `background-color: ${bgColor};` : '');
      return `<mark style="${finalStyle}">${content}</mark>`;
    }
  );

  // 2. Markdown 行内格式转 HTML 标签（带强样式声明，确保任何粘贴目标软件都能正确呈现）
  html = html.replace(/\*\*(.*?)\*\*/g, '<b style="font-weight: bold;">$1</b>');
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i style="font-style: italic;">$1</i>');
  html = html.replace(/==(.*?)==/g, '<mark style="background-color: #fff3a3;">$1</mark>');
  html = html.replace(/~~(.*?)~~/g, '<s style="text-decoration: line-through;">$1</s>');
  html = html.replace(/<u>(.*?)<\/u>/gi, '<u style="text-decoration: underline;">$1</u>');
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background: rgba(0,0,0,0.06); padding: 2px 4px; border-radius: 3px; font-family: monospace;">$1</code>'
  );
  html = html.replace(/!\[(.*?)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%;" />');
  html = html.replace(/\[(.*?)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/#\[\[(.*?)\]\]/g, '<span style="color: #106ba3; font-weight: 500;">#$1</span>');
  html = html.replace(/\[\[(.*?)\]\]/g, '<span style="color: #106ba3; text-decoration: underline;">$1</span>');
  html = html.replace(/(?<!\w)#([^\s#]+)/g, '<span style="color: #106ba3; font-weight: 500;">#$1</span>');
  html = html.replace(/^(?:TODO|DONE|NOW|LATER)\s+/gm, '');
  html = html.replace(/^#{1,6}\s+(.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^[-*+]\s+/gm, '');

  return html;
}

/**
 * 净化并标准化来自 DOM 渲染树的 HTML：
 * 1. 保留并内联强化所有加粗 (b, strong, font-weight)、斜体、下划线、删除线、颜色、高亮、超链接、代码
 * 2. 剥离 Logseq 内部冗余类名与属性 (blockid, data-*, class)
 * 3. 剥离大纲小圆点、折叠按钮等非正文 UI 控件
 */
function cleanHtmlForClipboard(container: HTMLElement): string {
  // 1. 移除不需要的辅助或控件元素
  const removeSelectors = [
    '.bullet-container',
    '.bullet',
    '.block-control',
    '.fold-handle',
    '.block-properties',
    '.opacity-0',
    '.drag-handle',
    '.menu-link',
    '.ui__portal',
    'button',
  ];
  container.querySelectorAll(removeSelectors.join(',')).forEach((el) => el.remove());

  // 2. 遍历所有元素，识别格式并将样式内联化（确保复制到 Word / 语雀 / 飞书 / 微信 等富文本软件时 100% 还原样式）
  const allElements = Array.from(container.querySelectorAll('*')) as HTMLElement[];
  for (const el of allElements) {
    const tagName = el.tagName.toUpperCase();
    const className = String(el.className || '');
    const style = el.style;

    // 加粗检测：<b>, <strong>, 类名含 bold, 或行内样式 font-weight 为 bold/600/700/800
    const isBold =
      tagName === 'B' ||
      tagName === 'STRONG' ||
      className.includes('bold') ||
      className.includes('font-bold') ||
      style.fontWeight === 'bold' ||
      parseInt(style.fontWeight || '0') >= 600;

    // 斜体检测
    const isItalic =
      tagName === 'I' ||
      tagName === 'EM' ||
      className.includes('italic') ||
      className.includes('font-italic') ||
      style.fontStyle === 'italic';

    // 下划线检测
    const isUnderline =
      tagName === 'U' ||
      className.includes('underline') ||
      style.textDecoration?.includes('underline');

    // 删除线检测
    const isStrike =
      tagName === 'S' ||
      tagName === 'DEL' ||
      tagName === 'STRIKE' ||
      className.includes('line-through') ||
      style.textDecoration?.includes('line-through');

    // 高亮检测
    const isHighlight =
      tagName === 'MARK' ||
      className.includes('highlight') ||
      Boolean(style.backgroundColor);

    // 字体颜色
    const color = style.color;
    // 背景颜色
    const bgColor = style.backgroundColor;

    if (isBold) {
      el.style.fontWeight = 'bold';
    }
    if (isItalic) {
      el.style.fontStyle = 'italic';
    }
    if (isUnderline) {
      el.style.textDecoration = 'underline';
    }
    if (isStrike) {
      el.style.textDecoration = 'line-through';
    }
    if (isHighlight && !style.backgroundColor) {
      el.style.backgroundColor = '#fff3a3';
    }
    if (color) {
      el.style.color = color;
    }
    if (bgColor) {
      el.style.backgroundColor = bgColor;
    }

    // 清理 Logseq 专属内部属性，保留 style 与 href / src / target
    el.removeAttribute('class');
    el.removeAttribute('data-ref');
    el.removeAttribute('data-uuid');
    el.removeAttribute('tabindex');
    el.removeAttribute('id');
    el.removeAttribute('blockid');
    el.removeAttribute('draggable');
  }

  return container.innerHTML;
}


function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 核心格式化包装函数：兼容编辑态与阅读/文档态，支持连击叠加与自动回写
 */
async function applyFormatToSelection(formatter: (text: string) => string, defaultPlaceholder: string = '文本') {
  try {
    const doc = parent.document;
    const sel = doc.getSelection();

    // 跨块多行格式化支持：仅当选区起始与结束位于不同的独立块时才触发
    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const startEl = range.startContainer.nodeType === 1 ? (range.startContainer as HTMLElement) : range.startContainer.parentElement;
      const endEl = range.endContainer.nodeType === 1 ? (range.endContainer as HTMLElement) : range.endContainer.parentElement;
      const startBlock = (startEl?.closest('[blockid]') || startEl?.closest('.ls-block')) as HTMLElement | null;
      const endBlock = (endEl?.closest('[blockid]') || endEl?.closest('.ls-block')) as HTMLElement | null;

      // 仅当选区跨越了不同的独立块时执行多块切分排版
      if (startBlock && endBlock && startBlock !== endBlock) {
        const allContentEls = Array.from(doc.querySelectorAll('.ls-block .block-content')) as HTMLElement[];
        const intersectedContents = allContentEls.filter((el) => {
          try {
            return range.intersectsNode(el);
          } catch {
            return false;
          }
        });

        if (intersectedContents.length > 1) {
          for (const contentEl of intersectedContents) {
            const blockEl = contentEl.closest('[blockid]') as HTMLElement | null;
            const uuid = blockEl?.getAttribute('blockid');
            if (!uuid) continue;
            const b = await logseq.Editor.getBlock(uuid);
            if (!b || !b.content) continue;

            const blockRange = doc.createRange();
            blockRange.selectNodeContents(contentEl);

            try {
              const subRange = doc.createRange();
              if (range.compareBoundaryPoints(Range.START_TO_START, blockRange) > 0) {
                subRange.setStart(range.startContainer, range.startOffset);
              } else {
                subRange.setStart(blockRange.startContainer, blockRange.startOffset);
              }

              if (range.compareBoundaryPoints(Range.END_TO_END, blockRange) < 0) {
                subRange.setEnd(range.endContainer, range.endOffset);
              } else {
                subRange.setEnd(blockRange.endContainer, blockRange.endOffset);
              }

              const subText = subRange.toString().trim();
              if (subText && b.content.includes(subText)) {
                let repl = formatter(subText);
                const idx = b.content.indexOf(subText);
                if (idx !== -1) {
                  const afterIdx = idx + subText.length;
                  if (repl.startsWith(' ') && (idx === 0 || /\s/.test(b.content.charAt(idx - 1)))) {
                    repl = repl.slice(1);
                  }
                  if (repl.endsWith(' ') && (afterIdx >= b.content.length || /\s/.test(b.content.charAt(afterIdx)))) {
                    repl = repl.slice(0, -1);
                  }
                  const newContent = b.content.substring(0, idx) + repl + b.content.substring(afterIdx);
                  await logseq.Editor.updateBlock(uuid, newContent);
                } else {
                  const newContent = b.content.replace(subText, () => repl);
                  await logseq.Editor.updateBlock(uuid, newContent);
                }
              }
            } catch {}
          }
          return;
        }
      }
    }

    // 单块精准替换逻辑：严格只使用选中文本本身，绝不外扩
    let text = currentSelection?.text;
    if (!text && sel && !sel.isCollapsed) {
      text = sel.toString().trim();
    }
    let blockUuid = currentSelection?.blockUuid;
    if (!blockUuid && sel && !sel.isCollapsed) {
      const anchorNode = sel.anchorNode;
      const anchorEl = anchorNode?.nodeType === 1 ? (anchorNode as HTMLElement) : anchorNode?.parentElement;
      const blockEl = anchorEl?.closest('[blockid]') || anchorEl?.closest('.ls-block');
      blockUuid = blockEl?.getAttribute('blockid') || null;
    }

    let block = blockUuid ? await logseq.Editor.getBlock(blockUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) {
      block = await logseq.Editor.getCurrentBlock();
    }
    if (!block) return;

    const content = block.content || '';

    if (text && content.includes(text)) {
      let replacement = formatter(text);
      let newContent: string;
      const start = currentSelection?.start;
      const end = currentSelection?.end;

      if (typeof start === 'number' && typeof end === 'number' && content.substring(start, end) === text) {
        if (replacement.startsWith(' ') && (start === 0 || /\s/.test(content.charAt(start - 1)))) {
          replacement = replacement.slice(1);
        }
        if (replacement.endsWith(' ') && (end >= content.length || /\s/.test(content.charAt(end)))) {
          replacement = replacement.slice(0, -1);
        }
        newContent = content.substring(0, start) + replacement + content.substring(end);
        if (currentSelection) {
          currentSelection.text = replacement;
          currentSelection.end = start + replacement.length;
        }
      } else {
        const idx = content.indexOf(text);
        if (idx !== -1) {
          const afterIdx = idx + text.length;
          if (replacement.startsWith(' ') && (idx === 0 || /\s/.test(content.charAt(idx - 1)))) {
            replacement = replacement.slice(1);
          }
          if (replacement.endsWith(' ') && (afterIdx >= content.length || /\s/.test(content.charAt(afterIdx)))) {
            replacement = replacement.slice(0, -1);
          }
          newContent = content.substring(0, idx) + replacement + content.substring(afterIdx);
        } else {
          newContent = content.replace(text, () => replacement);
        }
        if (currentSelection) {
          currentSelection.text = replacement;
        }
      }

      await logseq.Editor.updateBlock(block.uuid, newContent);
    } else {
      await logseq.Editor.insertAtEditingCursor(formatter(defaultPlaceholder));
    }
  } catch (err) {
    console.error('[Doc Enhancer] 格式化应用失败:', err);
  }
}

/**
 * 设置/切换标题等级 (H1 / H2 / H3)
 */
async function setHeading(level: 1 | 2 | 3) {
  try {
    let blockUuid = currentSelection?.blockUuid;
    let block = blockUuid ? await logseq.Editor.getBlock(blockUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) block = await logseq.Editor.getCurrentBlock();
    if (!block) return;

    const content = block.content || '';
    const clean = content.replace(/^(#{1,6}\s+)/, '');
    const prefix = '#'.repeat(level) + ' ';
    const newContent = content.startsWith(prefix) ? clean : `${prefix}${clean}`;
    await logseq.Editor.updateBlock(block.uuid, newContent);
  } catch (err) {
    console.error('[Doc Enhancer] 标题切换失败:', err);
  }
}

/**
 * 切换待办状态 (TODO -> DONE -> 无 -> TODO)
 */
async function toggleTodoStatus() {
  try {
    let blockUuid = currentSelection?.blockUuid;
    let block = blockUuid ? await logseq.Editor.getBlock(blockUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) block = await logseq.Editor.getCurrentBlock();
    if (!block) return;

    const content = block.content || '';
    const headingMatch = content.match(/^(#{1,6}\s+)/);
    const headingPrefix = headingMatch ? headingMatch[1] : '';
    const rest = content.slice(headingPrefix.length);

    let newRest = rest;
    if (/^TODO\s+/.test(rest)) {
      newRest = rest.replace(/^TODO\s+/, 'DONE ');
    } else if (/^DONE\s+/.test(rest)) {
      newRest = rest.replace(/^DONE\s+/, '');
    } else {
      newRest = 'TODO ' + rest;
    }
    await logseq.Editor.updateBlock(block.uuid, headingPrefix + newRest);
  } catch (err) {
    console.error('[Doc Enhancer] 待办切换失败:', err);
  }
}

/**
 * 清除所选区域所有 Markdown 与 HTML 格式
 */
async function clearSelectionFormatting() {
  try {
    let blockUuid = currentSelection?.blockUuid;
    let block = blockUuid ? await logseq.Editor.getBlock(blockUuid) : await logseq.Editor.getCurrentBlock();
    if (!block) block = await logseq.Editor.getCurrentBlock();
    if (!block) return;

    let content = block.content || '';
    const selected = currentSelection?.text;

    if (selected && content.includes(selected)) {
      const cleaned = cleanMarkdownAndHiccup(selected);

      const esc = escapeRegExp(selected);
      content = content.replace(new RegExp(`\\[:(?:span|mark)[^\\]]*"${esc}"\\]`, 'g'), cleaned);
      content = content.replace(new RegExp(`\\*\\*${esc}\\*\\*`, 'g'), cleaned);
      content = content.replace(new RegExp(`\\*${esc}\\*`, 'g'), cleaned);
      content = content.replace(new RegExp(`==${esc}==`, 'g'), cleaned);
      content = content.replace(new RegExp(`~~${esc}~~`, 'g'), cleaned);
      content = content.replace(new RegExp(`<u>${esc}<\\/u>`, 'gi'), cleaned);
      content = content.replace(new RegExp(`<ins>${esc}<\\/ins>`, 'gi'), cleaned);
      content = content.replace(new RegExp(`<span[^>]*>${esc}<\\/span>`, 'gi'), cleaned);
      content = content.replace(new RegExp(`<mark[^>]*>${esc}<\\/mark>`, 'gi'), cleaned);
      content = content.replace(new RegExp(`!?\\[${esc}\\]\\([^)]*\\)`, 'g'), cleaned);
      content = content.replace(new RegExp(`#?\\[\\[${esc}\\]\\]`, 'g'), cleaned);
      content = content.replace(new RegExp(`#${esc}`, 'g'), cleaned);
      content = content.replace(selected, () => cleaned);

      await logseq.Editor.updateBlock(block.uuid, content);
      if (currentSelection) {
        currentSelection.text = cleaned;
        if (typeof currentSelection.start === 'number') {
          currentSelection.end = currentSelection.start + cleaned.length;
        }
      }
    }
  } catch (err) {
    console.error('[Doc Enhancer] 清除格式失败:', err);
  }
}

/**
 * 链接/图片输入确认与取消处理
 */
async function confirmUrlInput(url: string) {
  const finalUrl = (url || '').trim() || 'https://';
  if (toolbarMode === 'link') {
    await applyFormatToSelection((t) => `[${t}](${finalUrl})`, '链接');
  } else if (toolbarMode === 'image') {
    await applyFormatToSelection((t) => `![${t}](${finalUrl})`, '图片');
  }
  toolbarMode = 'normal';
  inputUrlValue = '';
  if (isFloatingToolbarOpen && lastShownCoords) {
    showFloatingToolbar(lastShownCoords.x, lastShownCoords.y);
  } else if (isDockedToolbarOpen) {
    renderDockedToolbar();
  }
}

function cancelUrlInput() {
  toolbarMode = 'normal';
  inputUrlValue = '';
  if (isFloatingToolbarOpen && lastShownCoords) {
    showFloatingToolbar(lastShownCoords.x, lastShownCoords.y);
  } else if (isDockedToolbarOpen) {
    renderDockedToolbar();
  }
}

/**
 * 弹出系统原生文件选择框选取本地图片
 */
async function pickLocalImage() {
  try {
    const doc = parent.document;
    const fileInput = doc.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (file) {
        const rawPath = (file as any).path || file.name;
        let formattedPath = rawPath;
        if (!/^https?:\/\//i.test(formattedPath)) {
          formattedPath = formattedPath.replace(/\\/g, '/');
          if (!formattedPath.startsWith('file:///')) {
            formattedPath = `file:///${formattedPath.replace(/^\/+/, '')}`;
          }
        }
        await applyFormatToSelection((t) => `![${t}](${formattedPath})`, '图片');
        toolbarMode = 'normal';
        inputUrlValue = '';
        if (isFloatingToolbarOpen && lastShownCoords) {
          showFloatingToolbar(lastShownCoords.x, lastShownCoords.y);
        } else if (isDockedToolbarOpen) {
          renderDockedToolbar();
        }
      }
      fileInput.remove();
    };
    doc.body.appendChild(fileInput);
    fileInput.click();
  } catch (err) {
    console.error('[Doc Enhancer] 选择本地图片失败:', err);
  }
}

/**
 * 为动态注入的输入框挂载键盘与焦点事件
 */
function setupInputBarListeners() {
  setTimeout(() => {
    const input = parent.document.getElementById('doc-toolbar-url-input') as HTMLInputElement | null;
    if (input) {
      input.focus();
      if (input.value) {
        input.select();
      }
      input.onkeydown = async (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          await confirmUrlInput(input.value);
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          cancelUrlInput();
        }
      };
    }
  }, 60);
}

/**
 * 生成单行水平胶囊排版工具栏 HTML
 */
function getCapsuleToolbarTemplate(): string {
  if (toolbarMode === 'link') {
    return `
      <div class="doc-capsule-root doc-input-bar" onmousedown="event.preventDefault()">
        <span class="doc-input-title">${ICONS.link} Link:</span>
        <input type="text" id="doc-toolbar-url-input" class="doc-url-input" placeholder="Enter URL (Press Enter to confirm)..." value="${escapeHtml(inputUrlValue)}" />
        <button type="button" class="doc-item-btn doc-action-btn doc-confirm-btn" data-on-click="cmdConfirmInput" title="Confirm (Enter)">✓</button>
        <button type="button" class="doc-item-btn doc-action-btn doc-cancel-btn" data-on-click="cmdCancelInput" title="Cancel (Esc)">✕</button>
      </div>
    `;
  }

  if (toolbarMode === 'image') {
    return `
      <div class="doc-capsule-root doc-input-bar" onmousedown="event.preventDefault()">
        <span class="doc-input-title">${ICONS.image} Image:</span>
        <input type="text" id="doc-toolbar-url-input" class="doc-url-input" placeholder="Image URL or local path..." value="${escapeHtml(inputUrlValue)}" />
        <button type="button" class="doc-item-btn doc-action-btn" data-on-click="cmdBrowseImage" title="Browse local image">📁 Browse</button>
        <button type="button" class="doc-item-btn doc-action-btn doc-confirm-btn" data-on-click="cmdConfirmInput" title="Confirm (Enter)">✓</button>
        <button type="button" class="doc-item-btn doc-action-btn doc-cancel-btn" data-on-click="cmdCancelInput" title="Cancel (Esc)">✕</button>
      </div>
    `;
  }

  return `
    <div class="doc-capsule-root" onmousedown="event.preventDefault()">
      <!-- Heading Levels -->
      <button type="button" class="doc-item-btn doc-h-btn" data-on-click="cmdH1" title="Heading 1">H1</button>
      <button type="button" class="doc-item-btn doc-h-btn" data-on-click="cmdH2" title="Heading 2">H2</button>
      <button type="button" class="doc-item-btn doc-h-btn" data-on-click="cmdH3" title="Heading 3">H3</button>

      <span class="doc-sep"></span>

      <!-- Text Styles: Bold, Italic, Underline, Strikethrough -->
      <button type="button" class="doc-item-btn doc-bold-btn" data-on-click="cmdBold" title="Bold (Ctrl+B)">B</button>
      <button type="button" class="doc-item-btn doc-italic-btn" data-on-click="cmdItalic" title="Italic (Ctrl+I)">I</button>
      <button type="button" class="doc-item-btn doc-underline-btn" data-on-click="cmdUnderline" title="Underline (Ctrl+U)">U</button>
      <button type="button" class="doc-item-btn doc-strike-btn" data-on-click="cmdStrike" title="Strikethrough (~~)">S</button>

      <span class="doc-sep"></span>

      <!-- Font Colors -->
      <button type="button" class="doc-item-btn doc-swatch doc-swatch-red" data-on-click="cmdColorRed" title="Red text"></button>
      <button type="button" class="doc-item-btn doc-swatch doc-swatch-orange" data-on-click="cmdColorOrange" title="Orange text"></button>
      <button type="button" class="doc-item-btn doc-swatch doc-swatch-green" data-on-click="cmdColorGreen" title="Green text"></button>
      <button type="button" class="doc-item-btn doc-swatch doc-swatch-blue" data-on-click="cmdColorBlue" title="Blue text"></button>
      <button type="button" class="doc-item-btn doc-swatch doc-swatch-purple" data-on-click="cmdColorPurple" title="Purple text"></button>

      <span class="doc-sep"></span>

      <!-- Highlights -->
      <button type="button" class="doc-item-btn doc-highlighter doc-hl-yellow" data-on-click="cmdBgYellow" title="Yellow highlight"></button>
      <button type="button" class="doc-item-btn doc-highlighter doc-hl-green" data-on-click="cmdBgGreen" title="Mint highlight"></button>
      <button type="button" class="doc-item-btn doc-highlighter doc-hl-pink" data-on-click="cmdBgPink" title="Pink highlight"></button>

      <span class="doc-sep"></span>

      <!-- Knowledge & Utilities: Page Ref, Tag, Link, Todo, Image, Clear -->
      <button type="button" class="doc-item-btn doc-ref-btn" data-on-click="cmdPageRef" title="Page Reference ([[ ]])">[[ ]]</button>
      <button type="button" class="doc-item-btn doc-tag-btn" data-on-click="cmdTag" title="Tag (#)">#</button>
      <button type="button" class="doc-item-btn doc-icon-btn" data-on-click="cmdLink" title="Insert link">${ICONS.link}</button>
      <button type="button" class="doc-item-btn doc-icon-btn" data-on-click="cmdTodo" title="Toggle TODO">${ICONS.todo}</button>
      <button type="button" class="doc-item-btn doc-icon-btn" data-on-click="cmdImage" title="Insert image">${ICONS.image}</button>
      <button type="button" class="doc-item-btn doc-icon-btn" data-on-click="cmdClear" title="Clear formatting">${ICONS.clear}</button>
    </div>
  `;
}

/**
 * 弹出划词浮动气泡（严格计算坐标，绝不遮挡文字，零关闭按钮）
 */
function showFloatingToolbar(x: number, y: number) {
  const displayMode = getToolbarDisplayMode();
  if (displayMode === 'docked' || displayMode === 'none') {
    // 设置为“仅顶部固定栏”或“无 (禁用工具栏)”，不弹出划词气泡
    return;
  }

  const capsuleWidth = 530;
  let targetX = x - capsuleWidth / 2;
  const maxRight = (parent.window?.innerWidth || 1200) - capsuleWidth - 16;
  targetX = Math.max(16, Math.min(targetX, maxRight));

  // 向上偏移 56px (留足 24px 呼吸空隙)，首行则向下放到 +34px 处
  let targetY = y - 56;
  if (targetY < 56) {
    targetY = y + 34;
  }
  const maxBottom = (parent.window?.innerHeight || 800) - 48;
  targetY = Math.min(targetY, maxBottom);

  isFloatingToolbarOpen = true;
  lastShownCoords = { x, y };

  logseq.provideUI({
    key: 'doc-floating-toolbar',
    path: 'body',
    template: getCapsuleToolbarTemplate(),
    style: {
      position: 'fixed',
      left: `${Math.round(targetX)}px`,
      top: `${Math.round(targetY)}px`,
      zIndex: '999999',
      display: 'block',
      width: 'max-content',
      height: 'auto',
      padding: '0',
      margin: '0',
      border: 'none',
      background: 'transparent',
      boxShadow: 'none',
    },
  });

  if (toolbarMode !== 'normal') {
    setupInputBarListeners();
  }
}

/**
 * 隐藏划词浮动气泡
 */
function hideFloatingToolbar() {
  if (!isFloatingToolbarOpen) return;
  isFloatingToolbarOpen = false;
  lastShownCoords = null;
  currentSelection = null;
  toolbarMode = 'normal';
  inputUrlValue = '';
  logseq.provideUI({
    key: 'doc-floating-toolbar',
    template: '',
  });
}

/**
 * 渲染固定工具栏
 */
function renderDockedToolbar() {
  logseq.provideUI({
    key: 'doc-docked-toolbar',
    path: 'body',
    template: getCapsuleToolbarTemplate(),
    style: {
      position: 'fixed',
      top: '48px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '999999',
      display: 'block',
      width: 'max-content',
      height: 'auto',
      padding: '0',
      margin: '0',
      border: 'none',
      background: 'transparent',
      boxShadow: 'none',
    },
  });

  if (toolbarMode !== 'normal') {
    setupInputBarListeners();
  }
}

/**
 * 切换沉浸文档模式
 */
function toggleEnhancedDocMode() {
  isDocModeEnhanced = !isDocModeEnhanced;
  const doc = parent.document;

  if (isDocModeEnhanced) {
    doc.body.classList.add('doc-mode-enhanced');
    const trigger = doc.getElementById('doc-mode-toggle-trigger');
    if (trigger) trigger.classList.add('active');

    // 根据用户设置，若开启了顶部固定栏或两者皆显示，自动呼出顶部工具栏
    const displayMode = getToolbarDisplayMode();
    if (displayMode === 'docked' || displayMode === 'both') {
      isDockedToolbarOpen = true;
      renderDockedToolbar();
    }

    const clickMode = getBlockClickMode();
    const modeDesc = clickMode === 'readonly' ? 'Protected' : 'Native';
    logseq.UI.showMsg(`Document Mode ON 📄 (${modeDesc})`, 'success', { timeout: 2000 });
  } else {
    doc.body.classList.remove('doc-mode-enhanced');
    const trigger = doc.getElementById('doc-mode-toggle-trigger');
    if (trigger) trigger.classList.remove('active');

    // Close all toolbars when disabling doc mode
    hideFloatingToolbar();
    if (isDockedToolbarOpen) {
      isDockedToolbarOpen = false;
      logseq.provideUI({
        key: 'doc-docked-toolbar',
        template: '',
      });
    }

    logseq.UI.showMsg('Standard Outliner Mode 📑', 'info', { timeout: 1500 });
  }
}

/**
 * Synchronize state upon settings change
 */
function syncSettingsState() {
  const displayMode = getToolbarDisplayMode();
  if (isDocModeEnhanced) {
    if (displayMode === 'docked' || displayMode === 'both') {
      if (!isDockedToolbarOpen) {
        isDockedToolbarOpen = true;
        renderDockedToolbar();
      }
    } else {
      if (isDockedToolbarOpen) {
        isDockedToolbarOpen = false;
        logseq.provideUI({
          key: 'doc-docked-toolbar',
          template: '',
        });
      }
    }
  }

  if ((displayMode === 'docked' || displayMode === 'none') && isFloatingToolbarOpen) {
    hideFloatingToolbar();
  }

  const clickMode = getBlockClickMode();
  updateProtectedModeClass(parent.document);
  const desc = clickMode === 'readonly' ? 'Protected' : 'Native';
  const tbDesc = displayMode === 'none' ? 'Disabled' : displayMode === 'docked' ? 'Top Docked' : displayMode === 'both' ? 'Both' : 'Floating Bubble';
  logseq.UI.showMsg(`Settings updated: Mode: ${desc}, Toolbar: ${tbDesc}`, 'info', { timeout: 2000 });
}


/**
 * Toggle docked toolbar
 */
function toggleDockedToolbar() {
  isDockedToolbarOpen = !isDockedToolbarOpen;

  if (isDockedToolbarOpen) {
    renderDockedToolbar();
    logseq.UI.showMsg('Toolbar opened ✨', 'info', { timeout: 1200 });
  } else {
    toolbarMode = 'normal';
    inputUrlValue = '';
    logseq.provideUI({
      key: 'doc-docked-toolbar',
      template: '',
    });
  }
}

/**
 * 判断事件目标是否在工具栏容器内
 */
function isInsideToolbar(target: EventTarget | null, composedPath?: EventTarget[]): boolean {
  if (composedPath && Array.isArray(composedPath)) {
    for (const node of composedPath) {
      if (node && (node as HTMLElement).classList) {
        const el = node as HTMLElement;
        if (
          el.classList?.contains('doc-capsule-root') ||
          el.classList?.contains('doc-context-menu') ||
          el.id?.includes('doc-floating-toolbar') ||
          el.id?.includes('doc-docked-toolbar') ||
          el.id?.includes('doc-context-menu')
        ) {
          return true;
        }
      }
    }
  }
  if (target && typeof (target as any).closest === 'function') {
    const el = target as HTMLElement;
    if (
      el.closest('.doc-capsule-root') ||
      el.closest('.doc-context-menu') ||
      el.closest('[id*="doc-floating-toolbar"]') ||
      el.closest('[id*="doc-docked-toolbar"]') ||
      el.closest('[id*="doc-context-menu"]')
    ) {
      return true;
    }
  }
  return false;
}

let isContextMenuOpen = false;
let contextMenuBlockUuid: string | null = null;
let lastContextCoords: { x: number; y: number } | null = null;

function hideContextMenu() {
  if (!isContextMenuOpen) return;
  isContextMenuOpen = false;
  contextMenuBlockUuid = null;
  logseq.provideUI({
    key: 'doc-context-menu',
    template: '',
  });
}

function showContextMenu(x: number, y: number, blockUuid: string | null) {
  isContextMenuOpen = true;
  contextMenuBlockUuid = blockUuid;
  lastContextCoords = { x, y };

  const menuWidth = 160;
  const menuHeight = 150;
  const maxX = (parent.window?.innerWidth || 1200) - menuWidth - 12;
  const maxY = (parent.window?.innerHeight || 800) - menuHeight - 12;
  const targetX = Math.min(Math.max(12, x), maxX);
  const targetY = Math.min(Math.max(12, y), maxY);

  const sel = parent.document?.getSelection();
  const hasSelection = Boolean(sel && !sel.isCollapsed && sel.toString().trim().length > 0);
  const copyLabel = hasSelection ? '📋 Copy Selection' : '📋 Copy Block';

  const template = `
    <div class="doc-context-menu" onmousedown="event.stopPropagation()">
      <div class="doc-context-menu-item" data-on-click="ctxCmdCopy">
        <span>${copyLabel}</span>
        <span class="shortcut">Ctrl+C</span>
      </div>
      <div class="doc-context-menu-item" data-on-click="ctxCmdSelectAll">
        <span>📄 Select Block</span>
        <span class="shortcut">Ctrl+A</span>
      </div>
      <div class="doc-context-menu-item" data-on-click="ctxCmdEdit">
        <span>✏️ Edit Block</span>
        <span class="shortcut">Double-click</span>
      </div>
      <div class="doc-context-menu-item" data-on-click="ctxCmdToolbar">
        <span>🎨 Formatting Toolbar</span>
      </div>
    </div>
  `;

  logseq.provideUI({
    key: 'doc-context-menu',
    path: 'body',
    template,
    style: {
      position: 'fixed',
      left: `${targetX}px`,
      top: `${targetY}px`,
      zIndex: '9999999',
      display: 'block',
      width: 'max-content',
      height: 'auto',
      padding: '0',
      margin: '0',
      border: 'none',
      background: 'transparent',
      boxShadow: 'none',
    },
  });
}

function selectBlockContent(blockEl: HTMLElement) {
  const contentEl =
    blockEl.querySelector('.block-content') ||
    blockEl.querySelector('.block-content-wrapper') ||
    blockEl;
  const sel = parent.document.getSelection();
  if (sel) {
    const range = parent.document.createRange();
    range.selectNodeContents(contentEl);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const blockUuid = blockEl.getAttribute('blockid');
  currentSelection = {
    text: contentEl.textContent || '',
    blockUuid: blockUuid || null,
  };
}

async function copyCurrentSelection(blockEl?: HTMLElement) {
  let plainText = '';
  let htmlText = '';
  const sel = parent.document.getSelection();

  if (sel && !sel.isCollapsed && sel.toString().trim().length > 0 && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const container = parent.document.createElement('div');
    container.appendChild(range.cloneContents());
    htmlText = convertToStandardHtml(cleanHtmlForClipboard(container));
    plainText = cleanMarkdownAndHiccup(container.textContent || sel.toString());
  } else if (blockEl) {
    const contentEl = blockEl.querySelector('.block-content') || blockEl;
    const clone = contentEl.cloneNode(true) as HTMLElement;
    htmlText = convertToStandardHtml(cleanHtmlForClipboard(clone));
    plainText = cleanMarkdownAndHiccup(clone.textContent || '');
  }

  if (!plainText && contextMenuBlockUuid) {
    try {
      const b = await logseq.Editor.getBlock(contextMenuBlockUuid);
      if (b && b.content) {
        plainText = cleanMarkdownAndHiccup(b.content);
        htmlText = convertToStandardHtml(b.content);
      }
    } catch {}
  }

  if (plainText || htmlText) {
    let copied = false;

    // 1. 尝试现代 Async Clipboard API (富文本 + 纯文本)
    try {
      if (parent.navigator.clipboard?.write) {
        await parent.navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
            'text/html': new Blob([htmlText], { type: 'text/html' }),
          }),
        ]);
        copied = true;
      }
    } catch {}

    // 2. 宿主自定义 copy 事件回退 (同时写入纯文本与富文本)
    if (!copied) {
      try {
        const handler = (e: ClipboardEvent) => {
          e.preventDefault();
          e.stopPropagation();
          e.clipboardData?.setData('text/plain', plainText);
          e.clipboardData?.setData('text/html', htmlText);
        };
        parent.document.addEventListener('copy', handler, { once: true, capture: true });
        copied = parent.document.execCommand('copy');
      } catch {}
    }

    // 3. 终极兼容：尝试现代 Async Clipboard writeText (纯文本)
    if (!copied) {
      try {
        if (parent.navigator.clipboard?.writeText) {
          await parent.navigator.clipboard.writeText(plainText);
          copied = true;
        }
      } catch {}
    }

    if (copied) {
      logseq.UI.showMsg('Copied 📋', 'success', { timeout: 1200 });
    } else {
      logseq.UI.showMsg('Copy failed, please retry', 'warning', { timeout: 1500 });
    }
  }
}

function isTextareaOrInput(el: any): el is HTMLTextAreaElement | HTMLInputElement {
  if (!el || typeof el !== 'object') return false;
  const tag = el.tagName?.toUpperCase();
  return tag === 'TEXTAREA' || (tag === 'INPUT' && (el.type === 'text' || !el.type));
}

/**
 * 跨宿主获取当前有效选区信息（同时支持编辑态与阅读/文档态）
 */
function getActiveSelectionInfo(doc: Document): {
  text: string;
  blockUuid: string | null;
  start?: number;
  end?: number;
  coords: { x: number; y: number } | null;
} | null {
  // 1. 检查编辑态 Textarea（优先检查 activeElement，若因挂载失焦则查找全局唯一的块编辑框）
  let ta: HTMLTextAreaElement | null = null;
  const activeEl = doc.activeElement;
  if (isTextareaOrInput(activeEl)) {
    ta = activeEl as HTMLTextAreaElement;
  } else {
    ta = doc.querySelector('textarea.editor-inner, .ls-block textarea, textarea') as HTMLTextAreaElement | null;
  }

  if (
    ta &&
    typeof ta.selectionStart === 'number' &&
    typeof ta.selectionEnd === 'number' &&
    ta.selectionStart !== ta.selectionEnd
  ) {
    const text = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    if (text.length > 0) {
      const blockEl = ta.closest('[blockid]') || ta.closest('.ls-block');
      const blockUuid = blockEl?.getAttribute('blockid') || null;
      const rect = ta.getBoundingClientRect();
      const coords = { x: rect.left + rect.width / 2, y: rect.top };
      return {
        text,
        blockUuid,
        start: ta.selectionStart,
        end: ta.selectionEnd,
        coords,
      };
    }
  }

  // 2. 检查阅读/文档模式态（标准 DOM 选区，全面支持单行与跨行多块选区）
  const sel = doc.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
    const text = sel.toString().trim();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      let rect = range.getBoundingClientRect();

      // 跨块/跨行选区强化计算：若 getBoundingClientRect 因跨不同 DOM 分支出现 0 尺寸，采用 getClientRects 联合包围盒
      const clientRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if ((!rect || (rect.width === 0 && rect.height === 0)) && clientRects.length > 0) {
        const top = Math.min(...clientRects.map((r) => r.top));
        const bottom = Math.max(...clientRects.map((r) => r.bottom));
        const left = Math.min(...clientRects.map((r) => r.left));
        const right = Math.max(...clientRects.map((r) => r.right));
        rect = new DOMRect(left, top, Math.max(right - left, 10), Math.max(bottom - top, 10));
      }

      if (rect && (rect.width > 0 || rect.height > 0 || clientRects.length > 0)) {
        const anchorNode = sel.anchorNode;
        const anchorEl = anchorNode?.nodeType === 1 ? (anchorNode as HTMLElement) : anchorNode?.parentElement;
        const blockEl = anchorEl?.closest('[blockid]') || anchorEl?.closest('.ls-block');
        const blockUuid = blockEl?.getAttribute('blockid') || null;

        // 多行大段选中时，智能定位到视口内首个可见行顶部，保证气泡随处可见且紧随选区
        let topY = rect.top;
        if (clientRects.length > 1) {
          const winH = parent.window?.innerHeight || 800;
          const visibleRects = clientRects.filter((r) => r.bottom > 50 && r.top < winH - 20);
          if (visibleRects.length > 0) {
            topY = visibleRects[0].top;
          }
        }

        return {
          text,
          blockUuid,
          coords: { x: rect.left + rect.width / 2, y: topY },
        };
      }
    }
  }

  return null;
}

async function main() {
  console.log('[Light Doc Enhancer] 正在初始化...');

  // 0. 初始化设置面板与变更监听
  logseq.useSettingsSchema(SETTINGS_SCHEMA);
  logseq.onSettingsChanged((newSettings) => {
    if (newSettings && typeof newSettings === 'object') {
      Object.assign(logseq.settings || {}, newSettings);
    }
    syncSettingsState();
  });

  // 1. 注入 CSS 样式
  logseq.provideStyle(styleCss);
  logseq.provideStyle(docModeCss);

  // 2. 宿主生命周期管控：清理旧实例监听器，杜绝热重载残留
  const doc = parent.document;
  const win = parent.window as any;

  if (typeof win.__doc_enhancer_cleanup__ === 'function') {
    try {
      win.__doc_enhancer_cleanup__();
    } catch (err) {
      console.error('[Doc Enhancer] 清理旧实例监听器失败:', err);
    }
  }

  const cleanups: (() => void)[] = [];
  function addDocListener<K extends keyof DocumentEventMap>(
    type: K,
    listener: (ev: DocumentEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ) {
    doc.addEventListener(type, listener as any, options);
    cleanups.push(() => {
      doc.removeEventListener(type, listener as any, options);
    });
  }

  let todoSpaceTimer: any = null;
  cleanups.push(() => {
    if (todoSpaceTimer) {
      clearInterval(todoSpaceTimer);
      todoSpaceTimer = null;
    }
  });

  win.__doc_enhancer_cleanup__ = () => {
    if (todoSpaceTimer) {
      clearInterval(todoSpaceTimer);
      todoSpaceTimer = null;
    }
    cleanups.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanups.length = 0;
    doc.body.classList.remove('doc-mode-enhanced');
    doc.body.classList.remove('doc-protected-mode');
    const trigger = doc.getElementById('doc-mode-toggle-trigger');
    if (trigger) trigger.classList.remove('active');
    hideFloatingToolbar();
    hideContextMenu();
    if (isDockedToolbarOpen) {
      isDockedToolbarOpen = false;
      logseq.provideUI({ key: 'doc-docked-toolbar', template: '' });
    }
  };

  // 初始化保护模式 body class
  updateProtectedModeClass(doc);

  logseq.beforeunload(async () => {
    if (typeof win.__doc_enhancer_cleanup__ === 'function') {
      win.__doc_enhancer_cleanup__();
    }
  });

  let mouseDownPos: { x: number; y: number } | null = null;

  addDocListener(
    'mousedown',
    (e: MouseEvent) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };

      const path = e.composedPath ? e.composedPath() : [];
      if (!isInsideToolbar(e.target, path)) {
        hideContextMenu();
      }

      // 关键：绝对只拦截鼠标左键单击（button === 0）！
      // 鼠标右键（button === 2）或中键（button === 1）绝不拦截，保证原生上下文菜单完整可用！
      if (e.button !== 0) {
        return;
      }

      if (!shouldProtectBlockClick()) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (isInsideToolbar(target, path)) {
        return;
      }

      // 如果目标已经是输入框、文本域，放行打字与光标移动
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || (target as any).isContentEditable) {
        return;
      }

      // 如果点击的是复选框、按钮、大纲小圆点、折叠箭头、双链页面引用、标签、超链接，放行其原生操作
      if (
        target.closest('.form-checkbox') ||
        target.closest('button') ||
        target.closest('.bullet-container') ||
        target.closest('.bullet') ||
        target.closest('.block-control') ||
        target.closest('a') ||
        target.closest('.page-ref') ||
        target.closest('.tag')
      ) {
        return;
      }

      // 检查点击目标是否在块区域内（正文文本区、包装区、主容器或块元素空白处）
      const blockEl =
        target.closest('.ls-block') ||
        target.closest('.block-content-wrapper') ||
        target.closest('.block-content') ||
        target.closest('.block-main-container');
      if (blockEl) {
        // 核心：阻止 mousedown 冒泡至 Logseq 根组件，阻止其挂载 <textarea> 进入编辑态或激活大纲块多选
        // 绝不调用 preventDefault()，保留浏览器原生文字划选
        e.stopPropagation();
      }
    },
    true
  );

  // 阻止 HTML5 拖拽事件干扰只读保护模式下的文字连续划选
  addDocListener(
    'dragstart',
    (e: DragEvent) => {
      if (!shouldProtectBlockClick()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // 如果拖拽的是块内容区域且不是大纲小圆点或图片，在存在选区时阻止原生拖拽中断划选
      if (target.closest('.ls-block') && !target.closest('.bullet') && !target.closest('img')) {
        const sel = doc.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
          e.preventDefault();
        }
      }
    },
    true
  );

  addDocListener(
    'mouseup',
    (e: MouseEvent) => {
      // 关键：右键点击绝不触发工具栏计算与弹出，避免遮挡原生右键菜单
      if (e.button !== 0) {
        return;
      }

      // 点击发生在浮动工具栏或固定工具栏内部时，不收起、不重新计算
      const path = e.composedPath ? e.composedPath() : [];
      if (isInsideToolbar(e.target, path)) {
        return;
      }

      // 官方 onInputSelectionEnd 刚触发（400ms 内），直接交由官方钩子，不误杀
      if (Date.now() - lastInputSelectionTime < 400) {
        return;
      }

      const isDrag =
        mouseDownPos !== null &&
        Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y) > 4;

      const target = e.target as HTMLElement | null;
      const isTextarea = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');

      // 检查当前是否有有效文本选区
      const sel = doc.getSelection();
      const hasDomSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

      // 核心拦截：保护模式下划选正文（单行或跨行多选）时，阻止 mouseup 冒泡到 Logseq 核心，杜绝其 clear_selection 抹除文字选区！
      if (shouldProtectBlockClick() && !isTextarea && hasDomSelection) {
        e.stopPropagation();
      }

      setTimeout(async () => {
        if (Date.now() - lastInputSelectionTime < 400) {
          return;
        }

        const selInfo = getActiveSelectionInfo(doc);

        if (selInfo && selInfo.text.length > 0 && selInfo.coords) {
          if (!selInfo.blockUuid) {
            const curBlock = await logseq.Editor.getCurrentBlock();
            selInfo.blockUuid = curBlock?.uuid || null;
          }

          currentSelection = {
            text: selInfo.text,
            blockUuid: selInfo.blockUuid,
            start: selInfo.start,
            end: selInfo.end,
          };

          if (
            isFloatingToolbarOpen &&
            lastShownCoords &&
            Math.abs(lastShownCoords.x - selInfo.coords.x) < 30 &&
            Math.abs(lastShownCoords.y - selInfo.coords.y) < 30
          ) {
            return;
          }

          showFloatingToolbar(selInfo.coords.x, selInfo.coords.y);
        } else {
          // 无选区：仅当用户明确单击空白处（非拖拽划词过程中）才收起
          if (!isDrag) {
            hideFloatingToolbar();
          }
        }
      }, 50);
    },
    true
  );

  // 辅助获取元素所在块的 blockid
  function getBlockUuid(el: HTMLElement | null): string {
    if (!el) return '';
    const blockEl = (el.closest('[blockid]') || el.closest('.ls-block')) as HTMLElement | null;
    let uuid = blockEl?.getAttribute('blockid') || '';
    if (!uuid && blockEl?.id) {
      const match = blockEl.id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) uuid = match[0];
    }
    return uuid;
  }

  // 保证 TODO 块包含有效空格，并且光标位于空格之后（防止 Logseq 底层或重绘时自动截断空格）
  function ensureTodoSpace(keyword: string, targetUuid?: string) {
    if (todoSpaceTimer) {
      clearInterval(todoSpaceTimer);
      todoSpaceTimer = null;
    }

    let attempts = 0;
    todoSpaceTimer = setInterval(() => {
      attempts++;
      let activeEl = doc.activeElement as HTMLTextAreaElement | null;
      if (
        targetUuid &&
        (!activeEl || activeEl.tagName !== 'TEXTAREA' || getBlockUuid(activeEl) !== targetUuid)
      ) {
        const found = doc.querySelector(
          `[blockid="${targetUuid}"] textarea, .ls-block[blockid="${targetUuid}"] textarea, textarea.editor-inner`
        ) as HTMLTextAreaElement | null;
        if (found) {
          activeEl = found;
          if (doc.activeElement !== activeEl) {
            try {
              activeEl.focus();
            } catch {}
          }
        }
      }

      if (activeEl && activeEl.tagName === 'TEXTAREA') {
        if (targetUuid) {
          const currentUuid = getBlockUuid(activeEl);
          if (currentUuid && currentUuid !== targetUuid) {
            if (attempts >= 30) {
              clearInterval(todoSpaceTimer);
              todoSpaceTimer = null;
            }
            return;
          }
        }

        const val = activeEl.value;
        if (val === keyword) {
          // 如果被底层截断为无空格的 "TODO"，通过原生编辑命令追加空格，确保触发状态机
          activeEl.setSelectionRange(keyword.length, keyword.length);
          const ok = doc.execCommand('insertText', false, ' ');
          if (!ok || activeEl.value === keyword) {
            activeEl.value = keyword + ' ';
            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          activeEl.setSelectionRange(keyword.length + 1, keyword.length + 1);
        } else if (val.startsWith(keyword + ' ')) {
          // 确保光标在空格后
          if (activeEl.selectionStart < keyword.length + 1) {
            activeEl.setSelectionRange(keyword.length + 1, keyword.length + 1);
          }
          // 用户已开始输入正文文字，提前停止守护
          const rest = val.slice(keyword.length + 1);
          if (rest.trim().length > 0) {
            clearInterval(todoSpaceTimer);
            todoSpaceTimer = null;
            return;
          }
        } else if (!val.startsWith(keyword)) {
          // 内容已被删除或重写，停止定时器
          clearInterval(todoSpaceTimer);
          todoSpaceTimer = null;
          return;
        }
      }

      if (attempts >= 30) {
        clearInterval(todoSpaceTimer);
        todoSpaceTimer = null;
      }
    }, 20);
  }

  addDocListener(
    'keydown',
    async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideFloatingToolbar();
        hideContextMenu();
        return;
      }

      // Ctrl + U: 下划线快捷键
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'u'
      ) {
        e.preventDefault();
        e.stopPropagation();
        await applyFormatToSelection((t) => {
          const trimmed = t.trim();
          const hiccupMatch = trimmed.match(/^\[:span\s*\{:style\s*"text-decoration:\s*underline;?"\}\s*"([\s\S]+)"\s*\]$/);
          if (hiccupMatch) {
            return hiccupMatch[1];
          }
          if (trimmed.startsWith('<u>') && trimmed.endsWith('</u>') && trimmed.length >= 7) {
            return trimmed.slice(3, -4);
          }
          if (trimmed.startsWith('<ins>') && trimmed.endsWith('</ins>') && trimmed.length >= 11) {
            return trimmed.slice(5, -6);
          }
          return `[:span {:style "text-decoration: underline;"} "${trimmed}"]`;
        }, 'Underline');
        return;
      }

      // 处理 TODO 块中按 Tab / Shift+Tab 缩进/反缩进时空格被 Logseq 自动去掉的问题
      if (
        e.key === 'Tab' &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.isComposing &&
        (e as any).keyCode !== 229 &&
        isAutoInheritTodoEnabled()
      ) {
        const target = e.target as HTMLTextAreaElement | null;
        if (target && target.tagName === 'TEXTAREA') {
          const val = target.value;
          const todoMatch = val.match(/^((?:#{1,6}\s+)?(TODO|DOING|NOW|LATER))\s*$/);
          if (todoMatch) {
            const prefix = todoMatch[1];
            const uuid = getBlockUuid(target);
            // 允许原生 Tab / Shift+Tab 缩进/反缩进事件正常流转至 Logseq 核心，
            // 同时启动守护定时器，防止 Logseq 重绘时剥离尾随空格
            ensureTodoSpace(prefix, uuid || undefined);
          }
        }
      }

      // 智能中英文/数字盘古间距排版：回车换行时先行格式化当前块
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.isComposing &&
        (e as any).keyCode !== 229 &&
        isAutoSpacingCjkEnabled()
      ) {
        const target = e.target as HTMLTextAreaElement | null;
        if (target && target.tagName === 'TEXTAREA') {
          const val = target.value;
          if (val) {
            const formatted = formatCjkSpacing(val);
            if (formatted !== val) {
              const selStart = target.selectionStart ?? val.length;
              if (selStart >= val.length) {
                target.value = formatted;
                target.setSelectionRange(formatted.length, formatted.length);
                target.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }
        }
      }

      // OneNote 风格 TODO 智能连击处理（Enter 延续与二次 Enter 清除）
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.metaKey &&
        !e.isComposing &&
        (e as any).keyCode !== 229 &&
        isAutoInheritTodoEnabled()
      ) {
        const target = e.target as HTMLTextAreaElement | null;
        if (!target || target.tagName !== 'TEXTAREA') return;

        const val = target.value;
        const todoMatch = val.match(/^(TODO|DOING|NOW|LATER)(\s*)/);
        if (!todoMatch) return;

        const keyword = todoMatch[1];
        const prefix = todoMatch[0];
        const rest = val.slice(prefix.length);

        let uuid = getBlockUuid(target);
        if (!uuid) {
          const curBlock = await logseq.Editor.getCurrentBlock();
          uuid = curBlock?.uuid || '';
        }

        const selStart = target.selectionStart ?? val.length;
        const selEnd = target.selectionEnd ?? val.length;

        // 情况 1：当前块是空白的 TODO 块（只有 "TODO" 或 "TODO "，未输入文字）
        // 用户再次回车时，消除 TODO，恢复为普通段落（类似 OneNote 连续回车退出待办列表）
        if (rest.trim().length === 0) {
          e.preventDefault();
          e.stopPropagation();

          if (todoSpaceTimer) {
            clearInterval(todoSpaceTimer);
            todoSpaceTimer = null;
          }

          // 原生删除输入框中的全部字符（清除 TODO 及空格）
          target.select();
          const deleted = doc.execCommand('delete');
          if (!deleted || target.value.length > 0) {
            target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // 同步清空底层数据库中当前块内容
          if (uuid) {
            await logseq.Editor.updateBlock(uuid, '');
          }

          return;
        }

        // 情况 2：光标处于末尾（普通回车换行）
        // 在下方新建同级块，自动延续 TODO 前缀与空格，并自动对齐光标
        if (selStart >= val.length) {
          e.preventDefault();
          e.stopPropagation();

          if (uuid) {
            await logseq.Editor.updateBlock(uuid, val);
          }

          const newBlock = await logseq.Editor.insertBlock(
            uuid,
            `${keyword} `,
            { sibling: true, before: false, focus: true }
          );

          if (newBlock?.uuid) {
            await logseq.Editor.editBlock(newBlock.uuid);
            ensureTodoSpace(keyword, newBlock.uuid);
          }
          return;
        }

        // 情况 3：光标在文字中间（切分当前任务）
        if (selStart > prefix.length && selStart === selEnd) {
          e.preventDefault();
          e.stopPropagation();

          const part1 = val.slice(0, selStart);
          const part2 = `${keyword} ${val.slice(selStart).trimStart()}`;

          target.setSelectionRange(selStart, val.length);
          doc.execCommand('delete');
          if (uuid) {
            await logseq.Editor.updateBlock(uuid, part1);
          }

          const newBlock = await logseq.Editor.insertBlock(
            uuid,
            part2,
            { sibling: true, before: false, focus: true }
          );

          if (newBlock?.uuid) {
            await logseq.Editor.editBlock(newBlock.uuid);
            ensureTodoSpace(keyword, newBlock.uuid);
          }
          return;
        }
      }
    },
    true
  );

  addDocListener('keyup', (e: KeyboardEvent) => {
    if (e.key.startsWith('Arrow') || e.key === 'Shift') {
      setTimeout(async () => {
        if (Date.now() - lastInputSelectionTime < 400) return;
        const selInfo = getActiveSelectionInfo(doc);
        if (selInfo && selInfo.text.length > 0 && selInfo.coords) {
          if (!selInfo.blockUuid) {
            const curBlock = await logseq.Editor.getCurrentBlock();
            selInfo.blockUuid = curBlock?.uuid || null;
          }

          currentSelection = {
            text: selInfo.text,
            blockUuid: selInfo.blockUuid,
            start: selInfo.start,
            end: selInfo.end,
          };

          if (
            isFloatingToolbarOpen &&
            lastShownCoords &&
            Math.abs(lastShownCoords.x - selInfo.coords.x) < 30 &&
            Math.abs(lastShownCoords.y - selInfo.coords.y) < 30
          ) {
            return;
          }

          showFloatingToolbar(selInfo.coords.x, selInfo.coords.y);
        } else if (!e.shiftKey) {
          hideFloatingToolbar();
        }
      }, 50);
    }
  });

  // 3. 官方原生划词钩子保底（编辑态高精度绝对对齐）
  logseq.Editor.onInputSelectionEnd(async (e) => {
    if (e && e.text && e.text.trim().length > 0 && e.point) {
      lastInputSelectionTime = Date.now();
      const curBlock = await logseq.Editor.getCurrentBlock();
      currentSelection = {
        text: e.text.trim(),
        blockUuid: curBlock?.uuid || null,
        start: e.start,
        end: e.end,
      };

      if (
        isFloatingToolbarOpen &&
        lastShownCoords &&
        Math.abs(lastShownCoords.x - e.point.x) < 30 &&
        Math.abs(lastShownCoords.y - e.point.y) < 30
      ) {
        return;
      }

      showFloatingToolbar(e.point.x, e.point.y);
    }
  });

  // 4. 纯净只读保护：单击拦截进入编辑态，双击才精准进入编辑
  addDocListener(
    'click',
    (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }

      if (!shouldProtectBlockClick()) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target || isInsideToolbar(target)) return;

      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || (target as any).isContentEditable) {
        return;
      }

      // 放行复选框、按钮、大纲小圆点、超链接、双链引用、标签的原生操作
      if (
        target.closest('.form-checkbox') ||
        target.closest('button') ||
        target.closest('.bullet-container') ||
        target.closest('.bullet') ||
        target.closest('.block-control') ||
        target.closest('a') ||
        target.closest('.page-ref') ||
        target.closest('.tag')
      ) {
        return;
      }

      const blockEl =
        target.closest('.ls-block') ||
        target.closest('.block-content-wrapper') ||
        target.closest('.block-content') ||
        target.closest('.block-main-container');
      if (blockEl) {
        // 阻止 click 事件冒泡到 Logseq 核心层
        e.stopPropagation();
      }
    },
    true
  );

  addDocListener(
    'dblclick',
    async (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!shouldProtectBlockClick()) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target || isInsideToolbar(target)) return;

      const blockEl = target.closest('[blockid]') || target.closest('.ls-block');
      const blockUuid = blockEl?.getAttribute('blockid');
      if (blockUuid) {
        e.stopPropagation();
        await logseq.Editor.editBlock(blockUuid);
      }
    },
    true
  );

  // 5. 智能无痕复制：自动剥除 Markdown/Hiccup 语法，保留纯净文本与标准富文本色彩
  addDocListener(
    'copy',
    (e: ClipboardEvent) => {
      const activeEl = doc.activeElement as HTMLTextAreaElement | null;
      let plainText = '';
      let htmlText = '';

      if (
        activeEl &&
        (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT') &&
        typeof activeEl.selectionStart === 'number' &&
        typeof activeEl.selectionEnd === 'number' &&
        activeEl.selectionStart !== activeEl.selectionEnd
      ) {
        // 编辑态：从输入框中取原始 Markdown / Hiccup 语法并进行转换
        const rawText = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd);
        if (!rawText || rawText.trim().length === 0) return;
        plainText = cleanMarkdownAndHiccup(rawText);
        htmlText = convertToStandardHtml(rawText);
      } else {
        // 阅读态 / 只读保护态：从真实 DOM 渲染树提取内容，保留全部格式与内联样式
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const rawString = sel.toString();
        if (!rawString || rawString.trim().length === 0) return;

        const range = sel.getRangeAt(0);
        const container = doc.createElement('div');
        container.appendChild(range.cloneContents());

        plainText = cleanMarkdownAndHiccup(container.textContent || rawString);
        htmlText = convertToStandardHtml(cleanHtmlForClipboard(container));
      }

      if (!plainText && !htmlText) return;

      if (e.clipboardData) {
        e.preventDefault();
        e.stopPropagation();
        e.clipboardData.setData('text/plain', plainText);
        e.clipboardData.setData('text/html', htmlText);
      }
    },
    true
  );

  // 6. 右键快捷菜单：在只读保护模式下提供复制、全选本段、编辑此段等完整右键功能
  addDocListener(
    'contextmenu',
    (e: MouseEvent) => {
      // 仅在只读保护模式下提供专用的右键菜单
      if (!shouldProtectBlockClick()) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const path = e.composedPath ? e.composedPath() : [];
      if (isInsideToolbar(target, path)) {
        return;
      }

      // 如果目标已经是输入框、文本域，放行系统原生编辑菜单
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || (target as any).isContentEditable) {
        return;
      }

      // 检查当前是否有选中文本
      const sel = doc.getSelection();
      const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;

      // 如果没有选中文本，且右键的是大纲小圆点、折叠箭头、双链引用、独立超链接、标签，放行 Logseq 原生菜单
      if (!hasSelection) {
        if (
          target.closest('.bullet-container') ||
          target.closest('.bullet') ||
          target.closest('.block-control') ||
          target.closest('a') ||
          target.closest('.page-ref') ||
          target.closest('.tag')
        ) {
          return;
        }
      }

      const blockEl = (target.closest('[blockid]') || target.closest('.ls-block')) as HTMLElement | null;
      if (blockEl) {
        e.preventDefault();
        e.stopPropagation();
        const blockUuid = blockEl.getAttribute('blockid');
        showContextMenu(e.clientX, e.clientY, blockUuid);
      }
    },
    true
  );

  // 6.1 智能中英文/数字盘古排版：输入法选词上屏（compositionend）后即刻格式化当前输入框
  addDocListener(
    'compositionend',
    (e: CompositionEvent) => {
      if (!isAutoSpacingCjkEnabled()) return;
      const target = e.target as HTMLTextAreaElement | null;
      if (!target || target.tagName !== 'TEXTAREA') return;

      setTimeout(() => {
        const val = target.value;
        if (!val) return;
        const formatted = formatCjkSpacing(val);
        if (formatted !== val) {
          const curPos = target.selectionStart ?? val.length;
          const diff = formatted.length - val.length;
          target.value = formatted;
          const newPos = Math.min(formatted.length, curPos + diff);
          target.setSelectionRange(newPos, newPos);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 20);
    },
    true
  );

  // 6.2 智能中英文/数字盘古排版：失焦时自动规范间距并回写
  addDocListener(
    'blur',
    async (e: FocusEvent) => {
      if (!isAutoSpacingCjkEnabled()) return;
      const target = e.target as HTMLTextAreaElement | null;
      if (!target || target.tagName !== 'TEXTAREA') return;

      const val = target.value;
      if (!val) return;

      const formatted = formatCjkSpacing(val);
      if (formatted === val) return;

      target.value = formatted;
      target.dispatchEvent(new Event('input', { bubbles: true }));

      const uuid = getBlockUuid(target);
      if (uuid) {
        await logseq.Editor.updateBlock(uuid, formatted);
      }
    },
    true
  );

  // 滚动或滚轮滚动时，自动收起右键菜单以防止菜单悬空
  addDocListener('scroll', () => hideContextMenu(), true);
  addDocListener('wheel', () => {
    if (isContextMenuOpen) hideContextMenu();
  }, true);

  // 7. Register top bar main icon
  logseq.App.registerUIItem('toolbar', {
    key: 'open-doc-mode-item',
    template: `
      <a class="button" id="doc-mode-toggle-trigger" data-on-click="toggleDocMode" title="Document Mode">
        <i class="ti ti-file-text"></i>
      </a>
    `,
  });

  // 5. Register model actions
  logseq.provideModel({
    toggleDocMode() {
      toggleEnhancedDocMode();
    },
    toggleToolbar() {
      toggleDockedToolbar();
    },

    // Formatting
    async cmdBold() {
      await applyFormatToSelection((t) => {
        if (t.startsWith('**') && t.endsWith('**') && t.length >= 4) {
          return t.slice(2, -2);
        }
        return `**${t}**`;
      }, 'Bold');
    },
    async cmdItalic() {
      await applyFormatToSelection((t) => {
        if (t.startsWith('*') && t.endsWith('*') && t.length >= 2) {
          return t.slice(1, -1);
        }
        return `*${t}*`;
      }, 'Italic');
    },
    async cmdUnderline() {
      await applyFormatToSelection((t) => {
        const trimmed = t.trim();
        const hiccupMatch = trimmed.match(/^\[:span\s*\{:style\s*"text-decoration:\s*underline;?"\}\s*"([\s\S]+)"\s*\]$/);
        if (hiccupMatch) {
          return hiccupMatch[1];
        }
        if (trimmed.startsWith('<u>') && trimmed.endsWith('</u>') && trimmed.length >= 7) {
          return trimmed.slice(3, -4);
        }
        if (trimmed.startsWith('<ins>') && trimmed.endsWith('</ins>') && trimmed.length >= 11) {
          return trimmed.slice(5, -6);
        }
        return `[:span {:style "text-decoration: underline;"} "${trimmed}"]`;
      }, 'Underline');
    },
    async cmdStrike() {
      await applyFormatToSelection((t) => {
        if (t.startsWith('~~') && t.endsWith('~~') && t.length >= 4) {
          return t.slice(2, -2);
        }
        return `~~${t}~~`;
      }, 'Strikethrough');
    },

    // Knowledge: Page Reference & Tag
    async cmdPageRef() {
      await applyFormatToSelection((t) => {
        if (t.startsWith('[[') && t.endsWith(']]') && t.length >= 4) {
          return t.slice(2, -2);
        }
        return `[[${t}]]`;
      }, 'Page');
    },
    async cmdTag() {
      await applyFormatToSelection((t) => {
        const trimmed = t.trim();
        // 反向取消标签
        if (trimmed.startsWith('#[[') && trimmed.endsWith(']]') && trimmed.length >= 5) {
          return trimmed.slice(3, -2);
        }
        if (trimmed.startsWith('[[') && trimmed.endsWith(']]') && trimmed.length >= 4) {
          return trimmed.slice(2, -2);
        }
        if (trimmed.startsWith('#') && trimmed.length >= 2) {
          return trimmed.slice(1).trim();
        }
        // Logseq 标签格式为 #选中文本，并在两侧带空格（避免中文无空格导致整句被连带识别为标签）
        if (trimmed.includes(' ')) {
          return ` #[[${trimmed}]] `;
        }
        return ` #${trimmed} `;
      }, 'Tag');
    },

    // Headings
    async cmdH1() {
      await setHeading(1);
    },
    async cmdH2() {
      await setHeading(2);
    },
    async cmdH3() {
      await setHeading(3);
    },

    // Font Colors
    async cmdColorRed() {
      await applyFormatToSelection((t) => `[:span {:style "color: #e03e3e;"} "${t}"]`);
    },
    async cmdColorOrange() {
      await applyFormatToSelection((t) => `[:span {:style "color: #d9730d;"} "${t}"]`);
    },
    async cmdColorGreen() {
      await applyFormatToSelection((t) => `[:span {:style "color: #0f7b6c;"} "${t}"]`);
    },
    async cmdColorBlue() {
      await applyFormatToSelection((t) => `[:span {:style "color: #0b6e99;"} "${t}"]`);
    },
    async cmdColorPurple() {
      await applyFormatToSelection((t) => `[:span {:style "color: #6940a5;"} "${t}"]`);
    },

    // Highlights
    async cmdBgYellow() {
      await applyFormatToSelection((t) => `==${t}==`, 'Highlight');
    },
    async cmdBgGreen() {
      await applyFormatToSelection((t) => `[:mark {:style "background-color: #ddedea;"} "${t}"]`);
    },
    async cmdBgPink() {
      await applyFormatToSelection((t) => `[:mark {:style "background-color: #f4dfeb;"} "${t}"]`);
    },

    // Link & Image
    async cmdLink() {
      toolbarMode = 'link';
      let clip = '';
      try {
        clip = await parent.navigator.clipboard.readText();
      } catch {}
      inputUrlValue = (clip && /^https?:\/\//i.test(clip.trim())) ? clip.trim() : '';
      if (isFloatingToolbarOpen && lastShownCoords) {
        showFloatingToolbar(lastShownCoords.x, lastShownCoords.y);
      } else if (isDockedToolbarOpen) {
        renderDockedToolbar();
      }
    },
    async cmdImage() {
      toolbarMode = 'image';
      let clip = '';
      try {
        clip = await parent.navigator.clipboard.readText();
      } catch {}
      inputUrlValue = (clip && (/^https?:\/\//i.test(clip.trim()) || /\.(png|jpe?g|gif|webp|svg)/i.test(clip.trim()))) ? clip.trim() : '';
      if (isFloatingToolbarOpen && lastShownCoords) {
        showFloatingToolbar(lastShownCoords.x, lastShownCoords.y);
      } else if (isDockedToolbarOpen) {
        renderDockedToolbar();
      }
    },
    async cmdConfirmInput() {
      const input = parent.document.getElementById('doc-toolbar-url-input') as HTMLInputElement | null;
      await confirmUrlInput(input?.value || inputUrlValue);
    },
    async cmdCancelInput() {
      cancelUrlInput();
    },
    async cmdBrowseImage() {
      await pickLocalImage();
    },

    // TODO
    async cmdTodo() {
      await toggleTodoStatus();
    },

    // Clear formatting
    async cmdClear() {
      await clearSelectionFormatting();
    },

    // Context menu actions
    async ctxCmdCopy() {
      const doc = parent.document;
      let blockEl: HTMLElement | null = null;
      if (contextMenuBlockUuid) {
        blockEl = doc.querySelector(`[blockid="${contextMenuBlockUuid}"]`);
      }
      hideContextMenu();
      await copyCurrentSelection(blockEl || undefined);
    },
    ctxCmdSelectAll() {
      const doc = parent.document;
      let blockEl: HTMLElement | null = null;
      if (contextMenuBlockUuid) {
        blockEl = doc.querySelector(`[blockid="${contextMenuBlockUuid}"]`);
      }
      hideContextMenu();
      if (blockEl) {
        selectBlockContent(blockEl);
        const sel = doc.getSelection();
        if (sel && sel.rangeCount > 0) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            showFloatingToolbar(rect.left + rect.width / 2, rect.top);
          }
        }
      }
    },
    async ctxCmdEdit() {
      const uuid = contextMenuBlockUuid;
      hideContextMenu();
      if (uuid) {
        await logseq.Editor.editBlock(uuid);
      }
    },
    ctxCmdToolbar() {
      const doc = parent.document;
      const coords = lastContextCoords;
      hideContextMenu();
      const sel = doc.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          showFloatingToolbar(rect.left + rect.width / 2, rect.top);
          return;
        }
      }
      if (coords) {
        showFloatingToolbar(coords.x, coords.y);
      }
    },
  });

  // Command palette
  logseq.App.registerCommandPalette(
    {
      key: 'toggle-fluent-doc-mode',
      label: '📄 Toggle Document Mode',
    },
    () => toggleEnhancedDocMode()
  );

  logseq.App.registerCommandPalette(
    {
      key: 'toggle-docked-doc-toolbar',
      label: '🎨 Toggle Formatting Toolbar',
    },
    () => toggleDockedToolbar()
  );

  console.log('[FluentDoc] Ready!');
}

logseq.ready(main).catch(console.error);
