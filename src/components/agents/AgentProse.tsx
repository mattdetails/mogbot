/**
 * An agent's words as markdown. A reply lands whole (no word-by-word reveal),
 * drawn block by block: the parser keeps finished blocks
 * (`createStreamingSegments`) and `ProseRun` keeps their DOM, so a long reply
 * never rebuilds the paragraphs above the one that changed.
 *
 * @module components/agents/AgentProse
 */

import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@/components/icons';
import { IconButton } from '../primitives/IconButton';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { createStreamingSegments, toSegments, type Segment } from './agentMarkdown';

const CodeBlock = memo(function CodeBlock({ text }: { text: string }) {
  const { copy, isCopied } = useCopyToClipboard();
  return (
    <div className="agent-code">
      {/* Focusable: a long line scrolls sideways with the keyboard too. */}
      <pre tabIndex={0}>
        <code>{text}</code>
      </pre>
      <IconButton
        variant="ghost"
        size="compact"
        tabIndex={0}
        className="agent-code__copy"
        icon={isCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        onClick={() => void copy(text)}
        aria-label={isCopied ? 'Copied' : 'Copy code'}
        title={isCopied ? 'Copied' : 'Copy'}
      />
    </div>
  );
});

/**
 * A run of prose drawn block by block: a block whose HTML is what it was
 * keeps its nodes, and only the ones from the first change on are replaced.
 * The result is the same DOM as setting the joined HTML, one wrapper and the
 * blocks as its children, so spacing and the streaming caret are unchanged.
 * The HTML is the sanitizer's output (`sanitizeMessageHtml`), as it is for
 * `dangerouslySetInnerHTML`; a <template> parses it inert.
 */
function ProseRun({ parts }: { parts: readonly string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const drawn = useRef<{ html: string; nodes: ChildNode[] }[]>([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const before = drawn.current;
    let same = 0;
    while (same < before.length && same < parts.length && before[same].html === parts[same]) {
      same++;
    }
    for (const part of before.slice(same)) for (const node of part.nodes) node.remove();
    const now = before.slice(0, same);
    for (const html of parts.slice(same)) {
      const template = document.createElement('template');
      template.innerHTML = html;
      const nodes = Array.from(template.content.childNodes);
      el.append(template.content);
      now.push({ html, nodes });
    }
    drawn.current = now;
    focusableTables(el);
  }, [parts]);
  return <div ref={ref} className="agent-markdown__prose" />;
}

/**
 * A wide table scrolls sideways in its bubble, so keyboard users must be able
 * to reach it to scroll it (axe: scrollable-region-focusable). The sanitizer
 * keeps no attributes, so the tab stop is added once the HTML is in place.
 */
function focusableTables(el: HTMLElement) {
  for (const table of el.querySelectorAll('table')) {
    if (!table.hasAttribute('tabindex')) table.tabIndex = 0;
  }
}

function StaticProse({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) focusableTables(ref.current);
  }, [html]);
  return (
    <div ref={ref} className="agent-markdown__prose" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function ProseSegments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === 'code' ? (
          <CodeBlock key={i} text={segment.text} />
        ) : segment.parts ? (
          <ProseRun key={i} parts={segment.parts} />
        ) : (
          <StaticProse key={i} html={segment.html} />
        )
      )}
    </>
  );
}

/** Markdown prose with code blocks, shared by replies and agent-to-agent threads. */
export function Prose({ text }: { text: string }) {
  const segments = useMemo(() => toSegments(text), [text]);
  return <ProseSegments segments={segments} />;
}

/** Text revealed so far, parsed as it grows (only what changed is re-read and redrawn). */
export function GrowingProse({ text }: { text: string }) {
  const [segmentsFor] = useState(createStreamingSegments);
  const segments = useMemo(() => segmentsFor(text), [segmentsFor, text]);
  return <ProseSegments segments={segments} />;
}
