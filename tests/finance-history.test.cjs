const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");

const source = fs.readFileSync(path.join(__dirname, "../src/components/rm-app.tsx"), "utf8");
const ast = ts.createSourceFile("rm-app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const finance = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "Finance");
const { outputText } = ts.transpileModule(finance.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
});

function metrics(period, year = 2026) {
  let hook = 0;
  const useState = () => [hook++ === 0 ? period : { from: "", to: "" }, () => {}];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [`${year}-10-13T12:00:00`])); }
  }
  const components = ["Metric", "Panel", "TimelineItem", "DateRangePicker"];
  const render = new Function("React", "useState", "Date", "issueCost", "money", ...components,
    `${outputText}\nreturn Finance;`)(React, useState, FixedDate, (quote) => quote.cost,
    (value) => Number(value.toFixed(2)), ...components);
  const quote = { cashPrice: 1000, cost: 600, isIssue: true, issue: { saleDate: `${year}-10-13` } };
  const tree = render({ quotes: [quote, { ...quote, isDemo: true }, { ...quote, status: "cancelado" }] });
  const result = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Metric") result.push(node.props.value);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  }
  visit(tree);
  return result;
}

test("Este ano adds the Airpass history to active emissions exactly once", () => {
  assert.deepEqual(metrics("year"), [42212.75, 5093.36, 37119.39, "0", "1"]);
  assert.deepEqual(metrics("year"), metrics("year"));
});

for (const period of ["today", "week", "month", "custom"]) {
  test(`${period} does not include the annual history`, () => {
    assert.deepEqual(metrics(period), [1000, 400, 600, "0", "1"]);
  });
}

test("2026 history does not carry into the next year", () => {
  assert.deepEqual(metrics("year", 2027), [1000, 400, 600, "0", "1"]);
});
