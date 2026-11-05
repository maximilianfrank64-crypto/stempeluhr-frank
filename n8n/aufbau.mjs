// Creates or updates the Stempeluhr workflows in n8n through its public API.
// Usage: node n8n/aufbau.mjs            (key from env N8N_API_KEY, URL from N8N_URL)
// Workflows are matched by name; existing ones are updated in place, nothing is deleted.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.N8N_URL || 'https://zimaos.tail26a974.ts.net').replace(/\/$/, '');
const KEY = process.env.N8N_API_KEY;
if (!KEY) throw new Error('N8N_API_KEY fehlt');

const TABLE = { id: 'cHhdcJ0IqfiDkHop', name: 'Stempeluhr Frank' };
const CREDENTIAL = { id: 'hySGe81LEMQW9grR', name: 'Stempel APP Firma Frank' };
const ERROR_WORKFLOW = 'AIS4LFzeWYHx9o8A'; // "Fehler-Melder"
// The lists go by e-mail to Werner; his Claude checks the mailbox every 5 minutes.
// The SMTP credential is created by hand in n8n (Werner's S3-Medien mailbox).
const SMTP_CREDENTIAL_NAME = 'SMTP Werner Frank';
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
const tableRef = {
  __rl: true,
  value: TABLE.id,
  mode: 'list',
  cachedResultName: TABLE.name,
};
const settings = {
  executionOrder: 'v1',
  timezone: 'Europe/Berlin',
  errorWorkflow: ERROR_WORKFLOW,
  callerPolicy: 'workflowsFromSameOwner',
};

const eingang = {
  name: 'Stempeluhr - Eingang',
  settings,
  nodes: [
    {
      id: 'b1d2c3e4-0001-4a00-9000-000000000001',
      name: 'Stempel empfangen',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: 'stempeluhr',
      parameters: {
        httpMethod: 'POST',
        path: 'stempeluhr',
        authentication: 'headerAuth',
        responseMode: 'lastNode',
        options: { allowedOrigins: '*' },
      },
      credentials: { httpHeaderAuth: CREDENTIAL },
    },
    {
      id: 'b1d2c3e4-0001-4a00-9000-000000000002',
      name: 'Eingang pruefen',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [240, 0],
      parameters: { mode: 'runOnceForEachItem', jsCode: code('eingang.js') },
    },
    {
      id: 'b1d2c3e4-0001-4a00-9000-000000000003',
      name: 'Speichern',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [480, 0],
      parameters: {
        operation: 'upsert',
        dataTableId: tableRef,
        filters: { conditions: [{ keyName: 'key', keyValue: '={{ $json.key }}' }] },
        columns: {
          mappingMode: 'defineBelow',
          value: Object.fromEntries(COLUMNS.map((c) => [c, `={{ $json.${c} }}`])),
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
    },
  ],
  connections: {
    'Stempel empfangen': { main: [[{ node: 'Eingang pruefen', type: 'main', index: 0 }]] },
    'Eingang pruefen': { main: [[{ node: 'Speichern', type: 'main', index: 0 }]] },
  },
};

const smtp = (await api('GET', '/credentials?limit=250')).data.find(
  (c) => c.name === SMTP_CREDENTIAL_NAME,
);

const mailNode = {
  id: 'b1d2c3e4-0002-4a00-9000-000000000005',
  name: 'E-Mail an Werner',
  type: 'n8n-nodes-base.emailSend',
  typeVersion: 2.1,
  position: [1200, 0],
  parameters: {
    // Sender = the mailbox the SMTP credential belongs to. With Max's Gmail as sender, run:
    //   $env:MAIL_VON = 'maximilian.frank64@gmail.com'; node n8n/aufbau.mjs
    fromEmail: process.env.MAIL_VON || WERNER_EMAIL,
    toEmail: WERNER_EMAIL,
    subject: "={{ 'Stempeluhr: ' + $json.datei.replace('.xlsx', '').replaceAll('_', ' ') }}",
    emailFormat: 'text',
    text:
      "={{ 'Hallo Werner,\\n\\nim Anhang die Stundenliste aus der Stempeluhr (' + $json.datei + ').\\nZeilen mit einem Hinweis bitte nachfragen.\\n\\nAutomatisch erstellt von n8n.' }}",
    options: { attachments: 'data' },
  },
  ...(smtp && { credentials: { smtp: { id: smtp.id, name: smtp.name } } }),
};

/**
 * The report workflow. `trigger` lets the test copy start from a webhook; `last` is the
 * final node (the e-mail), left out in the test copy so testing never mails Werner.
 */
function bericht(name, trigger, berichtCode, last) {
  return {
    name,
    settings,
    nodes: [
      trigger,
      {
        id: 'b1d2c3e4-0002-4a00-9000-000000000002',
        name: 'Alle Eintraege holen',
        type: 'n8n-nodes-base.dataTable',
        typeVersion: 1.1,
        position: [240, 0],
        alwaysOutputData: true,
        parameters: { operation: 'get', dataTableId: tableRef, returnAll: true },
      },
      {
        id: 'b1d2c3e4-0002-4a00-9000-000000000003',
        name: 'Bericht bauen',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [480, 0],
        parameters: { mode: 'runOnceForAllItems', jsCode: berichtCode },
      },
      {
        id: 'b1d2c3e4-0002-4a00-9000-000000000004',
        name: 'Excel erstellen',
        type: 'n8n-nodes-base.convertToFile',
        typeVersion: 1.1,
        position: [720, 0],
        parameters: {
          operation: 'xlsx',
          options: { sheetName: 'Stunden', headerRow: true },
        },
      },
      {
        id: 'b1d2c3e4-0002-4a00-9000-000000000006',
        name: 'Dateiname setzen',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [960, 0],
        parameters: { mode: 'runOnceForAllItems', jsCode: code('dateiname.js') },
      },
      ...(last ? [last] : []),
    ],
    connections: {
      [trigger.name]: { main: [[{ node: 'Alle Eintraege holen', type: 'main', index: 0 }]] },
      'Alle Eintraege holen': { main: [[{ node: 'Bericht bauen', type: 'main', index: 0 }]] },
      'Bericht bauen': { main: [[{ node: 'Excel erstellen', type: 'main', index: 0 }]] },
      'Excel erstellen': { main: [[{ node: 'Dateiname setzen', type: 'main', index: 0 }]] },
      ...(last && { 'Dateiname setzen': { main: [[{ node: last.name, type: 'main', index: 0 }]] } }),
    },
  };
}

const schedule = {
  id: 'b1d2c3e4-0002-4a00-9000-000000000001',
  name: 'Jeden Abend 23:58 und 23:59',
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [0, 0],
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '58,59 23 * * *' }] } },
};

// Test copy: started by a webhook (only inside Tailscale) with a fixed "now" in the body,
// so week and month lists can be checked on any day. Inactive except while testing.
const testTrigger = {
  id: 'b1d2c3e4-0003-4a00-9000-000000000001',
  name: 'Testaufruf',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [0, 0],
  webhookId: 'stempeluhr-bericht-test',
  parameters: {
    httpMethod: 'POST',
    path: 'stempeluhr-bericht-test',
    authentication: 'headerAuth',
    responseMode: 'lastNode',
    // Returns the Excel file itself, so the test can open and check it.
    responseData: 'firstEntryBinary',
    options: {},
  },
  credentials: { httpHeaderAuth: CREDENTIAL },
};
const testCode = code('bericht.js').replace(
  'const now = Date.now();',
  "const now = new Date($('Testaufruf').first().json.body.jetzt).getTime();",
);

const wanted = [
  eingang,
  bericht('Stempeluhr - Bericht', schedule, code('bericht.js'), mailNode),
  bericht('TEST - Stempeluhr Bericht (Claude)', testTrigger, testCode, null),
];
if (!smtp) console.warn(`Hinweis: Zugangsdaten "${SMTP_CREDENTIAL_NAME}" fehlen noch in n8n.`);
if (!WERNER_EMAIL) console.warn('Hinweis: WERNER_EMAIL ist nicht gesetzt.');

const existing = (await api('GET', '/workflows?limit=250')).data;
for (const wf of wanted) {
  const found = existing.find((w) => w.name === wf.name);
  const saved = found
    ? await api('PUT', `/workflows/${found.id}`, wf)
    : await api('POST', '/workflows', wf);
  console.log(`${found ? 'aktualisiert' : 'angelegt'}: ${saved.name} (${saved.id})`);
}
