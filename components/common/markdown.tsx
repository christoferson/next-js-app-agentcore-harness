"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { memo } from "react";

// Markdown + syntax-highlighted code blocks (SPEC §6). highlight.js theme is
// imported globally in globals.css. Memoized so streaming siblings don't force
// a re-parse of settled messages.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:my-2 prose-pre:overflow-hidden prose-pre:rounded-lg prose-pre:bg-transparent prose-pre:p-0 prose-code:before:content-none prose-code:after:content-none prose-p:my-1.5 prose-headings:mt-3">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{text}</ReactMarkdown>
    </div>
  );
});
