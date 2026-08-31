import { type ChangeEvent } from "react";
import {
  ACCOMMODATION_LABEL,
  ACCOMMODATION_NOTE,
  ACCOMMODATION_ORDER,
  ACCOMMODATION_PRICE,
  qualifiesForVoucher,
  type Accommodation,
} from "../utils/pricing";

export interface AttendeeData {
  name: string;
  surname: string;
  accommodation: "" | Accommodation;
  phone: string;
  email: string;
  recreationVoucher: boolean;
  roommatePreference: string;
}

export interface AttendeeErrors {
  name?: string;
  surname?: string;
  accommodation?: string;
  phone?: string;
  email?: string;
}

interface AttendeeFormProps {
  index: number;
  label: string;
  data: AttendeeData;
  errors: AttendeeErrors;
  onChange: (
    index: number,
    field: keyof AttendeeData,
    value: string | boolean,
  ) => void;
  onRemove?: (index: number) => void;
  showRemove?: boolean;
}

const PHONE_RE = /^\+?[0-9\s-]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAttendee(data: AttendeeData): AttendeeErrors {
  const errors: AttendeeErrors = {};
  if (!data.name.trim()) errors.name = "Meno je povinné.";
  if (!data.surname.trim()) errors.surname = "Priezvisko je povinné.";
  if (!data.accommodation)
    errors.accommodation = "Vyberte ubytovanie a stravu.";

  if (data.phone && !PHONE_RE.test(data.phone)) {
    errors.phone = "Zadajte platné telefónne číslo.";
  }
  if (data.email && !EMAIL_RE.test(data.email)) {
    errors.email = "Zadajte platný e-mail.";
  }

  return errors;
}

export default function AttendeeForm({
  index,
  label,
  data,
  errors,
  onChange,
  onRemove,
  showRemove = false,
}: AttendeeFormProps) {
  function handle(e: ChangeEvent<HTMLInputElement>) {
    onChange(index, e.target.name as keyof AttendeeData, e.target.value);
  }

  const showVoucher =
    data.accommodation !== "" && qualifiesForVoucher(data.accommodation);
  const showRoommate = data.accommodation === "double";

  return (
    <fieldset className="attendee-form">
      <div className="attendee-form__header">
        <legend className="attendee-form__legend">{label}</legend>
        {showRemove && onRemove && (
          <button
            type="button"
            className="attendee-form__remove"
            onClick={() => onRemove(index)}
            aria-label={`Odstrániť ${label}`}
          >
            Odstrániť
          </button>
        )}
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor={`name-${index}`}>
            Meno <span className="form-required">*</span>
          </label>
          <input
            id={`name-${index}`}
            name="name"
            type="text"
            className={`form-input${errors.name ? " is-invalid" : ""}`}
            value={data.name}
            onChange={handle}
            autoComplete="given-name"
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={`surname-${index}`}>
            Priezvisko <span className="form-required">*</span>
          </label>
          <input
            id={`surname-${index}`}
            name="surname"
            type="text"
            className={`form-input${errors.surname ? " is-invalid" : ""}`}
            value={data.surname}
            onChange={handle}
            autoComplete="family-name"
          />
          {errors.surname && <p className="form-error">{errors.surname}</p>}
        </div>
      </div>

      <div className="form-field">
        <label className="form-label">
          Ubytovanie a strava <span className="form-required">*</span>
        </label>
        <div className="form-radio-group form-radio-group--stacked">
          {ACCOMMODATION_ORDER.map((option) => (
            <label className="form-radio-option" key={option}>
              <input
                type="radio"
                name={`accommodation-${index}`}
                value={option}
                checked={data.accommodation === option}
                onChange={() => onChange(index, "accommodation", option)}
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
        {errors.accommodation && (
          <p className="form-error">{errors.accommodation}</p>
        )}
      </div>

      {showRoommate && (
        <div className="form-field">
          <label className="form-label" htmlFor={`roommate-${index}`}>
            Preferovaný spolubývajúci{" "}
            <span className="form-optional">(nepovinné)</span>
          </label>
          <input
            id={`roommate-${index}`}
            name="roommatePreference"
            type="text"
            className="form-input"
            value={data.roommatePreference}
            onChange={handle}
            placeholder="Meno a priezvisko"
          />
        </div>
      )}

      {showVoucher && (
        <div className="form-field">
          <label className="form-checkbox">
            <input
              type="checkbox"
              name="recreationVoucher"
              checked={data.recreationVoucher}
              onChange={(e) =>
                onChange(index, "recreationVoucher", e.target.checked)
              }
            />
            <span>
              Má záujem uplatniť si rekreačný poukaz u zamestnávateľa
            </span>
          </label>
        </div>
      )}

      <div className="form-row">
        <div className="form-field">
          <label className="form-label" htmlFor={`phone-${index}`}>
            Telefón <span className="form-optional">(nepovinné)</span>
          </label>
          <input
            id={`phone-${index}`}
            name="phone"
            type="tel"
            className={`form-input${errors.phone ? " is-invalid" : ""}`}
            value={data.phone}
            onChange={handle}
            autoComplete="tel"
            placeholder="+421 900 000 000"
          />
          {errors.phone && <p className="form-error">{errors.phone}</p>}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={`email-${index}`}>
            E-mail <span className="form-optional">(nepovinné)</span>
          </label>
          <input
            id={`email-${index}`}
            name="email"
            type="email"
            className={`form-input${errors.email ? " is-invalid" : ""}`}
            value={data.email}
            onChange={handle}
            autoComplete="email"
            placeholder="vas@email.sk"
          />
          {errors.email && <p className="form-error">{errors.email}</p>}
        </div>
      </div>
    </fieldset>
  );
}
