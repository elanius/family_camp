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
  recreationVoucher: boolean;
  roommatePreference: string;
}

export function emptyRegistrant(): RegistrantData {
  return {
    name: "",
    surname: "",
    phone: "",
    email: "",
    accommodation: "",
    recreationVoucher: false,
    roommatePreference: "",
  };
}

export function emptyAttendee(): AttendeeData {
  return {
    name: "",
    surname: "",
    accommodation: "",
    phone: "",
    email: "",
    recreationVoucher: false,
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

  function resetForm() {
    setRegType("only_me");
    setRegistrant(emptyRegistrant());
    setAttendees([emptyAttendee()]);
    setNote("");
    setExtraContribution("");
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
