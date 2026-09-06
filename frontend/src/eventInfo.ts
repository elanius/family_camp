/** Single source of truth for the event details shown across the site. */

export const EVENT_NAME = "Vzdelávanie EVS";
export const EVENT_YEAR = "2026";
export const EVENT_DATES = "23. – 25. októbra 2026";
export const EVENT_DATES_SHORT = "23. – 25. 10. 2026";
export const EVENT_VENUE = "Hotel Máj***";
export const EVENT_CITY = "Liptovský Ján";
export const EVENT_VENUE_URL = "https://www.sorea.sk/nizke-tatry/hotel-sorea-maj";

export const EVENT_SUBTITLE = `${EVENT_NAME} · ${EVENT_VENUE}, ${EVENT_CITY} · ${EVENT_DATES}`;

export const REGISTRATION_DEADLINE = "27. septembra 2026";

export const CONTACT_EMAIL = "vzdelavanie@evs.sk";
export const CONTACT_PHONE = "0911 798 800";
export const CONTACT_PHONE_HREF = "+421911798800";

export interface Lecturer {
  name: string;
  role: string;
  topic: string;
}

export const LECTURERS: Lecturer[] = [
  {
    name: "Curt Westman",
    role: "evanjelista, Nórsko",
    topic: "Stará zmluva",
  },
  {
    name: "Ole Lilleheim",
    role: "evanjelista Open Doors, Nórsko",
    topic: "Prenasledovaní kresťania",
  },
];

export interface ProgramItem {
  /** Empty when the line carries its own timing (e.g. "odhlásenie do 10.00"). */
  time?: string;
  label: string;
}

export interface ProgramDay {
  day: string;
  items: ProgramItem[];
}

/** Outline of the weekend as published before registration. */
export const PROGRAM: ProgramDay[] = [
  {
    day: "Piatok 23. 10. 2026",
    items: [
      { time: "14.00 – 16.00", label: "príchod" },
      { time: "16.00 – 17.00", label: "spoločný program" },
      { time: "19.00 – 21.00", label: "spoločný program" },
    ],
  },
  {
    day: "Sobota 24. 10. 2026",
    items: [
      { time: "9.00 – 10.00", label: "spoločný program" },
      { time: "14.00 – 17.30", label: "voľný program" },
      { time: "19.00", label: "spoločný program" },
    ],
  },
  {
    day: "Nedeľa 25. 10. 2026",
    items: [{ label: "odhlásenie z hotela do 10.00" }, { time: "9.00 – 11.30", label: "spoločný program" }],
  },
];
