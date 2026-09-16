import '@logseq/libs';

/**
 * 格式化与文本包装工具集
 * 同时支持：
 * 1. 处于编辑态的输入框 (textarea) 直接平滑替换
 * 2. 未处于编辑态时通过 Logseq API 直接更新块内容
 */

export interface FormatContext {
  textarea?: HTMLTextAreaElement | null;
  selectedText: string;
  blockUuid?: string | null;
}

/**
 * 通用包裹或替换选中文本
 */
export async function applyWrap(
  ctx: FormatContext,
  before: string,
  after: string = '',
  defaultText: string = ''
): Promise<void> {
  const { textarea, selectedText, blockUuid } = ctx;

  // 1. 如果在编辑框内
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const textToWrap = val.substring(start, end) || defaultText;
    const replacement = `${before}${textToWrap}${after}`;

    textarea.focus();
    if (typeof textarea.setRangeText === 'function') {
      textarea.setRangeText(replacement, start, end, 'select');
    } else {
      textarea.value = val.substring(0, start) + replacement + val.substring(end);
      textarea.selectionStart = start;
      textarea.selectionEnd = start + replacement.length;
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    if (start === end && defaultText === '') {
      const cursor = start + before.length;
      textarea.setSelectionRange(cursor, cursor);
    }
    return;
  }

  // 2. 如果在非编辑态，通过 Logseq API 更新块
  if (blockUuid && selectedText) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const replacement = `${before}${selectedText}${after}`;
      const newContent = block.content.replace(selectedText, replacement);
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}

/**
 * 切换标题级别 (H1 ~ H3) 或清除标题
 */
export async function applyHeading(ctx: FormatContext, level: 1 | 2 | 3 | 0): Promise<void> {
  const { textarea, blockUuid } = ctx;

  const prefix = level > 0 ? '#'.repeat(level) + ' ' : '';

  if (textarea) {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = val.length;

    const line = val.substring(lineStart, lineEnd);
    const cleanLine = line.replace(/^(#{1,6}\s+)/, '');
    const newLine = prefix + cleanLine;

    textarea.focus();
    textarea.setRangeText(newLine, lineStart, lineEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return;
  }

  if (blockUuid) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const cleanContent = block.content.replace(/^(#{1,6}\s+)/, '');
      const newContent = prefix + cleanContent;
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}

/**
 * 切换 TODO 状态
 */
export async function toggleTodo(ctx: FormatContext): Promise<void> {
  const { textarea, blockUuid } = ctx;

  const getNewContent = (content: string) => {
    if (/^TODO\s+/.test(content)) {
      return content.replace(/^TODO\s+/, 'DONE ');
    } else if (/^DONE\s+/.test(content)) {
      return content.replace(/^DONE\s+/, '');
    } else {
      return 'TODO ' + content;
    }
  };

  if (textarea) {
    const start = textarea.selectionStart;
    const val = textarea.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = val.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = val.length;

    const line = val.substring(lineStart, lineEnd);
    const newLine = getNewContent(line);

    textarea.focus();
    textarea.setRangeText(newLine, lineStart, lineEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return;
  }

  if (blockUuid) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const newContent = getNewContent(block.content);
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}

/**
 * 应用文字颜色
 */
export async function applyTextColor(ctx: FormatContext, color: string): Promise<void> {
  if (color === 'inherit') {
    await clearFormat(ctx);
  } else {
    await applyWrap(ctx, `<span style="color: ${color}">`, '</span>');
  }
}

/**
 * 应用背景高亮
 */
export async function applyHighlight(ctx: FormatContext, bgColor: string): Promise<void> {
  if (bgColor === 'yellow-native') {
    await applyWrap(ctx, '==', '==');
  } else {
    await applyWrap(ctx, `<mark style="background-color: ${bgColor}">`, '</mark>');
  }
}

/**
 * 常规 Markdown 强调
 */
export async function applyFormat(
  ctx: FormatContext,
  type: 'bold' | 'italic' | 'strike' | 'code'
): Promise<void> {
  switch (type) {
    case 'bold':
      await applyWrap(ctx, '**', '**');
      break;
    case 'italic':
      await applyWrap(ctx, '*', '*');
      break;
    case 'strike':
      await applyWrap(ctx, '~~', '~~');
      break;
    case 'code':
      await applyWrap(ctx, '`', '`');
      break;
  }
}

/**
 * 插入超链接
 */
export async function applyLink(ctx: FormatContext): Promise<void> {
  const { textarea, selectedText, blockUuid } = ctx;
  const desc = selectedText || '链接描述';

  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = `[${desc}](`;
    const after = ')';

    textarea.focus();
    textarea.setRangeText(before + after, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    const urlCursorPos = start + before.length;
    textarea.setSelectionRange(urlCursorPos, urlCursorPos);
    return;
  }

  if (blockUuid && selectedText) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const replacement = `[${selectedText}](url)`;
      const newContent = block.content.replace(selectedText, replacement);
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}

/**
 * 插入图片模板
 */
export async function applyImage(ctx: FormatContext): Promise<void> {
  const { textarea, selectedText, blockUuid } = ctx;
  const desc = selectedText || '图片描述';

  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const template = `![${desc}](https://)`;

    textarea.focus();
    textarea.setRangeText(template, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));

    const urlCursorPos = start + desc.length + 4;
    textarea.setSelectionRange(urlCursorPos, urlCursorPos + 8);
    return;
  }

  if (blockUuid) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const template = `![${desc}](https://)`;
      const newContent = block.content + '\n' + template;
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}

/**
 * 清除格式
 */
export async function clearFormat(ctx: FormatContext): Promise<void> {
  const { textarea, selectedText, blockUuid } = ctx;

  const clean = (str: string) => {
    return str
      .replace(/<span[^>]*>(.*?)<\/span>/gi, '$1')
      .replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1')
      .replace(/(\*\*|\*|~~|==|`|\[\[|\]\])/g, '')
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1');
  };

  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.substring(start, end);
    if (!selected) return;

    const cleaned = clean(selected);
    textarea.focus();
    textarea.setRangeText(cleaned, start, end, 'select');
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    return;
  }

  if (blockUuid && selectedText) {
    const block = await logseq.Editor.getBlock(blockUuid);
    if (block && block.content) {
      const cleaned = clean(selectedText);
      const newContent = block.content.replace(selectedText, cleaned);
      await logseq.Editor.updateBlock(block.uuid, newContent);
    }
  }
}
