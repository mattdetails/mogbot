-- A dead token is looked up by itself on every APNs/FCM "gone" answer.
CREATE INDEX IF NOT EXISTS devices_token ON devices(token);

-- When a counter was last hit, so stale ones can be pruned (cron, daily).
ALTER TABLE rate ADD COLUMN at INTEGER NOT NULL DEFAULT 0;
