import { describe, expect, it } from 'vitest';
import { plainApprovalTitle, plainCommandTitle, planScope } from './approvalTitle';

describe('plainCommandTitle', () => {
  it('names what the well-known commands do', () => {
    expect(plainCommandTitle('rm -r ~/Exports/2024')).toBe('Delete ~/Exports/2024');
    expect(plainCommandTitle('rm -rf a b c')).toBe('Delete 3 items');
    expect(plainCommandTitle('pnpm add three@0.170.0')).toBe('Install three@0.170.0');
    expect(plainCommandTitle('pnpm install')).toBe('Install the project’s packages');
    expect(plainCommandTitle('pnpm test')).toBe('Run the tests');
    expect(plainCommandTitle('npm run build')).toBe('Build the project');
    expect(plainCommandTitle('git push origin main')).toBe('Push main to origin');
    expect(plainCommandTitle('git commit -m "x"')).toBe('Commit the changes');
    expect(plainCommandTitle('curl -s https://example.com/a')).toBe('Download from example.com');
  });
  it('says nothing for what it can’t read plainly', () => {
    expect(plainCommandTitle('cat a | grep b')).toBeNull();
    expect(plainCommandTitle('rm -rf $(ls)')).toBeNull();
    expect(plainCommandTitle('./deploy.sh --prod')).toBeNull();
    expect(plainCommandTitle('')).toBeNull();
  });
});

describe('planScope', () => {
  it('says what one OK covers, once per kind', () => {
    expect(planScope(['send', 'send', 'post'])).toBe(
      'This one OK covers: send, post. Each step runs without asking again for an hour.'
    );
    expect(planScope([])).toBeNull();
  });
});

describe('plainApprovalTitle', () => {
  const card = (over: Record<string, unknown>) =>
    ({ title: 'Run a command', detail: '', tool: 'Bash', ...over }) as never;
  it('replaces only the generic title, from the command', () => {
    expect(plainApprovalTitle(card({ input: { command: 'pnpm test' } }))).toEqual({
      title: 'Run the tests',
      plain: true,
    });
    expect(plainApprovalTitle(card({ title: 'Edit Hero.tsx?' }))).toEqual({
      title: 'Edit Hero.tsx?',
      plain: false,
    });
    expect(plainApprovalTitle(card({ detail: './deploy.sh' }))).toEqual({
      title: 'Run a command',
      plain: false,
    });
  });
});
