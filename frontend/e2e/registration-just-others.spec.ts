import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("/api/registration", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ message: "Registrácia prebehla úspešne." }),
    });
  });

  await page.goto("/registration/form");
  await page.getByRole("radio", { name: /Len ďalší/ }).click();
});

test.describe("Just Others registration", () => {
  test("switching to Just Others hides the registrant age field", async ({ page }) => {
    // Age field should only appear for attendees, not for the registrant
    const registrantSection = page.locator(".reg-form__section").first();
    await expect(registrantSection.getByLabel("Vek *")).not.toBeVisible();
  });

  test("registrant section still shows name, surname, phone, email", async ({ page }) => {
    const registrantSection = page.locator(".reg-form__section").first();
    await expect(registrantSection.getByLabel("Meno *")).toBeVisible();
    await expect(registrantSection.getByLabel("Priezvisko *")).toBeVisible();
    await expect(registrantSection.getByLabel("Telefón *")).toBeVisible();
    await expect(registrantSection.getByLabel("E-mail *")).toBeVisible();
  });

  test("attendee younger than 14 does not show optional contact fields", async ({ page }) => {
    const ageInput = page.getByLabel("Vek *").first(); // only attendee age field
    await ageInput.fill("12");
    await expect(page.getByLabel(/Telefón.*nepovinné/i)).not.toBeVisible();
  });

  test("attendee older than 14 shows optional phone and email", async ({ page }) => {
    const ageInput = page.getByLabel("Vek *").first();
    await ageInput.fill("16");
    await expect(page.getByLabel(/Telefón.*nepovinné/i)).toBeVisible();
    await expect(page.getByLabel(/E-mail.*nepovinné/i)).toBeVisible();
  });

  test("can add two attendees", async ({ page }) => {
    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    await expect(page.locator(".attendee-form")).toHaveCount(3);
  });

  test("sends correct payload for Just Others", async ({ page }) => {
    let capturedBody: unknown;

    await page.route("/api/registration", async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "ok" }),
      });
    });

    // Fill registrant (no age)
    await page.getByLabel("Meno *").first().fill("Mária");
    await page.getByLabel("Priezvisko *").first().fill("Horváthová");
    await page.getByLabel("Telefón *").fill("+421911222333");
    await page.getByLabel("E-mail *").fill("mama@example.sk");

    // Fill first attendee (child)
    await page.getByLabel("Meno *").nth(1).fill("Tomáš");
    await page.getByLabel("Priezvisko *").nth(1).fill("Horváth");
    await page.getByLabel("Vek *").fill("9");

    // Add second attendee (older)
    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    await page.getByLabel("Meno *").nth(2).fill("Zuzana");
    await page.getByLabel("Priezvisko *").nth(2).fill("Horváthová");
    await page.getByLabel("Vek *").nth(1).fill("16");

    await page.getByRole("button", { name: "Registrovať" }).click();

    expect(capturedBody).toMatchObject({
      registration_type: "just_others",
      registrant: {
        name: "Mária",
        surname: "Horváthová",
        phone: "+421911222333",
        email: "mama@example.sk",
        is_attendee: false,
      },
      attendees: [
        { name: "Tomáš", surname: "Horváth", age: 9 },
        { name: "Zuzana", surname: "Horváthová", age: 16 },
      ],
    });
  });

  test("successful submission shows success message", async ({ page }) => {
    await page.getByLabel("Meno *").first().fill("Mária");
    await page.getByLabel("Priezvisko *").first().fill("Horváthová");
    await page.getByLabel("Telefón *").fill("+421911222333");
    await page.getByLabel("E-mail *").fill("mama@example.sk");

    await page.getByLabel("Meno *").nth(1).fill("Tomáš");
    await page.getByLabel("Priezvisko *").nth(1).fill("Horváth");
    await page.getByLabel("Vek *").fill("9");

    await page.getByRole("button", { name: "Registrovať" }).click();

    await expect(page.getByText("Registrácia prebehla úspešne!")).toBeVisible();
  });
});
