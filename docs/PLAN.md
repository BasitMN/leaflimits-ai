# LeafLimits: plant-specific limits from a photo

Extension plan for MicroHydros: an Angular app, AI suggestions and a parallel
Node-RED flow. Author: BasitMN. Written 2026-09-19. Status: plan, nothing implemented.

The original MicroHydros stack (PR #16) is not changed by this plan. LeafLimits
runs as a separate compose project that only subscribes to the existing broker.

## 1. Goal

Adjust limit values per plant. The user photographs a plant in a mobile Angular
app, an AI suggests recommended limits, the user reviews and confirms, and the
values are sent to Node-RED, where they are applied to incoming sensor data.

## 2. What the existing code shows

1. **Current limits are sensor sanity checks, not plant limits.** `PLAUSIBLE_RANGES`
   in `docker/node-red/flows/mqtt-validation.json` marks a value as a hardware
   fault, and out-of-range values are rejected and never reach InfluxDB. Plant
   limits must not reject data. A too-hot reading is real data that should be
   stored and alarmed on. Plant limits are a second layer that classifies each
   value as `ok`, `low` or `high`. `PLAUSIBLE_RANGES` stays hardcoded and is also
   the hard bound for anything the AI suggests.
2. **Clean tap point.** Validated readings are published on
   `microhydros/v1/devices/+/telemetry/validated/+`. LeafLimits subscribes there
   and needs no validation of its own.
3. **Only four measurements exist:** `internal_temperature`, `internal_humidity`,
   `external_temperature`, `water_temperature`. No pH, EC or light sensor.
4. The `MEASUREMENT_MAP` bug (`external_sht31` vs `external_ds18b20`) is fixed on
   the PR branch.
5. The Grafana datasource uses the admin token, so it can read any bucket.
6. `settings.hetzner.js` has no `httpStatic` or CORS settings, so LeafLimits needs
   its own Node-RED settings file.

## 3. Architecture

```
ESP32 -> Mosquitto :1884 -> [original flow: validate] -> validated/+
                                   |                          |
                                   |               [original: Influx bucket 'microhydros']
                                   v  (read-only subscribe, unique client ID)
      LeafLimits Node-RED (compose project 'leaflimits')
        - evaluate readings against limits -> ok / low / high
        - write to Influx bucket 'microhydros_extra'
        - /api/limits (GET/PUT), /api/suggest-limits -> Claude API
        - serves the built Angular app (httpStatic, same origin)
                                   |
                                   v
      Grafana: new dashboard, Flux query on the new bucket
```

Isolation rules:

- Separate compose file with its own project name, container names, volume,
  network and a memory limit.
- The original stack is never restarted or edited.
- The new flow subscribes only. It never publishes to the original topics.

## 4. Data model

```json
{ "device_id": "esp32s3-01", "plant": "Basil", "source": "ai | manual",
  "updated_at": "...",
  "limits": {
    "water_temperature": { "min": 18, "max": 24 },
    "internal_humidity": { "min": 40, "max": 70 },
    "internal_temperature": {}, "external_temperature": {} } }
```

Stored in Node-RED file context, keyed by device ID. The default profile
reproduces today's behaviour, so nothing alarms until limits are set.

## 5. Evaluation logic

- Readings arrive every 5 s. Require 3 consecutive out-of-range readings before
  raising an alert, plus a small hysteresis band so an edge value does not flap.
- Each reading is written to Influx with `value`, `limit_min`, `limit_max` and
  `state`, so Grafana can draw threshold lines without extra queries.
- State changes are published on `microhydros/v1/devices/{id}/limits/alert`. The
  existing data contract is untouched.

## 6. API

| Endpoint | Purpose |
|---|---|
| `GET /api/limits/:device` | Current profile |
| `PUT /api/limits/:device` | Save a profile. Checks min < max, clamps to `PLAUSIBLE_RANGES` |
| `POST /api/suggest-limits` | Takes a base64 JPEG (about 1024 px). Node-RED calls Claude with a forced tool call and a JSON schema, re-validates and returns the suggestion. It never saves |

- Every endpoint needs a bearer token checked in a function node (`adminAuth`
  does not protect http-in routes).
- Rate limit the suggest endpoint (for example 20 per hour).
- `ANTHROPIC_API_KEY` lives in the container environment, never in flow JSON or
  the app.
- Human confirmation is mandatory: the AI only suggests, the user saves.

## 7. Angular app

Standalone components with signals, plus `@angular/pwa`. A `LimitsService`, a
token `HttpInterceptor` and a min < max validator. The build output goes into
Node-RED's `httpStatic`: one container, one origin, no CORS. Screens: Capture,
Review, Current (see `app/README.md`).

## 8. Phases

| # | Work | Done when |
|---|---|---|
| 0 | Check the server: free ports, spare RAM, anonymous access in `mosquitto.conf` | Numbers known |
| 1 | Create bucket `microhydros_extra` with a scoped write token | Test write succeeds |
| 2 | New compose project and Node-RED with the evaluation flow | New bucket fills while the old bucket's count is unchanged |
| 3 | Limits endpoints, tested with `curl` | A PUT changes the state of the next reading |
| 4 | AI endpoint with schema and rate limit | A test photo returns valid JSON |
| 5 | Grafana dashboard: values, threshold lines, state history | Lines move when limits change |
| 6 | Angular app | Photo, edit, save, and Grafana updates |
| 7 | HTTPS via reverse proxy, README, demo script | Works from the phone |

## 9. Risks

| Risk | Mitigation |
|---|---|
| MQTT client ID clash kicks the original Node-RED off the broker | Unique client ID |
| Wrong plant identification from a photo | Mandatory human review, confidence shown, optional growth-stage and setup fields |
| Shared Hetzner server has limited RAM | Memory limit, check in phase 0 |
| Simulator data pollutes the real bucket | Do not run the simulator against the live broker. Unit-test the evaluation function as plain JS |
| Live-system changes in phases 1-2 | Only with explicit go-ahead. Bucket creation is non-destructive and the container is separate |
| Camera and mixed-content limits over plain HTTP | One origin for app and API, HTTPS in phase 7 |
| API cost abuse | Token auth plus rate limit |

## 10. Open items

- Confirm the DS18B20 ROM pinning (water vs external probe) is finished.
- Decide whether the extension stays personal or is offered to the team as a PR.
- Confirm ports and RAM on the Hetzner server (phase 0).
