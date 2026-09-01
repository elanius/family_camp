import { createContext, useContext, useState, type ReactNode } from "react";
import type { AttendeeData } from "../components/AttendeeForm";
import type { Accommodation } from "../utils/pricing";

export type RegistrationType = "me_and_others" | "just_others" | "only_me";

export interface RegistrantData {
  name: string;
  surname: string;
  phone: string;
  email: string;
  /** Empty until the registrant picks a package; not used for "just_others". */
  accommodation: "" | Accommodation;
  roommatePreference: string;
}

export function emptyRegistrant(): RegistrantData {
  return {
    name: "",
    surname: "",
    phone: "",
    email: "",
    accommodation: "",
    roommatePreference: "",
  };
}

/** Billing address the hotel invoices when the registrant claims a recreation voucher. */
export interface VoucherBilling {
  name: string;
  surname: string;
  address: string;
  city: string;
  postalCode: string;
}

export function emptyVoucherBilling(): VoucherBilling {
  return { name: "", surname: "", address: "", city: "", postalCode: "" };
}

export function emptyAttendee(): AttendeeData {
  return {
    name: "",
    surname: "",
    accommodation: "",
    phone: "",
    email: "",
    roommatePreference: "",
  };
}

interface RegistrationContextValue {
  regType: RegistrationType;
  setRegType: (t: RegistrationType) => void;
  registrant: RegistrantData;
  setRegistrant: (r: RegistrantData) => void;
  attendees: AttendeeData[];
  setAttendees: (a: AttendeeData[]) => void;
  note: string;
  setNote: (n: string) => void;
  /** Voluntary contribution on top of the package price, as typed by the user. */
  extraContribution: string;
  setExtraContribution: (v: string) => void;
  /** The recreation voucher belongs to the registrant, so it lives at the top level. */
  recreationVoucher: boolean;
  setRecreationVoucher: (v: boolean) => void;
  voucherBilling: VoucherBilling;
  setVoucherBilling: (b: VoucherBilling) => void;
  resetForm: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(
  null,
);

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [regType, setRegType] = useState<RegistrationType>("only_me");
  const [registrant, setRegistrant] = useState<RegistrantData>(emptyRegistrant);
  const [attendees, setAttendees] = useState<AttendeeData[]>([emptyAttendee()]);
  const [note, setNote] = useState("");
  const [extraContribution, setExtraContribution] = useState("");
  const [recreationVoucher, setRecreationVoucher] = useState(false);
  const [voucherBilling, setVoucherBilling] = useState<VoucherBilling>(
    emptyVoucherBilling,
  );

  function resetForm() {
    setRegType("only_me");
    setRegistrant(emptyRegistrant());
    setAttendees([emptyAttendee()]);
    setNote("");
    setExtraContribution("");
    setRecreationVoucher(false);
    setVoucherBilling(emptyVoucherBilling());
  }

  return (
    <RegistrationContext.Provider
      value={{
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
        resetForm,
      }}
    >
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration(): RegistrationContextValue {
  const ctx = useContext(RegistrationContext);
  if (!ctx)
    throw new Error("useRegistration must be used within RegistrationProvider");
  return ctx;
}
