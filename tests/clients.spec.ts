import { expect, test } from "@playwright/test";

test("cliente pode ser cadastrado, consultado e abrir suas emissoes", async ({ page }) => {
  await page.goto("http://localhost:3008");
  await page.getByRole("button", { name: /Clientes/ }).click();
  await expect(page.getByLabel("Pesquisar clientes")).toBeVisible();

  await page.getByRole("button", { name: /Novo cliente/ }).click();
  await expect(page.getByRole("dialog", { name: "Dados do cliente" })).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("CLIENTE");
  await page.getByLabel("Sobrenome", { exact: true }).fill("TESTE");
  await page.getByLabel("E-mail", { exact: true }).fill("cliente@teste.com");
  await page.getByRole("button", { name: "Passaporte", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByLabel("Número do passaporte").fill("BR123456");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();

  await page.getByLabel("Pesquisar clientes").fill("cliente@teste.com");
  await expect(page.getByText("CLIENTE", { exact: true })).toBeVisible();
  await page.getByLabel("Ver dados de CLIENTE TESTE").click();
  await expect(page.getByText("BR123456", { exact: true })).toBeVisible();
  await page.getByLabel("Fechar").click();

  await page.getByLabel("Ver emissões de CLIENTE TESTE").click();
  await expect(page.getByRole("heading", { name: "Emissões" })).toBeVisible();
  await expect(page.getByPlaceholder("Cliente, rota ou destino")).toHaveValue("CLIENTE TESTE");
});
