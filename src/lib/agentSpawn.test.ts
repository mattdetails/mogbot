import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';

vi.mock('@tauri-apps/api/path', () => ({ homeDir: () => Promise.resolve('/Users/me') }));
vi.mock('./project', () => ({
  getShellPath: () => Promise.resolve('/usr/bin'),
  getSystemEnv: () => Promise.resolve({}),
}));
vi.mock('./setup', () => ({
  isWindows: () => false,
  isMac: () => true,
  needsCmdExeWrapper: () => false,
  resolveCliPath: () => Promise.resolve(null),
}));
vi.mock('./attached-libraries', () => ({ attachedLibraryDirs: () => Promise.resolve([]) }));

import { buildAgentSpawn } from './agentSpawn';
import { CLAUDE_CODE, CODEX, TERMINAL } from './agent';

const withModel = (model: string | null) => {
  const asked: string[] = [];
  mockIPC((cmd, args) => {
    if (cmd !== 'agents_terminal_model') return null;
    asked.push((args as { agentId: string }).agentId);
    return model;
  });
  return asked;
};

describe('a project terminal opens on the model chosen in Settings → Agents', () => {
  afterEach(() => clearMocks());

  it('Codex gets -m before its opening prompt', async () => {
    withModel('gpt-5.5');
    const spawn = await buildAgentSpawn({
      agent: CODEX,
      projectPath: '/p',
      initialPrompt: 'hi',
    });
    expect(spawn.args).toEqual(['-m', 'gpt-5.5', 'hi']);
  });

  it('Claude Code gets --model', async () => {
    withModel('opus');
    const spawn = await buildAgentSpawn({ agent: CLAUDE_CODE, projectPath: '/p' });
    expect(spawn.args.slice(0, 2)).toEqual(['--model', 'opus']);
  });

  it('no choice, a failed read or a plain terminal: no model flag', async () => {
    withModel(null);
    expect((await buildAgentSpawn({ agent: CODEX, projectPath: '/p' })).args).toEqual([]);
    mockIPC(() => {
      throw new Error('gone');
    });
    expect((await buildAgentSpawn({ agent: CODEX, projectPath: '/p' })).args).toEqual([]);
    const asked = withModel('opus');
    await buildAgentSpawn({ agent: TERMINAL, projectPath: '/p' });
    expect(asked).toEqual([]);
  });
});
