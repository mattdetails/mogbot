import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TERMINAL_ONLY_KEY,
  isTerminalOnly,
  parseTerminalOnly,
  reloadTerminalOnly,
  setTerminalOnly,
  toggleTerminalOnly,
  useTerminalOnly,
} from './terminalOnly';

describe('terminalOnly', () => {
  beforeEach(() => {
    localStorage.removeItem(TERMINAL_ONLY_KEY);
    reloadTerminalOnly();
  });

  it('reads only project paths from whatever was saved', () => {
    expect([...parseTerminalOnly('["/a", 3, null, "/b"]')]).toEqual(['/a', '/b']);
    expect(parseTerminalOnly('{"on":true}').size).toBe(0);
    expect(parseTerminalOnly('not json').size).toBe(0);
    expect(parseTerminalOnly(null).size).toBe(0);
  });

  it('is remembered per project, and survives a reload', () => {
    setTerminalOnly('/projects/api', true);
    expect(isTerminalOnly('/projects/api')).toBe(true);
    expect(isTerminalOnly('/projects/site')).toBe(false);
    expect(JSON.parse(localStorage.getItem(TERMINAL_ONLY_KEY) ?? '[]')).toEqual(['/projects/api']);

    reloadTerminalOnly();
    expect(isTerminalOnly('/projects/api')).toBe(true);
  });

  it('never counts a missing project', () => {
    expect(isTerminalOnly(null)).toBe(false);
    expect(isTerminalOnly(undefined)).toBe(false);
  });

  it('tells subscribers when it changes', () => {
    const { result } = renderHook(() => useTerminalOnly('/projects/api'));
    expect(result.current).toBe(false);
    act(() => toggleTerminalOnly('/projects/api'));
    expect(result.current).toBe(true);
    act(() => toggleTerminalOnly('/projects/api'));
    expect(result.current).toBe(false);
  });
});
