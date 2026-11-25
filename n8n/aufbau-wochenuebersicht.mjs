// Creates/updates "Stempeluhr - Wochenuebersicht" (Monday 07:30, mail body with hours per employee).
// Usage: node n8n/aufbau-wochenuebersicht.mjs [aktivieren]   (key from env N8N_API_KEY)
// With env TEST_MAIL_TO a separate test copy is made that mails only that address.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.N8N_URL || 'https://zimaos.tail26a974.ts.net').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
if (!KEY) throw new Error('N8N_API_KEY fehlt');
const TO = process.env.TEST_MAIL_TO || 'info@stukkateur-frank.de';
const api = async (m, p, b) => {
  const r = await fetch(`${BASE}/api/v1${p}`, {
    method: m,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json; charset=utf-8' },
    body: b ? JSON.stringify(b) : undefined,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${m} ${p}: ${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
};
const name = process.env.TEST_MAIL_TO ? 'TEST - Stempeluhr Wochenuebersicht (Claude)' : 'Stempeluhr - Wochenuebersicht';
const link = (node) => ({ main: [[{ node, type: 'main', index: 0 }]] });
const wf = {
  name,
  nodes: [
    { id: 'c1000000-0001-4a00-9000-000000000001', name: 'Montag 07:30', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 7 * * 1' }] } } },
    { id: 'c1000000-0001-4a00-9000-000000000002', name: 'Alle Eintraege holen', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [240, 0], alwaysOutputData: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, parameters: { operation: 'get', dataTableId: { __rl: true, value: 'cHhdcJ0IqfiDkHop', mode: 'list', cachedResultName: 'Stempeluhr Frank' }, returnAll: true } },
    { id: 'c1000000-0001-4a00-9000-000000000003', name: 'Woche zusammenfassen', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0], parameters: { mode: 'runOnceForAllItems', jsCode: readFileSync(join(here, 'wochenuebersicht.js'), 'utf8') } },
    { id: 'c1000000-0001-4a00-9000-000000000004', name: 'E-Mail an Werner', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [720, 0], credentials: { gmailOAuth2: { id: 'eQkvVzTfzaqAEoBF', name: 'Gmail Chantal' } }, parameters: { authentication: 'oAuth2', resource: 'message', operation: 'send', sendTo: TO, subject: '={{ $json.subject }}', emailType: 'text', message: '={{ $json.text }}', options: {} } },
  ],
  connections: {
    'Montag 07:30': link('Alle Eintraege holen'),
    'Alle Eintraege holen': link('Woche zusammenfassen'),
    'Woche zusammenfassen': link('E-Mail an Werner'),
  },
  settings: { executionOrder: 'v1', timezone: 'Europe/Berlin', errorWorkflow: 'AIS4LFzeWYHx9o8A', callerPolicy: 'workflowsFromSameOwner' },
};
const alt = (await api('GET', '/workflows?limit=250')).data.find((w) => w.name === name);
const w = alt ? await api('PUT', `/workflows/${alt.id}`, wf) : await api('POST', '/workflows', wf);
console.log('Workflow', w.id, name);
if (process.argv[2] === 'aktivieren') {
  await api('POST', `/workflows/${w.id}/activate`, {});
  console.log('aktiv');
}
