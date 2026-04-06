import { test, expect } from "@playwright/test";

test.describe("Registration landing page", () => {
  test("is accessible via /registration URL", async ({ page }) => {
    await page.goto("/registration");
    await expect(page.getByRole("heading", { name: "Registrácia na tábor" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Začať registráciu" })).toBeVisible();
  });

  test("navigates to form on button click", async ({ page }) => {
    await page.goto("/registration");
    await page.getByRole("button", { name: "Začať registráciu" }).click();
    await expect(page).toHaveURL("/registration/form");
  });

  test("main page at / still shows pre-registration form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Zaujal vás tábor?" })).toBeVisible();
  });
});
