/**
 * TabAccountBar — the bar at the foot of a terminal tab whose account ran out
 * of usage (`lib/tabAccounts`). One line, said by the backend, and at most one
 * decision: "Continue on <account>" when the user chose to be asked, else just
 * Dismiss. A switch made on its own shows no bar; the tab says it in a line.
 *
 * @module components/terminal/TabAccountBar
 */

import { Button } from '../primitives/Button';
import type { TabAccountNotice } from '../../lib/tabAccounts';
import '../../styles/features/tab-account-bar.css';

interface TabAccountBarProps {
  notice: TabAccountNotice;
  onContinue: () => void;
  onDismiss: () => void;
}

/** "Personal is out of usage until 10:30 PM." from the switch line's reason. */
function askLine(notice: TabAccountNotice): string {
  const reason = notice.line.split(': ').slice(1).join(': ');
  if (!reason) return 'This account is out of usage.';
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

export function TabAccountBar({ notice, onContinue, onDismiss }: TabAccountBarProps) {
  const asking = notice.kind === 'switch' && notice.ask;
  return (
    <div className="tab-account-bar" role="status">
      <span className="tab-account-bar-text">{asking ? askLine(notice) : notice.line}</span>
      {asking && notice.to && (
        <Button variant="strong" size="compact" onClick={onContinue}>
          Continue on {notice.to}
        </Button>
      )}
      <Button variant="ghost" size="compact" onClick={onDismiss}>
        {asking ? 'Not now' : 'Dismiss'}
      </Button>
    </div>
  );
}
