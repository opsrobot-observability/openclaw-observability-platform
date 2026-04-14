/**
 * MessageBubble — AG-UI 消息气泡组件
 * 支持 user / assistant / tool 三种角色，assistant 支持 Markdown 渲染
 */
import { useMemo } from "react";

export default function MessageBubble({ message }) {
  const { role, content, streaming } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-white">
          {content}
        </div>
      </div>
    );
  }

  if (role === "tool") {
    return null; // tool results are shown via ToolCallCard
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] rounded-2xl rounded-tl-md bg-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-800 dark:bg-gray-800 dark:text-gray-100">
        <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary dark:text-blue-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <rect x="5" y="6" width="14" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9.5" cy="11" r="1" fill="currentColor" stroke="none" />
            <circle cx="14.5" cy="11" r="1" fill="currentColor" stroke="none" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 14.5h5" />
          </svg>
          SRE Agent
        </span>
        <MarkdownContent text={content} />
        {streaming && <span className="inline-block h-4 w-1.5 animate-pulse bg-primary/60 ml-0.5 align-middle rounded-sm" />}
      </div>
    </div>
  );
}

/**
 * Lightweight markdown renderer (no external dependency).
 * Handles: headers, bold, code blocks, inline code, tables, lists, links, hr.
 */
function MarkdownContent({ text }) {
  const html = useMemo(() => renderMarkdown(text || ""), [text]);
  return (
    <div
      className="agui-markdown prose prose-sm max-w-none dark:prose-invert
        prose-headings:mb-2 prose-headings:mt-3 prose-p:my-1.5
        prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-3
        prose-code:before:content-none prose-code:after:content-none
        prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1
        prose-th:bg-gray-200 dark:prose-th:bg-gray-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  // code blocks
  let html = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
    `<pre><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`
  );
  // tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_m, header, _sep, body) => {
    const ths = header.split("|").filter(Boolean).map((c) => `<th>${c.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map((row) => {
      const tds = row.split("|").filter(Boolean).map((c) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });
  // headers
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // hr
  html = html.replace(/^---+$/gm, "<hr/>");
  // checkbox lists
  html = html.replace(/^- \[x\] (.+)$/gm, '<li class="flex items-center gap-1.5"><input type="checkbox" checked disabled class="accent-primary"/>$1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="flex items-center gap-1.5"><input type="checkbox" disabled/>$1</li>');
  // unordered list
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-200 px-1 py-0.5 text-xs dark:bg-gray-700">$1</code>');
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary underline" target="_blank">$1</a>');
  // line breaks → paragraphs for non-block content
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  return html;
}
