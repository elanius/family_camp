"""Package prices and what a registration actually owes.

Mirrors `frontend/src/utils/pricing.ts` — the two must stay in sync.
"""

# Price per attending person:
#   double – twin room, single – single room, none – lectures only.
ACCOMMODATION_PRICE = {"double": 179, "single": 219, "none": 0}


def voucher_claimed(doc: dict) -> bool:
    """Top-level voucher flag, falling back to the legacy per-person flags."""
    if "recreation_voucher" in doc:
        return bool(doc["recreation_voucher"])
    if doc.get("registrant", {}).get("recreation_voucher"):
        return True
    return any(a.get("recreation_voucher") for a in doc.get("attendees", []))


def accommodation_total(registrant: dict, attendees: list[dict]) -> int:
    """Price of the packages alone, without the voluntary contribution."""
    total = 0
    if registrant.get("is_attendee") and registrant.get("accommodation"):
        total += ACCOMMODATION_PRICE.get(registrant["accommodation"], 0)
    for a in attendees:
        total += ACCOMMODATION_PRICE.get(a.get("accommodation"), 0)
    return total


def hotel_amount(registrant: dict, attendees: list[dict], recreation_voucher: bool) -> int:
    """What is settled at the hotel reception — the stay, when a voucher is claimed."""
    return accommodation_total(registrant, attendees) if recreation_voucher else 0


def transfer_amount(
    registrant: dict,
    attendees: list[dict],
    extra_contribution: int = 0,
    recreation_voucher: bool = False,
) -> int:
    """Amount the registrant transfers to EVS.

    With a recreation voucher the stay is settled at the hotel reception, so only
    the voluntary contribution is invoiced — nothing at all without one.
    """
    stay = 0 if recreation_voucher else accommodation_total(registrant, attendees)
    return stay + max(0, int(extra_contribution or 0))


def amount_due(doc: dict) -> int:
    """What is left to transfer for a stored registration.

    An amount already sent in the payment e-mail wins over the calculation.
    """
    stored = doc.get("payment_amount")
    if stored is not None:
        return int(stored)
    return transfer_amount(
        doc["registrant"],
        doc.get("attendees", []),
        doc.get("extra_contribution", 0),
        voucher_claimed(doc),
    )
