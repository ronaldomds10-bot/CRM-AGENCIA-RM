const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
function load(file, deps = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'exports', js)(n => deps[n] || require(n), m.exports);
  return m.exports;
}
const math = load('src/lib/cpf-finance.ts');
const calc = math.calculateMileageFinance;
const input = { accountId: '00000000-0000-4000-8000-000000000001', miles: 50000, buyCents: 1500, sellCents: 2500, paidFeeCents: 10000, chargedFeeCents: 10000, otherCents: 0 };
class RequestInputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const { saveCpfFinance: save } = load('src/lib/cpf-finance-store.ts', { './cpf-finance': math, './security': { RequestInputError } });
test('requested totals, pass-through fee, zero and loss', () => {
  assert.deepEqual(calc(input), { milesCost: 75000, milesSale: 125000, revenue: 135000, cost: 85000, profit: 50000, margin: 50000 / 135000 * 100 });
  assert.equal(calc({ ...input, paidFeeCents: 0, chargedFeeCents: 0 }).profit, 50000);
  assert.equal(calc({ ...input, sellCents: 0, chargedFeeCents: 0 }).margin, null);
  assert.equal(calc({ ...input, otherCents: 60000 }).profit, -10000);
  assert.equal(calc({ ...input, miles: 1 }).milesCost, 2);
});
test('invalid, missing and fractional amounts rejected', () => {
  for (const key of ['miles','buyCents','sellCents','paidFeeCents','chargedFeeCents','otherCents']) {
    for (const value of [undefined, null, -1, 1.5, Infinity, NaN, '10', 1000000001]) assert.throws(() => calc({ ...input, [key]: value }));
  }
});
function client(current, exists = true) {
  const calls = [];
  return { calls, async query(sql, args) {
    calls.push([sql, args]);
    if (sql.includes('FROM mileage_emissions')) return { rowCount: exists ? 1 : 0, rows: exists ? [{ account_id: input.accountId }] : [] };
    if (sql.startsWith('SELECT')) return { rowCount: current ? 1 : 0, rows: current ? [current] : [] };
    return { rowCount: 1, rows: [] };
  } };
}
test('one snapshot per operation, account derived from existing CPF record, agency scoped', async () => {
  const db = client();
  const result = await save(db, 'agency', 'actor', 'operation', 0, { ...input, accountId: 'untrusted', passengers: [{}, {}], totals: { profit: 1 } });
  assert.equal(result.totals.profit, 50000); assert.equal(result.inputs.accountId, input.accountId);
  assert.deepEqual(db.calls[0][1], ['operation','agency']);
  assert.equal(db.calls.filter(([sql]) => sql.startsWith('INSERT')).length, 2);
  assert.ok(db.calls.every(([sql]) => !/crm_state|mileage_emission_passengers|UPDATE mileage_emissions/.test(sql)));
});
test('cross agency denied and concurrent updates rejected', async () => {
  await assert.rejects(save(client(null, false), 'other', 'actor', 'operation', 0, input), e => e.status === 404);
  await assert.rejects(save(client({ inputs: input, revision: 2 }), 'agency', 'actor', 'operation', 1, input), e => e.status === 409);
});
test('JSONB reload is idempotent and edit preserves earlier revision', async () => {
  const prior = Object.fromEntries(Object.entries(input).reverse());
  const db = client({ inputs: prior, revision: 1 });
  await save(db, 'agency', 'actor', 'operation', 1, input);
  assert.equal(db.calls.filter(([sql]) => sql.startsWith('INSERT')).length, 0);
  const result = await save(db, 'agency', 'actor', 'operation', 1, { ...input, buyCents: 1600 });
  assert.equal(result.revision, 2); assert.equal(result.totals.cost, 90000);
  assert.equal(prior.buyCents, 1500);
  assert.equal(db.calls.filter(([sql]) => sql.includes('INSERT INTO cpf_operation_finance_history')).length, 1);
});
test('CPF count queries and CRM route do not depend on finance', () => {
  assert.doesNotMatch(fs.readFileSync('src/lib/cpf-control-logic.ts', 'utf8'), /cpf.financ/i);
  assert.doesNotMatch(fs.readFileSync('src/app/api/crm-state/route.ts', 'utf8'), /finance/i);
  assert.doesNotMatch(fs.readFileSync('src/components/rm-app.tsx', 'utf8'), /MileageFinance|cpf_operation_finance/);
});

test('purchase derives existing thousand price and only charges miles used, with fees once', async () => {
  const purchase = { paidCents: 150000, receivedMiles: 100000 };
  const db = client();
  const result = await save(db, 'agency', 'actor', 'operation', 0, { ...input, buyCents: 999999, purchase });
  assert.equal(result.inputs.buyCents, 1500);
  assert.deepEqual(result.inputs.purchase, purchase);
  assert.equal(result.totals.milesCost, 75000);
  assert.equal(result.totals.cost, 85000);
  assert.equal(result.totals.revenue, 135000);
  assert.equal(result.totals.profit, 50000);
  const audit = db.calls.find(([sql]) => sql.includes('INSERT INTO cpf_operation_finance_history'));
  assert.deepEqual(JSON.parse(audit[1][5]).purchase, purchase);
});

test('purchase preserves exact ratio until final cents, not rounded displayed rate', () => {
  const p = { ...input, miles: 300000, purchase: { paidCents: 10000, receivedMiles: 300000 } };
  assert.equal(math.normalizeMileageFinance(p).buyCents, 33);
  assert.equal(calc(p).milesCost, 10000);
  assert.equal(calc({ ...p, miles: 100000 }).milesCost, 3333);
});

test('purchase rejects blanks, zero denominator, negatives and fractional miles; zero paid remains valid', () => {
  for (const receivedMiles of [0, undefined, null, '', -1, 1.5, Infinity]) assert.throws(() => calc({ ...input, purchase: { paidCents: 100, receivedMiles } }));
  for (const paidCents of [undefined, null, '', -1, 1.5, Infinity]) assert.throws(() => calc({ ...input, purchase: { paidCents, receivedMiles: 1000 } }));
  assert.throws(() => calc({ ...input, purchase: null }));
  assert.equal(calc({ ...input, purchase: { paidCents: 0, receivedMiles: 1000 } }).milesCost, 0);
});

test('purchase survives JSONB reload and later edits keep earlier purchase history', async () => {
  const prior = { ...input, purchase: { receivedMiles: 100000, paidCents: 150000 } };
  const db = client({ inputs: prior, revision: 1 });
  await save(db, 'agency', 'actor', 'operation', 1, { ...prior, purchase: { paidCents: 150000, receivedMiles: 100000 } });
  assert.equal(db.calls.filter(([sql]) => sql.startsWith('INSERT')).length, 0);
  const next = await save(db, 'agency', 'actor', 'operation', 1, { ...prior, purchase: { paidCents: 160000, receivedMiles: 100000 } });
  assert.equal(next.inputs.buyCents, 1600); assert.equal(next.revision, 2);
  assert.equal(prior.purchase.paidCents, 150000);
});
