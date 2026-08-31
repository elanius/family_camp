import { useState, useEffect, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "../utils/pricing";
import {
  emptyAttendee,
  emptyRegistrant,
  type RegistrantData,
  type RegistrationType,
} from "../context/RegistrationContext";
import { validateRegistrant, toPricePeople } from "./RegistrationFormPage";
import { EVENT_SUBTITLE } from "../eventInfo";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoadedRegistration {
  registration_type: RegistrationType;
  registrant: {
    name: string;
    surname: string;
    phone: string;
    email: string;
    is_attendee: boolean;
    accommodation?: Accommodation | null;
    recreation_voucher?: boolean;
    roommate_preference?: string | null;
  };
  attendees: Array<{
    name: string;
    surname: string;
    accommodation: Accommodation;
    phone?: string | null;
    email?: string | null;
    recreation_voucher?: boolean;
    roommate_preference?: string | null;
  }>;
  note?: string | null;
  extra_contribution?: number;
  is_paid: boolean;
  cancelled: boolean;
}

function hasErrors(errors: object): boolean {
  return Object.values(errors).some(Boolean);
}

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
  const [regType, setRegType] = useState<RegistrationType>("only_me");
  const [isAttendee, setIsAttendee] = useState(true);
  const [registrant, setRegistrant] = useState<RegistrantData>(emptyRegistrant);
  const [attendees, setAttendees] = useState<AttendeeData[]>([emptyAttendee()]);
  const [note, setNote] = useState("");
  const [extraContribution, setExtraContribution] = useState("");
  const [registrantErrors, setRegistrantErrors] = useState<
    ReturnType<typeof validateRegistrant>
  >({});
  const [attendeeErrors, setAttendeeErrors] = useState<AttendeeErrors[]>([{}]);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [touched, setTouched] = useState(false);
  const [originalEmail, setOriginalEmail] = useState("");

  const isOnlyMe = regType === "only_me";

  // ── Load registration on mount ───────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setLoadState("not-found");
      return;
    }

    fetch(`${API_BASE}/api/registration/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          setLoadState("not-found");
          return;
        }

        const data = (await res.json()) as LoadedRegistration;

        if (data.is_paid) {
          setLoadState("paid");
          return;
        }
        if (data.cancelled) {
          setLoadState("cancelled");
          return;
        }

        setRegType(data.registration_type);
        setIsAttendee(data.registrant.is_attendee);
        setRegistrant({
          name: data.registrant.name,
          surname: data.registrant.surname,
          phone: data.registrant.phone,
          email: data.registrant.email,
          accommodation: data.registrant.accommodation ?? "",
          recreationVoucher: data.registrant.recreation_voucher ?? false,
          roommatePreference: data.registrant.roommate_preference ?? "",
        });
        setOriginalEmail(data.registrant.email);
        setAttendees(
          data.attendees.map((a) => ({
            name: a.name,
            surname: a.surname,
            accommodation: a.accommodation,
            phone: a.phone ?? "",
            email: a.email ?? "",
            recreationVoucher: a.recreation_voucher ?? false,
            roommatePreference: a.roommate_preference ?? "",
          })),
        );
        setNote(data.note ?? "");
        setExtraContribution(
          data.extra_contribution ? String(data.extra_contribution) : "",
        );
        setAttendeeErrors(data.attendees.map(() => ({})));
        setLoadState("ready");
      })
      .catch(() => setLoadState("not-found"));
  }, [token]);

  // ── Form handlers ────────────────────────────────────────────────────────

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

    const rErr = validateRegistrant(registrant, isAttendee);
    const aErrs = attendees.map(validateAttendee);
    setRegistrantErrors(rErr);
    setAttendeeErrors(aErrs);

    if (hasErrors(rErr) || isEmailTaken || (!isOnlyMe && aErrs.some(hasErrors)))
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
          recreation_voucher: registrant.recreationVoucher,
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
            recreation_voucher: a.recreationVoucher,
            ...(a.roommatePreference.trim() && {
              roommate_preference: a.roommatePreference.trim(),
            }),
            ...(a.phone.trim() && { phone: a.phone.trim() }),
            ...(a.email.trim() && { email: a.email.trim() }),
          })),
      ...(note.trim() && { note: note.trim() }),
      extra_contribution: isNaN(extra) || extra < 0 ? 0 : extra,
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

  // ── State screens ────────────────────────────────────────────────────────

  function StatusScreen({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <h1 className="reg-form-page__title">{title}</h1>
          <p>{children}</p>
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

  if (loadState === "loading") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <p>Načítavam prihlášku…</p>
        </div>
      </main>
    );
  }

  if (loadState === "not-found") {
    return (
      <StatusScreen title="Neplatný odkaz">
        Prihláška nebola nájdená. Skontrolujte odkaz, ktorý ste dostali v
        e-maile.
      </StatusScreen>
    );
  }

  if (loadState === "paid") {
    return (
      <StatusScreen title="Prihláška je uhradená">
        Po uhradení platby už nie je možné prihlášku meniť. Ak potrebujete zmenu,
        kontaktujte nás prosím e-mailom.
      </StatusScreen>
    );
  }

  if (loadState === "cancelled") {
    return (
      <StatusScreen title="Prihláška bola zrušená">
        Táto prihláška bola zrušená a nie je možné ju upravovať.
      </StatusScreen>
    );
  }

  if (cancelState === "done") {
    return (
      <main className="reg-form-page">
        <div className="reg-form-page__inner">
          <div className="reg-form-page__success">
            <h1 className="reg-form-page__success-title">
              Prihláška bola zrušená
            </h1>
            <p className="reg-form-page__success-text">
              Vaša prihláška na vzdelávanie bola zrušená. Ak ste ju zrušili
              omylom, prihláste sa prosím znova.
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

  const registrantLabel = isAttendee
    ? "Účastník (platiteľ)"
    : "Kontaktná osoba (platiteľ)";

  const showRegistrantVoucher =
    isAttendee &&
    registrant.accommodation !== "" &&
    qualifiesForVoucher(registrant.accommodation);

  return (
    <main className="reg-form-page">
      <div className="reg-form-page__inner">
        <h1 className="reg-form-page__title">Úprava prihlášky</h1>
        <p className="reg-form-page__subtitle">{EVENT_SUBTITLE}</p>

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
                    Tento e-mail je už prihlásený. Zadajte iný e-mail alebo
                    použite pôvodný.
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

                {showRegistrantVoucher && (
                  <div className="form-field">
                    <label className="form-checkbox">
                      <input
                        type="checkbox"
                        checked={registrant.recreationVoucher}
                        onChange={(e) =>
                          handleRegistrantChange(
                            "recreationVoucher",
                            e.target.checked,
                          )
                        }
                      />
                      <span>
                        Mám záujem uplatniť si rekreačný poukaz u zamestnávateľa
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Attendees ───────────────────────────────── */}
          {!isOnlyMe && (
            <section className="reg-form__section">
              <h2 className="reg-form__section-title">
                {isAttendee ? "Ďalší účastníci" : "Účastníci"}
              </h2>

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

          {/* ── Voluntary contribution ──────────────────── */}
          <section className="reg-form__section">
            <h2 className="reg-form__section-title">Dobrovoľný príspevok</h2>
            <div className="form-field form-field--narrow">
              <label className="form-label" htmlFor="reg-extra">
                Suma navyše v €{" "}
                <span className="form-optional">(nepovinné)</span>
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
                placeholder="Napr.: prídem až v sobotu ráno, mám bezlepkovú diétu…"
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
                <span>Spolu</span>
                <strong>{priceBreakdown.total}&nbsp;€</strong>
              </div>
            </div>
          )}

          {/* ── Save feedback ────────────────────────────── */}
          {saveState === "saved" && (
            <p className="reg-form__submit-success">
              Prihláška bola aktualizovaná.
            </p>
          )}
          {saveState === "error" && (
            <p className="reg-form__submit-error">
              Uloženie zlyhalo. Skúste to prosím znova.
            </p>
          )}
          {saveState === "locked" && (
            <p className="reg-form__submit-error">
              Prihláška je uzavretá, zmeny nie sú možné.
            </p>
          )}

          {/* ── Cancel feedback ──────────────────────────── */}
          {cancelState === "locked" && (
            <p className="reg-form__submit-error">
              Prihláška je uzavretá, zrušenie nie je možné.
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
        <div className="reg-cancel">
          {cancelState === "idle" && (
            <button
              type="button"
              className="reg-cancel__trigger"
              onClick={() => setCancelState("confirming")}
            >
              Zrušiť prihlášku
            </button>
          )}
          {cancelState === "confirming" && (
            <div>
              <p style={{ marginBottom: "1rem" }}>
                Naozaj chcete zrušiť prihlášku? Táto akcia je nevratná.
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="reg-form__submit reg-form__submit--danger"
                  onClick={handleCancelConfirm}
                >
                  Áno, zrušiť prihlášku
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
          {cancelState === "cancelling" && <p>Ruším prihlášku…</p>}
        </div>
      </div>
    </main>
  );
}
