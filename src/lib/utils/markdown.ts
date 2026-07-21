/**
 * Rich markdown and LaTeX parser for Handwriting Corrector.
 * Supports Display Math ($$...$$), Inline Math ($...$), Obsidian Callouts, Tables, Code Blocks, Bold, Italics, Lists, and Horizontal Rules.
 */
export function parseMarkdown(md: string | null | undefined): string {
  if (!md) return '';

  const codeBlocks: { lang: string; code: string }[] = [];
  const inlineCodes: string[] = [];
  const displayMath: string[] = [];
  const inlineMath: string[] = [];

  let html = md;

  // 1. Extract Code Blocks (do this first to protect content from formatting changes)
  html = html.replace(/```(\w*)\r?\n([\s\S]*?)\r?\n```/g, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ lang, code });
    return placeholder;
  });

  // 2. Extract Inline Code
  html = html.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(code);
    return placeholder;
  });

  // 3. Extract Display Math $$ ... $$ and \[ ... \]
  html = html.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
    const placeholder = `__LATEX_DISPLAY_${displayMath.length}__`;
    displayMath.push(formula);
    return placeholder;
  });
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
    const placeholder = `__LATEX_DISPLAY_${displayMath.length}__`;
    displayMath.push(formula);
    return placeholder;
  });

  // 4. Extract Inline Math $ ... $ and \( ... \)
  html = html.replace(/\$([^\s$](?:[^$]*?[^\s$])?)\$/g, (match, formula) => {
    const placeholder = `__LATEX_INLINE_${inlineMath.length}__`;
    inlineMath.push(formula);
    return placeholder;
  });
  html = html.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
    const placeholder = `__LATEX_INLINE_${inlineMath.length}__`;
    inlineMath.push(formula);
    return placeholder;
  });

  // 5. Escape HTML entities to prevent XSS (our placeholders are safe)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 5b. Parse LaTeX tabular / table environments
  html = parseLatexTables(html);

  // 6. Split into lines to parse block-level elements
  const rawLines = html.split(/\r?\n/);
  const parsedLines: string[] = [];

  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Check Blockquote / Callout
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      inBlockquote = true;
      const marker = trimmed.startsWith('&gt;') ? '&gt;' : '>';
      const content = line.substring(line.indexOf(marker) + marker.length);
      blockquoteLines.push(content.startsWith(' ') ? content.substring(1) : content);
      continue;
    } else {
      if (inBlockquote) {
        parsedLines.push(renderBlockquoteOrCallout(blockquoteLines));
        inBlockquote = false;
        blockquoteLines = [];
      }
    }

    // Check Horizontal Rule
    if (/^\s*([-*_])\1\1+\s*$/.test(trimmed)) {
      parsedLines.push('<hr class="border-t border-outline-variant/50 my-6 opacity-60 w-full" />');
      continue;
    }

    // Check Headings
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*?)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        if (level === 1) {
          parsedLines.push(`<h3 class="font-bold text-sm mt-5 mb-2 text-primary border-b border-outline-variant/10 pb-1">${text}</h3>`);
        } else if (level === 2) {
          parsedLines.push(`<h4 class="font-bold text-xs mt-4 mb-1.5 text-primary border-b border-outline-variant/20 pb-0.5">${text}</h4>`);
        } else {
          parsedLines.push(`<h5 class="font-bold text-[11px] mt-3 mb-1 text-on-surface uppercase tracking-wide">${text}</h5>`);
        }
        continue;
      }
    }

    // Check List Item
    if (/^\s*[-*]\s+(.*?)$/.test(line)) {
      const match = line.match(/^\s*[-*]\s+(.*?)$/);
      if (match) {
        parsedLines.push(`<li class="ml-4 list-disc my-1 text-[11px]">${match[1]}</li>`);
        continue;
      }
    }

    // Default: regular line
    parsedLines.push(line);
  }

  // Handle trailing blockquote
  if (inBlockquote) {
    parsedLines.push(renderBlockquoteOrCallout(blockquoteLines));
  }

  // Parse Markdown Tables
  const linesAfterTable = parseTables(parsedLines);

  // Join lines back
  let processedHtml = linesAfterTable.join('\n');

  // Parse Inline elements (bold, italic, links)
  processedHtml = processedHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  processedHtml = processedHtml.replace(/\*(.*?)\*/g, '<em>$1</em>');
  processedHtml = processedHtml.replace(/\[(.*?)\]\(#(.*?)\)/g, '<a href="#$2" class="text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px] inline">ads_click</span>$1</a>');
  
  // Parse external or file links
  processedHtml = processedHtml.replace(/\[(.*?)\]\((?!#)(.*?)\)/g, (match, label, url) => {
    const escapedUrl = url.replace(/'/g, "\\'");
    return `<a href="javascript:void(0)" onclick="if(window.__open_file){window.__open_file('${escapedUrl}')}else{window.open('${escapedUrl}','_blank')}" class="text-primary hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"><span class="material-symbols-outlined text-[12px] inline">open_in_new</span>${label}</a>`;
  });

  // Replace remaining newlines with <br>, but protect structural HTML tags from getting <br> breaks next to them
  processedHtml = processedHtml.replace(/\n/g, '<br>');
  processedHtml = processedHtml.replace(/<\/li><br>/g, '</li>');
  processedHtml = processedHtml.replace(/<\/h[1-6]><br>/g, (m) => m.substring(0, 5));
  processedHtml = processedHtml.replace(/<\/div><br>/g, '</div>');
  processedHtml = processedHtml.replace(/<\/tr><br>/g, '</tr>');
  processedHtml = processedHtml.replace(/<\/thead><br>/g, '</thead>');
  processedHtml = processedHtml.replace(/<\/tbody><br>/g, '</tbody>');
  processedHtml = processedHtml.replace(/<\/table><br>/g, '</table>');
  processedHtml = processedHtml.replace(/<\/pre><br>/g, '</pre>');
  processedHtml = processedHtml.replace(/<\/blockquote><br>/g, '</blockquote>');
  processedHtml = processedHtml.replace(/<hr(.*?)><br>/g, '<hr$1>');

  // 7. Restore Code Blocks
  codeBlocks.forEach((block, idx) => {
    processedHtml = processedHtml.replace(`__CODE_BLOCK_${idx}__`, renderCodeBlock(block.lang, block.code));
  });

  // 8. Restore Inline Code
  inlineCodes.forEach((code, idx) => {
    processedHtml = processedHtml.replace(`__INLINE_CODE_${idx}__`, renderInlineCode(code));
  });

  // 9. Restore & Render Display Math
  if (displayMath.length > 0 && typeof window !== 'undefined' && (window as any).katex) {
    const katex = (window as any).katex;
    displayMath.forEach((formula, idx) => {
      const placeholder = `__LATEX_DISPLAY_${idx}__`;
      try {
        const rendered = `<div class="my-3 overflow-x-auto select-text text-center"><div class="inline-block min-w-full text-center">${katex.renderToString(formula, { displayMode: true, throwOnError: false })}</div></div>`;
        processedHtml = processedHtml.replace(placeholder, rendered);
      } catch (e) {
        processedHtml = processedHtml.replace(placeholder, formula);
      }
    });
  } else {
    displayMath.forEach((formula, idx) => {
      processedHtml = processedHtml.replace(`__LATEX_DISPLAY_${idx}__`, `$$${formula}$$`);
    });
  }

  // 10. Restore & Render Inline Math
  if (inlineMath.length > 0 && typeof window !== 'undefined' && (window as any).katex) {
    const katex = (window as any).katex;
    inlineMath.forEach((formula, idx) => {
      const placeholder = `__LATEX_INLINE_${idx}__`;
      try {
        const rendered = `<span class="select-text">${katex.renderToString(formula, { displayMode: false, throwOnError: false })}</span>`;
        processedHtml = processedHtml.replace(placeholder, rendered);
      } catch (e) {
        processedHtml = processedHtml.replace(placeholder, formula);
      }
    });
  } else {
    inlineMath.forEach((formula, idx) => {
      processedHtml = processedHtml.replace(`__LATEX_INLINE_${idx}__`, `$${formula}$`);
    });
  }

  return processedHtml;
}

function renderBlockquoteOrCallout(lines: string[]): string {
  if (lines.length === 0) return '';

  const firstLine = lines[0].trim();
  
  // Detect callout: [!TYPE] Title
  const calloutMatch = firstLine.match(/^\[!(.*?)\](.*)$/);

  if (calloutMatch) {
    const type = calloutMatch[1];
    const title = calloutMatch[2].trim();
    const content = lines.slice(1).join('\n');
    return renderCallout(type, title, parseMarkdown(content));
  } else {
    const content = lines.join('\n');
    return `
      <blockquote class="my-4 p-4 border-l-4 border-outline-variant bg-surface-container-low/30 italic rounded-r-lg text-xs leading-relaxed text-on-surface-variant text-left">
        ${parseMarkdown(content)}
      </blockquote>
    `;
  }
}

function renderCallout(type: string, title: string, content: string): string {
  const t = type.toLowerCase();
  let icon = 'info';
  let colorClass = 'border-blue-500 bg-blue-500/5 text-blue-800 dark:text-blue-200';
  let titleText = title || type;

  if (t === 'note' || t === 'info') {
    icon = 'info';
    colorClass = 'border-blue-500 bg-blue-500/5 text-blue-800 dark:text-blue-200';
    titleText = title || (t === 'note' ? 'Note' : 'Info');
  } else if (t === 'todo') {
    icon = 'edit_square';
    colorClass = 'border-blue-500 bg-blue-500/5 text-blue-800 dark:text-blue-200';
    titleText = title || 'Todo';
  } else if (t === 'tip' || t === 'hint') {
    icon = 'lightbulb';
    colorClass = 'border-emerald-500 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200';
    titleText = title || (t === 'tip' ? 'Tip' : 'Hint');
  } else if (t === 'important') {
    icon = 'visibility';
    colorClass = 'border-indigo-500 bg-indigo-500/5 text-indigo-800 dark:text-indigo-200';
    titleText = title || 'Important';
  } else if (t === 'warning' || t === 'caution' || t === 'attention') {
    icon = 'warning';
    colorClass = 'border-amber-500 bg-amber-500/5 text-amber-800 dark:text-amber-200';
    titleText = title || 'Warning';
  } else if (t === 'failure' || t === 'danger' || t === 'bug' || t === 'error') {
    icon = 'gpp_maybe';
    colorClass = 'border-red-500 bg-red-500/5 text-red-800 dark:text-red-200';
    titleText = title || (t === 'bug' ? 'Bug' : 'Danger');
  } else if (t === 'success' || t === 'done' || t === 'check') {
    icon = 'check_circle';
    colorClass = 'border-green-500 bg-green-500/5 text-green-800 dark:text-green-200';
    titleText = title || 'Success';
  } else if (t === 'quote' || t === 'cite') {
    icon = 'format_quote';
    colorClass = 'border-gray-500 bg-gray-500/5 text-gray-800 dark:text-gray-200';
    titleText = title || 'Quote';
  }

  return `
    <div class="my-4 p-4 border-l-4 rounded-r-lg ${colorClass} text-xs text-left">
      <div class="flex items-center gap-2 font-bold mb-2 uppercase tracking-wide text-[10px]">
        <span class="material-symbols-outlined text-[15px]">${icon}</span>
        <span>${titleText}</span>
      </div>
      <div class="opacity-95 leading-relaxed">${content}</div>
    </div>
  `;
}

function renderCodeBlock(lang: string, code: string): string {
  const escapedCode = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const displayLang = lang ? lang.toUpperCase() : 'CODE';

  return `
    <div class="code-block-wrapper my-4 rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest shadow-sm flex flex-col font-mono text-[0.9em] text-on-surface">
      <div class="flex justify-between items-center px-4 py-2 bg-surface-container-low border-b border-outline-variant/30 text-[0.75em] font-bold text-on-surface-variant select-none">
        <span>${displayLang}</span>
        <button 
          onclick="navigator.clipboard.writeText(this.closest('.code-block-wrapper').querySelector('code').innerText)" 
          class="material-symbols-outlined text-[14px] hover:text-primary cursor-pointer p-0.5 rounded transition-colors focus:outline-none"
          title="Copy code"
        >
          content_copy
        </button>
      </div>
      <pre class="p-4 overflow-x-auto bg-surface-container-low/20 text-left select-text whitespace-pre leading-relaxed"><code class="language-${lang}">${escapedCode}</code></pre>
    </div>
  `;
}

function renderInlineCode(code: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<code class="px-1.5 py-0.5 rounded bg-surface-container-low text-primary font-mono text-[0.9em] border border-outline-variant/20">${escaped}</code>`;
}

function parseTables(lines: string[]): string[] {
  const result: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let alignments: ('left' | 'center' | 'right' | null)[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).slice(1, -1);

      if (!inTable) {
        // Look ahead to check for separator line: e.g. |---|
        const nextLine = lines[i + 1]?.trim();
        if (nextLine && nextLine.startsWith('|') && nextLine.endsWith('|') && /^[|:\-\s]+$/.test(nextLine)) {
          inTable = true;
          tableRows = [cells];
          const sepCells = nextLine.split('|').map(c => c.trim()).slice(1, -1);
          alignments = sepCells.map(c => {
            if (c.startsWith(':') && c.endsWith(':')) return 'center';
            if (c.startsWith(':')) return 'left';
            if (c.endsWith(':')) return 'right';
            return null;
          });
          i++; // Skip the separator line
        } else {
          result.push(lines[i]);
        }
      } else {
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        result.push(renderTable(tableRows, alignments));
        inTable = false;
        tableRows = [];
        alignments = [];
      }
      result.push(lines[i]);
    }
  }

  if (inTable) {
    result.push(renderTable(tableRows, alignments));
  }

  return result;
}

function renderTable(rows: string[][], alignments: ('left' | 'center' | 'right' | null)[]): string {
  if (rows.length === 0) return '';
  const headers = rows[0];
  const bodyRows = rows.slice(1);

  let html = `<div class="my-4 overflow-x-auto border border-outline-variant/30 rounded-lg shadow-sm bg-surface-container-low/10 text-left">`;
  html += `<table class="w-full text-left border-collapse text-[11px] leading-normal">`;

  // Headers
  html += `<thead><tr class="bg-surface-container-low border-b border-outline-variant/50">`;
  headers.forEach((h, idx) => {
    const align = alignments[idx] ? `style="text-align: ${alignments[idx]}"` : '';
    html += `<th class="p-2.5 font-semibold text-primary" ${align}>${h}</th>`;
  });
  html += `</tr></thead>`;

  // Body
  html += `<tbody class="divide-y divide-outline-variant/20">`;
  bodyRows.forEach(row => {
    html += `<tr class="hover:bg-surface-container/20 transition-colors">`;
    headers.forEach((_, idx) => {
      const align = alignments[idx] ? `style="text-align: ${alignments[idx]}"` : '';
      const cellVal = row[idx] !== undefined ? row[idx] : '';
      html += `<td class="p-2.5 text-on-surface" ${align}>${cellVal}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  return html;
}

function parseLatexTables(md: string): string {
  // Strip out outer \begin{table}[...] and \end{table} environments and options
  let result = md.replace(/\\begin\{table\}(\[[^\]]*\])?/g, '');
  result = result.replace(/\\end\{table\}/g, '');
  result = result.replace(/\\centering/g, '');
  result = result.replace(/\\caption\{[^}]*\}/g, '');
  result = result.replace(/\\label\{[^}]*\}/g, '');

  // Match tabular environments: \begin{tabular}{spec} ... \end{tabular}
  const tabularRegex = /\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/g;

  result = result.replace(tabularRegex, (match, spec, body) => {
    const aligns: ('left' | 'center' | 'right')[] = [];
    const cleanSpec = spec.replace(/\|/g, '').trim();
    for (const char of cleanSpec) {
      if (char === 'l') aligns.push('left');
      else if (char === 'c') aligns.push('center');
      else if (char === 'r') aligns.push('right');
      else aligns.push('left');
    }

    const rawRows = body.split(/\\\\|\\cr/);
    const parsedRows: string[][] = [];

    for (const rawRow of rawRows) {
      let cleanRow = rawRow.trim();
      cleanRow = cleanRow.replace(/\\hline/g, '').trim();
      if (!cleanRow) continue;

      // Columns split by & or escaped &amp;
      const cols = cleanRow.split(/&amp;|&/).map((c: string) => c.trim());
      parsedRows.push(cols);
    }

    if (parsedRows.length === 0) return '';

    const headers = parsedRows[0];
    const bodyRows = parsedRows.slice(1);

    let html = `<div class="my-4 overflow-x-auto border border-outline-variant/30 rounded-lg shadow-sm bg-surface-container-low/10 text-left">`;
    html += `<table class="w-full text-left border-collapse text-[11px] leading-normal">`;

    // Headers
    html += `<thead><tr class="bg-surface-container-low border-b border-outline-variant/50">`;
    headers.forEach((h, idx) => {
      const align = aligns[idx] ? `style="text-align: ${aligns[idx]}"` : '';
      html += `<th class="p-2.5 font-semibold text-primary" ${align}>${h}</th>`;
    });
    html += `</tr></thead>`;

    // Body
    html += `<tbody class="divide-y divide-outline-variant/20">`;
    bodyRows.forEach(row => {
      html += `<tr class="hover:bg-surface-container/20 transition-colors">`;
      headers.forEach((_, idx) => {
        const align = aligns[idx] ? `style="text-align: ${aligns[idx]}"` : '';
        const cellVal = row[idx] !== undefined ? row[idx] : '';
        html += `<td class="p-2.5 text-on-surface" ${align}>${cellVal}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;

    return html;
  });

  return result;
}
