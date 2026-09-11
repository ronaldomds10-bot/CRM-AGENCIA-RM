import { expect, test } from "@playwright/test";

test("pesquisa e cadastra fornecedor local", async ({ page }) => {
  await page.goto("http://localhost:3008");
  await page.getByRole("button", { name: "Fornecedores" }).click();
  await expect(page.getByLabel("Pesquisar fornecedores")).toBeVisible();
  await page.getByRole("button", { name: /Novo fornecedor/ }).click();
  await page.getByLabel("Nome").fill("Fornecedor Teste");
  await page.getByLabel("Telefone").fill("+55 11 99999-9999");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Fornecedor Teste")).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).first().click();
  await page.getByLabel("Nome").fill("Fornecedor Editado");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Fornecedor Editado")).toBeVisible();
  await page.getByRole("button", { name: "Visualização em cartões" }).click();
  await expect(page.getByRole("button", { name: "Deletar" }).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Deletar" }).first().click();
  await expect(page.getByText("Fornecedor Editado")).toHaveCount(0);
  await page.screenshot({ path: "reports/fornecedores.png", fullPage: true });
});
