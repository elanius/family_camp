import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import AttendeeForm, {
  validateAttendee,
  type AttendeeData,
  type AttendeeErrors,
} from "../components/AttendeeForm";
import {
  ACCOMMODATION_LABEL,
  ACCOMMODATION_NOTE,
  ACCOMMODATION_ORDER,
  ACCOMMODATION_PRICE,
  calculatePrice,
  qualifiesForVoucher,
  type Accommodation,
  type PricePerson,
} from "../utils/pricing";
import VoucherSection, {
  validateVoucherBilling,
  type VoucherBillingErrors,
} from "../components/VoucherSection";
import {
  emptyAttendee,
  emptyRegistrant,
  useRegistration,
  type RegistrantData,
  type RegistrationType,
  type VoucherBilling,
} from "../context/RegistrationContext";
import { EVENT_SUBTITLE } from "../eventInfo";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface RegistrantErrors {
  name?: string;
  surname?: string;
  phone?: string;
  email?: string;
  accommodation?: string;
}

const PHONE_RE = /^\+?[0-9\s-]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistrant(
  data: RegistrantData,
  isAttendee: boolean,
): RegistrantErrors {
  const errors: RegistrantErrors = {};
  if (!data.name.trim()) errors.name = "Meno je povinné.";
  if (!data.surname.trim()) errors.surname = "Priezvisko je povinné.";

  if (!data.phone.trim()) {
    errors.phone = "Telefón je povinný.";
  } else if (!PHONE_RE.test(data.phone)) {
    errors.phone = "Zadajte platné telefónne číslo.";
  }

  if (!data.email.trim()) {
    errors.email = "E-mail je povinný.";
  } else if (!EMAIL_RE.test(data.email)) {
    errors.email = "Zadajte platný e-mail.";
  }

  if (isAttendee && !data.accommodation) {
    errors.accommodation = "Vyberte ubytovanie a stravu.";
  }

  return errors;
}

function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
}

/** Build the list of people the price is calculated from (accommodation already chosen). */
export function toPricePeople(
  registrant: RegistrantData,
  attendees: AttendeeData[],
  isAttendee: boolean,
  includeAttendees: boolean,
): PricePerson[] {
  const people: PricePerson[] = [];
  if (isAttendee && registrant.accommodation) {
    people.push({
      name: registrant.name || "–",
      surname: registrant.surname || "",
      accommodation: registrant.accommodation,
    });
  }
  if (includeAttendees) {
    for (const a of attendees) {
      if (a.accommodation) {
        people.push({
          name: a.name || "–",
          surname: a.surname || "",
          accommodation: a.accommodation,
        });
      }
    }
  }
  return people;
}

export default function RegistrationFormPage() {
  const {
    regType,
    setRegType,
    registrant,
    setRegistrant,
    attendees,
    setAttendees,
    note,
    setNote,
    extraContribution,
    setExtraContribution,
    recreationVoucher,
    setRecreationVoucher,
    voucherBilling,
    setVoucherBilling,
  } = useRegistration();

  const [registrantErrors, setRegistrantErrors] = useState<RegistrantErrors>(
    {},
  );
  const [attendeeErrors, setAttendeeErrors] = useState<AttendeeErrors[]>(() =>
    attendees.map(() => ({})),
  );
  const [voucherErrors, setVoucherErrors] = useState<VoucherBillingErrors>({});
  const [touched, setTouched] = useState(false);
  const [isEmailTaken, setIsEmailTaken] = useState(false);

  const navigate = useNavigate();
  const isMeAndOthers = regType === "me_and_others";
  const isOnlyMe = regType === "only_me";
  const isAttendee = isMeAndOthers || isOnlyMe;
  // The voucher covers the registrant's own stay, so it needs a booked room.
  const canClaimVoucher =
    isAttendee &&
    registrant.accommodation !== "" &&
    qualifiesForVoucher(registrant.accommodation);
  const claimsVoucher = canClaimVoucher && recreationVoucher;

  function handleRegTypeChange(e: ChangeEvent<HTMLInputElement>) {
    setRegType(e.target.value as RegistrationType);
    setRegistrant(emptyRegistrant());
    setRegistrantErrors({});
    setAttendees([emptyAttendee()]);
    setAttendeeErrors([{}]);
    setVoucherErrors({});
    setTouched(false);
    setIsEmailTaken(false);
  }

  function handleVoucherToggle(checked: boolean) {
    setRecreationVoucher(checked);
    if (!checked) {
      setVoucherErrors({});
      return;
    }
    // Pre-fill the invoice name from the contact details, still editable.
    setVoucherBilling({
      ...voucherBilling,
      name: voucherBilling.name || registrant.name.trim(),
      surname: voucherBilling.surname || registrant.surname.trim(),
    });
  }

  function handleVoucherBillingChange(
    field: keyof VoucherBilling,
    value: string,
  ) {
    const updated = { ...voucherBilling, [field]: value };
    setVoucherBilling(updated);
    if (touched) {
      setVoucherErrors(validateVoucherBilling(claimsVoucher, updated));
    }
  }

  function handleRegistrantChange(
    field: keyof RegistrantData,
    value: string | boolean,
  ) {
    const updated = { ...registrant, [field]: value };
    setRegistrant(updated);
    if (field === "email") setIsEmailTaken(false);
    if (touched) {
      setRegistrantErrors(validateRegistrant(updated, isAttendee));
    }
  }

  function handleAttendeeChange(
    index: number,
    field: keyof AttendeeData,
    value: string | boolean,
  ) {
    const updated = attendees.map((a, i) =>
      i === index ? { ...a, [field]: value } : a,
    );
    setAttendees(updated);
    if (touched) {
      setAttendeeErrors(updated.map((a) => validateAttendee(a)));
    }
  }

  async function handleEmailBlur() {
    const email = registrant.email.trim();
    if (!email || !EMAIL_RE.test(email)) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/registration/check-email?email=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { exists: boolean };
        setIsEmailTaken(data.exists);
      }
    } catch {
      // Network failure — a duplicate is only a warning, so nothing is blocked.
    }
  }

  function addAttendee() {
    setAttendees([...attendees, emptyAttendee()]);
    setAttendeeErrors([...attendeeErrors, {}]);
  }

  function removeAttendee(index: number) {
    setAttendees(attendees.filter((_, i) => i !== index));
    setAttendeeErrors(attendeeErrors.filter((_, i) => i !== index));
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    setTouched(true);

    const rErr = validateRegistrant(registrant, isAttendee);
    const aErrs = attendees.map(validateAttendee);
    const vErr = validateVoucherBilling(claimsVoucher, voucherBilling);
    setRegistrantErrors(rErr);
    setAttendeeErrors(aErrs);
    setVoucherErrors(vErr);

    // A duplicate e-mail only warns — the same address may register more groups.
    if (
      hasErrors(rErr) ||
      hasErrors(vErr) ||
      (!isOnlyMe && aErrs.some(hasErrors))
    )
      return;

    const extra = parseInt(extraContribution, 10);

    const payload = {
      registration_type: regType,
      registrant: {
        name: registrant.name.trim(),
        surname: registrant.surname.trim(),
        phone: registrant.phone.trim(),
        email: registrant.email.trim(),
        is_attendee: isAttendee,
        ...(isAttendee && {
          accommodation: registrant.accommodation as Accommodation,
          ...(registrant.roommatePreference.trim() && {
            roommate_preference: registrant.roommatePreference.trim(),
          }),
        }),
      },
      attendees: isOnlyMe
        ? []
        : attendees.map((a) => ({
            name: a.name.trim(),
            surname: a.surname.trim(),
            accommodation: a.accommodation as Accommodation,
            ...(a.roommatePreference.trim() && {
              roommate_preference: a.roommatePreference.trim(),
            }),
            ...(a.phone.trim() && { phone: a.phone.trim() }),
            ...(a.email.trim() && { email: a.email.trim() }),
          })),
      ...(note.trim() && { note: note.trim() }),
      extra_contribution: isNaN(extra) || extra < 0 ? 0 : extra,
      recreation_voucher: claimsVoucher,
      ...(claimsVoucher && {
        voucher_billing: {
          name: voucherBilling.name.trim(),
          surname: voucherBilling.surname.trim(),
          address: voucherBilling.address.trim(),
          city: voucherBilling.city.trim(),
          postal_code: voucherBilling.postalCode.trim(),
        },
      }),
    };

    navigate("/summary", { state: { regType, payload } });
  }

  const registrantLabel = isAttendee
    ? "Účastník (platiteľ)"
    : "Kontaktná osoba (platiteľ)";

  const pricePeople = toPricePeople(
    registrant,
    attendees,
    isAttendee,
    !isOnlyMe,
  );
  const parsedExtra = parseInt(extraContribution, 10);
  const priceBreakdown =
    pricePeople.length > 0 || parsedExtra > 0
      ? calculatePrice(pricePeople, isNaN(parsedExtra) ? 0 : parsedExtra)
      : null;

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Prihláška</h1>
        <p className="reg-form-page__subtitle">{EVENT_SUBTITLE}</p>

        <form onSubmit={handleNext} noValidate className="reg-form">
          {/* ── Mode selector ───────────────────────────── */}
          <fieldset className="reg-form__mode">
            <legend className="reg-form__mode-legend">Kto sa prihlasuje?</legend>
            <label className="reg-form__mode-option">
              <input
                type="radio"
                name="regType"
                value="only_me"
                checked={isOnlyMe}
                onChange={handleRegTypeChange}
              />
              <span>
                <strong>Len ja</strong> — prihlasujem iba seba
              </span>
            </label>
            <label className="reg-form__mode-option">
              <input
                type="radio"
                name="regType"
                value="me_and_others"
                checked={isMeAndOthers}
                onChange={handleRegTypeChange}
              />
              <span>
                <strong>Ja a ďalší</strong> — prihlasujem seba spolu s ďalšími
                (napr. manžel/manželka)
              </span>
            </label>
            <label className="reg-form__mode-option">
              <input
                type="radio"
                name="regType"
                value="just_others"
                checked={regType === "just_others"}
                onChange={handleRegTypeChange}
              />
              <span>
                <strong>Len ďalší</strong> — sám/sama sa nezúčastním, prihlasujem
                iné osoby
              </span>
            </label>
          </fieldset>

          {/* ── Registrant ──────────────────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">{registrantLabel}</h2>
            {isAttendee ? (
              <p className="reg-form__section-note">
                Táto osoba sa zúčastní vzdelávania a zároveň bude zodpovedná za
                platbu a komunikáciu.
              </p>
            ) : (
              <p className="reg-form__section-note">
                Táto osoba sa vzdelávania nezúčastní, ale bude zodpovedná za
                platbu a komunikáciu.
              </p>
            )}

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="reg-name">
                  Meno <span className="form-required">*</span>
                </label>
                <input
                  id="reg-name"
                  type="text"
                  className={`form-input${registrantErrors.name ? " is-invalid" : ""}`}
                  value={registrant.name}
                  onChange={(e) =>
                    handleRegistrantChange("name", e.target.value)
                  }
                  autoComplete="given-name"
                />
                {registrantErrors.name && (
                  <p className="form-error">{registrantErrors.name}</p>
                )}
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="reg-surname">
                  Priezvisko <span className="form-required">*</span>
                </label>
                <input
                  id="reg-surname"
                  type="text"
                  className={`form-input${registrantErrors.surname ? " is-invalid" : ""}`}
                  value={registrant.surname}
                  onChange={(e) =>
                    handleRegistrantChange("surname", e.target.value)
                  }
                  autoComplete="family-name"
                />
                {registrantErrors.surname && (
                  <p className="form-error">{registrantErrors.surname}</p>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label className="form-label" htmlFor="reg-phone">
                  Telefón <span className="form-required">*</span>
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  className={`form-input${registrantErrors.phone ? " is-invalid" : ""}`}
                  value={registrant.phone}
                  onChange={(e) =>
                    handleRegistrantChange("phone", e.target.value)
                  }
                  autoComplete="tel"
                  placeholder="+421 900 000 000"
                />
                {registrantErrors.phone && (
                  <p className="form-error">{registrantErrors.phone}</p>
                )}
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="reg-email">
                  E-mail <span className="form-required">*</span>
                </label>
                <input
                  id="reg-email"
                  type="email"
                  className={`form-input${registrantErrors.email ? " is-invalid" : ""}`}
                  value={registrant.email}
                  onChange={(e) =>
                    handleRegistrantChange("email", e.target.value)
                  }
                  onBlur={handleEmailBlur}
                  autoComplete="email"
                  placeholder="vas@email.sk"
                />
                {registrantErrors.email && (
                  <p className="form-error">{registrantErrors.email}</p>
                )}
                {!registrantErrors.email && isEmailTaken && (
                  <p className="form-warning">
                    Na tento e-mail už jedna prihláška existuje. Ak chcete
                    upraviť tú pôvodnú, použite odkaz z potvrdzovacieho
                    e-mailu — inak pokojne pokračujte a vytvorte novú.
                  </p>
                )}
              </div>
            </div>

            {isAttendee && (
              <>
                <div className="form-field">
                  <label className="form-label">
                    Ubytovanie a strava <span className="form-required">*</span>
                  </label>
                  <div className="form-radio-group form-radio-group--stacked">
                    {ACCOMMODATION_ORDER.map((option) => (
                      <label className="form-radio-option" key={option}>
                        <input
                          type="radio"
                          name="reg-accommodation"
                          value={option}
                          checked={registrant.accommodation === option}
                          onChange={() =>
                            handleRegistrantChange("accommodation", option)
                          }
                        />
                        <span>
                          <span className="form-radio-option__main">
                            {ACCOMMODATION_LABEL[option]}
                            <span className="form-radio-option__price">
                              {ACCOMMODATION_PRICE[option]}&nbsp;€
                            </span>
                          </span>
                          <span className="form-radio-option__note">
                            {ACCOMMODATION_NOTE[option]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {registrantErrors.accommodation && (
                    <p className="form-error">
                      {registrantErrors.accommodation}
                    </p>
                  )}
                </div>

                {registrant.accommodation === "double" && (
                  <div className="form-field">
                    <label className="form-label" htmlFor="reg-roommate">
                      Preferovaný spolubývajúci{" "}
                      <span className="form-optional">(nepovinné)</span>
                    </label>
                    <input
                      id="reg-roommate"
                      type="text"
                      className="form-input"
                      value={registrant.roommatePreference}
                      onChange={(e) =>
                        handleRegistrantChange(
                          "roommatePreference",
                          e.target.value,
                        )
                      }
                      placeholder="Meno a priezvisko"
                    />
                  </div>
                )}

              </>
            )}
          </section>

          {/* ── Attendees ───────────────────────────────── */}
          {!isOnlyMe && (
            <section className="reg-form__section">
              <h2 className="reg-form__section-title">
                {isMeAndOthers ? "Ďalší účastníci" : "Účastníci"}
              </h2>
              <p className="reg-form__section-note">
                Pre každého účastníka vyberte ubytovanie a stravu. Telefón a
                e-mail sú nepovinné — na uvedený e-mail pošleme potvrdenie
                účasti.
              </p>

              {attendees.map((attendee, i) => (
                <AttendeeForm
                  key={i}
                  index={i}
                  label={`Účastník ${i + 1}`}
                  data={attendee}
                  errors={attendeeErrors[i] ?? {}}
                  onChange={handleAttendeeChange}
                  onRemove={removeAttendee}
                  showRemove={attendees.length > 1}
                />
              ))}

              <button
                type="button"
                className="reg-form__add-btn"
                onClick={addAttendee}
              >
                + Pridať účastníka
              </button>
            </section>
          )}

          {/* ── Recreation voucher (registrant only) ─────── */}
          {canClaimVoucher && (
            <VoucherSection
              claimed={recreationVoucher}
              billing={voucherBilling}
              errors={voucherErrors}
              onToggle={handleVoucherToggle}
              onBillingChange={handleVoucherBillingChange}
            />
          )}

          {/* ── Voluntary contribution ──────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">Dobrovoľný príspevok</h2>
            <p className="reg-form__section-note">
              Cena za pobyt pokrýva priame náklady na ubytovanie a stravu. Ak
              môžete prispieť viac, príspevok použijeme na organizáciu
              vzdelávania, zaplatenie pobytu iným a na podporu služby EVS.
            </p>
            <div className="form-field form-field--narrow">
              <label className="form-label" htmlFor="reg-extra">
                Suma navyše v € <span className="form-optional">(nepovinné)</span>
              </label>
              <input
                id="reg-extra"
                type="number"
                min={0}
                step={1}
                className="form-input"
                value={extraContribution}
                onChange={(e) => setExtraContribution(e.target.value)}
                placeholder="0"
              />
            </div>
          </section>

          {/* ── Note ────────────────────────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">Poznámka</h2>
            <div className="form-field">
              <textarea
                id="reg-note"
                className="form-input"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Napr.: prídem až v sobotu ráno, mám bezlepkovú diétu, potrebujem izbu na prízemí…"
              />
            </div>
          </section>

          {/* ── Price preview ────────────────────────────── */}
          {priceBreakdown && (
            <div className="price-preview">
              <h2 className="price-preview__title">Predbežná cena</h2>
              <ul className="price-preview__list">
                {priceBreakdown.items.map((item, i) => (
                  <li key={i} className="price-preview__item">
                    <span className="price-preview__item-label">
                      {item.name} – {ACCOMMODATION_LABEL[item.accommodation]}
                    </span>
                    <span className="price-preview__item-price">
                      {item.price === 0 ? "bez poplatku" : `${item.price}\u00a0€`}
                    </span>
                  </li>
                ))}
                {priceBreakdown.extraContribution > 0 && (
                  <li className="price-preview__item">
                    <span className="price-preview__item-label">
                      Dobrovoľný príspevok
                    </span>
                    <span className="price-preview__item-price">
                      {priceBreakdown.extraContribution}&nbsp;€
                    </span>
                  </li>
                )}
              </ul>
              <div className="price-preview__total">
                <span>Spolu</span>
                <strong>{priceBreakdown.total}&nbsp;€</strong>
              </div>
            </div>
          )}

          {/* ── Next ────────────────────────────────────── */}
          <button type="submit" className="reg-form__submit">
            Ďalej →
          </button>
        </form>
      </div>
    </main>
  );
}
