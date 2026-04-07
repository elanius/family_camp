import { test, expect } from "@playwright/test";

const TAKEN_EMAIL = "existing@example.sk";
const FREE_EMAIL = "free@example.sk";

test.describe("Duplicate email check", () => {
  test.beforeEach(async ({ page }) => {
    // Default: email is free
    await page.route("/api/registration/check-email*", async (route) => {
      const url = new URL(route.request().url());
      const email = url.searchParams.get("email") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: email === TAKEN_EMAIL }),
      });
    });

    await page.route("/api/registration", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ message: "Registrácia prebehla úspešne." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/registration/form");
  });

  test("shows inline error when email is already registered", async ({ page }) => {
    await page.getByLabel("E-mail *").fill(TAKEN_EMAIL);
    await page.getByLabel("E-mail *").blur();

    await expect(
      page.getByText("Tento e-mail je už zaregistrovaný.")
    ).toBeVisible();
  });

  test("does not show error when email is available", async ({ page }) => {
    await page.getByLabel("E-mail *").fill(FREE_EMAIL);
    await page.getByLabel("E-mail *").blur();

    await expect(
      page.getByText("Tento e-mail je už zaregistrovaný.")
    ).not.toBeVisible();
  });

  test("clears error when user edits the email field again", async ({ page }) => {
    await page.getByLabel("E-mail *").fill(TAKEN_EMAIL);
    await page.getByLabel("E-mail *").blur();
    await expect(page.getByText("Tento e-mail je už zaregistrovaný.")).toBeVisible();

    // User starts typing a new email — error should clear immediately
    await page.getByLabel("E-mail *").fill(FREE_EMAIL);
    await expect(page.getByText("Tento e-mail je už zaregistrovaný.")).not.toBeVisible();
  });

  test("Ďalej button is disabled while email-taken error is active", async ({ page }) => {
    await page.getByLabel("E-mail *").fill(TAKEN_EMAIL);
    await page.getByLabel("E-mail *").blur();
    await expect(page.getByText("Tento e-mail je už zaregistrovaný.")).toBeVisible();

    await expect(page.getByRole("button", { name: "Ďalej →" })).toBeDisabled();
  });

  test("Ďalej button is re-enabled after error is cleared", async ({ page }) => {
    await page.getByLabel("E-mail *").fill(TAKEN_EMAIL);
    await page.getByLabel("E-mail *").blur();
    await expect(page.getByRole("button", { name: "Ďalej →" })).toBeDisabled();

    await page.getByLabel("E-mail *").fill(FREE_EMAIL);
    await expect(page.getByRole("button", { name: "Ďalej →" })).not.toBeDisabled();
  });

  test("does not call check-email for an invalid email format", async ({ page }) => {
    let checkEmailCalled = false;
    await page.route("/api/registration/check-email*", async (route) => {
      checkEmailCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exists: false }) });
    });

    await page.getByLabel("E-mail *").fill("not-an-email");
    await page.getByLabel("E-mail *").blur();

    // Wait a moment to confirm no request was made
    await page.waitForTimeout(300);
    expect(checkEmailCalled).toBe(false);
  });

  test("shows duplicate email error on 409 from POST (summary page fallback)", async ({ page }) => {
    // check-email returns free so the user can proceed to summary
    await page.route("/api/registration/check-email*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exists: false }) });
    });

    // POST returns 409 conflict
    await page.route("/api/registration", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail:
              "Tento e-mail je už zaregistrovaný. Pre úpravu registrácie použite odkaz, ktorý ste dostali v potvrdzovacom e-maile.",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Fill and proceed to summary page (default Me and Others mode)
    await page.getByLabel("Meno *").first().fill("Ján");
    await page.getByLabel("Priezvisko *").first().fill("Novák");
    await page.getByLabel("Vek *").first().fill("35");
    await page.getByLabel("Telefón *").fill("+421900123456");
    await page.getByLabel("E-mail *").fill(FREE_EMAIL);
    await page.getByLabel("Meno *").nth(1).fill("Eva");
    await page.getByLabel("Priezvisko *").nth(1).fill("Nováková");
    await page.getByLabel("Vek *").nth(1).fill("10");

    await page.getByRole("button", { name: "Ďalej →" }).click();
    await expect(page).toHaveURL("/registration/summary");

    await page.getByRole("button", { name: "Registrovať" }).click();

    await expect(page.getByText("aktualizáciu")).toBeVisible();
  });
});
