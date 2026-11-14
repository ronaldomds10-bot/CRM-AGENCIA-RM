const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/shared-quote.ts"), "utf8");
const { outputText } = ts.transpileModule(source.replace('import "server-only";', ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exportsObject = {};
new Function("exports", outputText)(exportsObject);
const { publicQuoteDto } = exportsObject;
const flight = (count) => ({
  adults: 0, children: 0,
  passengers: Array.from({ length: count }, () => ({ name: "Private name", ticket: "Private ticket" })),
});

test("preserves independent outbound, return and connection counts without personal data", () => {
  const quote = { flightOut: flight(3), flightBack: flight(2), flightOutSegments: [flight(3)], flightBackSegments: [flight(2)] };
  const result = publicQuoteDto(quote);
  for (const [item, expected] of [[result.flightOut, 3], [result.flightBack, 2], [result.flightOutSegments[0], 3], [result.flightBackSegments[0], 2]]) {
    assert.equal(item.passengerCount, expected);
    assert.deepEqual(item.passengers, []);
  }
  assert.ok(!JSON.stringify(result).includes("Private"));
  // The read endpoint sanitizes current quotes twice.
  assert.deepEqual(publicQuoteDto(result), result);
});

test("reflects passenger additions and removals on subsequent reads", () => {
  const quote = { flightOut: flight(1), flightBack: flight(1) };
  quote.flightOut.passengers.push({});
  quote.flightBack.passengers.push({}, {});
  assert.equal(publicQuoteDto(quote).flightOut.passengerCount, 2);
  assert.equal(publicQuoteDto(quote).flightBack.passengerCount, 3);
  quote.flightBack.passengers.pop();
  assert.equal(publicQuoteDto(quote).flightBack.passengerCount, 2);
});

test("supports legacy counts and empty flights", () => {
  const result = publicQuoteDto({ flightOut: { adults: 2, children: 1 } });
  assert.equal(result.flightOut.passengerCount, 3);
  assert.equal(result.flightBack.passengerCount, 0);
});

test("keeps quote options with a bounded whitelist", () => {
  const result = publicQuoteDto({ options: [{ id: "a", label: "Opção 1", hotelIndex: 0, cashPrice: 100, installments: "6x - 6,88%", paymentOption: "x", recommended: true, secret: "no" }] });
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].cashPrice, 100);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.deepEqual(publicQuoteDto({}).options, []);
});
