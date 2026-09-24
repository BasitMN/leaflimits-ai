# LeafLimits app

Angular 21 web app for setting plant-specific limit values. Take a photo of a plant, get
AI-suggested limits, review and confirm them, and save them to Node-RED. Standalone components,
signals, reactive forms, hash routing. No service worker yet (a PWA needs HTTPS).

Status: **first version, built and unit tested against a mock backend.** The Node-RED side
(the "LeafLimits" tab that implements the API below) is not written yet. See [`../docs/PLAN.md`](../docs/PLAN.md).

## Screens

| Screen | Purpose |
|--------|---------|
| Current  | Active plant, limits and the latest value per sensor with an in-range / too low / too high chip. Refreshes every 5 s |
| Photo    | Take a photo with the camera or choose an existing one (gallery or files, or drag and drop on a computer). It is checked, shrunk to a 1024 px JPEG on the phone, then sent for an AI suggestion |
| Review   | Editable min/max per sensor (min < max, inside the sensor's plausible range), then Save |
| Settings | Access token and device id, kept in this browser only |

## API contract with Node-RED

All URLs are relative to the page, so the app works under any path or host. Every request carries
`Authorization: Bearer <token>`.

| Request | Response |
|---------|----------|
| `GET  api/limits/:device` | `{ device_id, plant, source: 'default'\|'ai'\|'manual', updated_at, limits: { <measurement>: { min, max } } }` |
| `PUT  api/limits/:device` | the saved profile, same shape (body is the profile) |
| `POST api/suggest` | `{ plant, confidence 0..1, notes, limits }`. Body `{ image: <base64 jpeg>, media_type: 'image/jpeg' }`. Never saves anything |
| `GET  api/status/:device` | `{ <measurement>: { value, unit, state: 'ok'\|'low'\|'high'\|'unknown', timestamp } }` |

Measurements: `water_temperature`, `internal_temperature`, `internal_humidity`, `external_temperature`.
The plausible ranges in `src/app/models.ts` are the same as `PLAUSIBLE_RANGES` in the Node-RED
validation flow, and limits outside them are refused on both sides.

## Develop without a backend

Open the app with `?mock=1` (for example `http://localhost:8080/leaflimits/?mock=1`). An in-memory
fake API returns a Basil suggestion after 1.5 s and simulated readings. `?mock=0` turns it off.

## Build and test

```bash
cd app
npm install --legacy-peer-deps
npx ng test --watch=false              # unit tests (validation, classification, image scaling and file checks)
npx ng build --base-href /leaflimits/  # output in dist/leaflimits-app/browser
```

Serve the contents of `dist/leaflimits-app/browser` under `/leaflimits/`. On the phone (Termux),
`node_modules` cannot live in `~/ws` because that folder allows no links, so build in a copy
under the session scratchpad and keep only the source here.
