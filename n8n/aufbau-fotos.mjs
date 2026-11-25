// Creates or updates the two Rapport-photo workflows in n8n (kept apart from aufbau.mjs,
// whose report workflow was changed by hand in n8n and must not be overwritten).
// Usage: node n8n/aufbau-fotos.mjs        (key from env N8N_API_KEY, URL from N8N_URL)
// "Stempeluhr - Rapport-Fotos" is created INACTIVE: switching it on is up to a person.
// The test copy is started by a webhook with fake rows in the body and mails nobody.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.N8N_URL || 'https://zimaos.tail26a974.ts.net').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
if (!KEY) throw new Error('N8N_API_KEY fehlt');

const TABLE = { id: 'cHhdcJ0IqfiDkHop', name: 'Stempeluhr Frank' };
const CREDENTIAL = { id: 'hySGe81LEMQW9grR', name: 'Stempel APP Firma Frank' };
const GMAIL = { id: 'eQkvVzTfzaqAEoBF', name: 'Gmail Chantal' }; // same sender as the report workflow
const ERROR_WORKFLOW = 'AIS4LFzeWYHx9o8A'; // "Fehler-Melder"
const WERNER_EMAIL = process.env.WERNER_EMAIL || 'info@stukkateur-frank.de';
const COLUMNS = ['key', 'kind', 'employee', 'deviceId', 'date', 'data', 'receivedAt'];

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const code = (file) => readFileSync(join(here, file), 'utf8');
const tableRef = { __rl: true, value: TABLE.id, mode: 'list', cachedResultName: TABLE.name };
const settings = {
  executionOrder: 'v1',
  timezone: 'Europe/Berlin',
  errorWorkflow: ERROR_WORKFLOW,
  callerPolicy: 'workflowsFromSameOwner',
};
const link = (node) => ({ main: [[{ node, type: 'main', index: 0 }]] });

const fotosNode = (position) => ({
  id: 'b1d2c3e4-0004-4a00-9000-000000000003',
  name: 'Fotos aufbereiten',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position,
  parameters: { mode: 'runOnceForAllItems', jsCode: code('fotos.js') },
});

const merkenNode = (position) => (
{
    id: 'b1d2c3e4-0004-4a00-9000-000000000005',
      name: 'Als versendet merken',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position,
      parameters: {
        operation: 'upsert',
        dataTableId: tableRef,
        filters: {
          conditions: [{ keyName: 'key', keyValue: "={{ $('Fotos aufbereiten').item.json.markerKey }}" }],
        },
        columns: {
          mappingMode: 'defineBelow',
          value: {
            key: "={{ $('Fotos aufbereiten').item.json.markerKey }}",
            kind: 'fotoversand',
            employee: "={{ $('Fotos aufbereiten').item.json.employee }}",
            deviceId: '',
            date: "={{ $('Fotos aufbereiten').item.json.date }}",
            data: "={{ JSON.stringify({ hash: $('Fotos aufbereiten').item.json.hash }) }}",
            receivedAt: '={{ new Date().toISOString() }}',
          },
          matchingColumns: [],
          schema: COLUMNS.map((c) => ({
            id: c,
            displayName: c,
            required: false,
            defaultMatch: false,
            display: true,
            type: 'string',
            readOnly: false,
            removed: false,
          })),
        },
      },
    }
);

const produktiv = {
  name: 'Stempeluhr - Rapport-Fotos',
  settings,
  nodes: [
    {
      id: 'b1d2c3e4-0004-4a00-9000-000000000001',
      name: 'Jeden Abend 19:00 und Morgen 06:30',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: {
        rule: {
          interval: [
            { field: 'cronExpression', expression: '0 19 * * *' },
            { field: 'cronExpression', expression: '30 6 * * *' },
          ],
        },
      },
    },
    {
      id: 'b1d2c3e4-0004-4a00-9000-000000000002',
      name: 'Alle Eintraege holen',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [240, 0],
      alwaysOutputData: true,
      parameters: { operation: 'get', dataTableId: tableRef, returnAll: true },
    },
    fotosNode([480, 0]),
    {
      id: 'b1d2c3e4-0004-4a00-9000-000000000004',
      name: 'E-Mail an Werner',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: [720, 0],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 5000,
      parameters: {
        authentication: 'oAuth2',
        resource: 'message',
        operation: 'send',
        sendTo: WERNER_EMAIL,
        subject: '={{ $json.betreff }}',
        emailType: 'text',
        message: '={{ $json.text }}',
        options: { attachmentsUi: { attachmentsBinary: [{ property: 'data' }] } },
      },
      credentials: { gmailOAuth2: GMAIL },
    },
    merkenNode([960, 0]),
  ],
  connections: {
    'Jeden Abend 19:00 und Morgen 06:30': link('Alle Eintraege holen'),
    'Alle Eintraege holen': link('Fotos aufbereiten'),
    'Fotos aufbereiten': link('E-Mail an Werner'),
    'E-Mail an Werner': link('Als versendet merken'),
  },
};

// Test copy: fake table rows in the body ({"rows": [...]}), answers with the planned mails. Mails nobody.
const test = {
  name: 'TEST - Stempeluhr Rapport-Fotos (Claude)',
  settings,
  nodes: [
    {
      id: 'b1d2c3e4-0005-4a00-9000-000000000001',
      name: 'Testaufruf',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'stempeluhr-fotos-test',
      parameters: {
        httpMethod: 'POST',
        path: 'stempeluhr-fotos-test',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        options: {},
      },
      // Test only: its own throw-away key (TEST_CREDENTIAL = "<id>|<name>"), never the company key.
      credentials: { httpHeaderAuth: process.env.TEST_CREDENTIAL ? { id: process.env.TEST_CREDENTIAL.split('|')[0], name: process.env.TEST_CREDENTIAL.split('|')[1] } : CREDENTIAL },
    },
    {
      id: 'b1d2c3e4-0005-4a00-9000-000000000002',
      name: 'Testzeilen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [240, 0],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: "return ($('Testaufruf').first().json.body.rows || []).map((json) => ({ json }));",
      },
    },
    fotosNode([480, 0]),
    // Only when TEST_MAIL_TO is set (e.g. Max's own address): proves the mail with attachment.
    ...(process.env.TEST_MAIL_TO
      ? [
          {
            id: 'b1d2c3e4-0005-4a00-9000-000000000004',
            name: 'Test-Mail an Max',
            type: 'n8n-nodes-base.gmail',
            typeVersion: 2.1,
            position: [720, 0],
            parameters: {
              authentication: 'oAuth2',
              resource: 'message',
              operation: 'send',
              sendTo: process.env.TEST_MAIL_TO,
              subject: '={{ "TEST " + $json.betreff }}',
              emailType: 'text',
              message: '={{ $json.text }}',
              options: { attachmentsUi: { attachmentsBinary: [{ property: 'data' }] } },
            },
            credentials: { gmailOAuth2: GMAIL },
          },
          { ...merkenNode([960, 0]), id: 'b1d2c3e4-0005-4a00-9000-000000000005' },
          {
            id: 'b1d2c3e4-0005-4a00-9000-000000000006',
            name: 'Marker zur Kontrolle',
            type: 'n8n-nodes-base.dataTable',
            typeVersion: 1.1,
            position: [1200, 0],
            parameters: {
              operation: 'get',
              dataTableId: tableRef,
              returnAll: true,
              filters: { conditions: [{ keyName: 'kind', keyValue: 'fotoversand' }] },
            },
          },
        ]
      : []),
  ],
  connections: {
    Testaufruf: link('Testzeilen'),
    Testzeilen: link('Fotos aufbereiten'),
    ...(process.env.TEST_MAIL_TO && {
      'Fotos aufbereiten': link('Test-Mail an Max'),
      'Test-Mail an Max': link('Als versendet merken'),
      'Als versendet merken': link('Marker zur Kontrolle'),
    }),
  },
};

const existing = (await api('GET', '/workflows?limit=250')).data;
for (const wf of [produktiv, test]) {
  const found = existing.find((w) => w.name === wf.name);
  const saved = found
    ? await api('PUT', `/workflows/${found.id}`, wf)
    : await api('POST', '/workflows', wf);
  console.log(`${found ? 'aktualisiert' : 'angelegt'}: ${saved.name} (${saved.id}), aktiv=${saved.active}`);
}
