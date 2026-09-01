import type { Page } from "@playwright/test";

export const ROOM = {
  double: 179,
  single: 219,
  none: 0,
} as const;

/** Select an accommodation package for the registrant. */
export function registrantRoom(page: Page, room: keyof typeof ROOM) {
  return page.locator(`input[name="reg-accommodation"][value="${room}"]`);
}

/** Select an accommodation package for the n-th attendee (0-based). */
export function attendeeRoom(
  page: Page,
  index: number,
  room: keyof typeof ROOM,
) {
  return page.locator(`input[name="accommodation-${index}"][value="${room}"]`);
}

/** Fill the registrant block with valid data. */
export async function fillRegistrant(
  page: Page,
  {
    name = "Ján",
    surname = "Novák",
    phone = "+421900000000",
    email = "jan@example.sk",
    room,
  }: {
    name?: string;
    surname?: string;
    phone?: string;
    email?: string;
    room?: keyof typeof ROOM;
  } = {},
) {
  await page.locator("#reg-name").fill(name);
  await page.locator("#reg-surname").fill(surname);
  await page.locator("#reg-phone").fill(phone);
  await page.locator("#reg-email").fill(email);
  if (room) await registrantRoom(page, room).check();
}

/** Fill the n-th attendee block with valid data. */
export async function fillAttendee(
  page: Page,
  index: number,
  {
    name = "Eva",
    surname = "Nováková",
    room = "double",
  }: { name?: string; surname?: string; room?: keyof typeof ROOM } = {},
) {
  await page.locator(`#name-${index}`).fill(name);
  await page.locator(`#surname-${index}`).fill(surname);
  await attendeeRoom(page, index, room).check();
}

/** Tick the recreation voucher and fill the billing address it reveals. */
export async function claimVoucher(
  page: Page,
  {
    address = "Hlavná 12",
    city = "Bratislava",
    postalCode = "811 01",
  }: { address?: string; city?: string; postalCode?: string } = {},
) {
  await page.getByLabel("Mám záujem uplatniť si rekreačný poukaz").check();
  await page.locator("#voucher-address").fill(address);
  await page.locator("#voucher-city").fill(city);
  await page.locator("#voucher-postal-code").fill(postalCode);
}
