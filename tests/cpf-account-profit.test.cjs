const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const exportsObject={};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/cpf-account-profit.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exportsObject);
const {cpfAccountProfit:sum}=exportsObject;
const row=(id,profit,extra={})=>({id,account_id:'a',status:'emitido',finance_totals:profit===null?null:{profit},...extra});
test('profit belongs to each account, counts operations once and excludes cancelled/corrected',()=>{
 const rows=[row('one',40000),row('one',40000),row('two',-10000),row('other',99999,{account_id:'b'}),row('cancelled',99999,{status:'cancelado'}),row('correction',99999,{status:'correcao'})];
 assert.deepEqual(sum(rows,'a'),{formatted:'R$ 300,00',completed:2,pending:0,sign:1});
 assert.equal(sum(rows,'b').formatted,'R$ 999,99');
});
test('pending is not zero; partial results and no operations are distinct',()=>{
 assert.deepEqual(sum([row('pending',null)],'a'),{formatted:null,completed:0,pending:1,sign:0});
 assert.equal(sum([row('zero',0)],'a').formatted,'R$ 0,00');
 assert.deepEqual(sum([],'a'),{formatted:null,completed:0,pending:0,sign:0});
 assert.deepEqual(sum([row('one',40000),row('pending',null)],'a'),{formatted:'R$ 400,00',completed:1,pending:1,sign:1});
});
test('loss and integer precision',()=>{
 assert.equal(sum([row('loss',-12345)],'a').formatted,'-R$ 123,45');
 assert.equal(sum([row('one',10),row('two',20)],'a').formatted,'R$ 0,30');
 assert.equal(sum([row('one',9007199254740991),row('two',10)],'a').formatted,'R$ 90.071.992.547.410,01');
});
