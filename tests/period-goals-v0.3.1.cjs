const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index_v0.3.1.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'period_goals_v0.3.1.sql'), 'utf8');

const checks = [
  ['period goal table query', html, /from\('period_goals'\)/],
  ['period goal upsert conflict key', html, /onConflict: 'user_id,period_type,period_start'/],
  ['current-period-only prompt', html, /isCurrentPeriod/],
  ['explicit skipped status', html, /status: 'skipped'/],
  ['goal modal', html, /data-period-goal-modal/],
  ['week and month period types', sql, /period_type in \('week', 'month'\)/],
  ['RLS enabled', sql, /enable row level security/i],
  ['authenticated ownership select', sql, /for select to authenticated[\s\S]*auth\.uid\(\).*user_id/i],
  ['authenticated ownership update check', sql, /for update to authenticated[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/i],
  ['anon revoked', sql, /revoke all on table public\.period_goals from anon/i],
];

for (const [name, source, pattern] of checks) {
  if (!pattern.test(source)) throw new Error(`FAIL: ${name}`);
}

if (/weeklyGoal, isMonth/.test(html)) throw new Error('FAIL: legacy weekly conversion remains');
console.log('PASS period goals v0.3.1');

