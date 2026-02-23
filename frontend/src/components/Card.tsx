export function Card({
  icon,
  label,
  value,
  note,
  isOpen = false,
  onToggle,
  children,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  note?: string;
  isOpen?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`info-card${isOpen ? " info-card--open" : ""}`}>
      <div className="info-card__body">
        <div className="info-card__header">
          <div className="info-card__icon">{icon}</div>
          <div className="info-card__label">{label}</div>
        </div>
        <div className="info-card__value">{value}</div>
        {note && <div className="info-card__note">{note}</div>}
        {children && (
          <button
            className={`info-card__footer${isOpen ? " info-card__footer--open" : ""}`}
            onClick={onToggle}
            aria-expanded={isOpen}
          >
            <span className="info-card__footer-label">viac</span>
            <span className="info-card__toggle">
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden="true"
              >
                <path
                  d="M2 4 L6 8 L10 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        )}
      </div>
      {children && (
        <div className="info-card__details" aria-hidden={!isOpen}>
          <div className="info-card__details-inner">{children}</div>
        </div>
      )}
    </div>
  );
}
