import { useMemo } from "react";
import Markdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";

import { LessonImg } from "./LessonImg";
import { MermaidDiagram } from "./MermaidDiagram";

// The single configured markdown renderer, shared by every render site (artifacts,
// placement feedback, submission preview, placement stems). Channels — all offline, all
// degrade gracefully:
//   • GFM tables/strikethrough
//   • KaTeX math — `$$…$$` ONLY (singleDollarTextMath off) so prose like "$5 to $10",
//     shell, and regex don't silently turn into garbled math on existing artifacts.
//   • ```mermaid diagrams (lazy, sanitized, raw-source fallback)
//   • SVG-file images via read_artifact (`slug` prop); without slug, svg refs degrade.
const remarkPlugins: Options["remarkPlugins"] = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];
const rehypePlugins: Options["rehypePlugins"] = [
  [rehypeKatex, { throwOnError: false, strict: false, errorColor: "var(--danger)" }],
];

export function RichMarkdown({ children, slug }: { children: string; slug?: string }) {
  // react-markdown v9 passes no custom props to component overrides, so `img` closes over
  // `slug`. Memoize on slug so the components map is stable between renders.
  const components = useMemo<Components>(
    () => ({
      code({ className, children }) {
        // v9 dropped the `inline` prop: a block is identified by a `language-` class.
        if (/\blanguage-mermaid\b/.test(className ?? "")) {
          return <MermaidDiagram code={String(children).replace(/\n$/, "")} />;
        }
        return <code className={className}>{children}</code>;
      },
      pre({ children }) {
        // Unwrap the <pre> around a mermaid fence so the diagram (and its raw-source
        // fallback) isn't nested in a second <pre>; normal code keeps its <pre>.
        const child = Array.isArray(children) ? children[0] : children;
        const cls = (child as { props?: { className?: string } })?.props?.className ?? "";
        if (/\blanguage-mermaid\b/.test(cls)) return <>{children}</>;
        return <pre>{children}</pre>;
      },
      img({ src, alt }) {
        return <LessonImg src={src} alt={alt} slug={slug} />;
      },
    }),
    [slug],
  );

  return (
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
      {children}
    </Markdown>
  );
}
