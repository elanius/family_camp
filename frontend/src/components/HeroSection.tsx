import { Link } from "react-router-dom";
import {
  EVENT_CITY,
  EVENT_DATES,
  EVENT_NAME,
  EVENT_VENUE,
  EVENT_YEAR,
} from "../eventInfo";

export default function HeroSection() {
  return (
    <section className="hero">
      <div className="hero__inner">
        <span className="hero__eyebrow">EVS · {EVENT_YEAR}</span>
        <h1 className="hero__title">{EVENT_NAME}</h1>
        <p className="hero__lead">
          Víkend nad otvorenou Bibliou — v spoločenstve, ktoré spolu študuje,
          modlí sa a hľadí dopredu.
        </p>
        <div className="hero__meta">
          <span className="hero__meta-item">{EVENT_DATES}</span>
          <span className="hero__meta-divider" aria-hidden="true" />
          <span className="hero__meta-item">
            {EVENT_VENUE}, {EVENT_CITY}
          </span>
        </div>
        <Link to="/registration" className="hero__cta">
          Prihlásiť sa
        </Link>
      </div>
    </section>
  );
}
