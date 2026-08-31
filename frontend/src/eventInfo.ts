/** Single source of truth for the event details shown across the site. */

export const EVENT_NAME = "Vzdelávanie EVS";
export const EVENT_YEAR = "2026";
export const EVENT_DATES = "23. – 25. októbra 2026";
export const EVENT_DATES_SHORT = "23. – 25. 10. 2026";
export const EVENT_VENUE = "Hotel Máj***";
export const EVENT_CITY = "Liptovský Ján";
export const EVENT_VENUE_URL = "https://www.sorea.sk/hotel-maj";

export const EVENT_SUBTITLE = `${EVENT_NAME} · ${EVENT_VENUE}, ${EVENT_CITY} · ${EVENT_DATES}`;

export const REGISTRATION_DEADLINE = "27. septembra 2026";

export const CONTACT_EMAIL = "lydia@evs.sk";
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
