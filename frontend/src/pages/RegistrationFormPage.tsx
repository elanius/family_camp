import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import AttendeeForm, {
  validateAttendee,
  type AttendeeData,
  type AttendeeErrors,
} from "../components/AttendeeForm";
import { calculatePrice, CATEGORY_LABEL } from "../utils/pricing";
import {
  useRegistration,
  type RegistrantData,
  type RegistrationType,
} from "../context/RegistrationContext";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface RegistrantErrors {
  name?: string;
  surname?: string;
  age?: string;
  phone?: string;
  email?: string;
}

const PHONE_RE = /^\+?[0-9\s\-]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyAttendee(): AttendeeData {
  return { name: "", surname: "", age: "", phone: "", email: "" };
}

function emptyRegistrant(): RegistrantData {
  return { name: "", surname: "", age: "", phone: "", email: "" };
}

function validateRegistrant(
  data: RegistrantData,
  includeAge: boolean,
  requireAdult = false,
): RegistrantErrors {
  const errors: RegistrantErrors = {};
  if (!data.name.trim()) errors.name = "Meno je povinné.";
  if (!data.surname.trim()) errors.surname = "Priezvisko je povinné.";

  if (includeAge) {
    const ageNum = parseInt(data.age, 10);
    if (!data.age.trim()) {
      errors.age = "Vek je povinný.";
    } else if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
      errors.age = "Zadajte platný vek (0–120).";
    } else if (requireAdult && ageNum < 15) {
      errors.age =
        "Samostatnú registráciu môže urobiť len osoba od 15 rokov. Pre deti vyberte možnosť \u201eLen ďalší\u201c.";
    }
  }

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

  return errors;
}

function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
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
  } = useRegistration();
  const [registrantErrors, setRegistrantErrors] = useState<RegistrantErrors>(
    {},
  );
  const [attendeeErrors, setAttendeeErrors] = useState<AttendeeErrors[]>(() =>
    attendees.map(() => ({})),
  );
  const [touched, setTouched] = useState(false);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const navigate = useNavigate();
  const isMeAndOthers = regType === "me_and_others";
  const isOnlyMe = regType === "only_me";
  const includeAge = isMeAndOthers || isOnlyMe;

  function handleRegTypeChange(e: ChangeEvent<HTMLInputElement>) {
    const t = e.target.value as RegistrationType;
    setRegType(t);
    setRegistrant(emptyRegistrant());
    setRegistrantErrors({});
    setAttendees([emptyAttendee()]);
    setAttendeeErrors([{}]);
    setTouched(false);
    setIsEmailTaken(false);
  }

  function handleRegistrantChange(field: keyof RegistrantData, value: string) {
    const updated = { ...registrant, [field]: value };
    setRegistrant(updated);
    if (field === "email") setIsEmailTaken(false);
    if (touched) {
      setRegistrantErrors(validateRegistrant(updated, includeAge, isOnlyMe));
    }
  }

  function handleAttendeeChange(
    index: number,
    field: keyof AttendeeData,
    value: string,
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
    setIsCheckingEmail(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/registration/check-email?email=${encodeURIComponent(email)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { exists: boolean };
        setIsEmailTaken(data.exists);
      }
    } catch {
      // Network failure — let the backend catch it on submit
    } finally {
      setIsCheckingEmail(false);
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

    const rErr = validateRegistrant(registrant, includeAge, isOnlyMe);
    const aErrs = attendees.map(validateAttendee);
    setRegistrantErrors(rErr);
    setAttendeeErrors(aErrs);

    if (hasErrors(rErr) || isEmailTaken || (!isOnlyMe && aErrs.some(hasErrors)))
      return;

    const ageNum = includeAge ? parseInt(registrant.age, 10) : undefined;

    const payload = {
      registration_type: regType,
      registrant: {
        name: registrant.name.trim(),
        surname: registrant.surname.trim(),
        ...(includeAge && { age: ageNum }),
        phone: registrant.phone.trim(),
        email: registrant.email.trim(),
        is_attendee: isMeAndOthers || isOnlyMe,
      },
      attendees: isOnlyMe
        ? []
        : attendees.map((a) => {
            const aAge = parseInt(a.age, 10);
            return {
              name: a.name.trim(),
              surname: a.surname.trim(),
              age: aAge,
              ...(a.phone.trim() && { phone: a.phone.trim() }),
              ...(a.email.trim() && { email: a.email.trim() }),
            };
          }),
      ...(note.trim() && { note: note.trim() }),
    };

    navigate("/registration/summary", { state: { regType, payload } });
  }

  const registrantLabel =
    regType === "just_others"
      ? "Kontaktná osoba (platiteľ)"
      : "Účastník (platiteľ)";

  // Live price preview — only count attendees whose age is already filled in
  const pricingAttendees: { name: string; surname: string; age: number }[] = [];
  if (regType !== "just_others") {
    const age = parseInt(registrant.age, 10);
    if (!isNaN(age) && age >= 0 && age <= 120) {
      pricingAttendees.push({
        name: registrant.name || "–",
        surname: registrant.surname || "",
        age,
      });
    }
  }
  if (regType !== "only_me") {
    for (const a of attendees) {
      const age = parseInt(a.age, 10);
      if (!isNaN(age) && age >= 0 && age <= 120) {
        pricingAttendees.push({
          name: a.name || "–",
          surname: a.surname || "",
          age,
        });
      }
    }
  }
  const priceBreakdown =
    pricingAttendees.length > 0 ? calculatePrice(pricingAttendees) : null;

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Registrácia na tábor</h1>
        <p className="reg-form-page__subtitle">
          Detský biblický tábor · ECAV Obišovce · 26.–31. júla 2026
        </p>

        <form onSubmit={handleNext} noValidate className="reg-form">
          {/* ── Mode selector ───────────────────────────── */}
          <fieldset className="reg-form__mode">
            <legend className="reg-form__mode-legend">
              Kto sa registruje?
            </legend>
            <label className="reg-form__mode-option">
              <input
                type="radio"
                name="regType"
                value="only_me"
                checked={isOnlyMe}
                onChange={handleRegTypeChange}
              />
              <span>
                <strong>Len ja</strong> — registrujem iba seba
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
                <strong>Len ďalší</strong> — registrujem iných účastníkov (napr.
                rodič registruje deti)
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
                <strong>Ja a ďalší</strong> — registrujem seba spolu s ďalšími
                účastníkmi
              </span>
            </label>
          </fieldset>

          {/* ── Registrant ──────────────────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">{registrantLabel}</h2>
            {(isMeAndOthers || isOnlyMe) && (
              <p className="reg-form__section-note">
                Táto osoba bude zaradená medzi účastníkov tábora a zároveň bude
                zodpovedná za platbu.
              </p>
            )}
            {regType === "just_others" && (
              <p className="reg-form__section-note">
                Táto osoba sa tábora nezúčastní, ale bude zodpovedná za platbu a
                komunikáciu.
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

            {includeAge && (
              <div className="form-field form-field--narrow">
                <label className="form-label" htmlFor="reg-age">
                  Vek <span className="form-required">*</span>
                </label>
                <input
                  id="reg-age"
                  type="number"
                  min={0}
                  max={120}
                  className={`form-input${registrantErrors.age ? " is-invalid" : ""}`}
                  value={registrant.age}
                  onChange={(e) =>
                    handleRegistrantChange("age", e.target.value)
                  }
                />
                {registrantErrors.age && (
                  <p className="form-error">{registrantErrors.age}</p>
                )}
              </div>
            )}

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
                  className={`form-input${registrantErrors.email || isEmailTaken ? " is-invalid" : ""}`}
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
                  <p className="form-error">
                    Tento e-mail je už zaregistrovaný. Pre úpravu registrácie
                    použite odkaz, ktorý ste dostali v potvrdzovacom e-maile.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── Attendees ───────────────────────────────── */}
          {!isOnlyMe && (
            <section className="reg-form__section">
              <h2 className="reg-form__section-title">
                {isMeAndOthers ? "Ďalší účastníci" : "Účastníci"}
              </h2>
              <p className="reg-form__section-note">
                Pre účastníkov starších ako 14 rokov môžete uviesť telefón a
                e-mail.
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
                placeholder="Napr.: Peter je alergický na orechy, Jana berie každý deň lieky na astmu..."
              />
            </div>
          </section>

          {/* ── Price preview ────────────────────────────── */}
          {priceBreakdown && (
            <div className="price-preview">
              <h2 className="price-preview__title">Predbežná cena</h2>
              {priceBreakdown.isLatePeriod && (
                <p className="price-preview__late-note">
                  Registrácia po 1. júla — ceny sú zvýšené o 10&nbsp;€.
                </p>
              )}
              <ul className="price-preview__list">
                {priceBreakdown.items.map((item, i) => (
                  <li key={i} className="price-preview__item">
                    <span className="price-preview__item-label">
                      {item.name} ({item.age} r.) –{" "}
                      {CATEGORY_LABEL[item.category]}
                      {item.lateFee > 0 && (
                        <span className="price-preview__late-fee">
                          {" "}
                          +{item.lateFee}&nbsp;€
                        </span>
                      )}
                      {item.discount > 0 && (
                        <span className="price-preview__discount">
                          {" "}
                          &minus;{item.discount}&nbsp;€
                        </span>
                      )}
                    </span>
                    <span className="price-preview__item-price">
                      {item.finalPrice === 0
                        ? "zadarmo"
                        : `${item.finalPrice}\u00a0€`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="price-preview__total">
                <span>Spolu</span>
                <strong>{priceBreakdown.total}&nbsp;€</strong>
              </div>
            </div>
          )}

          {/* ── Next ────────────────────────────────────── */}
          <button
            type="submit"
            className="reg-form__submit"
            disabled={isEmailTaken || isCheckingEmail}
          >
            Ďalej →
          </button>
        </form>
      </div>
    </main>
  );
}
