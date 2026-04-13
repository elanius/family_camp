import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { calculatePrice, CATEGORY_LABEL } from "../utils/pricing";

type RegistrationType = "me_and_others" | "just_others" | "only_me";

interface RegistrantPayload {
  name: string;
  surname: string;
  age?: number;
  phone: string;
  email: string;
  is_attendee: boolean;
  transportation: "individual" | "train_with_organizer";
}

interface AttendeePayload {
  name: string;
  surname: string;
  age: number;
  phone?: string;
  email?: string;
}

interface RegistrationPayload {
  registration_type: RegistrationType;
  registrant: RegistrantPayload;
  attendees: AttendeePayload[];
  note?: string;
}

interface LocationState {
  regType: RegistrationType;
  payload: RegistrationPayload;
}

type Status = "idle" | "loading" | "error" | "duplicate" | "success";

export default function RegistrationSummaryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("idle");

  const state = location.state as LocationState | null;

  if (!state?.payload) {
    return <Navigate to="/form" replace />;
  }

  const { payload } = state;
  const { registrant, attendees } = payload;

  // Build list of attendees used for pricing
  const pricingAttendees: { name: string; surname: string; age: number }[] = [];
  if (registrant.is_attendee && registrant.age !== undefined) {
    pricingAttendees.push({
      name: registrant.name,
      surname: registrant.surname,
      age: registrant.age,
    });
  }
  for (const a of attendees) {
    pricingAttendees.push({ name: a.name, surname: a.surname, age: a.age });
  }
  const priceBreakdown = calculatePrice(pricingAttendees);

  async function handleRegister() {
    setStatus("loading");
    try {
      const res = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 201) {
        setStatus("success");
      } else if (res.status === 409) {
        setStatus("duplicate");
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
            <p className="reg-form-page__success-icon">✅</p>
            <h1 className="reg-form-page__success-title">
              Registrácia prebehla úspešne!
            </h1>
            <p className="reg-form-page__success-text">
              Potvrdenie sme zaslali na váš e-mail. Tešíme sa na vás na tábore!
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

  const registrantSectionLabel =
    payload.registration_type === "just_others"
      ? "Kontaktná osoba (platiteľ)"
      : "Účastník (platiteľ)";

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Zhrnutie registrácie</h1>
        <p className="reg-form-page__subtitle">
          Detský biblický tábor · ECAV Obišovce · 26.–31. júla 2026
        </p>

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
            {registrant.age !== undefined && (
              <div className="summary-card__row">
                <span className="summary-card__label">Vek</span>
                <span className="summary-card__value">
                  {registrant.age} rokov
                </span>
              </div>
            )}
            <div className="summary-card__row">
              <span className="summary-card__label">Telefón</span>
              <span className="summary-card__value">{registrant.phone}</span>
            </div>
            <div className="summary-card__row">
              <span className="summary-card__label">E-mail</span>
              <span className="summary-card__value">{registrant.email}</span>
            </div>
            <div className="summary-card__row">
              <span className="summary-card__label">Doprava</span>
              <span className="summary-card__value">
                {registrant.transportation === "individual"
                  ? "Individuálna doprava"
                  : "Doprava vlakom s organizátorom"}
              </span>
            </div>
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
                  <span className="summary-card__label">Vek</span>
                  <span className="summary-card__value">{a.age} rokov</span>
                </div>
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

        {/* ── Note ──────────────────────────────────────── */}
        {payload.note && (
          <section className="summary-section">
            <h2 className="summary-section__title">Poznámka</h2>
            <div className="summary-card">
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {payload.note}
              </p>
            </div>
          </section>
        )}

        {/* ── Price breakdown ─────────────────────────── */}
        <div className="price-preview price-preview--final">
          <h2 className="price-preview__title">Cena</h2>
          {priceBreakdown.items.length === 0 ? (
            <p className="price-preview__empty">Žiadni účastníci.</p>
          ) : (
            <>
              <ul className="price-preview__list">
                {priceBreakdown.items.map((item, i) => (
                  <li key={i} className="price-preview__item">
                    <span className="price-preview__item-label">
                      {item.name} ({item.age} r.) –{" "}
                      {CATEGORY_LABEL[item.category]}
                      {item.discount > 0 && (
                        <span className="price-preview__discount">
                          {" "}
                          &minus;{item.discount}&nbsp;€
                        </span>
                      )}
                    </span>
                    <span className="price-preview__item-price">
                      {item.finalPrice === 0
                        ? "zdarma"
                        : `${item.finalPrice}\u00a0€`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="price-preview__total">
                <span>Celková suma</span>
                <strong>{priceBreakdown.total}&nbsp;€</strong>
              </div>
            </>
          )}
        </div>

        {/* ── Actions ─────────────────────────────────── */}
        {status === "error" && (
          <p className="reg-form__submit-error">
            ❌ Registrácia zlyhala. Skúste to prosím znova.
          </p>
        )}
        {status === "duplicate" && (
          <p className="reg-form__submit-error">
            ❌ Tento e-mail je už zaregistrovaný. Pre úpravu registrácie použite
            odkaz, ktorý ste dostali v potvrdzovacom e-maile.
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
            {status === "loading" ? "Odosielam…" : "Registrovať"}
          </button>
        </div>
      </div>
    </main>
  );
}
