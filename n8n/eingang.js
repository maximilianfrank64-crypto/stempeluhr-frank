// n8n Code node "Eingang pruefen" (Mode: Run Once for Each Item).
// Turns one message from the app into one row for the Data Table "stempel".
// The row key is unique per record, so the table node can simply upsert on "key".

const body = typeof $json.body === 'string' ? JSON.parse($json.body) : $json.body;
const item = body && body.item;
if (!body || body.v !== 1 || !item || typeof body.employee !== 'string' || !body.deviceId) {
  throw new Error('Unbekanntes Format');
}

let key;
let date;
if (item.kind === 'shift' || item.kind === 'shiftDeleted') {
  key = `shift:${item.id}`;
  date = item.kind === 'shift' ? item.date : '';
} else if (item.kind === 'dayNote') {
  // Day notes are per phone, shift ids are unique anyway.
  key = `note:${body.deviceId}:${item.date}`;
  date = item.date;
} else {
  throw new Error(`Unbekannte Art: ${item.kind}`);
}

return {
  json: {
    key,
    kind: item.kind,
    employee: body.employee.trim().slice(0, 80),
    deviceId: String(body.deviceId).slice(0, 64),
    date,
    data: JSON.stringify(item),
    receivedAt: new Date().toISOString(),
  },
};
