#!/usr/bin/env node
/**
 * The harness as another platform's webview draws it, from this Mac.
 *
 *   node scripts/harness-platforms.mjs <scenario> [<scenario>…] [--theme light|dark]
 *        [--engines windows,webkit] [--port 1425] [--out harness/shots/platforms]
 *
 * Engines (what each stands in for, and what it can't show):
 *   windows  Playwright Chromium at 125% scale with classic scrollbars: WebView2 is
 *            Chromium (Edge), so layout, CSS and JS match. Fonts are this Mac's, not
 *            Segoe UI, so text widths differ a little.
 *   webkit   Playwright WebKit: the same engine family as WKWebView and WebKitGTK
 *            (Linux), but the macOS build: no GTK fonts, scrollbars or form controls.
 *   linux    The same two engines run in Linux (Docker: the Playwright image), with
 *            Linux's fonts and scrollbars: see `docker run` in docs/ui-harness.md.
 *            Run this script inside the container with --engines linux-chromium,linux-webkit
 *            and --host host.docker.internal.
 *
 * Needs playwright-core (PLAYWRIGHT_CORE=<dir of the package>, else the npx cache's).
 * Takes the same scenario ids as harness-capture.mjs (`window.__harnessReady` says
 * when its scripted steps have run). Never a fixture-less state: it fails on any
 * command the scenario didn't mock, as the capture script does.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const valueIdx = new Set(['--theme', '--engines', '--port', '--out', '--host'].flatMap((f) => {
  const i = args.indexOf(f);
  return i === -1 ? [] : [i + 1];
}));
const scenarios = args.filter((a, i) => !a.startsWith('--') && !valueIdx.has(i));
const theme = opt('theme', 'dark');
const engines = opt('engines', 'windows,webkit').split(',');
const host = opt('host', '127.0.0.1');
const port = opt('port', process.env.SHIPSTUDIO_HARNESS_PORT ?? '1425');
const out = path.resolve(opt('out', 'harness/shots/platforms'));
if (scenarios.length === 0) {
  console.error('Name at least one scenario id (see harness-capture.mjs).');
  process.exit(2);
}

function playwright() {
  const dirs = [process.env.PLAYWRIGHT_CORE];
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) {
    for (const d of fs.readdirSync(npx)) dirs.push(path.join(npx, d, 'node_modules', 'playwright-core'));
  }
  for (const d of dirs.filter(Boolean)) {
    if (fs.existsSync(path.join(d, 'package.json'))) return createRequire(import.meta.url)(d);
  }
  throw new Error('playwright-core not found: set PLAYWRIGHT_CORE to its folder');
}

const { chromium, webkit } = playwright();

/** The newest browser Playwright already downloaded here, when its own version's isn't there. */
function cached(prefix, ...rest) {
  const base = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith(`${prefix}-`)).sort();
  const dir = dirs.pop();
  if (!dir) return undefined;
  const sub = fs.readdirSync(path.join(base, dir)).find((d) => d !== 'DEPENDENCIES_VALIDATED' && d !== 'INSTALLATION_COMPLETE');
  const file = path.join(base, dir, ...(sub && prefix !== 'webkit' ? [sub] : []), ...rest);
  return fs.existsSync(file) ? file : undefined;
}
const chromiumPath = process.env.CHROMIUM_PATH ?? cached('chromium_headless_shell', 'chrome-headless-shell');
const webkitPath =
  process.env.WEBKIT_PATH ?? cached('webkit', 'pw_run.sh');
const KIND = {
  windows: () =>
    chromium.launch({
      executablePath: chromiumPath,
      args: ['--disable-features=OverlayScrollbar', '--font-render-hinting=none'],
    }),
  'linux-chromium': () =>
    chromium.launch({ args: ['--disable-features=OverlayScrollbar', '--no-sandbox'] }),
  webkit: () => webkit.launch({ executablePath: webkitPath }),
  'linux-webkit': () => webkit.launch(),
};
const SCALE = { windows: 1.25 };

fs.mkdirSync(out, { recursive: true });
let failed = 0;
for (const engine of engines) {
  if (!KIND[engine]) {
    console.error(`unknown engine ${engine}`);
    process.exit(2);
  }
  const browser = await KIND[engine]();
  for (const id of scenarios) {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: SCALE[engine] ?? 2,
    });
    const page = await ctx.newPage();
    const url = `http://${host}:${port}/harness.html?chrome=off&theme=${theme}&scenario=${id}`;
    try {
      await page.goto(url);
      await page.waitForFunction('window.__harnessReady', null, { timeout: 25000 });
      const bad = await page.evaluate(() => ({
        unmocked: (window.__harness?.unhandled() ?? []).map((u) => u.cmd),
        steps: (window.__harness?.steps ?? []).filter((s) => s.startsWith('never appeared')),
      }));
      const file = path.join(out, `${id}.${engine}.${theme}.png`);
      await page.screenshot({ path: file });
      const problem = bad.unmocked.length || bad.steps.length;
      if (problem) failed++;
      console.log(`${problem ? '✗' : '✓'} ${engine} ${id} → ${file}`);
      if (problem) console.log(`   unmocked: ${bad.unmocked.join(', ')} ${bad.steps.join(', ')}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${engine} ${id}: ${String(e.message).split('\n')[0]}`);
    }
    await ctx.close();
  }
  await browser.close();
}
process.exit(failed ? 1 : 0);
