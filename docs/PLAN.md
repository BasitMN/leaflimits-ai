# LeafLimits: plant-specific limits from a photo

Extension and deployment plan for MicroHydros: an Angular app, AI suggestions, a parallel Node-RED flow and a portable deployment.

**Author:** BasitMN   **Written:** 2026-09-19   **Revised:** 2026-09-19 after the live server check   **Status:** plan. Phases D1 and D1b written on branch `deploy` and statically checked, not yet run on Docker. Nothing else implemented

The original MicroHydros stack (PR #16) is not changed by this plan. LeafLimits lives in its own private repository, `BasitMN/leaflimits-ai`. Its `main` branch is an exact copy of the PR #16 branch, and the work happens on other branches.

## 1. Goal

1. Adjust limit values per plant. The user photographs a plant in a mobile Angular app, an AI suggests recommended limits, the user reviews and confirms, and the values are sent to Node-RED, where they are applied to incoming sensor data.
2. Make the whole backend and the app deployable on another server (for example at a workplace) with a clone and a few commands, working the same way as on Hetzner.

## 2. What the existing code shows

1. **Current limits are sensor sanity checks, not plant limits.** `PLAUSIBLE_RANGES` in `docker/node-red/flows/mqtt-validation.json` marks a value as a hardware fault, and out-of-range values are rejected and never reach InfluxDB. Plant limits must not reject data. A too-hot reading is real data that should be stored and alarmed on. Plant limits are a second layer that classifies each value as `ok`, `low` or `high`. `PLAUSIBLE_RANGES` stays hardcoded and is also the hard bound for anything the AI suggests.
2. **Clean tap point.** Validated readings are published on `microhydros/v1/devices/+/telemetry/validated/+`. LeafLimits subscribes there and needs no validation of its own.
3. **Only four measurements exist:** `internal_temperature`, `internal_humidity`, `external_temperature`, `water_temperature`. There is no pH, EC or light sensor.
4. The `MEASUREMENT_MAP` bug (`external_sht31` vs `external_ds18b20`) is fixed on the PR branch.
5. The Grafana datasource uses the admin token, so it can read any bucket.
6. `settings.hetzner.js` has no `httpStatic` or CORS settings, so LeafLimits needs its own Node-RED settings file.

## 3. Live server check (2026-09-19, read-only)

| Item | Finding |
|---|---|
| Host | Ubuntu 24.04, aarch64 (ARM), 2 CPUs, 3.7 GB RAM with about 2.6 GB available, 21 GB disk free |
| Docker | 29.6.2 with Compose v5.3.1 |
| Other workloads | Six other containers share the server: pm-iot-ui, grafana, influxdb, nodered, mosquitto-server, portainer |
| Ports already in use | 1880, 1881, 1883, 1884, 3000, 3001, 3002, 8086, 8087, 9000, 9001, 9443. LeafLimits must use other ports |
| Deployment folder | `/root/microhydros/docker` is a plain copy of the files, not a git checkout |
| Repo match | Compose file, Node-RED settings, Grafana datasource and dashboard match the repo. The validation and storage function code in the live flows is identical to the repo |
| Palette | Only core Node-RED nodes are used, so there are no extra packages to install |
| Mosquitto | `allow_anonymous true`, published on `0.0.0.0:1884`, no TLS |
| Firewall | `ufw` inactive, iptables INPUT is ACCEPT. InfluxDB `:8087`, Node-RED `:1881` and Grafana `:3002` are all reachable from the internet |
| Data | InfluxDB bucket `microhydros`, 34 MB, 248 water-temperature points for `esp32s3-01` in the last 7 days |
| **Storage tab** | **The "InfluxDB storage" tab was disabled by mistake. The last stored reading is from 2026-09-18 22:08 UTC, the same minute the flows file was last saved.** Enabling it and pressing Deploy in the Node-RED editor fixes it |

## 4. Architecture

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

Two deployment modes use the same repository:

| Mode | Where | What runs |
|---|---|---|
| **Add-on** | Hetzner, next to the running MicroHydros stack | Only the LeafLimits Node-RED. It subscribes to the existing broker |
| **Full stack** | A new server, for example at a workplace | Mosquitto, the original flows, InfluxDB, Grafana and LeafLimits, all from one compose file |

Isolation rules for the add-on mode:

- Separate compose project (`leaflimits`) with its own container names, volume, network and a memory limit.
- The original stack is never restarted or edited.
- The new flow subscribes only. It never publishes to the original topics, and it uses a unique MQTT client ID.

## 5. Repository and branches

| Item | Value |
|---|---|
| Repository | `git@github.com:BasitMN/leaflimits-ai.git` (private) |
| `main` | Exact copy of `feature/esp32s3-firmware` (PR #16), same commit IDs |
| `app` | The LeafLimits plan and the `app/` folder for the Angular app |
| `deploy` | Portable deployment work from section 9 (phase D1 in progress) |
| Commit identity | `BasitMN <43453765+BasitMN@users.noreply.github.com>` |
| Team repository | Not a remote of this repository, and never pushed to from here |

## 6. Data model

```json
{ "device_id": "esp32s3-01", "plant": "Basil", "source": "ai | manual",
  "updated_at": "...",
  "limits": {
    "water_temperature": { "min": 18, "max": 24 },
    "internal_humidity": { "min": 40, "max": 70 },
    "internal_temperature": {}, "external_temperature": {} } }
```

Stored in Node-RED file context, keyed by device ID. The default profile reproduces today's behaviour, so nothing alarms until limits are set.

## 7. Evaluation logic

- Readings arrive every 5 s. Require 3 consecutive out-of-range readings before raising an alert, plus a small hysteresis band so a value on the edge does not flap.
- Each reading is written to Influx with `value`, `limit_min`, `limit_max` and `state`, so Grafana can draw threshold lines without extra queries.
- State changes are published on `microhydros/v1/devices/{id}/limits/alert`. The existing data contract is untouched.

## 8. API and app

| Endpoint | Purpose |
|---|---|
| `GET /api/limits/:device` | Current profile |
| `PUT /api/limits/:device` | Save a profile. Checks min < max and clamps to `PLAUSIBLE_RANGES` |
| `POST /api/suggest-limits` | Takes a base64 JPEG (about 1024 px). Node-RED calls Claude with a forced tool call and a JSON schema, re-validates and returns the suggestion. It never saves |

- Every endpoint needs a bearer token checked in a function node, because `adminAuth` does not protect http-in routes.
- The suggest endpoint is rate limited (for example 20 per hour).
- `ANTHROPIC_API_KEY` lives in the container environment, never in flow JSON or the app.
- Human confirmation is mandatory. The AI only suggests, the user saves.

The Angular app uses standalone components with signals and `@angular/pwa`, a `LimitsService`, a token interceptor and a min < max validator. The build output goes into Node-RED's `httpStatic`, so there is one container, one origin and no CORS. Screens are Capture, Review and Current (see `app/README.md`).

## 9. Making the deployment portable

### Why cloning is not enough today

| Gap | Evidence | Effect on a new server |
|---|---|---|
| Flows are not loaded automatically | `docker/node-red/README.md` says to import them by hand, and no compose file mounts them | Node-RED starts empty, so nothing is validated or stored |
| Firmware has the Hetzner IP built in | `Kconfig.projbuild` defaults to `mqtt://95.216.208.235:1884` | The ESP32 keeps sending to Hetzner until reflashed |
| Two compose files | The root one has default ports and no Node-RED login. The Hetzner one remaps ports and has a login | One must be chosen and edited by hand |
| Bucket name is fixed | The dashboard hardcodes `from(bucket: "microhydros")` 8 times | The bucket and org must stay `microhydros` |
| Shared Node-RED login | The bcrypt hash is committed in `settings.hetzner.js` | The same login works on every server |
| No git checkout on the server | `/root/microhydros` has no `.git` | Updates are manual file copies |
| Windows line endings | The server's `mosquitto.conf` differs from the repo only in line endings | Harmless now, and `.gitattributes` prevents surprises |
| State is not in git | InfluxDB data lives in a Docker volume | A new server starts empty unless migrated |
| Security | Anonymous public MQTT, no firewall, root SSH with a password | Not acceptable on a workplace network |

What already helps: image versions are pinned and multi-arch (ARM to x86 works), Grafana provisioning and the dashboard come from files, the live flow code matches the repo, only core nodes are used, and containers reach each other by service name.

### Deployment phases

| # | Phase | Work | Done when |
|---|---|---|---|
| D1 | One-command deploy | One compose file driven by `.env` (ports, bind addresses, Node-RED login). Flows combined into one `flows.json` that is seeded on first start, with the storage tab enabled and the test inject removed. Complete `.env.example`. `.gitattributes` with LF endings. `scripts/deploy.sh` (checks Docker, ports, RAM, `.env`), `scripts/smoke-test.sh`, `scripts/backup.sh` and `restore.sh` | A clean machine runs `git clone`, `cp .env.example .env`, `./scripts/deploy.sh`, `./scripts/smoke-test.sh` with no manual clicks |
| D1b | Co-existence | Container names and the project name come from `.env`, and memory limits per service come from `.env`, so two copies of the stack can run on one host | Two projects run side by side without clashes and each stays under its limit |
| D2 | Hardening | Mosquitto password file and ACLs (publish-only user for the ESP32, own user for Node-RED). InfluxDB write-only token for Node-RED and read-only token for Grafana. Web UIs bound to `127.0.0.1` behind a Caddy reverse proxy. `ufw` on, with only the MQTT and HTTPS ports open | Anonymous publish is refused and the UIs are not reachable directly |
| D3 | LeafLimits in the deploy | Multi-stage Dockerfile builds the Angular app into the LeafLimits Node-RED image, so the server needs no Node.js. `ANTHROPIC_API_KEY` and the API token go in `.env`. Relative API URLs | `docker compose up -d --build` starts everything |
| D4 | Firmware | Change the broker default to a hostname such as `mqtt://hydro.<domain>:8883`. Reflash once. Workplace WiFi credentials set through menuconfig. The current setup supports WPA2-PSK only, not WPA2-Enterprise | Moving servers means a DNS change, with no reflash |
| D5 | Proof | Run the D1 commands at stage E1 (your own machine). Then run at E2 (the existing Hetzner server) after the deadline. E3 (throwaway VM, deleted afterwards) is optional and not planned | The smoke test passes on a machine that never saw the project |

**Progress on D1 (branch `deploy`):** the env-driven `compose.yaml`, the seeded `flows.json` (built by `scripts/build-seed-flows.py`), `settings.js`, `.env.example`, `.gitattributes`, `deploy.sh`, `smoke-test.sh`, `backup.sh`, the password-hash helper and `docs/DEPLOYMENT.md` are written and statically checked. Not yet run against Docker. `restore.sh` is still missing. **D1b** (project name, container names and memory limits from `.env`, plus a container-name check in `deploy.sh`) is written and statically checked.

Data migration is optional. Starting fresh is simplest. To keep history, run `influx backup` on Hetzner and restore at the new server. Grafana needs nothing, because its dashboards are provisioned.

### Where to build and test

The order is: this phone (E0), your PC (E1), then the existing Hetzner server (E2). Work moves up this ladder one stage at a time. A stage is finished when `./scripts/smoke-test.sh` passes there (E0 has no stack, so its exit criterion is that the static checks and unit tests pass).

| Stage | Where | What runs there | Risk to the live system | Enter when |
|---|---|---|---|---|
| E0 | This phone (Termux), no Docker | Static checks (YAML, shell syntax, JSON wiring), unit tests of the limits evaluation function in plain JS, Angular build if Node allows | None | Now |
| E1 | Your PC, with Docker | The full stack from a clean clone with default ports. Real `deploy.sh` and `smoke-test.sh`. The telemetry simulator can run against this local broker. LeafLimits and the Angular dev server are built and tested here | None | Docker (Desktop or Engine) with Compose v2 is installed on the PC |
| E2 | The existing Hetzner server, as a second project | Same stack in its own folder, on free ports (for example 1882, 1885, 3003, 8088), with memory limits and no container-name clash. LeafLimits runs as an add-on that subscribes to the live broker | Low but real: about 2.6 GB free RAM is shared with the live stacks | After the 25 September deadline and demo, and E1 has passed |
| E3 | A throwaway Hetzner Cloud VM (optional, not planned) | Clean-machine proof of D1 to D3, then the VM is deleted. About EUR 0.02 for a short test | None | Only if you later want the extra clean-machine proof |

Rules:

- Build and iterate on E0 and E1 only.
- Until the deadline and demo, the live server is only read from. The one allowed change is re-enabling the storage tab.
- Creating a cloud resource, or changing anything on the live server, needs explicit approval each time.
- Move to the next stage only when the previous one passes.

### Workplace checklist

- Get permission from the employer and IT to run a school project on their server.
- The server needs outbound access to `api.anthropic.com`, or the AI suggestion will not work behind a firewall or proxy.
- Confirm whether sending plant photos to an external AI is allowed.
- The ESP32's WiFi network must be able to reach the server. Watch for VLANs, client isolation and blocked ports.
- Decide who owns backups and who has admin access.
- Check that the server clock is synced, because Node-RED assigns the timestamps.
- A hostname and a TLS certificate are needed. If the company uses an internal CA, the firmware must trust it.

## 10. Build phases for LeafLimits

| # | Work | Where | Done when |
|---|---|---|---|
| 0 | Server check (done, see section 3) | Live server, read-only | Numbers known |
| 1 | Create bucket `microhydros_extra` with a scoped write token | E1 first, E2 after the deadline | Test write succeeds |
| 2 | New compose project and Node-RED with the evaluation flow, on free ports | E1 first, E2 after the deadline | New bucket fills while the old bucket's count is unchanged (E2) |
| 3 | Limits endpoints, tested with `curl` | E0 and E1 | A PUT changes the state of the next reading |
| 4 | AI endpoint with schema and rate limit | E1 | A test photo returns valid JSON |
| 5 | Grafana dashboard: values, threshold lines, state history | E1 | Lines move when limits change |
| 6 | Angular app | E0 and E1 | Photo, edit, save, and Grafana updates |
| 7 | HTTPS via reverse proxy, README and demo script | E2 or E3 | Works from the phone |

## 11. Risks

| Risk | Mitigation |
|---|---|
| MQTT client ID clash kicks the original Node-RED off the broker | Unique client ID |
| Wrong plant identification from a photo | Mandatory human review, confidence shown, optional growth-stage and setup fields |
| Shared Hetzner server is tight on RAM (about 2.6 GB free, six other containers) | Memory limits on the new containers, and watch usage in phase 2 |
| Simulator data pollutes the real bucket | Do not run the simulator against the live broker. Unit-test the evaluation function as plain JS |
| Live-system changes in phases 1 and 2 | Built and tested locally at E1 first. Live changes only at E2, after the deadline, with explicit go-ahead |
| Camera and mixed-content limits over plain HTTP | One origin for app and API, HTTPS in phase 7 |
| API cost abuse | Token auth plus rate limit |
| Public anonymous MQTT and open ports | Hardening phase D2 |
| Employer policy blocks the deployment | Ask before building anything for the workplace |

## 12. Open items

- **Re-enable the "InfluxDB storage" tab on the live server.** It was disabled by mistake. This is a one-click change in the Node-RED editor, and I have not made it.
- Confirm the PC (stage E1) has Docker with Compose v2, about 1 GB free RAM and the default ports free.
- Confirm the DS18B20 ROM pinning (water vs external probe) is finished.
- Decide whether the extension stays personal or is offered to the team as a PR after the deadline.
- Get workplace permission before any work there (section 9 checklist).
