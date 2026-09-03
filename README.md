# Vzdelávanie EVS 2026

Registračná stránka pre víkendové biblické vzdelávanie EVS
(23. – 25. 10. 2026, Hotel Máj***, Liptovský Ján).

Návštevník vyplní prihlášku (za seba a/alebo za ďalšie osoby), dostane
potvrdzovací e-mail s odkazom na neskoršiu úpravu alebo zrušenie prihlášky.
Administrátor v samostatnej sekcii spravuje stav prihlášok a posiela platobné
inštrukcie s QR kódom (Pay by Square).

Rovnaký e-mail smie podať viac prihlášok — formulár na duplicitu len upozorní.

## Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Frontend | React 18 + Vite 5 + TypeScript            |
| Backend  | FastAPI + UV + Motor (async MongoDB)      |
| Database | MongoDB Atlas — databáza `evs-vzdelavanie-2026` |
| Email    | SMTP                                      |
| E2E      | Playwright                                |

## Project structure

```
family_camp/
├── backend/          # FastAPI app (UV / Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── routers/{register,registration,admin}.py
│   │   └── services/{email,auth}.py
│   ├── scripts/create_admin.py
│   ├── pyproject.toml
│   └── .env.example
└── frontend/         # Vite + React + TypeScript
    ├── e2e/          # Playwright specs
    └── src/
        ├── eventInfo.ts        # termín, miesto, prednášajúci, kontakt
        ├── utils/pricing.ts    # ceny balíkov ubytovania
        ├── components/
        └── pages/
```

## Registrácia — dátový model

Prihlášku podáva jedna **kontaktná osoba (platiteľ)** v jednom z troch režimov:

| `registration_type` | Kto sa zúčastní                          |
|---------------------|------------------------------------------|
| `only_me`           | len prihlasujúci                         |
| `me_and_others`     | prihlasujúci + ďalší účastníci           |
| `just_others`       | len ďalší účastníci (platiteľ nepríde)   |

Každý **účastník** si vyberá balík ubytovania a stravy:

| `accommodation` | Cena / osoba | Obsah                                            |
|-----------------|--------------|--------------------------------------------------|
| `double`        | 179 €        | 2× nocľah v dvojlôžkovej izbe, 2× raňajky, 2× obed, 2× večera, miestna daň |
| `single`        | 219 €        | to isté v jednolôžkovej izbe                      |
| `none`          | 0 €          | účasť len na prednáškach                          |

Pri každom účastníkovi sa eviduje **preferovaný spolubývajúci** (len pri
`double`). K celej prihláške patrí voliteľný **dobrovoľný príspevok** v celých
eurách, ktorý sa pripočíta k výslednej sume.

**Rekreačný poukaz** patrí osobe, ktorá prihlášku podáva, preto je to voľba na
úrovni celej prihlášky (`recreation_voucher`), nie jednotlivých účastníkov.
Ponúka sa len pri `only_me` a `me_and_others`, a len keď má prihlasujúci
objednaný pobyt. Po zaškrtnutí sa vypĺňajú fakturačné údaje pre hotel
(`voucher_billing`: meno, priezvisko, adresa, mesto, PSČ) — hotel na ne vystaví
faktúru potrebnú na uplatnenie poukazu.

Ceny sú definované na dvoch miestach a musia zostať zosúladené:
[`frontend/src/utils/pricing.ts`](frontend/src/utils/pricing.ts) a
`_ACCOMMODATION_PRICE` v [`backend/app/routers/admin.py`](backend/app/routers/admin.py).

## Getting started

### Prerequisites

- Python ≥ 3.13
- [uv](https://docs.astral.sh/uv/)
- Node.js ≥ 18
- Prístup k MongoDB Atlas (alebo lokálna Mongo cez `docker compose up -d`)

### Backend

```bash
cd backend

cp .env.example .env       # doplniť MONGODB_URI, SMTP_*, BANK_*, JWT_SECRET
uv sync
uv run uvicorn app.main:app --reload --port 8008
# API na http://localhost:8008 — dev proxy frontendu mieri na tento port
```

Vytvorenie admin používateľa:

```bash
cd backend
uv run python scripts/create_admin.py --username admin --password <heslo>
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, /api sa proxuje na :8008
npm run build    # produkčný build do frontend/dist/
npm run lint
```

### E2E testy

```bash
cd frontend
npx playwright install chromium   # prvýkrát
npx playwright test
```

Testy si samy spustia dev server a backend **nepotrebujú** — sieťové volania sú
mockované cez `page.route`.

## Konfigurácia (backend/.env)

| Premenná           | Popis                                                        |
|--------------------|--------------------------------------------------------------|
| `MONGODB_URI`      | Connection string na Atlas cluster                            |
| `MONGODB_DB`       | `evs-vzdelavanie-2026`                                        |
| `APP_BASE_URL`     | Verejná URL frontendu — z nej sa skladá odkaz na úpravu prihlášky v e-maile |
| `EMAIL_ENABLED`    | `false` vypne všetky odchádzajúce e-maily (vývoj)             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Prihlasovacie údaje SMTP servera        |
| `BANK_IBAN`, `BANK_NAME`, `BANK_BENEFICIARY` | Údaje do platobného e-mailu a QR kódu |
| `JWT_SECRET`       | Podpisovanie admin tokenov                                    |

Bez `SMTP_HOST`, `SMTP_USER` alebo `SMTP_PASSWORD` sa e-maily preskočia
(zaloguje sa varovanie), registrácia však prebehne normálne.

## Admin

| Route                  | Účel                                                    |
|------------------------|---------------------------------------------------------|
| `/admin/login`         | Prihlásenie                                             |
| `/admin`               | Zoznam prihlášok, stavy, súhrn osôb / sumy / poukazov   |
| `/admin/attendees`     | Plochá tabuľka účastníkov + export do CSV               |
| `/admin/payment/:id`   | Platobné údaje, QR kód a odoslanie e-mailu s platbou    |

Stavy prihlášky: `new → wait_for_payment → paid → accepted`, kedykoľvek
`rejected`. Verejný odkaz na úpravu funguje len v stave `new` — odoslaním
platobných informácií (`wait_for_payment`) sa prihláška uzavrie, aby sa
nerozišla s už oznámenou sumou.

Pri označení platby ako prijatej vyberá administrátor v kalendári **dátum
prijatia platby** (predvolene dnešok, spätne ľubovoľný starší deň, budúce dátumy
sú odmietnuté). Ukladá sa do `payment_received_at`.

Platba má pre celé podujatie **pevný variabilný symbol `022026`**
(`FIXED_VARIABLE_SYMBOL` v [`backend/app/routers/admin.py`](backend/app/routers/admin.py));
platby sa párujú cez **správu pre príjemcu**, ktorá obsahuje celé meno
prihlasujúceho. Sumu môže administrátor pred odoslaním upraviť — uloží sa do
`payment_amount` a od tej chvíle je to cena prihlášky, aj keď sa líši od
vypočítanej.
