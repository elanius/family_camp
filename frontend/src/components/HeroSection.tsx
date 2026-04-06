import { useNavigate } from "react-router-dom";

export default function HeroSection() {
  const navigate = useNavigate();
  return (
    <section className="hero">
      <span className="hero__eyebrow">ECAV Obišovce · Leto 2026</span>
      <h1 className="hero__title">
        Detský biblický tábor
        <span className="hero__camp_name">V záhrade Kráľa</span>
      </h1>
      <p className="hero__subtitle">
        Týždeň plný hier, dobrodružstiev a Božieho slova pre deti v krásnom prírodnom prostredí.
      </p>
      <div className="hero__badges">
        <span className="badge">📅 26. – 31. júla 2026</span>
        <span className="badge">✝️ Biblický program</span>
        <span className="badge">👧 0 – 14 rokov</span>
      </div>
    </section>
  );
}
