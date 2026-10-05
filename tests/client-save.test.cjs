const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function evaluate(source, localRequire = require) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
  return module.exports;
}

function loadLib(name) {
  return evaluate(fs.readFileSync(path.join(__dirname, "../src/lib", `${name}.ts`), "utf8"),
    (id) => id === "@/lib/tenant" ? loadLib("tenant") : require(id));
}

// Execute the actual client initialization code without mounting the entire UI.
const source = fs.readFileSync(path.join(__dirname, "../src/components/rm-app.tsx"), "utf8");
const ast = ts.createSourceFile("rm-app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const selected = ast.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && node.name?.text === "mergeImportedClients") ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(ast) === "importedClients")));
const { mergeImportedClients, importedClients } = evaluate(
  selected.map((node) => node.getText(ast)).join("\n") + "\nmodule.exports = { mergeImportedClients, importedClients };",
);
const { mergeState } = loadLib("access");
const user = { id: "manager", role: "agency_admin" };

test("saving an imported quote preserves an edited seed client without duplicate IDs", () => {
  const edited = { ...importedClients[0], name: "Edited", surname: "Client", email: "edited@example.test", document: "", ownerId: user.id };
  const current = { quotes: [], clients: [edited], suppliers: [], events: [] };
  const incoming = { ...current, clients: mergeImportedClients(current.clients),
    quotes: [{ id: "imported-quote", client: "", destination: "João Pessoa", cashPrice: 6540 }] };
  const saved = mergeState(current, incoming, user);
  assert.equal(saved.quotes[0].destination, "João Pessoa");
  assert.deepEqual(saved.clients.filter((client) => client.id === edited.id), [{ ...edited, assignedUserId: null }]);
  assert.deepEqual(mergeImportedClients(incoming.clients), incoming.clients);
});

test("existing contact matching and duplicate cleanup remain supported", () => {
  const existing = { ...importedClients[0], id: "existing-client" };
  const result = mergeImportedClients([existing, existing]);
  assert.equal(result.filter((client) => client.id === existing.id).length, 1);
  assert.ok(!result.some((client) => client.id === importedClients[0].id));
  assert.ok(result.some((client) => client.id === importedClients[1].id));
});

test("server still rejects duplicate IDs", () => {
  const state = { quotes: [], clients: [{ id: "duplicate" }, { id: "duplicate" }], suppliers: [], events: [] };
  assert.throws(() => mergeState({ ...state, clients: [] }, state, user), /Registro clients inválido/);
});
