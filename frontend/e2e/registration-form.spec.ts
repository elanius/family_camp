import { test, expect } from "@playwright/test";
import {
  attendeeRoom,
  fillAttendee,
  fillRegistrant,
  registrantRoom,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/registration");
});

test.describe("Registration form – modes", () => {
  test("defaults to 'Len ja' with no attendees section", async ({ page }) => {
    await expect(page.getByRole("radio", { name: /Len ja/ })).toBeChecked();
    await expect(
      page.getByRole("button", { name: /Pridať účastníka/ }),
    ).not.toBeVisible();
  });

  test("'Ja a ďalší' shows both the registrant package and an attendee", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await expect(registrantRoom(page, "double")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ďalší účastníci" }),
    ).toBeVisible();
    await expect(attendeeRoom(page, 0, "double")).toBeVisible();
  });

  test("'Len ďalší' hides the registrant package — they do not attend", async ({
    page,
  }) => {
    await page.getByRole("radio", { name: /Len ďalší/ }).check();
    await expect(registrantRoom(page, "double")).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kontaktná osoba (platiteľ)" }),
    ).toBeVisible();
    await expect(attendeeRoom(page, 0, "double")).toBeVisible();
  });

  test("switching mode resets what was already typed", async ({ page }) => {
    await page.locator("#reg-name").fill("Ján");
    await page.getByRole("radio", { name: /Len ďalší/ }).check();
    await expect(page.locator("#reg-name")).toHaveValue("");
  });
});

test.describe("Registration form – accommodation", () => {
  test("offers all three packages with their prices", async ({ page }) => {
    await expect(page.getByText("Dvojlôžková izba").first()).toBeVisible();
    await expect(page.getByText("Jednolôžková izba").first()).toBeVisible();
    await expect(page.getByText("Bez ubytovania a stravy").first()).toBeVisible();
    await expect(page.getByText("179 €").first()).toBeVisible();
    await expect(page.getByText("219 €").first()).toBeVisible();
  });

  test("roommate field appears only for a twin room", async ({ page }) => {
    await expect(page.locator("#reg-roommate")).not.toBeVisible();
    await registrantRoom(page, "double").check();
    await expect(page.locator("#reg-roommate")).toBeVisible();
    await registrantRoom(page, "single").check();
    await expect(page.locator("#reg-roommate")).not.toBeVisible();
  });

  test("voucher checkbox is hidden when no stay is booked", async ({ page }) => {
    const voucher = page.getByText(
      "Mám záujem uplatniť si rekreačný poukaz u zamestnávateľa",
    );
    await registrantRoom(page, "double").check();
    await expect(voucher).toBeVisible();
    await registrantRoom(page, "none").check();
    await expect(voucher).not.toBeVisible();
  });

  test("the voucher is offered only when the registrant attends", async ({
    page,
  }) => {
    const voucher = page.getByText(
      "Mám záujem uplatniť si rekreačný poukaz u zamestnávateľa",
    );
    await registrantRoom(page, "double").check();
    await expect(voucher).toBeVisible();

    // "Len ďalší" — the payer does not come, so there is nothing to claim.
    await page.getByRole("radio", { name: /Len ďalší/ }).check();
    await expect(voucher).not.toBeVisible();
  });

  test("ticking the voucher reveals the billing address for the hotel", async ({
    page,
  }) => {
    await fillRegistrant(page, { room: "double" });
    await expect(page.locator("#voucher-address")).not.toBeVisible();

    await page
      .getByLabel("Mám záujem uplatniť si rekreačný poukaz")
      .check();

    // Name and surname come from the contact details.
    await expect(page.locator("#voucher-name")).toHaveValue("Ján");
    await expect(page.locator("#voucher-surname")).toHaveValue("Novák");
    await expect(page.locator("#voucher-address")).toBeVisible();
    await expect(page.locator("#voucher-city")).toBeVisible();
    await expect(page.locator("#voucher-postal-code")).toBeVisible();
  });
});

test.describe("Registration form – price preview", () => {
  test("adds up rooms and the voluntary contribution", async ({ page }) => {
    await page.getByRole("radio", { name: /Ja a ďalší/ }).check();
    await fillRegistrant(page, { room: "single" });
    await fillAttendee(page, 0, { room: "double" });
    await page.locator("#reg-extra").fill("25");

    // 219 + 179 + 25
    await expect(page.locator(".price-preview__total")).toContainText("423");
  });

  test("a lecture-only attendee costs nothing", async ({ page }) => {
    await fillRegistrant(page, { room: "none" });
    await expect(page.locator(".price-preview__total")).toContainText("0");
    await expect(page.getByText("bez poplatku")).toBeVisible();
  });
});
