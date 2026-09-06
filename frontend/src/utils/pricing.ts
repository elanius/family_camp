export type Accommodation = "double" | "single" | "none";

export const ACCOMMODATION_PRICE: Record<Accommodation, number> = {
  double: 179,
  single: 219,
  none: 0,
};

export const ACCOMMODATION_LABEL: Record<Accommodation, string> = {
  double: "Dvojlôžková izba",
  single: "Jednolôžková izba",
  none: "Bez ubytovania a stravy",
};

export const ACCOMMODATION_NOTE: Record<Accommodation, string> = {
  double: "2× nocľah, 2× raňajky, 2× obed, 2× večera, miestna daň",
  single: "2× nocľah, 2× raňajky, 2× obed, 2× večera, miestna daň",
  none: "Účasť len na prednáškach, bez ubytovania a stravy",
};

export const ACCOMMODATION_ORDER: Accommodation[] = ["double", "single", "none"];

/** A ZTP card holder pays no local tax, so their stay is 3 € cheaper. */
export const ZTP_DISCOUNT = 3;

export const ZTP_LABEL = "Vlastník preukazu ZŤP";

export const ZTP_HINT =
  `Držiteľ preukazu ZŤP neplatí miestnu daň — cena za pobyt sa znižuje ` +
  `o ${ZTP_DISCOUNT} €.`;

/** Price of one person's package, after the ZTP exemption from the local tax. */
export function personPrice(
  accommodation: Accommodation,
  ztp = false,
): number {
  const base = ACCOMMODATION_PRICE[accommodation];
  // Nothing is booked with "none", so there is no local tax to waive either.
  return ztp && accommodation !== "none" ? base - ZTP_DISCOUNT : base;
}

/** Room types that qualify for the employer recreation voucher (2-night stay). */
export function qualifiesForVoucher(accommodation: Accommodation): boolean {
  return accommodation !== "none";
}

export interface PricePerson {
  name: string;
  surname: string;
  accommodation: Accommodation;
  /** Holder of a ZTP card — exempt from the local tax. */
  ztp?: boolean;
}

export interface PriceLineItem {
  name: string;
  accommodation: Accommodation;
  price: number;
}

export interface PriceBreakdown {
  items: PriceLineItem[];
  /** Sum of the accommodation packages, without the voluntary contribution. */
  accommodationTotal: number;
  extraContribution: number;
  /** Full price of the stay plus the contribution, whoever ends up collecting it. */
  total: number;
  /** Settled at the hotel reception — the stay, when the recreation voucher is claimed. */
  paidAtHotel: number;
  /** Transferred to EVS: the contribution alone once the voucher moves the stay. */
  amountDue: number;
}

export function calculatePrice(
  people: PricePerson[],
  extraContribution = 0,
  recreationVoucher = false,
): PriceBreakdown {
  const items: PriceLineItem[] = people.map((p) => ({
    name: `${p.name} ${p.surname}`.trim(),
    accommodation: p.accommodation,
    price: personPrice(p.accommodation, p.ztp),
  }));

  const accommodationTotal = items.reduce((sum, item) => sum + item.price, 0);
  const extra = Math.max(0, Math.round(extraContribution) || 0);
  const paidAtHotel = recreationVoucher ? accommodationTotal : 0;

  return {
    items,
    accommodationTotal,
    extraContribution: extra,
    total: accommodationTotal + extra,
    paidAtHotel,
    amountDue: accommodationTotal + extra - paidAtHotel,
  };
}
