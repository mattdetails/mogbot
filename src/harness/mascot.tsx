/**
 * Standalone harness surface for the sidebar mascot
 * (components/workspace/SidebarMascot.tsx): every mood and state side by side,
 * large and at its real size, and live ones to play with (eyes follow the
 * pointer; hover, press, click, click four times fast). Either theme:
 *
 *   harness-mascot.html?theme=light
 *
 * Served only by the harness's Vite server. The real component and the real
 * stylesheet; nothing here is a mock-up.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PlayfulMascot,
  SidebarMascotFace,
  type MascotMood,
  type MascotState,
} from '../components/workspace/SidebarMascot';
import '../styles/index.css';
import './mascotGallery.css';

const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';
document.title = 'Sidebar mascot harness';

const STATES: { mood: MascotMood; state: MascotState; label: string }[] = [
  { mood: 'idle', state: 'awake', label: 'Quiet: blinks, glances around' },
  { mood: 'working', state: 'awake', label: 'Agents working: watches side to side' },
  { mood: 'needs-you', state: 'awake', label: 'Needs you: looks at the bell, hops' },
  { mood: 'idle', state: 'sleep', label: 'Asleep: after 90s with nothing going on' },
  { mood: 'idle', state: 'happy', label: 'Pointed at: happy eyes, blush' },
  { mood: 'idle', state: 'held', label: 'Pressed: squashed, eyes squeezed' },
  { mood: 'idle', state: 'poked', label: 'Clicked: jumps and spins' },
  { mood: 'idle', state: 'dizzy', label: 'Poked 4× fast: dizzy' },
];

function Cell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="mascot-gallery__cell">
      <div className="mascot-gallery__stage">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Gallery() {
  return (
    <main className="mascot-gallery">
      <h1>Sidebar mascot</h1>
      <p>
        Play with these: move the pointer around, hover, press and hold, click, click four times
        fast. The sleepy one wakes when the pointer moves (after 90 seconds still, any of them falls
        asleep).
      </p>
      <section className="mascot-gallery__row mascot-gallery__row--live">
        <Cell label="Live · quiet">
          <PlayfulMascot mood="idle" />
        </Cell>
        <Cell label="Live · agents working">
          <PlayfulMascot mood="working" />
        </Cell>
        <Cell label="Live · needs you">
          <PlayfulMascot mood="needs-you" />
        </Cell>
      </section>
      <h2>Every state</h2>
      <section className="mascot-gallery__row">
        {STATES.map((s) => (
          <Cell key={`${s.mood}-${s.state}`} label={s.label}>
            <SidebarMascotFace mood={s.mood} state={s.state} />
          </Cell>
        ))}
      </section>
      <h2>Real size</h2>
      <section className="mascot-gallery__row mascot-gallery__row--real">
        {STATES.map((s) => (
          <Cell key={`real-${s.mood}-${s.state}`} label={s.state === 'awake' ? s.mood : s.state}>
            <SidebarMascotFace mood={s.mood} state={s.state} />
          </Cell>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>
);
