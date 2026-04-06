import { type ChangeEvent } from "react";

export interface AttendeeData {
  name: string;
  surname: string;
  age: string;
  phone: string;
  email: string;
}

export interface AttendeeErrors {
  name?: string;
  surname?: string;
  age?: string;
  phone?: string;
  email?: string;
}

interface AttendeeFormProps {
  index: number;
  label: string;
  data: AttendeeData;
  errors: AttendeeErrors;
  onChange: (index: number, field: keyof AttendeeData, value: string) => void;
  onRemove?: (index: number) => void;
  showRemove?: boolean;
}

const PHONE_RE = /^\+?[0-9\s\-]{9,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAttendee(data: AttendeeData): AttendeeErrors {
  const errors: AttendeeErrors = {};
  if (!data.name.trim()) errors.name = "Meno je povinné.";
  if (!data.surname.trim()) errors.surname = "Priezvisko je povinné.";

  const ageNum = parseInt(data.age, 10);
  if (!data.age.trim()) {
    errors.age = "Vek je povinný.";
  } else if (isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
    errors.age = "Zadajte platný vek (0–120).";
  }

  if (!isNaN(ageNum) && ageNum > 14) {
    if (data.phone && !PHONE_RE.test(data.phone)) {
      errors.phone = "Zadajte platné telefónne číslo.";
    }
    if (data.email && !EMAIL_RE.test(data.email)) {
      errors.email = "Zadajte platný e-mail.";
    }
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
  const ageNum = parseInt(data.age, 10);
  const showOptionalContact = !isNaN(ageNum) && ageNum > 14;

  function handle(e: ChangeEvent<HTMLInputElement>) {
    onChange(index, e.target.name as keyof AttendeeData, e.target.value);
  }

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

      <div className="form-field form-field--narrow">
        <label className="form-label" htmlFor={`age-${index}`}>
          Vek <span className="form-required">*</span>
        </label>
        <input
          id={`age-${index}`}
          name="age"
          type="number"
          min={0}
          max={120}
          className={`form-input${errors.age ? " is-invalid" : ""}`}
          value={data.age}
          onChange={handle}
        />
        {errors.age && <p className="form-error">{errors.age}</p>}
      </div>

      {showOptionalContact && (
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
      )}
    </fieldset>
  );
}
