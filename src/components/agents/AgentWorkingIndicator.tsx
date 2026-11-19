/**
 * The working line under the last message while an agent works. One line,
 * no bubble: the agent's key (`AgentKey`), pressed while it works, then what it's doing in
 * calm text with a soft shimmer while it's live, and muted at the end how
 * many steps so far and how long the turn has run:
 *
 *   [key] Running the Cypress tests · 5 steps · 6:02          Stop this step
 *         Test runs usually take a few minutes
 *         [its browser, live]
 *
 * The line itself is the toggle: pressing it opens the steps under it, in the
 * column the finished timeline uses, ending on the step it's on now with its
 * timer and output. Anything that hangs under the line (a hint, what a check
 * found, the live browser card) sits on the text's left edge; actions are
 * quiet text buttons at the line's right end. When the turn ends the line
 * gives way to "› Worked 6 min · 5 steps" in the same place, its chevron in
 * the column the key held.
 *
 * The words are steadied (`useSteadyLine`), so they don't flicker step to
 * step; the time sits in tabular figures at the end, so ticking moves nothing.
 *
 * @module components/agents/AgentWorkingIndicator
 */

import { useState, type ReactNode } from 'react';
import { TextButton } from '../primitives/TextButton';
import { TypingDots } from '../primitives/TypingDots';
import { useSteadyLine } from '../../hooks/useSteadyLine';
import type { Agent, TurnWork } from '../../lib/agents';
import { indicatorWords } from '../../../packages/companion-protocol/src/workIndicator';
import { Button } from '../primitives/Button';
import { AgentKey } from './AgentKey';
import { useLiveStep } from './AgentLiveStep';
import { WorkMenu } from './AgentTakeover';
import { useLiveWork } from './AgentWork';

interface WorkingIndicatorProps {
  activity: string | null;
  /** The turn's steps so far (`status.work`), and whose they are. */
  work?: TurnWork;
  agent?: Agent;
  /** It appeared after the chat opened: open its height rather than pop in. */
  entering?: boolean;
  /** The turn ended: collapse, then `onExited` unmounts it. */
  leaving?: boolean;
  onExited?: () => void;
  /** Where the turn answers, when it isn't this chat (a room). */
  place?: ReactNode;
  /**
   * Nothing to say yet stays wordless (the import bar above the composer
   * says what's happening). Otherwise a turn with no step yet says
   * "Thinking", as its sidebar row does.
   */
  bare?: boolean;
  /**
   * What waits on the user ("12 emails"): the row says "Needs your OK on …"
   * with a real Review, instead of a status.
   */
  needsOk?: { line: string; onReview: () => void };
  /** Its reply is streaming in: dots in a pill, no phrase. */
  typing?: boolean;
}

/**
 * What the line says before the engine has reported anything: the turn has
 * started (the engine is loading, or reading the message). Measured on the
 * fake engine and Claude Code, that is the first one to five seconds after
 * Send, and a pressed key with no words read as nothing happening. The
 * sidebar row has always said this word here (`workingRowLine`).
 */
export const NO_STEP_YET = 'Thinking';

export function WorkingIndicator({
  activity,
  work,
  agent,
  entering,
  leaving,
  onExited,
  place,
  bare,
  needsOk,
  typing,
}: WorkingIndicatorProps) {
  // Each step holds a moment and a blink of "Thinking" between two never
  // shows (the sidebar's rule), so the line doesn't flicker step to step.
  const steady = useSteadyLine(activity ?? '') || null;
  // Keep the last thing it said while it collapses, rather than blanking it.
  const [shown, setShown] = useState(steady);
  if (!leaving && steady !== shown) setShown(steady);
  // Only a change of activity crossfades; the first one is just there.
  const [first] = useState(shown);
  const step = useLiveStep({ agent, work, activity, leaving });
  const live = useLiveWork({ work, agent, activity, leaving, current: step.current });
  const [frozen, setFrozen] = useState<string | null>(null);
  // Once it has opened it stops clipping (the open clips its height, and the
  // key leading the line reaches a little past it).
  const [opened, setOpened] = useState(false);
  if (!entering && opened) setOpened(false);

  // One phrase from what was observed (`indicatorWords`): the step's own words,
  // "Working on it" before any, "Still working" when quiet, "3 of 8" only when
  // the step reports it, the timer from 8s. The Mac's own "No progress" line
  // (`step.text`) still wins when it says so.
  const said = indicatorWords(shown, work, step.now);
  const words = needsOk
    ? needsOk.line
    : (step.text ??
      (bare || leaving ? null : shown && !work ? shown : (said.phrase ?? NO_STEP_YET)));
  const meta =
    needsOk || step.quiet ? '' : [said.progress, said.elapsed].filter(Boolean).join(' · ');
  // While it collapses the time holds where it was.
  if (!leaving && frozen !== meta) setFrozen(meta);
  const tail = leaving ? frozen : meta;
  const shimmering = !step.quiet && !said.quiet && !needsOk && !leaving;

  const text = (
    <span className="agent-working__text">
      {words && (
        <span
          key={words}
          className="agent-working__activity"
          data-live={shimmering || undefined}
          data-changed={words !== first || undefined}
        >
          {words}
          {/* The light passing over the words: a brighter copy of them seen
              through a moving band, all transforms, so the compositor runs it
              (agents-work.css, "The shimmer"). The copy is CSS content, so the
              words are in the DOM once. */}
          {shimmering && (
            <span className="agent-working__glint" aria-hidden="true">
              <span className="agent-working__glint-band" data-text={words} />
            </span>
          )}
        </span>
      )}
      {/* The time ticks every second: read when asked, never announced. */}
      {tail && (
        <span className="agent-working__meta" aria-live="off">
          {words ? ` · ${tail}` : tail}
        </span>
      )}
    </span>
  );
  const under = step.under || step.browser;
  return (
    <div
      className="agent-chat__row agent-chat__row--agent agent-chat__row--working"
      data-work={work ? true : undefined}
      data-open={live.open || undefined}
      data-entering={(entering && !opened) || undefined}
      data-leaving={leaving || undefined}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        if (leaving) onExited?.();
        else if (entering) setOpened(true);
      }}
      aria-live="polite"
    >
      <div
        className="agent-working__line"
        data-quiet={step.quiet || said.quiet || undefined}
        data-needs-ok={needsOk ? true : undefined}
      >
        <span className="agent-working__lead" aria-hidden>
          {agent ? (
            <AgentKey
              id={agent.id}
              name={agent.name}
              color={agent.color}
              state={!step.quiet && !leaving ? 'working' : 'idle'}
              size="sm"
            />
          ) : (
            <TypingDots />
          )}
        </span>
        {place && <span className="agent-working__place">{place}</span>}
        {typing ? (
          // The reply is being written: the three dots in a pill, and nothing else.
          <span className="agent-working__pill" role="status">
            <TypingDots label={`${agent?.name ?? 'It'} is writing`} />
          </span>
        ) : live.toggle ? (
          <TextButton
            tabIndex={0}
            className="agent-working__toggle"
            aria-expanded={live.open}
            aria-controls={live.controls}
            // The row shows the timer only; the steps so far are said to assistive tech.
            aria-label={[
              words,
              tail,
              work && work.stepCount > 0
                ? `${work.stepCount} ${work.stepCount === 1 ? 'step' : 'steps'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            title={live.open ? 'Hide the steps' : 'Show the steps'}
            onClick={live.toggle}
          >
            {text}
          </TextButton>
        ) : (
          text
        )}
        {needsOk && !typing && (
          <Button
            tabIndex={0}
            variant="secondary"
            size="compact"
            className="agent-working__review"
            onClick={needsOk.onReview}
          >
            Review
          </Button>
        )}
        {(step.actions || (!leaving && agent)) && (
          <span className="agent-working__actions">
            {/* Its project and its session, one ⋯ away: not a row under every turn.
                First, so the text actions keep the right edge while it's hidden. */}
            {!leaving && agent && <WorkMenu agent={agent} />}
            {step.actions}
          </span>
        )}
      </div>
      {live.list}
      {under && (
        <div className="agent-working__under">
          {step.under}
          {step.browser}
        </div>
      )}
    </div>
  );
}
