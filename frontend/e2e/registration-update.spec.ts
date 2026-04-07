import { test, expect, type Page } from "@playwright/test";

const TOKEN = "abc123";
const TAKEN_EMAIL = "other@example.sk";

const mockRegistration = {
  registration_type: "just_others",
  registrant: {
    name: "Mária",
    surname: "Horváthová",
    age: null,
    phone: "+421911222333",
    email: "mama@example.sk",
    is_attendee: false,
  },
  attendees: [{ name: "Tomáš", surname: "Horváth", age: 9 }],
  is_paid: false,
  cancelled: false,
};

async function setupMocks(page: Page, overrides: Partial<typeof mockRegistration> = {}) {
  const data = { ...mockRegistration, ...overrides };

  await page.route(`/api/registration/${TOKEN}`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    } else if (method === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Registrácia bola aktualizovaná." }),
      });
    } else if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Registrácia bola zrušená." }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("/api/registration/check-email*", async (route) => {
    const url = new URL(route.request().url());
    const email = url.searchParams.get("email") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ exists: email === TAKEN_EMAIL }),
    });
  });
}

test.describe("Update registration page", () => {
  test("shows invalid token error for 404 response", async ({ page }) => {
    await page.route("/api/registration/invalidtoken", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found." }) });
      } else {
        await route.continue();
      }
    });

    await page.goto("/update/invalidtoken");
    await expect(page.getByText("Neplatný")).toBeVisible();
  });

  test("shows locked message when registration is paid", async ({ page }) => {
    await setupMocks(page, { is_paid: true });
    await page.goto(`/update/${TOKEN}`);

    await expect(page.getByText("Zmeny nie sú možné")).toBeVisible();
  });

  test("shows cancelled message when registration is cancelled", async ({ page }) => {
    await setupMocks(page, { cancelled: true });
    await page.goto(`/update/${TOKEN}`);

    await expect(page.getByText("zrušená")).toBeVisible();
  });

  test("pre-fills form with existing registration data", async ({ page }) => {
    await setupMocks(page);
    await page.goto(`/update/${TOKEN}`);

    await expect(page.getByLabel("Meno *").first()).toHaveValue("Mária");
    await expect(page.getByLabel("Priezvisko *").first()).toHaveValue("Horváthová");
    await expect(page.getByLabel("Telefón *")).toHaveValue("+421911222333");
    await expect(page.getByLabel("E-mail *")).toHaveValue("mama@example.sk");
  });

  test("allows editing and saving changes", async ({ page }) => {
    await setupMocks(page);
    await page.goto(`/update/${TOKEN}`);

    await page.getByLabel("Meno *").first().fill("Jana");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();

    await expect(page.getByText("Registrácia bola aktualizovaná.")).toBeVisible();
  });

  test("sends correct PUT payload on save", async ({ page }) => {
    let capturedBody: unknown;

    await page.route(`/api/registration/${TOKEN}`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRegistration) });
      } else if (method === "PUT") {
        capturedBody = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "ok" }) });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByLabel("Meno *").first().fill("Jana");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();

    expect(capturedBody).toMatchObject({
      registration_type: "just_others",
      registrant: expect.objectContaining({ name: "Jana", surname: "Horváthová" }),
    });
  });

  test("clicking Zrušiť registráciu shows confirmation prompt", async ({ page }) => {
    await setupMocks(page);
    await page.goto(`/update/${TOKEN}`);

    await page.getByRole("button", { name: "Zrušiť registráciu" }).click();

    await expect(page.getByText("Naozaj chcete zrušiť registráciu?")).toBeVisible();
  });

  test("cancels registration after confirmation", async ({ page }) => {
    await setupMocks(page);
    await page.goto(`/update/${TOKEN}`);

    await page.getByRole("button", { name: "Zrušiť registráciu" }).click();
    await page.getByRole("button", { name: "Áno, zrušiť registráciu" }).click();

    await expect(page.getByText("Registrácia bola zrušená.")).toBeVisible();
  });

  test("going back from confirmation hides the prompt", async ({ page }) => {
    await setupMocks(page);
    await page.goto(`/update/${TOKEN}`);

    await page.getByRole("button", { name: "Zrušiť registráciu" }).click();
    await expect(page.getByText("Naozaj chcete zrušiť registráciu?")).toBeVisible();

    await page.getByRole("button", { name: "Späť" }).click();
    await expect(page.getByText("Naozaj chcete zrušiť registráciu?")).not.toBeVisible();
  });

  test("shows email conflict error on PUT 409", async ({ page }) => {
    await page.route(`/api/registration/${TOKEN}`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRegistration) });
      } else if (method === "PUT") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Tento e-mail je už zaregistrovaný." }),
        });
      } else {
        await route.continue();
      }
    });

    // Allow check-email to pass so we can still submit
    await page.route("/api/registration/check-email*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ exists: false }) });
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByLabel("E-mail *").fill("other-taken@example.sk");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();

    // 409 from PUT → sets isEmailTaken → inline error shown
    await expect(page.getByText("Tento e-mail je už zaregistrovaný.")).toBeVisible();
  });

  test("shows locked error on PUT 403", async ({ page }) => {
    await page.route(`/api/registration/${TOKEN}`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRegistration) });
      } else if (method === "PUT") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Registrácia je uzavretá, zmeny nie sú možné." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();

    await expect(page.getByText("Registrácia je uzavretá, zmeny nie sú možné.")).toBeVisible();
  });

  test("shows locked error on DELETE 403", async ({ page }) => {
    await page.route(`/api/registration/${TOKEN}`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRegistration) });
      } else if (method === "DELETE") {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Registrácia je uzavretá, zrušenie nie je možné." }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByRole("button", { name: "Zrušiť registráciu" }).click();
    await page.getByRole("button", { name: "Áno, zrušiť registráciu" }).click();

    await expect(page.getByText("Registrácia je uzavretá, zrušenie nie je možné.")).toBeVisible();
  });
});
