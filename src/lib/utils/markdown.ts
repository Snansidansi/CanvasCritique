/**
 * Simple markdown parser for canvas critiques.
 * Supports Display Math ($$...$$), Inline Math ($...$), bold, italics, lists, headers.
 */
export function parseMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  let html = md;
  
  const displayMath: string[] = [];
  const inlineMath: string[] = [];
  
  // 1. Extract Display Math $$ ... $$
  html = html.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
    const placeholder = `__LATEX_DISPLAY_${displayMath.length}__`;
    displayMath.push(formula);
    return placeholder;
  });
  
  // 2. Extract Inline Math $ ... $
  html = html.replace(/\$([^\s$](?:[^$]*?[^\s$])?)\$/g, (match, formula) => {
    const placeholder = `__LATEX_INLINE_${inlineMath.length}__`;
    inlineMath.push(formula);
    return placeholder;
  });

  // 3. Escape HTML entities to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 4. Parse bold, italic, lists, anchors, headings
  html = html.replace(/\*\*(.*?)\*\"/g, '<strong>$1</strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc my-1 text-[11px]">$1</li>');
  html = html.replace(/\[(.*?)\]\(#(.*?)\)/g, '<a href="#$2" class="text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px] inline">ads_click</span>$1</a>');
  html = html.replace(/^### (.*?)$/gm, '<h5 class="font-bold text-xs mt-3 mb-1 text-on-surface">$1</h5>');
  html = html.replace(/^## (.*?)$/gm, '<h4 class="font-bold text-xs mt-4 mb-1.5 text-primary border-b border-outline-variant/20 pb-0.5">$1</h4>');
  html = html.replace(/^# (.*?)$/gm, '<h3 class="font-bold text-sm mt-5 mb-2 text-primary">$1</h3>');

  // 5. Replace newlines with <br>
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<\/li><br>/g, '</li>');
  html = html.replace(/<\/h[1-6]><br>/g, (m) => m.substring(0, 5));

  // 6. Restore & Render Display Math
  if (displayMath.length > 0 && typeof window !== 'undefined' && (window as any).katex) {
    const katex = (window as any).katex;
    displayMath.forEach((formula, idx) => {
      const placeholder = `__LATEX_DISPLAY_${idx}__`;
      try {
        const rendered = `<div class="my-3 flex justify-center overflow-x-auto select-text">${katex.renderToString(formula, { displayMode: true, throwOnError: false })}</div>`;
        html = html.replace(placeholder, rendered);
      } catch (e) {
        html = html.replace(placeholder, formula);
      }
    });
  } else {
    displayMath.forEach((formula, idx) => {
      html = html.replace(`__LATEX_DISPLAY_${idx}__`, `$$${formula}$$`);
    });
  }

  // 7. Restore & Render Inline Math
  if (inlineMath.length > 0 && typeof window !== 'undefined' && (window as any).katex) {
    const katex = (window as any).katex;
    inlineMath.forEach((formula, idx) => {
      const placeholder = `__LATEX_INLINE_${idx}__`;
      try {
        const rendered = `<span class="select-text">${katex.renderToString(formula, { displayMode: false, throwOnError: false })}</span>`;
        html = html.replace(placeholder, rendered);
      } catch (e) {
        html = html.replace(placeholder, formula);
      }
    });
  } else {
    inlineMath.forEach((formula, idx) => {
      html = html.replace(`__LATEX_INLINE_${idx}__`, `$${formula}$`);
    });
  }

  return html;
}
