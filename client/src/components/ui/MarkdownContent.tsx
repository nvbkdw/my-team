import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownContentProps {
  children: string;
  className?: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-3 mb-1 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-gray-300 dark:border-gray-600 pl-3 my-2 text-gray-600 dark:text-gray-400 italic">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <code className={`block text-[13px] leading-snug ${className ?? ''}`}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-100 dark:bg-gray-800 text-pink-600 dark:text-pink-400 rounded px-1 py-0.5 text-[13px]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-md p-3 my-2 overflow-x-auto text-[13px] leading-snug">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border-collapse border border-gray-300 dark:border-gray-600">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>
  ),
  hr: () => <hr className="my-3 border-gray-300 dark:border-gray-600" />,
  img: ({ src, alt }) => (
    <img src={src} alt={alt ?? ''} className="max-w-full rounded my-2" />
  ),
  input: ({ checked, disabled, ...rest }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      readOnly
      className="mr-1.5 accent-indigo-600"
      {...rest}
    />
  ),
};

export default function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={`text-sm text-gray-800 dark:text-gray-200 ${className ?? ''}`}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
