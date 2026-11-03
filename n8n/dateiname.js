// n8n Code node "Dateiname setzen" (Mode: Run Once for All Items), JavaScript.
// Gives the Excel file the name chosen by "Bericht bauen". Expressions in other nodes
// cannot read $execution.customData, Code nodes can.
const datei = $execution.customData.get('datei');
if (!datei) throw new Error('Dateiname fehlt (Bericht bauen hat keinen gesetzt)');
return $input.all().map((item) => {
  item.binary.data.fileName = datei;
  item.json = { datei };
  return item;
});
