import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ACCOMMODATION_LABEL,
  ZTP_LABEL,
  calculatePrice,
  type Accommodation,
} from "../utils/pricing";
import { EVENT_SUBTITLE } from "../eventInfo";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type RegistrationType = "me_and_others" | "just_others" | "only_me";

interface RegistrantPayload {
  name: string;
  surname: string;
  phone: string;
  email: string;
  is_attendee: boolean;
  accommodation?: Accommodation;
  roommate_preference?: string;
  ztp?: boolean;
}

interface AttendeePayload {
  name: string;
  surname: string;
  accommodation: Accommodation;
  phone?: string;
  email?: string;
  roommate_preference?: string;
  ztp?: boolean;
}

interface VoucherBillingPayload {
  name: string;
  surname: string;
  address: string;
  city: string;
  postal_code: string;
}

interface RegistrationPayload {
  registration_type: RegistrationType;
  registrant: RegistrantPayload;
  attendees: AttendeePayload[];
  note?: string;
  extra_contribution: number;
  recreation_voucher: boolean;
  voucher_billing?: VoucherBillingPayload;
}

interface LocationState {
  regType: RegistrationType;
  payload: RegistrationPayload;
}

type Status = "idle" | "loading" | "error" | "success";

export default function RegistrationSummaryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("idle");

  const state = location.state as LocationState | null;

  if (!state?.payload) {
    return <Navigate to="/registration" replace />;
  }

  const { payload } = state;
  const { registrant, attendees } = payload;

  const pricePeople: {
    name: string;
    surname: string;
    accommodation: Accommodation;
    ztp?: boolean;
  }[] = [];
  if (registrant.is_attendee && registrant.accommodation) {
    pricePeople.push({
      name: registrant.name,
      surname: registrant.surname,
      accommodation: registrant.accommodation,
      ztp: registrant.ztp,
    });
  }
  for (const a of attendees) {
    pricePeople.push({
      name: a.name,
      surname: a.surname,
      accommodation: a.accommodation,
      ztp: a.ztp,
    });
  }
  const priceBreakdown = calculatePrice(
    pricePeople,
    payload.extra_contribution,
    payload.recreation_voucher,
  );

  async function handleRegister() {
    setStatus("loading");
    try {
      const res = await fetch(`${API_BASE}/api/registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <div className="reg-form-page__success">
            <h1 className="reg-form-page__success-title">
              Prihláška bola odoslaná
            </h1>
            <p className="reg-form-page__success-text">
              Potvrdenie sme zaslali na váš e-mail spolu s odkazom, cez ktorý
              môžete prihlášku upraviť — až kým vám nepošleme informácie
              k úhrade. Tešíme sa na vás!
            </p>
            <button
              className="reg-form__submit"
              style={{ marginTop: "2rem" }}
              onClick={() => navigate("/")}
            >
              Späť na hlavnú stránku
            </button>
          </div>
        </div>
      </main>
    );
  }

  const registrantSectionLabel = registrant.is_attendee
    ? "Účastník (platiteľ)"
    : "Kontaktná osoba (platiteľ)";

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Zhrnutie prihlášky</h1>
        <p className="reg-form-page__subtitle">{EVENT_SUBTITLE}</p>

        {/* ── Registrant ──────────────────────────────── */}
        <section className="summary-section">
          <h2 className="summary-section__title">{registrantSectionLabel}</h2>
          <div className="summary-card">
            <div className="summary-card__row">
              <span className="summary-card__label">Meno a priezvisko</span>
              <span className="summary-card__value">
                {registrant.name} {registrant.surname}
              </span>
            </div>
            <div className="summary-card__row">
              <span className="summary-card__label">Telefón</span>
              <span className="summary-card__value">{registrant.phone}</span>
            </div>
            <div className="summary-card__row">
              <span className="summary-card__label">E-mail</span>
              <span className="summary-card__value">{registrant.email}</span>
            </div>
            {registrant.accommodation && (
              <div className="summary-card__row">
                <span className="summary-card__label">Ubytovanie a strava</span>
                <span className="summary-card__value">
                  {ACCOMMODATION_LABEL[registrant.accommodation]}
                </span>
              </div>
            )}
            {registrant.ztp && (
              <div className="summary-card__row">
                <span className="summary-card__label">{ZTP_LABEL}</span>
                <span className="summary-card__value">Áno</span>
              </div>
            )}
            {registrant.roommate_preference && (
              <div className="summary-card__row">
                <span className="summary-card__label">Spolubývajúci</span>
                <span className="summary-card__value">
                  {registrant.roommate_preference}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Attendees ───────────────────────────────── */}
        {attendees.length > 0 && (
          <section className="summary-section">
            <h2 className="summary-section__title">
              {payload.registration_type === "me_and_others"
                ? "Ďalší účastníci"
                : "Účastníci"}
            </h2>
            {attendees.map((a, i) => (
              <div key={i} className="summary-card summary-card--attendee">
                <p className="summary-card__attendee-label">Účastník {i + 1}</p>
                <div className="summary-card__row">
                  <span className="summary-card__label">Meno a priezvisko</span>
                  <span className="summary-card__value">
                    {a.name} {a.surname}
                  </span>
                </div>
                <div className="summary-card__row">
                  <span className="summary-card__label">Ubytovanie a strava</span>
                  <span className="summary-card__value">
                    {ACCOMMODATION_LABEL[a.accommodation]}
                  </span>
                </div>
                {a.ztp && (
                  <div className="summary-card__row">
                    <span className="summary-card__label">{ZTP_LABEL}</span>
                    <span className="summary-card__value">Áno</span>
                  </div>
                )}
                {a.roommate_preference && (
                  <div className="summary-card__row">
                    <span className="summary-card__label">Spolubývajúci</span>
                    <span className="summary-card__value">
                      {a.roommate_preference}
                    </span>
                  </div>
                )}
                {a.phone && (
                  <div className="summary-card__row">
                    <span className="summary-card__label">Telefón</span>
                    <span className="summary-card__value">{a.phone}</span>
                  </div>
                )}
                {a.email && (
                  <div className="summary-card__row">
                    <span className="summary-card__label">E-mail</span>
                    <span className="summary-card__value">{a.email}</span>
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        {/* ── Recreation voucher ──────────────────────── */}
        {payload.recreation_voucher && payload.voucher_billing && (
          <section className="summary-section">
            <h2 className="summary-section__title">Rekreačný poukaz</h2>
            <div className="summary-card">
              <div className="summary-card__row">
                <span className="summary-card__label">Záujem o poukaz</span>
                <span className="summary-card__value">Áno, mám záujem</span>
              </div>
              <div className="summary-card__row">
                <span className="summary-card__label">Fakturačné meno</span>
                <span className="summary-card__value">
                  {payload.voucher_billing.name}{" "}
                  {payload.voucher_billing.surname}
                </span>
              </div>
              <div className="summary-card__row">
                <span className="summary-card__label">Adresa</span>
                <span className="summary-card__value">
                  {payload.voucher_billing.address},{" "}
                  {payload.voucher_billing.postal_code}{" "}
                  {payload.voucher_billing.city}
                </span>
              </div>
            </div>
            <p className="summary-notice">
              Ubytovanie a stravu ({priceBreakdown.paidAtHotel}&nbsp;€) uhradíte
              priamo v hoteli na mieste — nie prevodom vopred. Hotel vám na
              uvedené fakturačné údaje vystaví faktúru potrebnú na uplatnenie
              poukazu.
            </p>
          </section>
        )}

        {/* ── Note ──────────────────────────────────────── */}
        {payload.note && (
          <section className="summary-section">
            <h2 className="summary-section__title">Poznámka</h2>
            <div className="summary-card">
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{payload.note}</p>
            </div>
          </section>
        )}

        {/* ── Price breakdown ─────────────────────────── */}
        <div className="price-preview price-preview--final">
          <h2 className="price-preview__title">Cena</h2>
          {priceBreakdown.items.length === 0 &&
          priceBreakdown.extraContribution === 0 ? (
            <p className="price-preview__empty">Žiadni účastníci.</p>
          ) : (
            <>
              <ul className="price-preview__list">
                {priceBreakdown.items.map((item, i) => (
                  <li key={i} className="price-preview__item">
                    <span className="price-preview__item-label">
                      {item.name} – {ACCOMMODATION_LABEL[item.accommodation]}
                    </span>
                    <span className="price-preview__item-price">
                      {item.price === 0 ? "bez poplatku" : `${item.price} €`}
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
                <span>Celková suma</span>
                <strong>{priceBreakdown.total}&nbsp;€</strong>
              </div>
              {priceBreakdown.paidAtHotel > 0 && (
                <ul className="price-preview__split">
                  <li className="price-preview__item">
                    <span className="price-preview__item-label">
                      Uhradíte v hoteli na mieste
                    </span>
                    <span className="price-preview__item-price">
                      {priceBreakdown.paidAtHotel}&nbsp;€
                    </span>
                  </li>
                  <li className="price-preview__item">
                    <span className="price-preview__item-label">
                      Uhradíte prevodom pre EVS
                    </span>
                    <span className="price-preview__item-price">
                      {priceBreakdown.amountDue}&nbsp;€
                    </span>
                  </li>
                </ul>
              )}
            </>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────── */}
        {status === "error" && (
          <p className="reg-form__submit-error">
            Odoslanie prihlášky zlyhalo. Skúste to prosím znova.
          </p>
        )}
        <div className="reg-summary__actions">
          <button
            type="button"
            className="reg-summary__back-btn"
            onClick={() => navigate(-1)}
            disabled={status === "loading"}
          >
            ← Späť
          </button>
          <button
            type="button"
            className="reg-form__submit reg-summary__submit"
            onClick={handleRegister}
            disabled={status === "loading"}
          >
            {status === "loading" ? "Odosielam…" : "Odoslať prihlášku"}
          </button>
        </div>
      </div>
    </main>
  );
}
