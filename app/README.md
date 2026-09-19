# LeafLimits app

Angular PWA for setting plant-specific limit values. Take a photo of a plant, get
AI-suggested limits, review and confirm them, and save them to Node-RED.

Status: **planned, not implemented yet.** See [`../docs/PLAN.md`](../docs/PLAN.md).

## Screens

| Screen  | Purpose |
|---------|---------|
| Capture | Take a photo with the phone camera, downscale it to about 1024 px |
| Review  | Edit the AI-suggested min/max per sensor, then save |
| Current | Active plant profile with the latest value next to each limit |

The app talks only to the LeafLimits Node-RED instance (`/api/limits`,
`/api/suggest-limits`). It never calls the AI provider directly, and no API key
is ever stored in the app.
