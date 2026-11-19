import { describe, expect, it } from 'vitest';
import { answeredWords, cantAlwaysAllow } from './answeredFrom';

describe('answeredWords', () => {
  it('says where an answer came from', () => {
    expect(answeredWords('allowed', 'phone')).toBe('Allowed on your phone');
    expect(answeredWords('allowed', 'phoneLockScreen')).toBe('Allowed from the Lock Screen');
    expect(answeredWords('allowed', 'admin')).toBe('Allowed by the Chief');
    expect(answeredWords('allowed', 'rule')).toBe('Allowed by your rule');
    expect(answeredWords('denied', 'phone')).toBe('Declined on your phone');
  });
  it('says nothing extra at the desk, when missing, or when nobody answered', () => {
    expect(answeredWords('allowed', 'desk')).toBeNull();
    expect(answeredWords('allowed', undefined)).toBeNull();
    expect(answeredWords('expired', 'phone')).toBeNull();
  });
});

describe('cantAlwaysAllow', () => {
  it('keys off the flag', () => {
    expect(cantAlwaysAllow({ alwaysRefused: true })).toBe(true);
    expect(cantAlwaysAllow({ alwaysRefused: false, alwaysNote: 'Can’t be always allowed: x' })).toBe(false);
  });
  it('falls back to the note’s words on an older Mac', () => {
    expect(cantAlwaysAllow({ alwaysNote: 'Can’t be always allowed: it sends mail.' })).toBe(true);
    expect(cantAlwaysAllow({ alwaysNote: "Can't be always allowed" })).toBe(true);
    expect(cantAlwaysAllow({ alwaysNote: 'Skips your Ask first rules.' })).toBe(false);
    expect(cantAlwaysAllow(undefined)).toBe(false);
  });
});
