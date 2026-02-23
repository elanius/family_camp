import { useState } from "react";
import { Card } from "./Card";

export default function CampInfo() {
  const [openCard, setOpenCard] = useState<number | null>(null);

  const toggle = (index: number) =>
    setOpenCard((prev) => (prev === index ? null : index));

  return (
    <section className="info">
      <h2 className="info__heading">Čo vás čaká?</h2>
      <div className="info__grid">
        <Card
          icon="📅"
          label="Termín"
          value="26. – 31. júla 2025"
          note="5 plných dní programu"
          isOpen={openCard === 0}
          onToggle={() => toggle(0)}
        >
          <p>Začíname v nedeľu o 17:00. Končíme v piatok obedom.</p>
        </Card>
        <Card
          icon="📍"
          label="Miesto"
          value="Cirkevná škola v prírode sv. Lukáša - Viničky"
          // note="Prírodné prostredie."
          isOpen={openCard === 1}
          onToggle={() => toggle(1)}
        >
          <p>
            <a
              href="https://www.hatfa.sk/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cirkevná škola v prírode sv. Lukáša
            </a>{" "}
            v obci Viničky ponúka pekné prírodné prostredie s ubytovaním v
            chatkách s kapacitou 20 ľudí.
          </p>
        </Card>
        <Card
          icon="👧"
          label="Účastníci"
          value="Deti vo veku 0 – 14 rokov"
          note="Možnosť doprovodu dospelou osobou"
          isOpen={openCard === 2}
          onToggle={() => toggle(2)}
        >
          <p>
            Tábor je určený pre deti vo veku 6 – 14 rokov. Deti mladšie ako 6
            rokov sa môžu zúčastniť len v sprievode dospelej osoby. Staršie deti
            sa môžu zúčastniť samostatne. Radi privítame aj celé rodiny, ktoré
            sa chcú zapojiť spoločne.
          </p>
        </Card>
        <Card
          icon="💶"
          label="Cena"
          value={
            <>
              Dieťa: 130 €<br />
              Dospelý: 150 €
            </>
          }
          note="Možnosť zľavy pre súrodencov"
          isOpen={openCard === 3}
          onToggle={() => toggle(3)}
        >
          <p>Deti do 3 rokov zdarma.</p>
          <p>Súrodenecká zľava:</p>
          <ul>
            <li>2 deti: 240 € (zľava 20 €)</li>
            <li>3 deti: 350 € (zľava 40 €)</li>
          </ul>
        </Card>
        <Card
          icon="🍽️"
          label="Strava"
          value="5× denne"
          note="Raňajky, desiata, obed, olovrant, večera"
          isOpen={openCard === 4}
          onToggle={() => toggle(4)}
        >
          <p>Strava je zabezpečená prevádzkovateľom ubytovacieho zariadenia.</p>
        </Card>
        <Card
          icon="🚂"
          label="Doprava"
          value="Individuálne alebo vlakom"
          note="Možný spoločný presun s organizátorom"
          isOpen={openCard === 5}
          onToggle={() => toggle(5)}
        >
          <p>
            V prípade záujmu budeme organizovať spoločný presun vlakom tam aj
            späť.
          </p>
        </Card>
      </div>
    </section>
  );
}
