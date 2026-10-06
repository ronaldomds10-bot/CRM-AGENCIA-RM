const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

// Exercise the production editor's rendered callbacks with isolated hook state.
const source = fs.readFileSync(path.join(__dirname, "../src/components/rm-app.tsx"), "utf8");
const ast = ts.createSourceFile("rm-app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const editor = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "IssueEditor");
const { outputText } = ts.transpileModule(editor.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
});

function harness(issue, quotes) {
  const states = ["reservation", false, false];
  let index = 0;
  let result;
  const useState = (initial) => {
    const slot = index++;
    if (!(slot in states)) states[slot] = initial;
    return [states[slot], (value) => { states[slot] = value; }];
  };
  const components = ["SaveButton", "CarsForm", "HotelsForm", "QuoteImportModal", "SectionBand", "CompactFlightBlock"];
  const renderEditor = new Function("React", "useState", "missingIssueDetails", "loyaltyPrograms", ...components,
    `${outputText}\nreturn IssueEditor;`)(React, useState, () => [], [], ...components);
  return {
    render() {
      index = 0;
      return renderEditor({ issue, availableQuotes: quotes, suppliers: [], clients: [], settings: {}, onChange: (next) => { result = next; } });
    },
    get result() { return result; },
  };
}

function find(node, type) {
  if (!node || typeof node !== "object") return undefined;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const match = find(child, type);
    if (match) return match;
  }
}

for (const [service, form, label] of [["hotel", "HotelsForm", "hospedagens"], ["car", "CarsForm", "aluguel de carro"]]) {
  for (const additionalOptions of [true, false]) {
    test(`imports ${service} from a quote, additional options: ${additionalOptions}`, () => {
      const key = `${service}Options`;
      const issue = {
        id: "issue-id", isIssue: true, issueType: service, name: "Existing emission", client: "Existing client",
        issue: { locator: "ABC123", attachments: [], pointsAmount: 0, thousandCost: 0, fees: 0 },
        cashPrice: 100, cost: 50, flightOut: { code: "KEEP" }, flightBack: {},
        hotel: { name: "Existing hotel" }, car: { models: "Existing car" },
        [key]: [{ previous: true }],
      };
      const reservation = service === "hotel"
        ? { name: "Quoted hotel", address: "Hotel street", checkin: "2027-01-01", breakfast: true, photoNames: ["photo-1"] }
        : { models: "Quoted car", pickupAddress: "Airport", pickupDate: "2027-01-01", automatic: true };
      const quote = { client: "Quoted client", cashPrice: 900, destination: "Recife", [service]: reservation,
        ...(additionalOptions ? { [key]: [{ ...reservation, extra: true }] } : {}) };
      const ui = harness(issue, [quote]);
      find(ui.render(), form).props.onImport();
      const modal = find(ui.render(), "QuoteImportModal");
      assert.deepEqual(modal.props.quotes, [quote]);
      assert.ok(modal.props.description.includes(label));
      modal.props.onImport(quote);
      assert.equal(find(ui.render(), "QuoteImportModal"), undefined);
      assert.deepEqual(ui.result[service], reservation);
      assert.deepEqual(ui.result[key], additionalOptions ? quote[key] : []);
      assert.notEqual(ui.result[service], reservation);
      if (additionalOptions) assert.notEqual(ui.result[key][0], quote[key][0]);
      assert.equal(ui.result.client, quote.client);
      assert.equal(ui.result.cashPrice, quote.cashPrice);
      for (const field of ["id", "isIssue", "issueType", "name", "issue", "cost", "flightOut", "flightBack", service === "hotel" ? "car" : "hotel"]) {
        assert.equal(ui.result[field], issue[field], `preserves ${field}`);
      }
      if (service === "hotel") {
        ui.result.hotel.photoNames.push("new-photo");
        assert.deepEqual(quote.hotel.photoNames, ["photo-1"]);
      }
    });
  }
}
