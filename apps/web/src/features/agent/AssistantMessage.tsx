import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const heading = 'mt-4 mb-2 text-small font-semibold text-strong';
const cell = 'border border-border px-2 py-1';

export function AssistantMessage({ text }: { text: string }) {
  return (
    <div className="leading-[1.75]">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2">{children}</p>,
          h1: ({ children }) => <h1 className={heading}>{children}</h1>,
          h2: ({ children }) => <h2 className={heading}>{children}</h2>,
          h3: ({ children }) => <h3 className={heading}>{children}</h3>,
          h4: ({ children }) => <h4 className={heading}>{children}</h4>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-4">{children}</ol>,
          code: ({ children, className }) => (
            <code
              className={`rounded-sm bg-surface-inset px-0.75 py-px font-mono text-caption ${className || ''}`}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="max-h-80 overflow-auto rounded-sm border border-border bg-editor p-2 font-mono text-caption [&_code]:bg-transparent [&_code]:p-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <table className="my-2 block border-collapse overflow-auto">{children}</table>
          ),
          th: ({ children }) => <th className={cell}>{children}</th>,
          td: ({ children }) => <td className={cell}>{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border-strong pl-2 text-muted">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                className="text-accent underline"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          // Model output must not load remote resources automatically.
          img: ({ alt }) => <span className="text-muted">{alt || 'Image'}</span>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
