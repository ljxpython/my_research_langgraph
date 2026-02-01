import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { coldarkDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

export function Markdown(props: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }) {
            const m = /language-(\w+)/.exec(className || '');
            const lang = m?.[1];
            const text = String(children ?? '').replace(/\n$/, '');
            if (lang) {
              return (
                <SyntaxHighlighter
                  {...(rest as any)}
                  style={coldarkDark as any}
                  language={lang}
                  PreTag="div"
                  customStyle={{ margin: 0, padding: '12px', borderRadius: 8 }}
                >
                  {text}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className="rounded bg-gray-100 px-1 py-0.5" {...(rest as any)}>
                {children}
              </code>
            );
          },
        }}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  );
}
