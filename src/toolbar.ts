import {
  applyWrap,
  applyHeading,
  applyTextColor,
  applyHighlight,
  applyFormat,
  applyLink,
  applyImage,
  toggleTodo,
  clearFormat,
  FormatContext,
} from './formatters';

// 轻量内联 SVG 图标
const ICONS = {
  h1: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/></svg>`,
  bold: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h9a4 4 0 0 1 0 8H6v-8Z"/><path d="M6 4h8a4 4 0 0 1 0 8H6V4Z"/></svg>`,
  italic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
  palette: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,
  highlighter: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  checkSquare: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
};

const TEXT_COLORS = [
  { name: '暗红', color: '#e03e3e' },
  { name: '橙黄', color: '#d9730d' },
  { name: '翠绿', color: '#0f7b6c' },
  { name: '深蓝', color: '#0b6e99' },
  { name: '雅紫', color: '#6940a5' },
  { name: '低调灰', color: '#787774' },
  { name: '棕褐', color: '#64473a' },
  { name: '默认', color: 'inherit' },
];

const HIGHLIGHT_COLORS = [
  { name: '原生黄 (==)', color: 'yellow-native', preview: '#ffe066' },
  { name: '淡黄', color: '#fbf3db', preview: '#fbf3db' },
  { name: '淡绿', color: '#ddedea', preview: '#ddedea' },
  { name: '淡蓝', color: '#ddebf1', preview: '#ddebf1' },
  { name: '淡粉', color: '#f4dfeb', preview: '#f4dfeb' },
  { name: '淡紫', color: '#eae4f2', preview: '#eae4f2' },
];

export class FloatingToolbar {
  private toolbarEl: HTMLElement | null = null;
  private isVisible: boolean = false;
  private isDocked: boolean = false;
  private currentContext: FormatContext = { selectedText: '' };
  private hideTimer: any = null;

  constructor() {
    this.initDOM();
    this.bindEvents();
  }

  private initDOM() {
    const doc = parent.document;
    const existing = doc.getElementById('logseq-light-doc-toolbar');
    if (existing) existing.remove();

    const tb = doc.createElement('div');
    tb.id = 'logseq-light-doc-toolbar';
    tb.innerHTML = `
      <!-- 标题等级下拉 -->
      <div class="doc-tb-dropdown">
        <button class="doc-tb-btn" title="标题与段落">${ICONS.h1}</button>
        <div class="doc-tb-dropdown-menu">
          <div class="doc-tb-menu-item" data-action="h1"><b>H1</b> 一级标题</div>
          <div class="doc-tb-menu-item" data-action="h2"><b>H2</b> 二级标题</div>
          <div class="doc-tb-menu-item" data-action="h3"><b>H3</b> 三级标题</div>
          <div class="doc-tb-menu-item" data-action="h0">正文段落</div>
        </div>
      </div>

      <!-- 粗体与斜体 -->
      <button class="doc-tb-btn" data-action="bold" title="加粗 (Ctrl+B)">${ICONS.bold}</button>
      <button class="doc-tb-btn" data-action="italic" title="斜体 (Ctrl+I)">${ICONS.italic}</button>

      <div class="doc-tb-divider"></div>

      <!-- 字体颜色 -->
      <div class="doc-tb-dropdown">
        <button class="doc-tb-btn" title="字体颜色">${ICONS.palette}</button>
        <div class="doc-tb-dropdown-menu">
          <div class="doc-tb-color-grid">
            ${TEXT_COLORS.map(
              (c) =>
                `<div class="doc-tb-color-item" data-color="${c.color}" title="${c.name}" style="background-color: ${c.color === 'inherit' ? '#888' : c.color};"></div>`
            ).join('')}
          </div>
        </div>
      </div>

      <!-- 背景高亮 -->
      <div class="doc-tb-dropdown">
        <button class="doc-tb-btn" title="背景高亮">${ICONS.highlighter}</button>
        <div class="doc-tb-dropdown-menu">
          <div class="doc-tb-color-grid">
            ${HIGHLIGHT_COLORS.map(
              (h) =>
                `<div class="doc-tb-color-item" data-bg="${h.color}" title="${h.name}" style="background-color: ${h.preview};"></div>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="doc-tb-divider"></div>

      <!-- 超链接 -->
      <button class="doc-tb-btn" data-action="link" title="添加超链接">${ICONS.link}</button>

      <!-- TODO 待办 -->
      <button class="doc-tb-btn" data-action="todo" title="切换 TODO 待办">${ICONS.checkSquare}</button>

      <!-- 插入图片 -->
      <button class="doc-tb-btn" data-action="image" title="插入图片">${ICONS.image}</button>

      <!-- 清除格式 -->
      <button class="doc-tb-btn" data-action="clear" title="清除格式">${ICONS.eraser}</button>
    `;

    tb.addEventListener('mousedown', (e) => {
      e.preventDefault(); // 防止点击导致失焦
    });

    tb.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-action], [data-color], [data-bg]') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const color = btn.dataset.color;
      const bg = btn.dataset.bg;
      const ctx = this.currentContext;

      if (action) {
        switch (action) {
          case 'bold':
            await applyFormat(ctx, 'bold');
            break;
          case 'italic':
            await applyFormat(ctx, 'italic');
            break;
          case 'h1':
            await applyHeading(ctx, 1);
            break;
          case 'h2':
            await applyHeading(ctx, 2);
            break;
          case 'h3':
            await applyHeading(ctx, 3);
            break;
          case 'h0':
            await applyHeading(ctx, 0);
            break;
          case 'link':
            await applyLink(ctx);
            break;
          case 'todo':
            await toggleTodo(ctx);
            break;
          case 'image':
            await applyImage(ctx);
            break;
          case 'clear':
            await clearFormat(ctx);
            break;
        }
      } else if (color) {
        await applyTextColor(ctx, color);
      } else if (bg) {
        await applyHighlight(ctx, bg);
      }
    });

    doc.body.appendChild(tb);
    this.toolbarEl = tb;
  }

  private bindEvents() {
    const doc = parent.document;

    const handleSelection = () => {
      if (this.isDocked) return; // 若已常驻顶部则不执行浮动隐藏
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        this.checkSelection();
      }, 50);
    };

    doc.addEventListener('selectionchange', handleSelection);
    doc.addEventListener('mouseup', handleSelection);
    doc.addEventListener('keyup', (e) => {
      if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        handleSelection();
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    parent.window.addEventListener('resize', () => {
      if (!this.isDocked) this.hide();
    });
  }

  /**
   * 综合检查选区：支持输入框内选区与普通页面浏览划词
   */
  private checkSelection() {
    const doc = parent.document;
    const win = parent.window;

    let selectedText = '';
    let targetRect: DOMRect | null = null;
    let textarea: HTMLTextAreaElement | null = null;
    let blockUuid: string | null = null;

    // 1. 检查浏览器通用 Selection (无论是否在编辑框)
    const selection = win.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const text = selection.toString().trim();
      if (text.length > 0) {
        selectedText = text;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          targetRect = rect;
        }

        // 寻找所在块的 UUID
        const anchor = selection.anchorNode;
        if (anchor) {
          const el = anchor instanceof HTMLElement ? anchor : anchor.parentElement;
          const blockEl = el?.closest('[blockid]');
          if (blockEl) {
            blockUuid = blockEl.getAttribute('blockid');
          }
        }
      }
    }

    // 2. 检查 textarea 选区
    const activeEl = doc.activeElement;
    if (activeEl instanceof HTMLTextAreaElement) {
      textarea = activeEl;
      if (activeEl.selectionStart !== activeEl.selectionEnd) {
        selectedText = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
        targetRect = activeEl.getBoundingClientRect();
      }
      const blockEl = activeEl.closest('[blockid]');
      if (blockEl) {
        blockUuid = blockEl.getAttribute('blockid');
      }
    }

    if (selectedText.length > 0 && targetRect) {
      this.currentContext = {
        selectedText,
        textarea,
        blockUuid,
      };
      this.showAtRect(targetRect);
      return;
    }

    this.hide();
  }

  /**
   * 将工具栏精准定位在给定矩形上方
   */
  private showAtRect(targetRect: DOMRect) {
    if (!this.toolbarEl) return;

    this.toolbarEl.classList.remove('docked-top');
    this.toolbarEl.classList.add('visible');
    this.isVisible = true;

    const tbWidth = this.toolbarEl.offsetWidth || 320;
    const tbHeight = this.toolbarEl.offsetHeight || 38;

    // 居中对齐选区
    let left = targetRect.left + (targetRect.width - tbWidth) / 2;
    // 选区正上方
    let top = targetRect.top - tbHeight - 8;

    // 边界检测：若顶部溢出，则放置于下方
    if (top < 10) {
      top = targetRect.bottom + 8;
    }
    // 左右边界
    if (left < 10) left = 10;
    if (left + tbWidth > parent.window.innerWidth - 10) {
      left = parent.window.innerWidth - tbWidth - 10;
    }

    this.toolbarEl.style.top = `${Math.round(top)}px`;
    this.toolbarEl.style.left = `${Math.round(left)}px`;
  }

  /**
   * 切换常驻顶部模式
   */
  public toggleDocked() {
    if (!this.toolbarEl) return;

    this.isDocked = !this.isDocked;
    if (this.isDocked) {
      this.toolbarEl.classList.add('docked-top', 'visible');
      this.isVisible = true;
    } else {
      this.toolbarEl.classList.remove('docked-top');
      this.hide();
    }
  }

  public hide() {
    if (this.toolbarEl && this.isVisible && !this.isDocked) {
      this.toolbarEl.classList.remove('visible');
      this.isVisible = false;
    }
  }

  public destroy() {
    if (this.toolbarEl) {
      this.toolbarEl.remove();
      this.toolbarEl = null;
    }
  }
}
