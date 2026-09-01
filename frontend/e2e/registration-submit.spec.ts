import { test, expect } from "@playwright/test";
import { claimVoucher, fillAttendee, fillRegistrant } from "./helpers";

interface SubmittedPayload {
  registration_type: string;
  registrant: {
    name: string;
    surname: string;
    email: string;
    is_attendee: boolean;
    accommodation?: string;
    roommate_preference?: string;
  };
  attendees: {
    name: string;
    accommodation: string;
    email?: string;
  }[];
  note?: string;
  extra_contribution: number;
  recreation_voucher: boolean;
  voucher_billing?: {
    name: string;
    surname: string;
    address: string;
    city: string;
    postal_code: string;
  };
}

/** Capture the POST body and answer with the given status. */
async function stubRegistration(
  page: import("@playwright/test").Page,
  status = 201,
) {
  const captured: { body?: SubmittedPayload } = {};
  await page.route("**/api/registration", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    captured.body = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ message: "ok" }),
    });
  });
  return captured;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/registration");
});

test.describe("Summary and submit", () => {
  test("summary repeats what was entered before sending", async ({ page }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await fillRegistrant(page, { room: "double" });
    await page.locator("#reg-roommate").fill("Eva Nováková");
    await fillAttendee(page, 0, { room: "double" });
    await claimVoucher(page);
    await page.locator("#reg-note").fill("Prídeme v piatok o 15:30.");

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await expect(page).toHaveURL("/summary");

    await expect(
      page.getByRole("heading", { name: "Zhrnutie prihlášky" }),
    ).toBeVisible();
    await expect(
      page.getByText("Ján Novák", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Eva Nováková", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("Áno, mám záujem")).toBeVisible();
    await expect(
      page.getByText("Hlavná 12, 811 01 Bratislava"),
    ).toBeVisible();
    await expect(page.getByText("Prídeme v piatok o 15:30.")).toBeVisible();
    // 179 + 179
    await expect(page.locator(".price-preview__total")).toContainText("358");
  });

  test("submits the whole 'Ja a ďalší' payload", async ({ page }) => {
    const captured = await stubRegistration(page);

    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await fillRegistrant(page, { room: "single" });
    await fillAttendee(page, 0, { room: "none" });
    await page.locator("#reg-extra").fill("40");

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(page.getByText("Prihláška bola odoslaná")).toBeVisible();

    const body = captured.body!;
    expect(body.registration_type).toBe("me_and_others");
    expect(body.registrant.is_attendee).toBe(true);
    expect(body.registrant.accommodation).toBe("single");
    expect(body.attendees).toHaveLength(1);
    expect(body.attendees[0].accommodation).toBe("none");
    expect(body.extra_contribution).toBe(40);
    expect(body.recreation_voucher).toBe(false);
  });

  test("submits a 'Len ja' payload with no attendees", async ({ page }) => {
    const captured = await stubRegistration(page);

    await fillRegistrant(page, { room: "double" });
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(page.getByText("Prihláška bola odoslaná")).toBeVisible();

    const body = captured.body!;
    expect(body.registration_type).toBe("only_me");
    expect(body.registrant.accommodation).toBe("double");
    expect(body.attendees).toHaveLength(0);
    expect(body.extra_contribution).toBe(0);
  });

  test("submits a 'Len ďalší' payload where the payer does not attend", async ({
    page,
  }) => {
    const captured = await stubRegistration(page);

    await page.getByRole("radio", { name: /Len ďalší/ }).check();
    await fillRegistrant(page);
    await fillAttendee(page, 0, { room: "single" });

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(page.getByText("Prihláška bola odoslaná")).toBeVisible();

    const body = captured.body!;
    expect(body.registration_type).toBe("just_others");
    expect(body.registrant.is_attendee).toBe(false);
    expect(body.registrant.accommodation).toBeUndefined();
    expect(body.attendees[0].accommodation).toBe("single");
  });

  test("accepts a registration on an e-mail that is already in use", async ({
    page,
  }) => {
    await page.route("**/api/registration/check-email**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ exists: true }),
      }),
    );
    const captured = await stubRegistration(page);

    await fillRegistrant(page, { room: "double" });
    await page.locator("#reg-email").blur();
    await expect(
      page.getByText("Na tento e-mail už jedna prihláška existuje."),
    ).toBeVisible();

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(page.getByText("Prihláška bola odoslaná")).toBeVisible();
    expect(captured.body!.registrant.email).toBe("jan@example.sk");
  });

  test("submits the voucher as a top-level claim with billing data", async ({
    page,
  }) => {
    const captured = await stubRegistration(page);

    await fillRegistrant(page, { room: "double" });
    await claimVoucher(page);

    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(page.getByText("Prihláška bola odoslaná")).toBeVisible();

    const body = captured.body!;
    expect(body.recreation_voucher).toBe(true);
    expect(body.voucher_billing).toEqual({
      name: "Ján",
      surname: "Novák",
      address: "Hlavná 12",
      city: "Bratislava",
      postal_code: "811 01",
    });
  });

  test("reports a server failure and keeps the data for a retry", async ({
    page,
  }) => {
    await stubRegistration(page, 500);

    await fillRegistrant(page, { room: "double" });
    await page.getByRole("button", { name: /Ďalej/ }).click();
    await page.getByRole("button", { name: "Odoslať prihlášku" }).click();

    await expect(
      page.getByText("Odoslanie prihlášky zlyhalo. Skúste to prosím znova."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Odoslať prihlášku" }),
    ).toBeEnabled();
  });

  test("opening /summary directly bounces back to the form", async ({
    page,
  }) => {
    await page.goto("/summary");
    await expect(page).toHaveURL("/registration");
  });
});
