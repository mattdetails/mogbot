import type { ITheme, ITerminalOptions, Terminal } from '@xterm/xterm';
import type { ISearchDecorationOptions } from '@xterm/addon-search';
import { getResolvedTheme, subscribeTheme, type ResolvedTheme } from '../../lib/theme';

export type TerminalThemeVariant = 'normal' | 'onboarding' | 'build' | 'logs' | 'connection';

type TerminalVisualOptions = Pick<
  ITerminalOptions,
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'cursorBlink'
  | 'cursorStyle'
  | 'scrollback'
  | 'minimumContrastRatio'
>;

/*
 * These values intentionally live at the xterm API boundary. They are not CSS
 * values and cannot be represented by the app token cascade; each terminal
 * variant consumes these palettes through createTerminalOptions(), and
 * followAppTheme() swaps a live terminal between them.
 *
 * Backgrounds match --surface-app in each theme (#151413 / #f4f2ee), so a
 * terminal reads as part of the window rather than a box set into it.
 */
const DARK_TERMINAL_THEME: ITheme = {
  background: '#151413',
  foreground: '#d6d2ca',
  cursor: '#ffffff',
  selectionBackground: '#3a3835',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

/*
 * The light palette. Not the dark one inverted: ANSI colours are chosen to
 * read on near-white at the same weight the dark ones read on near-black
 * (GitHub light's terminal hues), and "white" / "brightWhite" — which CLIs use
 * for emphasis, assuming a dark background — become dark greys, or bold
 * output would vanish. minimumContrastRatio (below) is the safety net for
 * anything a program draws in a colour of its own.
 */
const LIGHT_TERMINAL_THEME: ITheme = {
  background: '#f4f2ee',
  foreground: '#1c1c1c',
  cursor: '#1c1c1c',
  cursorAccent: '#f4f2ee',
  selectionBackground: '#d6dbe2',
  black: '#1c1c1c',
  red: '#cf222e',
  green: '#1a7f37',
  yellow: '#9a6200',
  blue: '#0a63c9',
  magenta: '#8250df',
  cyan: '#18757c',
  white: '#555555',
  brightBlack: '#6b6b6b',
  brightRed: '#a40e26',
  brightGreen: '#116329',
  brightYellow: '#7d4e00',
  brightBlue: '#0550ae',
  brightMagenta: '#6639ba',
  brightCyan: '#136061',
  brightWhite: '#0d0d0d',
};

const TERMINAL_THEMES: Record<ResolvedTheme, ITheme> = {
  dark: DARK_TERMINAL_THEME,
  light: LIGHT_TERMINAL_THEME,
};

const STANDARD_TERMINAL_OPTIONS: TerminalVisualOptions = {
  fontFamily: '"JetBrainsMono NF", Menlo, Monaco, "Courier New", monospace',
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 5000,
  // Match VS Code's default and keep dim ANSI text readable on dark cells.
  minimumContrastRatio: 4.5,
};

const TERMINAL_VARIANT_OPTIONS: Record<TerminalThemeVariant, TerminalVisualOptions> = {
  normal: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13 },
  onboarding: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13 },
  build: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 12, cursorStyle: 'bar' },
  logs: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13, cursorBlink: false, scrollback: 10000 },
  connection: { ...STANDARD_TERMINAL_OPTIONS, fontSize: 13, scrollback: 1000 },
};

const TERMINAL_VARIANT_THEME: Record<
  ResolvedTheme,
  Record<TerminalThemeVariant, Partial<ITheme>>
> = {
  // Logs sit on the panel surface (--surface-panel) in both themes.
  dark: { normal: {}, onboarding: {}, build: {}, logs: { background: '#1c1b19' }, connection: {} },
  light: { normal: {}, onboarding: {}, build: {}, logs: { background: '#fdfcfa' }, connection: {} },
};

/*
 * Find in the terminal: every match a quiet amber wash, the current one a
 * stronger amber with a border, so it can be told apart without colour too.
 * Also at the xterm API boundary (the search addon takes #RRGGBB only).
 */
const TERMINAL_SEARCH_COLORS: Record<ResolvedTheme, ISearchDecorationOptions> = {
  dark: {
    matchBackground: '#4d3f17',
    matchOverviewRuler: '#a3812a',
    activeMatchBackground: '#7a5f14',
    activeMatchBorder: '#e5b93a',
    activeMatchColorOverviewRuler: '#e5b93a',
  },
  light: {
    matchBackground: '#f6e7b0',
    matchOverviewRuler: '#c99a1c',
    activeMatchBackground: '#f0cd5e',
    activeMatchBorder: '#9a6200',
    activeMatchColorOverviewRuler: '#9a6200',
  },
};

/** How find marks matches in a terminal (default: the theme currently painted). */
export function terminalSearchColors(
  theme: ResolvedTheme = getResolvedTheme()
): ISearchDecorationOptions {
  return TERMINAL_SEARCH_COLORS[theme];
}

/** The xterm palette for a variant on a theme (default: the theme currently painted). */
export function terminalTheme(
  variant: TerminalThemeVariant,
  theme: ResolvedTheme = getResolvedTheme()
): ITheme {
  return { ...TERMINAL_THEMES[theme], ...TERMINAL_VARIANT_THEME[theme][variant] };
}

/**
 * Build the shared xterm options for a terminal surface.
 *
 * Callers may provide lifecycle/input overrides, but visual options and the
 * palette stay explicit and centralized here.
 */
export function createTerminalOptions(
  variant: TerminalThemeVariant,
  overrides: Partial<ITerminalOptions> = {}
): ITerminalOptions {
  const { theme: themeOverride, ...behaviorOverrides } = overrides;

  return {
    ...TERMINAL_VARIANT_OPTIONS[variant],
    ...behaviorOverrides,
    theme: {
      ...terminalTheme(variant),
      ...themeOverride,
    },
  };
}

/**
 * Keep a live terminal's palette in step with the app theme. Call once after
 * `new Terminal(createTerminalOptions(variant))`; it unsubscribes itself when
 * the terminal is disposed, and the returned function does so early.
 */
export function followAppTheme(
  term: Terminal,
  variant: TerminalThemeVariant,
  override: Partial<ITheme> = {}
): () => void {
  let current = getResolvedTheme();
  const unsubscribe = subscribeTheme(() => {
    const next = getResolvedTheme();
    if (next === current) return;
    current = next;
    try {
      term.options.theme = { ...terminalTheme(variant, next), ...override };
    } catch {
      unsubscribe();
    }
  });
  const dispose = term.dispose.bind(term);
  term.dispose = () => {
    unsubscribe();
    dispose();
  };
  return unsubscribe;
}
