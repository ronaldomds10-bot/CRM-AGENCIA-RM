import { expect, test } from "@playwright/test";

test("abre e cria uma emissão local", async ({ page }) => {
  await page.goto("http://localhost:3008");
  await page.getByRole("button", { name: "Emissões" }).click();
  await expect(page.getByRole("heading", { name: "Emissões" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Companhia/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Localizador/ })).toBeVisible();
  await page.getByRole("button", { name: "Nova emissão" }).click();
  await expect(page.getByRole("button", { name: "Dados da emissão" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Localizador", exact: true })).toBeVisible();
  await page.screenshot({ path: "reports/emissao-editor.png", fullPage: true });
});
