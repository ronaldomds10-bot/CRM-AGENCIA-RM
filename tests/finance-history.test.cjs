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
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ["issueCost", "issueRevenue", "financePending"].includes(node.name?.text)).map(node => node.getText(ast)).join("\n");
const helperJS = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const financeModule = { exports: {} };
new Function("exports", ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/mileage-finance.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(financeModule.exports);

function metrics(period, year = 2026, extra = []) {
  let hook = 0;
  const useState = () => [hook++ === 0 ? period : { from: "", to: "" }, () => {}];
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [`${year}-10-13T12:00:00`])); }
  }
  const components = ["Metric", "Panel", "TimelineItem", "DateRangePicker"];
  const render = new Function("React", "useState", "Date", "calculateMileageFinance", "money", ...components,
    `${helperJS}\n${outputText}\nreturn Finance;`)(React, useState, FixedDate, financeModule.exports.calculateMileageFinance,
    (value) => Number(value.toFixed(2)), ...components);
  const quote = { cashPrice: 1000, cost: 600, isIssue: true, issue: { saleDate: `${year}-10-13` } };
  const tree = render({ quotes: [quote, { ...quote, isDemo: true }, { ...quote, status: "cancelado" }, ...extra] });
  const result = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "Metric") result.push(node.props.value);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  }
  visit(tree);
  return result.slice(0, 5);
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

test("pending excluded, passengers counted once and cancelled miles excluded", () => {
  const pending = { isIssue: true, cashPrice: 9999, cost: 0, issue: { method: "miles", saleDate: "2026-10-13" } };
  const ready = { ...pending, issue: { ...pending.issue, passengers: [{}, {}], finance: { accountId: "00000000-0000-4000-8000-000000000001", miles: 50000, buyCents: 1500, sellCents: 2500, paidFeeCents: 10000, chargedFeeCents: 10000, otherCents: 0 } } };
  assert.deepEqual(metrics("month", 2026, [pending, ready, { ...ready, status: "cancelado" }]), [2350, 900, 1450, "0", "3"]);
});
