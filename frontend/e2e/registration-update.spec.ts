import { test, expect, type Page } from "@playwright/test";

const TOKEN = "test-token-123";

const REGISTRATION = {
  registration_type: "me_and_others",
  registrant: {
    name: "Ján",
    surname: "Novák",
    phone: "+421900000000",
    email: "jan@example.sk",
    is_attendee: true,
    accommodation: "double",
    roommate_preference: "Eva Nováková",
  },
  attendees: [
    {
      name: "Eva",
      surname: "Nováková",
      accommodation: "double",
      phone: null,
      email: "eva@example.sk",
      roommate_preference: "Ján Novák",
    },
  ],
  note: "Prídeme v piatok.",
  extra_contribution: 20,
  recreation_voucher: true,
  voucher_billing: {
    name: "Ján",
    surname: "Novák",
    address: "Hlavná 12",
    city: "Bratislava",
    postal_code: "811 01",
  },
  is_paid: false,
  cancelled: false,
  locked: false,
};

/** Serve GET /api/registration/:token with the given overrides. */
async function stubLoad(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route(`**/api/registration/${TOKEN}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...REGISTRATION, ...overrides }),
    });
  });
}

test.describe("Update page – loading", () => {
  test("prefills the form from the saved registration", async ({ page }) => {
    await stubLoad(page);
    await page.goto(`/update/${TOKEN}`);

    await expect(
      page.getByRole("heading", { name: "Úprava prihlášky" }),
    ).toBeVisible();
    await expect(page.locator("#reg-name")).toHaveValue("Ján");
    await expect(page.locator("#reg-email")).toHaveValue("jan@example.sk");
    await expect(
      page.locator('input[name="reg-accommodation"][value="double"]'),
    ).toBeChecked();
    await expect(page.locator("#reg-roommate")).toHaveValue("Eva Nováková");
    await expect(page.locator("#reg-extra")).toHaveValue("20");
    await expect(page.locator("#name-0")).toHaveValue("Eva");
    await expect(page.locator("#reg-note")).toHaveValue("Prídeme v piatok.");
    await expect(
      page.getByLabel("Mám záujem uplatniť si rekreačný poukaz"),
    ).toBeChecked();
    await expect(page.locator("#voucher-address")).toHaveValue("Hlavná 12");
    await expect(page.locator("#voucher-city")).toHaveValue("Bratislava");
    await expect(page.locator("#voucher-postal-code")).toHaveValue("811 01");
    // 179 + 179 + 20
    await expect(page.locator(".price-preview__total")).toContainText("378");
  });

  test("shows a not-found screen for an unknown token", async ({ page }) => {
    await page.route("**/api/registration/*", (route) =>
      route.fulfill({ status: 404, body: "{}" }),
    );
    await page.goto(`/update/${TOKEN}`);
    await expect(
      page.getByRole("heading", { name: "Neplatný odkaz" }),
    ).toBeVisible();
  });

  test("locks a registration that is already confirmed", async ({ page }) => {
    await stubLoad(page, { is_paid: true });
    await page.goto(`/update/${TOKEN}`);
    await expect(
      page.getByRole("heading", { name: "Prihláška je potvrdená" }),
    ).toBeVisible();
  });

  test("locks a registration once payment info was sent", async ({ page }) => {
    await stubLoad(page, { locked: true });
    await page.goto(`/update/${TOKEN}`);
    await expect(
      page.getByRole("heading", { name: "Prihlášku už nie je možné meniť" }),
    ).toBeVisible();
  });

  test("shows a cancelled registration as cancelled", async ({ page }) => {
    await stubLoad(page, { cancelled: true });
    await page.goto(`/update/${TOKEN}`);
    await expect(
      page.getByRole("heading", { name: "Prihláška bola zrušená" }),
    ).toBeVisible();
  });

  test("a contact person who does not attend gets no package picker", async ({
    page,
  }) => {
    await stubLoad(page, {
      registration_type: "just_others",
      registrant: {
        ...REGISTRATION.registrant,
        is_attendee: false,
        accommodation: null,
        roommate_preference: null,
      },
      recreation_voucher: false,
      voucher_billing: null,
    });
    await page.goto(`/update/${TOKEN}`);

    await expect(
      page.locator('input[name="reg-accommodation"][value="double"]'),
    ).not.toBeVisible();
    await expect(page.locator('input[name="accommodation-0"][value="double"]')).toBeVisible();
  });
});

test.describe("Update page – saving", () => {
  test("sends the edited values and confirms the save", async ({ page }) => {
    await stubLoad(page);
    let body: Record<string, never> | undefined;
    await page.route(`**/api/registration/${TOKEN}`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto(`/update/${TOKEN}`);
    await page.locator('input[name="reg-accommodation"][value="single"]').check();
    await page.locator("#reg-extra").fill("60");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();

    await expect(page.getByText("Prihláška bola aktualizovaná.")).toBeVisible();

    const payload = body as unknown as {
      registrant: { accommodation: string };
      extra_contribution: number;
      recreation_voucher: boolean;
      voucher_billing: { address: string; city: string; postal_code: string };
    };
    expect(payload.registrant.accommodation).toBe("single");
    expect(payload.extra_contribution).toBe(60);
    expect(payload.recreation_voucher).toBe(true);
    expect(payload.voucher_billing).toMatchObject({
      address: "Hlavná 12",
      city: "Bratislava",
      postal_code: "811 01",
    });
  });

  test("reports a save failure", async ({ page }) => {
    await stubLoad(page);
    await page.route(`**/api/registration/${TOKEN}`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 500, body: "{}" });
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(
      page.getByText("Uloženie zlyhalo. Skúste to prosím znova."),
    ).toBeVisible();
  });

  test("reports a registration locked server-side", async ({ page }) => {
    await stubLoad(page);
    await page.route(`**/api/registration/${TOKEN}`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({ status: 403, body: "{}" });
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(
      page.getByText("Prihláška je uzavretá, zmeny nie sú možné."),
    ).toBeVisible();
  });

  test("validation still applies when editing", async ({ page }) => {
    await stubLoad(page);
    await page.goto(`/update/${TOKEN}`);

    await page.locator("#reg-name").fill("");
    await page.getByRole("button", { name: "Uložiť zmeny" }).click();
    await expect(page.getByText("Meno je povinné.")).toBeVisible();
  });
});

test.describe("Update page – cancelling", () => {
  test("asks for confirmation before cancelling", async ({ page }) => {
    await stubLoad(page);
    await page.route(`**/api/registration/${TOKEN}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await route.fulfill({ status: 200, body: "{}" });
    });

    await page.goto(`/update/${TOKEN}`);
    await page.getByRole("button", { name: "Zrušiť prihlášku" }).click();
    await expect(
      page.getByText("Naozaj chcete zrušiť prihlášku?"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Áno, zrušiť prihlášku" }).click();
    await expect(
      page.getByRole("heading", { name: "Prihláška bola zrušená" }),
    ).toBeVisible();
  });

  test("backing out of the confirmation keeps the form", async ({ page }) => {
    await stubLoad(page);
    await page.goto(`/update/${TOKEN}`);

    await page.getByRole("button", { name: "Zrušiť prihlášku" }).click();
    await page.getByRole("button", { name: "Späť" }).click();
    await expect(
      page.getByRole("button", { name: "Zrušiť prihlášku" }),
    ).toBeVisible();
  });
});
