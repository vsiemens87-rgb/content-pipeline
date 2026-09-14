# Content Pipeline MVP

Board für Valentins wöchentlichen Social-Rezept-Flow. **Kein Auto-Post. Kein Backend.** Nur statisches HTML/CSS/JS + `localStorage`.

**Live:** https://vsiemens87-rgb.github.io/content-pipeline/

## Status-Flow

`Idee` → `PT` → `Einkauf` → `Gedreht` → `Caption final` → `Gepostet` → `Review`

Plus **`Kill`** (mit Pflicht-Begründung).

### Einkauf = drehbereit

Nach **PT** mit ausgefüllten **Macros** (`kcal` / `proteinG`) und/oder **`cutFit = true`** gilt Status **`Einkauf` als drehbereit** (bereit zum Dreh). Die UI zeigt auf Einkauf-Karten mit cutFit/Macros den Chip **drehbereit**.

Es gibt kein automatisches Posten — Gepostet bleibt manuell.

## Constraints (UI-Hinweis)

- Airfryer ja  
- 3 Drehs/Woche  
- Fokus: Reispapier / Wrap / Airfryer  
- Cut-Ziel: 65–66 kg bis 31.12.  
- Käse oft No-Go  

## Features

- Dark, mobile-freundliches Kanban nach Status (Filter-Select + Move-Buttons)
- **Rank Woche** Panel (Ranks 1–7)
- Detail-Modal (alle Felder)
- Neue Karte
- **Wochen-Einkaufsliste**: aggregiert `shopping` aus Status `Einkauf` + `Gedreht` + `Caption final` (ohne Kill)
- JSON Import/Export
- Persistenz: `localStorage` Key **`content_pipeline_v1`**
- Seed nur wenn Storage leer (3 Rezepte, Rank 1–3, Status `Caption final`, `cutFit: true`)

## Card-Felder

`id`, `title`, `rank` (1–7 \| null), `status`, `killReason`, `refLink`, `localClipPath`, `creatorUsername`, `sourceMode` (A\|B), `patternTags`, `hookType`, `kochkarte`, `drehbrief`, `caption`, `captionHookAlt`, `macros` `{kcal, proteinG, note}`, `cutFit`, `shopping` (Newline-Liste), `timeMinutes`, `difficultyOnCam`, `shootDurationSec`, `platformSlot` (IG\|TT\|beide), `postWindow`, `performance48h` / `performance7d`, `createdAt`, `updatedAt`

## Lokal öffnen

```bash
cd /workspace/content-pipeline
python3 -m http.server 8080
# → http://localhost:8080/
```

Oder Datei `index.html` direkt im Browser öffnen (localStorage funktioniert file:// in den meisten Browsern).

## Deploy (GitHub Pages)

Repo: `vsiemens87-rgb/content-pipeline` (public), Branch `main`, Pages aus Root `/`, Datei `.nojekyll` vorhanden.

```bash
gh auth setup-git
# … push main …
# Pages: Settings → Pages → Deploy from branch main / (root)
```

## Seed-Quellen

- `/workspace/nachmachen/kochkarten-drei-rezepte.md`
- `/workspace/drei-dreh-scripts-cut.md`
- Clips: `/workspace/nachmachen/referenzen/*.mp4`

## Dateien

| Datei | Zweck |
|-------|--------|
| `index.html` | Shell / Modals |
| `styles.css` | Dark UI |
| `app.js` | Board-Logik, Storage, Import/Export |
| `seed.js` | 3 Startkarten |
| `.nojekyll` | GitHub Pages ohne Jekyll |
