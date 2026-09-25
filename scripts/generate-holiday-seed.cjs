const fs = require("node:fs");
const path = require("node:path");

const source = process.argv[2];
if (!source) throw new Error("Informe o diretório do repositório feriados-brasil.");
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(source, ...parts), "utf8"));
const states = new Map(read("dados", "localizacao", "estados", "estados.json").map((state) => [state.codigo_uf, state.uf]));
const municipalities = read("dados", "localizacao", "municipios", "municipios.json").map((city) => ({
  ibgeCode: String(city.codigo_ibge),
  city: city.nome,
  state: states.get(city.codigo_uf),
}));
const citiesByCode = new Map(municipalities.map((city) => [city.ibgeCode, city.city]));
const iso = (value) => {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
};
const categories = [
  ["nacional", "NATIONAL"],
  ["estadual", "STATE"],
  ["municipal", "MUNICIPAL"],
  ["facultativo", "OPTIONAL"],
];
const holidays = categories.flatMap(([folder, type]) => read("dados", "feriados", folder, "json", "2026.json").map((item) => ({
  name: item.nome,
  date: iso(item.data),
  type,
  state: item.uf || null,
  ibgeCode: item.codigo_ibge ? String(item.codigo_ibge) : null,
  city: item.codigo_ibge ? citiesByCode.get(String(item.codigo_ibge)) || null : null,
})));
const output = path.join(process.cwd(), "src", "data");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "municipalities.json"), JSON.stringify(municipalities));
fs.writeFileSync(path.join(output, "holidays-2026.json"), JSON.stringify(holidays));
console.log(JSON.stringify({ municipalities: municipalities.length, holidays: holidays.length }));
