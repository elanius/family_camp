import { useState } from "react";
import { Card } from "./Card";
import { ACCOMMODATION_PRICE } from "../utils/pricing";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_HREF,
  EVENT_CITY,
  EVENT_DATES,
  EVENT_VENUE,
  EVENT_VENUE_URL,
  LECTURERS,
  PROGRAM,
  REGISTRATION_DEADLINE,
} from "../eventInfo";

export default function EventInfo() {
  const [openCard, setOpenCard] = useState<number | null>(null);

  const toggle = (index: number) => setOpenCard((prev) => (prev === index ? null : index));

  return (
    <>
      {/* ── Intro ─────────────────────────────────────────────────── */}
      <section className="intro">
        <blockquote className="intro__quote">
          <p className="intro__text">
            „Napokon, bratia, radujte sa, zdokonaľujte sa, napomínajte sa, rovnako zmýšľajte, nažívajte v pokoji a Boh
            lásky a pokoja bude s vami.“
          </p>
          <cite className="intro__citation">2. list Korintským 13, 11</cite>
        </blockquote>
      </section>

      {/* ── Lecturers ─────────────────────────────────────────────── */}
      <section className="lecturers">
        <h2 className="section__heading">Prednášajúci</h2>
        <div className="lecturers__grid">
          {LECTURERS.map((l) => (
            <article className="lecturer" key={l.name}>
              <h3 className="lecturer__name">{l.name}</h3>
              <p className="lecturer__role">{l.role}</p>
              <p className="lecturer__topic">{l.topic}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Practical info ────────────────────────────────────────── */}
      <section className="info">
        <h2 className="section__heading">Praktické informácie pred prihlásením</h2>
        <div className="info__grid">
          <Card
            label="Termín"
            value={EVENT_DATES}
            note="Piatok 16:00 – nedeľa obed"
            isOpen={openCard === 0}
            onToggle={() => toggle(0)}
          >
            <p>Začíname v piatok o 16:00 prvou prednáškou (Curt Westman) a končíme v nedeľu obedom.</p>
            <div className="program">
              {PROGRAM.map((day) => (
                <div className="program__day" key={day.day}>
                  <p className="program__day-title">{day.day}</p>
                  <ul className="program__list">
                    {day.items.map((item, i) => (
                      <li className="program__item" key={i}>
                        {item.time && <span className="program__time">{item.time}</span>}
                        <span className="program__label">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card
            label="Miesto"
            value={`${EVENT_VENUE}, ${EVENT_CITY}`}
            note="Ubytovanie, strava aj prednášky na jednom mieste"
            isOpen={openCard === 1}
            onToggle={() => toggle(1)}
          >
            <p>
              Vzdelávanie sa uskutoční v hoteli{" "}
              <a href={EVENT_VENUE_URL} target="_blank" rel="noopener noreferrer">
                Sorea Máj***
              </a>{" "}
              v Liptovskom Jáne.
            </p>
          </Card>

          <Card
            label="Cena"
            value={
              <>
                {ACCOMMODATION_PRICE.double} € v dvojlôžkovej izbe
                <br />
                {ACCOMMODATION_PRICE.single} € v jednolôžkovej izbe
              </>
            }
            note="Cena za osobu na celý pobyt"
            isOpen={openCard === 2}
            onToggle={() => toggle(2)}
          >
            <p>V cene je 2× nocľah, 2× raňajky, 2× obed, 2× večera a miestna daň.</p>
            <p>
              Cena pokrýva priame náklady na ubytovanie a stravu. Ak môžete zaplatiť viac, príspevok použijeme na
              náklady spojené s organizáciou vzdelávania, zaplatenie pobytu iným a na podporu služby EVS.
            </p>
            <p>
              Ak plánujete prísť len na prednášky, bez ubytovania a stravy, prihláste sa tiež — účasť je v tom prípade
              bez poplatku.
            </p>
          </Card>

          <Card
            label="Rekreačný poukaz"
            value="Môžete si ho uplatniť"
            note="Pobyt na 2 noci spĺňa podmienky"
            isOpen={openCard === 3}
            onToggle={() => toggle(3)}
          >
            <p>
              Pri pobyte na 2 noci si môžete uplatniť rekreačný poukaz. Ak máte o to záujem, uveďte to v prihláške a
              pošleme vám informácie, ako postupovať u zamestnávateľa.
            </p>
          </Card>

          <Card
            label="Prihlasovanie"
            value={`Do ${REGISTRATION_DEADLINE}`}
            note="Vzdelávanie je len na pozvanie"
            isOpen={openCard === 4}
            onToggle={() => toggle(4)}
          >
            <p>
              Prihlášku Vám spätne potvrdíme e-mailom. Všetci prihlásení dostanú potvrdenie o úhrade a informácie o
              pobyte.
            </p>
            <p>Aj tento ročník vzdelávania EVS je len na pozvanie. Ak chcete niekoho pozvať, kontaktujte nás.</p>
          </Card>

          <Card
            label="Kontakt"
            value={CONTACT_EMAIL}
            note={CONTACT_PHONE}
            isOpen={openCard === 5}
            onToggle={() => toggle(5)}
          >
            <p>
              Máte otázky? Napíšte nám na <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> alebo zavolajte na{" "}
              <a href={`tel:${CONTACT_PHONE_HREF}`}>{CONTACT_PHONE}</a>.
            </p>
          </Card>
        </div>
      </section>
    </>
  );
}
