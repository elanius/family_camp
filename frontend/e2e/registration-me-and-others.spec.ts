import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Mock the backend registration endpoint
  await page.route("/api/registration", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ message: "Registrácia prebehla úspešne." }),
    });
  });

  await page.goto("/registration/form");
});

test.describe("Me and Others registration", () => {
  test("form page renders with mode selector and Me and Others selected by default", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Registrácia na tábor" }),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: /Ja a ďalší/ })).toBeChecked();
    await expect(
      page.getByRole("radio", { name: /Len ďalší/ }),
    ).not.toBeChecked();
  });

  test("registrant section shows age field in Me and Others mode", async ({
    page,
  }) => {
    await expect(page.getByLabel("Vek *").first()).toBeVisible();
  });

  test("attendee older than 14 shows optional phone and email fields", async ({
    page,
  }) => {
    // The attendee section starts with one attendee form
    const ageInput = page.getByLabel("Vek *").nth(1); // second age field is attendee
    await ageInput.fill("15");

    await expect(page.getByLabel(/Telefón.*nepovinné/i).first()).toBeVisible();
    await expect(page.getByLabel(/E-mail.*nepovinné/i).first()).toBeVisible();
  });

  test("attendee 14 or younger does not show optional contact fields", async ({
    page,
  }) => {
    const ageInput = page.getByLabel("Vek *").nth(1);
    await ageInput.fill("14");

    await expect(page.getByLabel(/Telefón.*nepovinné/i)).not.toBeVisible();
    await expect(page.getByLabel(/E-mail.*nepovinné/i)).not.toBeVisible();
  });

  test("can add a second attendee", async ({ page }) => {
    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    const legends = page.locator(".attendee-form__legend");
    await expect(legends).toHaveCount(2);
    await expect(legends.nth(0)).toHaveText("Účastník 1");
    await expect(legends.nth(1)).toHaveText("Účastník 2");
  });

  test("can remove an attendee", async ({ page }) => {
    await page.getByRole("button", { name: /Pridať účastníka/ }).click();
    await expect(page.locator(".attendee-form")).toHaveCount(2);

    await page
      .getByRole("button", { name: /Odstrániť/ })
      .first()
      .click();
    await expect(page.locator(".attendee-form")).toHaveCount(1);
  });

  test("successful submission shows success message", async ({ page }) => {
    // Fill registrant
    await page.getByLabel("Meno *").first().fill("Ján");
    await page.getByLabel("Priezvisko *").first().fill("Novák");
    await page.getByLabel("Vek *").first().fill("35");
    await page.getByLabel("Telefón *").fill("+421900123456");
    await page.getByLabel("E-mail *").fill("jan.novak@example.sk");
    await page.getByRole("radio", { name: /Individuálna doprava/ }).click();

    // Fill first attendee
    await page.getByLabel("Meno *").nth(1).fill("Marek");
    await page.getByLabel("Priezvisko *").nth(1).fill("Novák");
    await page.getByLabel("Vek *").nth(1).fill("10");

    await page.getByRole("button", { name: "Registrovať" }).click();

    await expect(page.getByText("Registrácia prebehla úspešne!")).toBeVisible();
  });

  test("sends correct payload for Me and Others", async ({ page }) => {
    let capturedBody: unknown;

    await page.route("/api/registration", async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ message: "ok" }),
      });
    });

    await page.getByLabel("Meno *").first().fill("Ján");
    await page.getByLabel("Priezvisko *").first().fill("Novák");
    await page.getByLabel("Vek *").first().fill("35");
    await page.getByLabel("Telefón *").fill("+421900123456");
    await page.getByLabel("E-mail *").fill("jan@example.sk");
    await page
      .getByRole("radio", { name: /Doprava vlakom s organizátorom/ })
      .click();

    await page.getByLabel("Meno *").nth(1).fill("Eva");
    await page.getByLabel("Priezvisko *").nth(1).fill("Nováková");
    await page.getByLabel("Vek *").nth(1).fill("8");

    await page.getByRole("button", { name: "Registrovať" }).click();

    expect(capturedBody).toMatchObject({
      registration_type: "me_and_others",
      registrant: {
        name: "Ján",
        surname: "Novák",
        age: 35,
        phone: "+421900123456",
        email: "jan@example.sk",
        is_attendee: true,
        transportation: "train_with_organizer",
      },
      attendees: [{ name: "Eva", surname: "Nováková", age: 8 }],
    });
  });
});
