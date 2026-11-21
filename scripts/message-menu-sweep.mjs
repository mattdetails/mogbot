#!/usr/bin/env node
/**
 * The message ⋯ with real input (spec-message-hover.md), against the harness:
 *
 *   node scripts/message-menu-sweep.mjs --theme light --out <dir>
 *
 * 1. Hover sweep over `agents-message-menu-many`: the pointer moves down the
 *    chat a few pixels at a time. At every step at most one ⋯ shows, it is the
 *    one on the row under the pointer, each row's ⋯ is at the same place every
 *    time, and no bubble moves. Frames go to <out>/sweep-*.png and, with
 *    ffmpeg, <out>/sweep.gif.
 * 2. Hover shots: your message and the agent's, pointer on the bubble.
 * 3. Keyboard over `agents-message-menu-keyboard`: Tab reaches a ⋯, Enter
 *    opens its menu with focus inside, Esc closes it and focus is back on
 *    the same ⋯. Shots at each step.
 *
 * Exits non-zero, with the reason, when any check fails. The harness must be
 * running (SHIPSTUDIO_HARNESS_PORT, default 1425).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { launchChrome } from './headless-chrome.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const theme = arg('theme', 'light');
const out = arg('out', 'harness/shots/message-menu');
const port = Number(process.env.SHIPSTUDIO_HARNESS_PORT ?? 1425);
mkdirSync(out, { recursive: true });

const failures = [];
const fail = (why) => {
  failures.push(why);
  console.error(`✗ ${why}`);
};

const { port: cdp, close } = await launchChrome({ tool: 'message-menu-sweep', basePort: 9791 });
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${cdp}/json`)).json();
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const evaluate = async (expr) =>
    (
      await send('Runtime.evaluate', {
        expression: `(()=>{${expr}})()`,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.result?.value;
  const shot = async (name) => {
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const key = async (k, code = k) => {
    const keyCode = { Tab: 9, Enter: 13, Escape: 27 }[k];
    // Enter carries its text, as a real key does, so the focused button clicks.
    const text = k === 'Enter' ? '\r' : undefined;
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: k,
      code,
      windowsVirtualKeyCode: keyCode,
      text,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: k,
      code,
      windowsVirtualKeyCode: keyCode,
    });
    await wait(150);
  };
  const open = async (scenario, width = 1280, height = 900) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    });
    await send('Page.navigate', {
      url: `http://127.0.0.1:${port}/harness.html?chrome=off&theme=${theme}&scenario=${scenario}`,
    });
    await wait(5000);
  };

  // 1. The sweep.
  await open('agents-message-menu-many');
  const layout = await evaluate(`
    const rows = [...document.querySelectorAll('.agent-chat__row')].filter((r) => r.querySelector('.agent-message__more'));
    const col = document.querySelector('.agent-chat__messages').getBoundingClientRect();
    return { x: Math.round(col.left + col.width / 2), top: Math.round(rows[0].getBoundingClientRect().top), bottom: Math.round(rows[rows.length - 1].getBoundingClientRect().bottom), rows: rows.length };
  `);
  const STATE = `
    const rows = [...document.querySelectorAll('.agent-chat__row')].filter((r) => r.querySelector('.agent-message__more'));
    return rows.map((r) => {
      const m = r.querySelector('.agent-message__tools');
      const b = r.querySelector('.agent-bubble').getBoundingClientRect();
      const t = m.getBoundingClientRect();
      return { shown: getComputedStyle(m).opacity === '1', hovered: r.matches(':hover'), dots: [Math.round(t.left), Math.round(t.top)], bubble: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] };
    });
  `;
  const first = await evaluate(STATE);
  const seen = new Map();
  let frame = 0;
  let steps = 0;
  for (let y = layout.top - 10; y <= layout.bottom + 10; y += 6) {
    await move(layout.x, y);
    await wait(140);
    const now = await evaluate(STATE);
    steps++;
    const shown = now.filter((r) => r.shown);
    if (shown.length > 1) fail(`y ${y}: ${shown.length} ⋯ showing at once`);
    now.forEach((r, i) => {
      if (r.shown && !r.hovered)
        fail(`y ${y}: row ${i}'s ⋯ shows without its row under the pointer`);
      if (r.bubble.join() !== first[i].bubble.join()) fail(`y ${y}: row ${i}'s bubble moved`);
      const at = seen.get(i);
      if (r.shown) {
        if (at && at !== r.dots.join()) fail(`y ${y}: row ${i}'s ⋯ jumped from ${at} to ${r.dots}`);
        seen.set(i, r.dots.join());
      }
    });
    if (steps % 4 === 0) await shot(`sweep-${String(frame++).padStart(3, '0')}`);
  }
  console.log(
    `sweep: ${steps} steps over ${layout.rows} messages, ${seen.size} ⋯ seen, ${frame} frames`
  );
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      '6',
      '-i',
      join(out, 'sweep-%03d.png'),
      '-vf',
      'scale=1280:-1',
      join(out, 'sweep.gif'),
    ]);
  } catch {
    console.log('(no gif: ffmpeg missing or failed)');
  }

  // 2. Hover shots.
  for (const who of ['user', 'agent']) {
    const at = await evaluate(`
      // The last of each, on screen (the first is scrolled away above).
      const all = document.querySelectorAll('.agent-chat__row--${who} .agent-bubble');
      const b = all[all.length - 1].getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    `);
    await move(at.x, at.y);
    await wait(300);
    await shot(`hover-${who}`);
  }

  // 3. The keyboard.
  await open('agents-message-menu-keyboard');
  await evaluate(
    `document.activeElement?.blur(); document.querySelector('.agent-composer__input')?.focus(); return 1;`
  );
  let reached = null;
  for (let i = 0; i < 40 && !reached; i++) {
    await key('Tab');
    reached = await evaluate(
      `const a = document.activeElement; return a?.classList.contains('agent-message__more') ? a.closest('.agent-chat__row')?.dataset.messageIds ?? 'yes' : null;`
    );
  }
  if (!reached) fail('Tab never reached a message ⋯');
  else {
    await shot('keyboard-1-focused');
    await key('Enter', 'Enter');
    await wait(300);
    const opened = await evaluate(
      `const m = document.querySelector('.agent-message__menu'); return { open: !!m && m.dataset.state === 'open', inside: !!m?.contains(document.activeElement), first: document.activeElement?.textContent?.trim() };`
    );
    if (!opened.open) fail('Enter did not open the menu');
    if (!opened.inside) fail('focus did not move into the menu');
    await shot('keyboard-2-open');
    await key('Escape');
    await wait(400);
    const back = await evaluate(
      `const a = document.activeElement; return { closed: !document.querySelector('.agent-message__menu[data-state="open"]'), on: a?.classList.contains('agent-message__more') ? a.closest('.agent-chat__row')?.dataset.messageIds ?? 'yes' : null };`
    );
    if (!back.closed) fail('Esc did not close the menu');
    if (back.on !== reached)
      fail(`focus went to ${back.on}, not back to the ⋯ it came from (${reached})`);
    await shot('keyboard-3-closed');
    console.log(
      `keyboard: Tab reached ${reached}; Enter opened with “${opened.first}” focused; Esc closed, focus back: ${back.on === reached}`
    );
  }
  ws.close();
} finally {
  close();
}
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log(`all checks passed (${theme}) → ${out}`);
