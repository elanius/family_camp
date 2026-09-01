import type { VoucherBilling } from "../context/RegistrationContext";

export interface VoucherBillingErrors {
  name?: string;
  surname?: string;
  address?: string;
  city?: string;
  postalCode?: string;
}

const POSTAL_CODE_RE = /^\d{3}\s?\d{2}$/;

export function validateVoucherBilling(
  claimed: boolean,
  billing: VoucherBilling,
): VoucherBillingErrors {
  if (!claimed) return {};
  const errors: VoucherBillingErrors = {};
  if (!billing.name.trim()) errors.name = "Meno je povinné.";
  if (!billing.surname.trim()) errors.surname = "Priezvisko je povinné.";
  if (!billing.address.trim()) errors.address = "Adresa je povinná.";
  if (!billing.city.trim()) errors.city = "Mesto je povinné.";

  if (!billing.postalCode.trim()) {
    errors.postalCode = "PSČ je povinné.";
  } else if (!POSTAL_CODE_RE.test(billing.postalCode.trim())) {
    errors.postalCode = "Zadajte PSČ v tvare 811 01.";
  }

  return errors;
}

interface VoucherSectionProps {
  claimed: boolean;
  billing: VoucherBilling;
  errors: VoucherBillingErrors;
  onToggle: (checked: boolean) => void;
  onBillingChange: (field: keyof VoucherBilling, value: string) => void;
}

/**
 * Recreation voucher — claimed by the person who submits the registration, so it
 * sits at the top level of the form rather than per attendee. Ticking it reveals
 * the billing address the hotel needs for the invoice.
 */
export default function VoucherSection({
  claimed,
  billing,
  errors,
  onToggle,
  onBillingChange,
}: VoucherSectionProps) {
  return (
    <section className="reg-form__section">
      <h2 className="reg-form__section-title">Rekreačný poukaz</h2>

      <div className="form-field">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={claimed}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span>Mám záujem uplatniť si rekreačný poukaz u zamestnávateľa</span>
        </label>
        <p className="form-hint">
          Poukaz sa vzťahuje na osobu, ktorá podáva prihlášku. Pošleme vám
          informácie, ako pri uplatnení postupovať.
        </p>
      </div>

      {claimed && (
        <>
          <p className="reg-form__section-note">
            Fakturačné údaje pre hotel — na tieto údaje vystaví hotel faktúru
            potrebnú na uplatnenie poukazu.
          </p>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="voucher-name">
                Meno <span className="form-required">*</span>
              </label>
              <input
                id="voucher-name"
                type="text"
                className={`form-input${errors.name ? " is-invalid" : ""}`}
                value={billing.name}
                onChange={(e) => onBillingChange("name", e.target.value)}
                autoComplete="given-name"
              />
              {errors.name && <p className="form-error">{errors.name}</p>}
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="voucher-surname">
                Priezvisko <span className="form-required">*</span>
              </label>
              <input
                id="voucher-surname"
                type="text"
                className={`form-input${errors.surname ? " is-invalid" : ""}`}
                value={billing.surname}
                onChange={(e) => onBillingChange("surname", e.target.value)}
                autoComplete="family-name"
              />
              {errors.surname && <p className="form-error">{errors.surname}</p>}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="voucher-address">
              Adresa <span className="form-required">*</span>
            </label>
            <input
              id="voucher-address"
              type="text"
              className={`form-input${errors.address ? " is-invalid" : ""}`}
              value={billing.address}
              onChange={(e) => onBillingChange("address", e.target.value)}
              autoComplete="street-address"
              placeholder="Ulica a číslo domu"
            />
            {errors.address && <p className="form-error">{errors.address}</p>}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label" htmlFor="voucher-city">
                Mesto <span className="form-required">*</span>
              </label>
              <input
                id="voucher-city"
                type="text"
                className={`form-input${errors.city ? " is-invalid" : ""}`}
                value={billing.city}
                onChange={(e) => onBillingChange("city", e.target.value)}
                autoComplete="address-level2"
              />
              {errors.city && <p className="form-error">{errors.city}</p>}
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="voucher-postal-code">
                PSČ <span className="form-required">*</span>
              </label>
              <input
                id="voucher-postal-code"
                type="text"
                className={`form-input${errors.postalCode ? " is-invalid" : ""}`}
                value={billing.postalCode}
                onChange={(e) => onBillingChange("postalCode", e.target.value)}
                autoComplete="postal-code"
                placeholder="811 01"
              />
              {errors.postalCode && (
                <p className="form-error">{errors.postalCode}</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
