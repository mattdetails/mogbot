/**
 * A plain title for a command card: what will happen, in a few words, read
 * from the command itself ("Delete ~/Exports/2024", "Install three@0.170.0",
 * "Run the tests", "Push main to origin"). The card said "Run a command" for
 * most of what Julian answered in a day, so every one meant reading the raw
 * command. Only the well-known shapes are named; anything else keeps the
 * Mac's own title ("Run a command"), never a guess. The raw command stays one
 * click away behind Details.
 *
 * @module lib/approvalTitle
 */

import type { Approval } from './model';

/** The titles the Mac gives a command it can't say more about. */
const GENERIC = new Set(['run a command', 'run command']);

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '');

/** The words of a simple command line, quotes dropped; null when it is a pipeline or has substitutions. */
function words(command: string): string[] | null {
  const line = command.trim().split('\n')[0];
  if (/[|;&`]|\$\(/.test(line)) return null;
  const parts = line.match(/"[^"]*"|'[^']*'|\S+/g);
  return parts ? parts.map(unquote) : null;
}

const NODE_TOOLS = new Set(['pnpm', 'npm', 'yarn', 'bun']);

/** What a command does, in a few words, or null when it isn't a shape we name. */
export function plainCommandTitle(command: string): string | null {
  const w = words(command);
  if (!w || w.length === 0) return null;
  const [bin, ...rest] = w;
  const args = rest.filter((a) => !a.startsWith('-'));

  if (bin === 'rm') {
    if (args.length === 0) return null;
    return args.length === 1 ? `Delete ${args[0]}` : `Delete ${args.length} items`;
  }
  if (bin === 'mkdir' && args.length > 0) return `Make the folder ${args[0]}`;
  if (bin === 'mv') return args.length === 2 ? `Move ${args[0]} to ${args[1]}` : 'Move files';
  if (bin === 'cp') return args.length === 2 ? `Copy ${args[0]} to ${args[1]}` : 'Copy files';
  if (bin === 'curl' || bin === 'wget') {
    const url = args.find((a) => /^https?:\/\//.test(a));
    if (!url) return null;
    try {
      return `Download from ${new URL(url).host}`;
    } catch {
      return null;
    }
  }
  if (bin === 'git') {
    const [sub, ...more] = args;
    if (sub === 'push') {
      const [remote, branch] = more;
      return remote && branch ? `Push ${branch} to ${remote}` : 'Push to the remote';
    }
    if (sub === 'commit') return 'Commit the changes';
    if (sub === 'pull') return 'Pull the latest changes';
    if (sub === 'merge' && more[0]) return `Merge ${more[0]}`;
    if ((sub === 'checkout' || sub === 'switch') && rest.includes('-b') && more[0]) {
      return `Make the branch ${more[0]}`;
    }
    return null;
  }
  if (NODE_TOOLS.has(bin)) {
    const [sub, ...more] = args;
    if (sub === 'add' || sub === 'install' || sub === 'i') {
      return more.length > 0 ? `Install ${more.join(', ')}` : 'Install the project’s packages';
    }
    const script = sub === 'run' ? more[0] : sub;
    if (script === 'test' || script === 'vitest' || script === 'jest') return 'Run the tests';
    if (script === 'build') return 'Build the project';
    if (script === 'dev' || script === 'start') return 'Start the dev server';
    if (script === 'lint') return 'Check the code style';
    if (script === 'typecheck') return 'Check the types';
    return null;
  }
  if (bin === 'vitest' || bin === 'jest' || bin === 'pytest') return 'Run the tests';
  if (bin === 'cargo' && args[0] === 'test') return 'Run the tests';
  if (bin === 'cargo' && args[0] === 'build') return 'Build the project';
  return null;
}

const VERB: Record<string, string> = {
  push: 'push',
  pull_request: 'open the pull request',
  merge: 'merge',
  issue: 'file the issue',
  comment: 'comment',
  release: 'release',
  deploy: 'deploy',
  publish: 'publish',
  post: 'post',
  send: 'send',
  request: 'make the request',
  github: 'do the GitHub step',
};

/**
 * "This one OK covers: send, post." What Allow on a plan covers: exactly its
 * listed actions, by kind and target, for an hour (`agents/plan_grant.rs`).
 * Null for a plan with no readable action.
 */
export function planScope(kinds: string[]): string | null {
  const verbs = [...new Set(kinds.map((k) => VERB[k] ?? k))];
  if (verbs.length === 0) return null;
  return `This one OK covers: ${verbs.join(', ')}. Each step runs without asking again for an hour.`;
}

/**
 * The title a card shows: the Mac's own, unless it is the generic "Run a
 * command" and the command is one we can name.
 */
export function plainApprovalTitle(
  approval: Pick<Approval, 'title' | 'tool' | 'detail' | 'input'>
): {
  title: string;
  /** The title came from reading the command: its raw text belongs behind Details. */
  plain: boolean;
} {
  if (!GENERIC.has(approval.title.trim().toLowerCase()))
    return { title: approval.title, plain: false };
  const input = approval.input as { command?: unknown } | undefined;
  const command =
    typeof input?.command === 'string'
      ? input.command
      : approval.tool === 'Bash'
        ? approval.detail
        : '';
  const named = command ? plainCommandTitle(command) : null;
  return named ? { title: named, plain: true } : { title: approval.title, plain: false };
}

/**
 * The title a card shows on the phone: `plainApprovalTitle`, and for a command
 * that copies, moves or deletes, the title names where it goes ("Copy
 * export/icons to ~/ShipStudio/acme-site") even when the Mac gave it a
 * general one ("Write files outside its folder"). A yes should say what it
 * says yes to; the whole command is under it.
 */
export function cardTitle(
  approval: Pick<Approval, 'title' | 'tool' | 'detail' | 'input'>
): string {
  const plain = plainApprovalTitle(approval);
  if (plain.plain) return plain.title;
  const input = approval.input as { command?: unknown } | undefined;
  const command =
    typeof input?.command === 'string'
      ? input.command
      : approval.tool === 'Bash'
        ? approval.detail
        : '';
  const named = command ? plainCommandTitle(command) : null;
  return named && /^(Copy|Move|Delete)\b/.test(named) ? named : plain.title;
}
