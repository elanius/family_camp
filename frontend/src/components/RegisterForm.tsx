import { useState, type FormEvent } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error' | 'duplicate'

const MESSAGES: Record<Exclude<Status, 'idle' | 'loading'>, string> = {
  success: '✅ Hotovo! Potvrdenie sme vám zaslali na e-mail. Ozveme sa, keď spustíme registráciu na tábor.',
  error: '❌ Odoslanie sa nepodarilo. Skúste to prosím znova.',
  duplicate: 'ℹ️ Tento e-mail je už zaregistrovaný.',
}

export default function RegisterForm() {
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [status, setStatus] = useState<Status>('idle')

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const showError = touched && !isValidEmail

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!isValidEmail) return

    setStatus('loading')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.status === 201) {
        setStatus('success')
        setEmail('')
        setTouched(false)
      } else if (res.status === 409) {
        setStatus('duplicate')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="register" className="register">
      <div className="register__inner">
        <h2 className="register__heading">Zaujal vás tábor?</h2>
        <p className="register__description">
          Registrácia ešte nie je otvorená. Zanechajte nám svoj e-mail
          a budete prví, ktorí sa dozvedia, keď ju spustíme.
        </p>

        {status === 'success' ? (
          <p className="register__message register__message--success">
            {MESSAGES.success}
          </p>
        ) : (
          <form className="register__form" onSubmit={handleSubmit} noValidate>
            <input
              type="email"
              className={`register__input${showError ? ' is-invalid' : ''}`}
              placeholder="vas@email.sk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={status === 'loading'}
              aria-label="E-mailová adresa"
              autoComplete="email"
            />
            <button
              type="submit"
              className="register__button"
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Odosielam…' : 'Mám záujem, dajte mi vedieť'}
            </button>

            {(status === 'error' || status === 'duplicate') && (
              <p className="register__message register__message--error">
                {MESSAGES[status]}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}
