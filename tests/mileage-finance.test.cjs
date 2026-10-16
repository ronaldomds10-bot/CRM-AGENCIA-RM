const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require','module','exports',source)(name => dependencies[name] || require(name),module,module.exports);
  return module.exports;
}
const math = load('src/lib/mileage-finance.ts');
const { calculateMileageFinance: calc } = math;
const input = { accountId: '00000000-0000-4000-8000-000000000001', miles: 50000, buyCents: 1500, sellCents: 2500, paidFeeCents: 10000, chargedFeeCents: 10000, otherCents: 0 };
test('requested example and pass-through fee', () => {
  assert.deepEqual(calc(input), { milesCost: 75000, milesSale: 125000, revenue: 135000, cost: 85000, profit: 50000, margin: 50000 / 135000 * 100 });
  assert.equal(calc(input).margin.toFixed(2), '37.04');
  assert.equal(calc({ ...input, paidFeeCents: 0, chargedFeeCents: 0 }).profit, 50000);
});
test('zero revenue, loss, rounding and invalid inputs', () => {
  assert.equal(calc({ ...input, sellCents: 0, chargedFeeCents: 0 }).margin, null);
  assert.equal(calc({ ...input, otherCents: 60000 }).profit, -10000);
  assert.equal(calc({ ...input, miles: 1, buyCents: 1500 }).milesCost, 2);
  for (const value of [-1, 1.5, NaN, Infinity, '100', null, undefined]) assert.throws(() => calc({ ...input, miles: value }));
});
class InputError extends Error {}
const { validateEmissionFinances: validate } = load('src/lib/mileage-finance-server.ts', { './mileage-finance': math, './security': { RequestInputError: InputError } });
const state = q => ({ quotes: q, clients: [], suppliers: [], events: [] });
const quote = () => ({ id: 'emission', isIssue: true, status: 'emitido', cashPrice: 999, cost: 999, issue: { method: 'miles', finance: { ...input }, passengers: [{}, {}] } });
test('backend recalculates once per emission, immutable snapshot and idempotent audit', async () => {
  const calls = [];
  const client = { query: async (sql, args) => { calls.push([sql,args]); return { rowCount: 1 }; } };
  const q = quote(); await validate(client, state([]), state([q]), 'agency', 'actor');
  assert.equal(q.cashPrice, 1350); assert.equal(q.cost, 850);
  assert.equal(calls.filter(([sql]) => sql.startsWith('INSERT')).length, 1);
  assert.deepEqual(calls[0][1], [input.accountId, 'agency']);
  calls.length = 0; await validate(client, state([structuredClone(q)]), state([q]), 'agency', 'actor');
  assert.equal(calls.filter(([sql]) => sql.startsWith('INSERT')).length, 0);
  const changed = structuredClone(q); changed.issue.finance.buyCents = 1600;
  await validate(client, state([q]), state([changed]), 'agency', 'actor');
  assert.equal(q.issue.finance.buyCents, 1500);
  const audit = calls.find(([sql]) => sql.startsWith('INSERT'))[1];
  assert.equal(JSON.parse(audit[3]).finance.buyCents, 1500);
  assert.equal(JSON.parse(audit[4]).finance.buyCents, 1600);
});
test('foreign account denied, old client cannot erase finance, legacy stays pending', async () => {
  const client = { query: async () => ({ rowCount: 0 }) };
  await assert.rejects(validate(client, state([]), state([quote()]), 'other-agency', 'actor'), InputError);
  const legacy = quote(); delete legacy.issue.finance;
  await assert.rejects(validate(client, state([quote()]), state([legacy]), 'agency', 'actor'), InputError);
  await validate(client, state([legacy]), state([legacy]), 'agency', 'actor');
  assert.equal(legacy.issue.finance, undefined);
});
test('cancellation and deletion preserve audit', async () => {
  const calls=[]; const client={ query: async (sql,args) => { if(sql.startsWith('INSERT')) calls.push(args); return {rowCount:1}; } };
  const old=quote(), cancelled=quote(); cancelled.status='cancelado';
  await validate(client,state([old]),state([cancelled]),'agency','actor');
  assert.equal(JSON.parse(calls[0][4]).status,'cancelado');
  await validate(client,state([cancelled]),state([]),'agency','actor');
  assert.equal(calls.length,2);
});
