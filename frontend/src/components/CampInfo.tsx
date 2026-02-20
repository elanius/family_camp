const INFO_ITEMS = [
  {
    icon: '📅',
    label: 'Termín',
    value: '26. – 31. júla 2025',
    note: '6 nocí, 5 plných dní programu',
  },
  {
    icon: '📍',
    label: 'Miesto',
    value: 'Cirkevná škola v prírode sv. Lukáša',
    note: 'Viničky · hatfa.sk',
    link: 'https://www.hatfa.sk/',
  },
  {
    icon: '👧',
    label: 'Vek účastníkov',
    value: '6 – 14 rokov',
    note: 'Sprevádzajúci rodičia sú vítaní',
  },
  {
    icon: '💶',
    label: 'Cena',
    value: 'Dieťa: 130 € · Dospelý: 150 €',
    note: 'Vrátane stravy a ubytovania',
  },
  {
    icon: '🍽️',
    label: 'Strava',
    value: '5× denne',
    note: 'Raňajky, desiata, obed, olovrant, večera',
  },
  {
    icon: '🚂',
    label: 'Doprava',
    value: 'Individuálna alebo vlakom',
    note: 'Možný spoločný presun s organizátorom',
  },
]

export default function CampInfo() {
  return (
    <section className="info">
      <h2 className="info__heading">Čo vás čaká?</h2>
      <div className="info__grid">
        {INFO_ITEMS.map((item) => (
          <div key={item.label} className="info-card">
            <div className="info-card__icon">{item.icon}</div>
            <div className="info-card__label">{item.label}</div>
            <div className="info-card__value">{item.value}</div>
            {item.note && (
              <div className="info-card__note">
                {'link' in item && item.link
                  ? <a href={item.link} target="_blank" rel="noopener noreferrer">{item.note}</a>
                  : item.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
