import { createContext, useContext, useState, type ReactNode } from "react";
import type { AttendeeData } from "../components/AttendeeForm";

export type RegistrationType = "me_and_others" | "just_others" | "only_me";

export interface RegistrantData {
  name: string;
  surname: string;
  /** String to mirror the text input; parsed to number when building the API payload. */
  age: string;
  phone: string;
  email: string;
  transportation: "" | "individual" | "train_with_organizer";
}

function emptyRegistrant(): RegistrantData {
  return {
    name: "",
    surname: "",
    age: "",
    phone: "",
    email: "",
    transportation: "",
  };
}

function emptyAttendee(): AttendeeData {
  return { name: "", surname: "", age: "", phone: "", email: "" };
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
  resetForm: () => void;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(
  null,
);

export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [regType, setRegType] = useState<RegistrationType>("me_and_others");
  const [registrant, setRegistrant] = useState<RegistrantData>(emptyRegistrant);
  const [attendees, setAttendees] = useState<AttendeeData[]>([emptyAttendee()]);
  const [note, setNote] = useState("");

  function resetForm() {
    setRegType("me_and_others");
    setRegistrant(emptyRegistrant());
    setAttendees([emptyAttendee()]);
    setNote("");
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
