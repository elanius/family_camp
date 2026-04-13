import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AttendeeForm, {
  validateAttendee,
  type AttendeeData,
  type AttendeeErrors,
} from "../components/AttendeeForm";
import { calculatePrice, CATEGORY_LABEL } from "../utils/pricing";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// ── Types ────────────────────────────────────────────────────────────────────

type RegistrationType = "me_and_others" | "just_others" | "only_me";

interface RegistrantData {
  name: string;
  surname: string;
  age: string;
  phone: string;
  email: string;
  is_attendee: boolean;
  transportation: "" | "individual" | "train_with_organizer";
}

interface RegistrantErrors {
  name?: string;
  surname?: string;
  age?: string;
  phone?: string;
  email?: string;
  transportation?: string;
}

const PHONE_RE = /^\+?[0-9\s\-]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyAttendee(): AttendeeData {
  return { name: "", surname: "", age: "", phone: "", email: "" };
}

function validateRegistrant(
  data: RegistrantData,
  includeAge: boolean,
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

  if (!data.transportation) {
    errors.transportation = "Doprava je povinná.";
  }

  return errors;
}

function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
}

// ── Component ─────────────────────────────────────────────────────────────────

type LoadState = "loading" | "not-found" | "paid" | "cancelled" | "ready";
type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "locked"
  | "email-conflict";
type CancelState = "idle" | "confirming" | "cancelling" | "done" | "locked";

export default function RegistrationUpdatePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [cancelState, setCancelState] = useState<CancelState>("idle");

  // Form state
  const [regType, setRegType] = useState<RegistrationType>("just_others");
  const [registrant, setRegistrant] = useState<RegistrantData>({
    name: "",
    surname: "",
    age: "",
    phone: "",
    email: "",
    is_attendee: false,
    transportation: "",
  });
  const [attendees, setAttendees] = useState<AttendeeData[]>([emptyAttendee()]);
  const [note, setNote] = useState("");
  const [registrantErrors, setRegistrantErrors] = useState<RegistrantErrors>(
    {},
  );
  const [attendeeErrors, setAttendeeErrors] = useState<AttendeeErrors[]>([{}]);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [touched, setTouched] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");

  const isMeAndOthers = regType === "me_and_others";
  const isOnlyMe = regType === "only_me";
  const includeAge = isMeAndOthers || isOnlyMe;

  // ── Load registration on mount ───────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setLoadState("not-found");
      return;
    }

    fetch(`${API_BASE}/api/registration/${token}`)
      .then(async (res) => {
        if (res.status === 404) {
          setLoadState("not-found");
          return;
        }
        if (!res.ok) {
          setLoadState("not-found");
          return;
        }

        const data = (await res.json()) as {
          registration_type: RegistrationType;
          registrant: {
            name: string;
            surname: string;
            age?: number;
            phone: string;
            email: string;
            is_attendee: boolean;
            transportation: "individual" | "train_with_organizer";
          };
          attendees: Array<{
            name: string;
            surname: string;
            age: number;
            phone?: string;
            email?: string;
          }>;
          note?: string;
          is_paid: boolean;
          cancelled: boolean;
        };

        if (data.is_paid) {
          setLoadState("paid");
          return;
        }
        if (data.cancelled) {
          setLoadState("cancelled");
          return;
        }

        setRegType(data.registration_type);
        setRegistrant({
          name: data.registrant.name,
          surname: data.registrant.surname,
          age:
            data.registrant.age !== undefined && data.registrant.age !== null
              ? String(data.registrant.age)
              : "",
          phone: data.registrant.phone,
          email: data.registrant.email,
          is_attendee: data.registrant.is_attendee,
          transportation: data.registrant.transportation,
        });
        setOriginalEmail(data.registrant.email);
        setAttendees(
          data.attendees.map((a) => ({
            name: a.name,
            surname: a.surname,
            age: String(a.age),
            phone: a.phone ?? "",
            email: a.email ?? "",
          })),
        );
        setNote(data.note ?? "");
        setAttendeeErrors(data.attendees.map(() => ({})));
        setLoadState("ready");
      })
      .catch(() => setLoadState("not-found"));
  }, [token]);

  // ── Form handlers ────────────────────────────────────────────────────────

  function handleRegistrantChange(field: keyof RegistrantData, value: string) {
    const updated = { ...registrant, [field]: value };
    setRegistrant(updated);
    if (field === "email") setIsEmailTaken(false);
    if (touched) {
      setRegistrantErrors(validateRegistrant(updated, includeAge));
    }
  }

  async function handleEmailBlur() {
    const email = registrant.email.trim();
    if (!email || !EMAIL_RE.test(email) || email === originalEmail) return;
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
      // Network failure — backend will catch it on save
    } finally {
      setIsCheckingEmail(false);
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

  function addAttendee() {
    setAttendees([...attendees, emptyAttendee()]);
    setAttendeeErrors([...attendeeErrors, {}]);
  }

  function removeAttendee(index: number) {
    setAttendees(attendees.filter((_, i) => i !== index));
    setAttendeeErrors(attendeeErrors.filter((_, i) => i !== index));
  }

  // ── Save ────────────────────────────────────────────────────────────────

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setTouched(true);

    const rErr = validateRegistrant(registrant, includeAge);
    const aErrs = attendees.map(validateAttendee);
    setRegistrantErrors(rErr);
    setAttendeeErrors(aErrs);

    if (hasErrors(rErr) || isEmailTaken || (!isOnlyMe && aErrs.some(hasErrors)))
      return;

    // Always preserve the age value if it exists, even for "only_me" registrations
    const ageNum =
      registrant.age && registrant.age.trim()
        ? parseInt(registrant.age, 10)
        : undefined;

    const payload = {
      registration_type: regType,
      registrant: {
        name: registrant.name.trim(),
        surname: registrant.surname.trim(),
        ...(ageNum !== undefined && { age: ageNum }),
        phone: registrant.phone.trim(),
        email: registrant.email.trim(),
        is_attendee: registrant.is_attendee,
        transportation: registrant.transportation,
      },
      attendees: attendees.map((a) => {
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

    setSaveState("saving");
    try {
      const res = await fetch(`${API_BASE}/api/registration/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 200) {
        setOriginalEmail(registrant.email.trim());
        setSaveState("saved");
      } else if (res.status === 409) {
        setIsEmailTaken(true);
        setSaveState("email-conflict");
      } else if (res.status === 403) {
        setSaveState("locked");
      } else {
        setSaveState("error");
      }
    } catch {
      setSaveState("error");
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────

  async function handleCancelConfirm() {
    setCancelState("cancelling");
    try {
      const res = await fetch(`${API_BASE}/api/registration/${token}`, {
        method: "DELETE",
      });
      if (res.status === 200) {
        setCancelState("done");
      } else if (res.status === 403) {
        setCancelState("locked");
      } else {
        setCancelState("idle");
      }
    } catch {
      setCancelState("idle");
    }
  }

  // ── Live price preview ───────────────────────────────────────────────────

  const pricingAttendees: { name: string; surname: string; age: number }[] = [];
  if (isMeAndOthers || isOnlyMe) {
    const age = parseInt(registrant.age, 10);
    if (!isNaN(age) && age >= 0 && age <= 120) {
      pricingAttendees.push({
        name: registrant.name || "–",
        surname: registrant.surname || "",
        age,
      });
    }
  }
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
  const priceBreakdown =
    pricingAttendees.length > 0 ? calculatePrice(pricingAttendees) : null;

  // ── State screens ────────────────────────────────────────────────────────

  if (loadState === "loading") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <p>Načítavam registráciu…</p>
        </div>
      </main>
    );
  }

  if (loadState === "not-found") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <h1 className="reg-form-page__title">Neplatný odkaz</h1>
          <p>
            Registrácia nebola nájdená. Skontrolujte odkaz, ktorý ste dostali v
            e-maile.
          </p>
          <button
            className="reg-form__submit"
            style={{ marginTop: "2rem" }}
            onClick={() => navigate("/")}
          >
            Späť na hlavnú stránku
          </button>
        </div>
      </main>
    );
  }

  if (loadState === "paid") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <h1 className="reg-form-page__title">Registrácia je zaplatená</h1>
          <p>Zmeny nie sú možné po uhradení platby za tábor.</p>
          <button
            className="reg-form__submit"
            style={{ marginTop: "2rem" }}
            onClick={() => navigate("/")}
          >
            Späť na hlavnú stránku
          </button>
        </div>
      </main>
    );
  }

  if (loadState === "cancelled") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <h1 className="reg-form-page__title">Registrácia bola zrušená</h1>
          <p>Táto registrácia bola zrušená a nie je možné ju upravovať.</p>
          <button
            className="reg-form__submit"
            style={{ marginTop: "2rem" }}
            onClick={() => navigate("/")}
          >
            Späť na hlavnú stránku
          </button>
        </div>
      </main>
    );
  }

  if (cancelState === "done") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <div className="reg-form-page__success">
            <p className="reg-form-page__success-icon">✅</p>
            <h1 className="reg-form-page__success-title">
              Registrácia bola zrušená.
            </h1>
            <p className="reg-form-page__success-text">
              Vaša registrácia na tábor bola úspešne zrušená.
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

  const registrantLabel = isMeAndOthers
    ? "Účastník (platiteľ)"
    : "Kontaktná osoba (platiteľ)";

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Úprava registrácie</h1>
        <p className="reg-form-page__subtitle">
          Detský biblický tábor · ECAV Obišovce · 26.–31. júla 2026
        </p>

        <form onSubmit={handleSave} noValidate className="reg-form">
          {/* ── Registrant ──────────────────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">{registrantLabel}</h2>

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
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
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
                    Tento e-mail je už zaregistrovaný. Zadajte iný e-mail alebo
                    použite pôvodný.
                  </p>
                )}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">
                Doprava <span className="form-required">*</span>
              </label>
              <div className="form-radio-group">
                <label className="form-radio-option">
                  <input
                    type="radio"
                    name="transportation"
                    value="individual"
                    checked={registrant.transportation === "individual"}
                    onChange={(e) =>
                      handleRegistrantChange("transportation", e.target.value)
                    }
                  />
                  <span>Individuálna doprava</span>
                </label>
                <label className="form-radio-option">
                  <input
                    type="radio"
                    name="transportation"
                    value="train_with_organizer"
                    checked={
                      registrant.transportation === "train_with_organizer"
                    }
                    onChange={(e) =>
                      handleRegistrantChange("transportation", e.target.value)
                    }
                  />
                  <span>Doprava vlakom s organizátorom</span>
                </label>
              </div>
              {registrantErrors.transportation && (
                <p className="form-error">{registrantErrors.transportation}</p>
              )}
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

          {/* ── Note ──────────────────────────────────────── */}
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

          {/* ── Save feedback ────────────────────────────── */}
          {saveState === "saved" && (
            <p className="reg-form__submit-success">
              ✅ Registrácia bola aktualizovaná.
            </p>
          )}
          {saveState === "error" && (
            <p className="reg-form__submit-error">
              ❌ Uloženie zlyhalo. Skúste to prosím znova.
            </p>
          )}
          {saveState === "locked" && (
            <p className="reg-form__submit-error">
              ❌ Registrácia je uzavretá, zmeny nie sú možné.
            </p>
          )}

          {/* ── Cancel feedback ──────────────────────────── */}
          {cancelState === "locked" && (
            <p className="reg-form__submit-error">
              ❌ Registrácia je uzavretá, zrušenie nie je možné.
            </p>
          )}

          {/* ── Actions ─────────────────────────────────── */}
          <div className="reg-summary__actions">
            <button
              type="submit"
              className="reg-form__submit"
              disabled={
                isEmailTaken || isCheckingEmail || saveState === "saving"
              }
            >
              {saveState === "saving" ? "Ukladám…" : "Uložiť zmeny"}
            </button>
          </div>
        </form>

        {/* ── Cancel registration ──────────────────────── */}
        <div
          style={{
            marginTop: "3rem",
            borderTop: "1px solid #e5e7eb",
            paddingTop: "2rem",
          }}
        >
          {cancelState === "idle" && (
            <button
              type="button"
              className="reg-summary__back-btn"
              style={{ color: "#dc2626" }}
              onClick={() => setCancelState("confirming")}
            >
              Zrušiť registráciu
            </button>
          )}
          {cancelState === "confirming" && (
            <div>
              <p style={{ marginBottom: "1rem" }}>
                Naozaj chcete zrušiť registráciu? Táto akcia je nevratná.
              </p>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  type="button"
                  className="reg-form__submit"
                  style={{ background: "#dc2626" }}
                  onClick={handleCancelConfirm}
                >
                  Áno, zrušiť registráciu
                </button>
                <button
                  type="button"
                  className="reg-summary__back-btn"
                  onClick={() => setCancelState("idle")}
                >
                  Späť
                </button>
              </div>
            </div>
          )}
          {cancelState === "cancelling" && <p>Zrušujem registráciu…</p>}
        </div>
      </div>
    </main>
  );
}
