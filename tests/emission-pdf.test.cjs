const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const parsePdf = require("pdf-parse");

// Exercise the production renderer with the real embedded fonts and synthetic
// bookings. Browser image loading is verified separately through the download UI.
function loadRenderer() {
  function load(name) {
    const source = fs.readFileSync(path.join(__dirname, "../src/lib", `${name}.ts`), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    } });
    const module = { exports: {} };
    const localRequire = (id) => id === "./flight-duration" ? load("flight-duration") : require(id);
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  }
  return load("emission-pdf").createEmissionPdf;
}

const passenger = { name: "Ana", surname: "Silva", ticket: "0001234567890", checkedBags: 0, carryOnBags: 1, backpacks: 1 };
const flight = {
  code: "LA1000", airline: "LATAM", from: "GRU - São Paulo/SP", to: "MAO - Manaus/AM",
  date: "2027-01-19", departTime: "06:40", arriveTime: "09:35", passengers: [passenger],
  checkedBags: 0, carryOnBags: 1, backpacks: 1, checkedBagWeight: 23, carryOnWeight: 10, refundable: false,
};
function booking() {
  return structuredClone({
    client: "Ana Silva", destination: "Manaus", startDate: flight.date, endDate: "2027-01-26", qrContent: "",
    flightOut: flight,
    flightBack: { ...flight, code: "LA2000", from: flight.to, to: flight.from, date: "2027-01-26", departTime: "18:00", arriveTime: "22:55" },
    issue: { locator: "ABC123 | DEF456", locatorLink: "https://example.com/booking", ticket: passenger.ticket, showLogo: true, provider: "LATAM" },
  });
}
const settings = { companyName: "Agência de teste", logoDataUrl: "" };

test("PDF de emissões: formato, fusos, conteúdo, links e paginação", async (t) => {
  const originalFetch = global.fetch, originalImage = global.Image;
  global.fetch = async (url) => new Response(fs.readFileSync(path.join(__dirname, "../public", url)));
  global.Image = class { set src(_) { queueMicrotask(() => this.onerror(new Error("Image skipped in unit test"))); } };
  t.after(() => { global.fetch = originalFetch; global.Image = originalImage; });
  const createPdf = loadRenderer();
  await t.test("ida e volta cabem no formato original, com duração real e QR clicável", async () => {
    const pdf = await createPdf(booking(), settings);
    assert.equal(pdf.getNumberOfPages(), 1);
    assert.equal(pdf.internal.pageSize.width, 476.88);
    assert.equal(pdf.internal.pageSize.height, 770.88);
    const { text } = await parsePdf(Buffer.from(pdf.output("arraybuffer")));
    for (const value of ["LA1000", "LA2000", "GMT-3", "GMT-4", "Ana", "Silva", "0001234567890", "em 19 de janeiro de 2027", "Bagagens despachadas (23kg)", "Bagagens de bordo (10kg)"]) assert.ok(text.includes(value), value);
    assert.equal(text.match(/3h 55min/g)?.length, 2);
    assert.ok(pdf.output().includes("/URI (https://example.com/booking)"));
    assert.ok(pdf.output().includes("/FontFile2"));
  });
  await t.test("nomes longos e 25 passageiros não são cortados nas páginas", async () => {
    const data = booking();
    data.flightOutSegments = [{ ...flight, code: "LA3000" }];
    data.flightOut.passengers = Array.from({ length: 25 }, (_, i) => ({ ...passenger, name: `Viajante ${i + 1}`, surname: "Sobrenome extenso para verificar as quebras de linha do cartão", ticket: `BILHETE${i}` }));
    const pdf = await createPdf(data, settings);
    assert.ok(pdf.getNumberOfPages() > 1);
    const { text } = await parsePdf(Buffer.from(pdf.output("arraybuffer")), { pagerender: async (page) => {
      const { items } = await page.getTextContent();
      for (const item of items.filter((item) => item.str.trim())) {
        assert.ok(item.transform[5] >= 0 && item.transform[5] <= 770.88, `Vertical overflow: ${item.str}`);
        assert.ok(item.transform[4] >= 0 && item.transform[4] + item.width <= 477, `Horizontal overflow: ${item.str}`);
      }
      return items.map((item) => item.str).join("\n");
    } });
    for (let i = 0; i < 25; i++) assert.ok(text.includes(`BILHETE${i}`));
    assert.ok(text.includes("Passageiros (continuação)"));
    assert.ok(text.includes("LA2000"));
  });
  await t.test("ida e volta com vários passageiros ficam juntas em uma página", async () => {
    for (const count of [3, 4, 9, 25]) {
      const data = booking();
      const passengers = Array.from({ length: count }, (_, i) => ({ ...passenger, surname: "Sobrenome extenso para conferir a paginação", ticket: `TESTE${i}` }));
      data.flightOut.passengers = passengers;
      data.flightBack.passengers = passengers;
      const pdf = await createPdf(data, settings);
      assert.equal(pdf.getNumberOfPages(), 1);
      const { text } = await parsePdf(Buffer.from(pdf.output("arraybuffer")), { pagerender: async (page) => {
        const { items } = await page.getTextContent();
        for (const item of items.filter((item) => item.str.trim())) {
          assert.ok(item.transform[5] >= 35 && item.transform[5] <= 750, `Conteúdo cortado: ${item.str}`);
        }
        return items.map((item) => item.str).join("\n");
      } });
      assert.ok(text.includes("LA1000") && text.includes("LA2000"));
      assert.equal(text.split(`TESTE${count - 1}`).length - 1, 2);
    }
  });
  await t.test("voo noturno, classe e conexão preservam os dados cadastrados", async () => {
    const data = booking();
    data.flightOut.departTime = "23:40"; data.flightOut.arriveTime = "02:35";
    data.flightOut.cabinClass = "Executiva";
    data.flightOutSegments = [{ ...flight, code: "LA3000", from: flight.to, to: flight.from, date: "2027-01-20", departTime: "04:35", arriveTime: "09:30" }];
    data.issue.locator = "LA: ABC123";
    data.qrContent = "javascript:alert(1)";
    const pdf = await createPdf(data, settings);
    const { text } = await parsePdf(Buffer.from(pdf.output("arraybuffer")));
    for (const value of ["20 de janeiro", "Executiva", "LA3000", "Parada de 2h 00min"]) assert.ok(text.includes(value), value);
    assert.ok(!text.includes("LA: LA:"));
    assert.ok(!pdf.output().includes("/URI (javascript:"));
  });
  await t.test("usa o cliente quando o cartão de passageiro ainda está sem nome", async () => {
    const data = booking();
    data.flightOut.passengers = [{ ...passenger, name: "", surname: "" }];
    data.flightBack = { ...flight, code: "", from: "", to: "", date: "" };
    const pdf = await createPdf(data, settings);
    const { text } = await parsePdf(Buffer.from(pdf.output("arraybuffer")));
    assert.ok(text.includes("Ana")); assert.ok(text.includes("Silva"));
  });
});
