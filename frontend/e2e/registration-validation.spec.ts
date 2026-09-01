import { test, expect } from "@playwright/test";
import { fillRegistrant, registrantRoom } from "./helpers";

/** Only the inline field errors, not the section note that repeats the wording. */
const packageErrors = (page: import("@playwright/test").Page) =>
  page.locator(".form-error", { hasText: "Vyberte ubytovanie a stravu." });

test.beforeEach(async ({ page }) => {
  await page.goto("/registration");
});

test.describe("Registration form validation", () => {
  test("reports every missing required registrant field", async ({ page }) => {
    await page.getByRole("button", { name: /Ďalej/ }).click();

    await expect(page.getByText("Meno je povinné.")).toBeVisible();
    await expect(page.getByText("Priezvisko je povinné.")).toBeVisible();
    await expect(page.getByText("Telefón je povinný.")).toBeVisible();
    await expect(page.getByText("E-mail je povinný.")).toBeVisible();
    await expect(packageErrors(page)).toHaveCount(1);
  });

  test("stays on the form when validation fails", async ({ page }) => {
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page).toHaveURL("/registration");
  });

  test("rejects a malformed e-mail", async ({ page }) => {
    await page.locator("#reg-email").fill("not-an-email");
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page.getByText("Zadajte platný e-mail.")).toBeVisible();
  });

  test("rejects a malformed phone number", async ({ page }) => {
    await page.locator("#reg-phone").fill("abc-invalid");
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(
      page.getByText("Zadajte platné telefónne číslo."),
    ).toBeVisible();
  });

  test("a contact person who does not attend needs no package", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /Len ďalší/ }).check();
    await page.getByRole("button", { name: /Ďalej/ }).click();

    // Only the attendee's package error is shown, not one for the registrant.
    await expect(packageErrors(page)).toHaveCount(1);
  });

  test("each attendee must have a package", async ({ page }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await fillRegistrant(page, { room: "double" });
    await page.locator("#name-0").fill("Eva");
    await page.locator("#surname-0").fill("Nováková");

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(packageErrors(page)).toHaveCount(1);
    await expect(page).toHaveURL("/registration");
  });

  test("an optional attendee e-mail must still be well formed", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await fillRegistrant(page, { room: "double" });
    await page.locator("#name-0").fill("Eva");
    await page.locator("#surname-0").fill("Nováková");
    await page.locator("#email-0").fill("bad-email");

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page.getByText("Zadajte platný e-mail.")).toBeVisible();
  });

  test("attendees can be added and removed", async ({ page }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await expect(page.getByText("Účastník 1")).toBeVisible();

    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    await expect(page.getByText("Účastník 2")).toBeVisible();

    await page.getByRole("button", { name: /Odstrániť Účastník 2/ }).click();
    await expect(page.getByText("Účastník 2")).not.toBeVisible();
  });

  test("warns about an already used e-mail but still lets you continue", async ({
    page,
  }) => {
    await page.route("**/api/registration/check-email**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true }),
      }),
    );

    await fillRegistrant(page, { room: "double" });
    await page.locator("#reg-email").blur();

    await expect(
      page.getByText("Na tento e-mail už jedna prihláška existuje."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Ďalej/ })).toBeEnabled();

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page).toHaveURL("/summary");
  });

  test("the voucher billing address must be complete", async ({ page }) => {
    await fillRegistrant(page, { room: "double" });
    await page.getByLabel("Mám záujem uplatniť si rekreačný poukaz").check();

    await page.getByRole("button", { name: /Ďalej/ }).click();

    await expect(page.getByText("Adresa je povinná.")).toBeVisible();
    await expect(page.getByText("Mesto je povinné.")).toBeVisible();
    await expect(page.getByText("PSČ je povinné.")).toBeVisible();
    await expect(page).toHaveURL("/registration");
  });

  test("does not advance while a required package is missing", async ({
    page,
  }) => {
    await fillRegistrant(page);
    await expect(registrantRoom(page, "double")).not.toBeChecked();
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page).toHaveURL("/registration");
  });
});
