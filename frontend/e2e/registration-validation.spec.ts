import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/form");
});

test.describe("Registration form validation", () => {
  test("shows required field errors on empty submit", async ({ page }) => {
    await page.getByRole("button", { name: "Registrovať" }).click();

    // Registrant errors
    await expect(page.getByText("Meno je povinné.").first()).toBeVisible();
    await expect(
      page.getByText("Priezvisko je povinné.").first(),
    ).toBeVisible();
    await expect(page.getByText("Vek je povinný.").first()).toBeVisible();
    await expect(page.getByText("Telefón je povinný.")).toBeVisible();
    await expect(page.getByText("E-mail je povinný.")).toBeVisible();
    await expect(page.getByText("Doprava je povinná.")).toBeVisible();

    // Attendee errors
    await expect(page.getByText("Meno je povinné.").nth(1)).toBeVisible();
    await expect(page.getByText("Priezvisko je povinné.").nth(1)).toBeVisible();
    await expect(page.getByText("Vek je povinný.").nth(1)).toBeVisible();
  });

  test("shows error for invalid email format", async ({ page }) => {
    await page.getByLabel("E-mail *").fill("not-an-email");
    await page.getByRole("button", { name: "Registrovať" }).click();
    await expect(page.getByText("Zadajte platný e-mail.")).toBeVisible();
  });

  test("shows error for invalid phone format", async ({ page }) => {
    await page.getByLabel("Telefón *").fill("abc-invalid");
    await page.getByRole("button", { name: "Registrovať" }).click();
    await expect(
      page.getByText("Zadajte platné telefónne číslo."),
    ).toBeVisible();
  });

  test("shows error for age out of range", async ({ page }) => {
    await page.getByLabel("Vek *").first().fill("200");
    await page.getByRole("button", { name: "Registrovať" }).click();
    await expect(
      page.getByText("Zadajte platný vek (0–120).").first(),
    ).toBeVisible();
  });

  test("does not submit when registrant fields are missing", async ({
    page,
  }) => {
    let submitted = false;
    await page.route("/api/registration", async (route) => {
      submitted = true;
      await route.fulfill({ status: 201, body: "{}" });
    });

    await page.getByRole("button", { name: "Registrovať" }).click();
    expect(submitted).toBe(false);
  });

  test("optional email on attendee over 14 accepts invalid format and shows error", async ({
    page,
  }) => {
    const attendeeAgeInput = page.getByLabel("Vek *").nth(1);
    await attendeeAgeInput.fill("16");

    const optionalEmail = page.getByLabel(/E-mail.*nepovinné/i).first();
    await optionalEmail.fill("bad-email");

    await page.getByRole("button", { name: "Registrovať" }).click();
    await expect(page.getByText("Zadajte platný e-mail.")).toBeVisible();
  });

  test("optional phone on attendee over 14 accepts invalid format and shows error", async ({
    page,
  }) => {
    const attendeeAgeInput = page.getByLabel("Vek *").nth(1);
    await attendeeAgeInput.fill("17");

    const optionalPhone = page.getByLabel(/Telefón.*nepovinné/i).first();
    await optionalPhone.fill("xyz");

    await page.getByRole("button", { name: "Registrovať" }).click();
    await expect(
      page.getByText("Zadajte platné telefónne číslo."),
    ).toBeVisible();
  });

  test("shows backend error message on 500 response", async ({ page }) => {
    await page.route("/api/registration", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Server error" }),
      });
    });

    // Fill valid form
    await page.getByLabel("Meno *").first().fill("Ján");
    await page.getByLabel("Priezvisko *").first().fill("Novák");
    await page.getByLabel("Vek *").first().fill("35");
    await page.getByLabel("Telefón *").fill("+421900000000");
    await page.getByLabel("E-mail *").fill("jan@example.sk");
    await page.getByRole("radio", { name: /Individuálna doprava/ }).click();
    await page.getByLabel("Meno *").nth(1).fill("Eva");
    await page.getByLabel("Priezvisko *").nth(1).fill("Nováková");
    await page.getByLabel("Vek *").nth(1).fill("8");

    await page.getByRole("button", { name: "Registrovať" }).click();

    await expect(
      page.getByText("Registrácia zlyhala. Skúste to prosím znova."),
    ).toBeVisible();
  });

  test("Just Others mode: no age field for registrant, no age required error shown for it", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /Len ďalší/ }).click();
    await page.getByRole("button", { name: "Registrovať" }).click();

    // Age error should only appear for attendees, not registrant
    const ageErrors = page.getByText("Vek je povinný.");
    // The attendee age error exists
    await expect(ageErrors.first()).toBeVisible();

    // There should be exactly one age error (the attendee), not two
    await expect(ageErrors).toHaveCount(1);
  });

  test.describe("Only Me mode", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("radio", { name: /Len ja/ }).click();
    });

    test("hides attendees section entirely", async ({ page }) => {
      await expect(
        page.getByRole("heading", { name: /Ďalší účastníci|Účastníci/ }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: /Pridať účastníka/ }),
      ).not.toBeVisible();
    });

    test("shows age field for registrant", async ({ page }) => {
      await expect(page.getByLabel("Vek *")).toBeVisible();
    });

    test("shows required field errors on empty submit (no attendee errors)", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Registrovať" }).click();

      await expect(page.getByText("Meno je povinné.")).toBeVisible();
      await expect(page.getByText("Priezvisko je povinné.")).toBeVisible();
      await expect(page.getByText("Vek je povinný.")).toBeVisible();
      await expect(page.getByText("Telefón je povinný.")).toBeVisible();
      await expect(page.getByText("E-mail je povinný.")).toBeVisible();
      await expect(page.getByText("Doprava je povinná.")).toBeVisible();

      // No second set of errors from attendees
      await expect(page.getByText("Meno je povinné.")).toHaveCount(1);
      await expect(page.getByText("Vek je povinný.")).toHaveCount(1);
    });

    test("submits successfully with only registrant data", async ({ page }) => {
      let requestBody: unknown;
      await page.route("/api/registration", async (route) => {
        requestBody = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({ status: 201, body: "{}" });
      });

      await page.getByLabel("Meno *").fill("Ján");
      await page.getByLabel("Priezvisko *").fill("Novák");
      await page.getByLabel("Vek *").fill("30");
      await page.getByLabel("Telefón *").fill("+421900000000");
      await page.getByLabel("E-mail *").fill("jan@example.sk");
      await page.getByRole("radio", { name: /Individuálna doprava/ }).click();

      await page.getByRole("button", { name: "Registrovať" }).click();

      await expect(
        page.getByText("Registrácia prebehla úspešne!"),
      ).toBeVisible();

      const body = requestBody as {
        registration_type: string;
        registrant: {
          is_attendee: boolean;
          age: number;
          transportation: string;
        };
        attendees: unknown[];
      };
      expect(body.registration_type).toBe("only_me");
      expect(body.registrant.is_attendee).toBe(true);
      expect(body.registrant.age).toBe(30);
      expect(body.registrant.transportation).toBe("individual");
      expect(body.attendees).toHaveLength(0);
    });

    test("does not submit when registrant fields are missing", async ({
      page,
    }) => {
      let submitted = false;
      await page.route("/api/registration", async (route) => {
        submitted = true;
        await route.fulfill({ status: 201, body: "{}" });
      });

      await page.getByRole("button", { name: "Registrovať" }).click();
      expect(submitted).toBe(false);
    });

    test("shows backend error message on failure", async ({ page }) => {
      await page.route("/api/registration", async (route) => {
        await route.fulfill({ status: 500, body: "{}" });
      });

      await page.getByLabel("Meno *").fill("Ján");
      await page.getByLabel("Priezvisko *").fill("Novák");
      await page.getByLabel("Vek *").fill("30");
      await page.getByLabel("Telefón *").fill("+421900000000");
      await page.getByLabel("E-mail *").fill("jan@example.sk");

      await page.getByRole("button", { name: "Registrovať" }).click();

      await expect(
        page.getByText("Registrácia zlyhala. Skúste to prosím znova."),
      ).toBeVisible();
    });
  });
});
