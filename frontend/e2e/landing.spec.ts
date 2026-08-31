import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("shows the event name, dates and venue", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Vzdelávanie EVS", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("23. – 25. októbra 2026").first()).toBeVisible();
    await expect(
      page.getByText("Hotel Máj***, Liptovský Ján").first(),
    ).toBeVisible();
  });

  test("lists both lecturers with their topics", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Curt Westman" }),
    ).toBeVisible();
    await expect(page.getByText("Stará zmluva")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ole Lilleheim" }),
    ).toBeVisible();
    await expect(page.getByText("Prenasledovaní kresťania")).toBeVisible();
  });

  test("shows both room prices", async ({ page }) => {
    await expect(page.getByText("179 € v dvojlôžkovej izbe")).toBeVisible();
    await expect(page.getByText("219 € v jednolôžkovej izbe")).toBeVisible();
  });

  test("shows the registration deadline and contact details", async ({
    page,
  }) => {
    await expect(
      page.getByText("Do 27. septembra 2026", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("lydia@evs.sk").first()).toBeVisible();
    await expect(page.getByText("0911 798 800").first()).toBeVisible();
  });

  test("info card expands to reveal details", async ({ page }) => {
    const detail = page.getByText(
      "Začíname v piatok o 16:00 prvou prednáškou",
    );
    await expect(detail).not.toBeVisible();
    await page.getByRole("button", { name: "viac" }).first().click();
    await expect(detail).toBeVisible();
  });

  test("registration is open — both CTAs lead to the form", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Prihlásiť sa" })).toBeVisible();
    await page.getByRole("link", { name: "Vyplniť prihlášku" }).click();
    await expect(page).toHaveURL("/registration");
    await expect(
      page.getByRole("heading", { name: "Prihláška", level: 1 }),
    ).toBeVisible();
  });
});
