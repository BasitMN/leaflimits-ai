# LeafLimits tab for Node-RED

A Node-RED tab that adds plant-specific limits to MicroHydros. It is **additive**: it only reads the
validated readings that the MQTT Validation flow already publishes, and it never changes the validation
flow or the InfluxDB storage flow. Import it disabled, enable it when ready, disable it to go back to the
original behaviour.

Importable flow: [`../flows/leaflimits.json`](../flows/leaflimits.json), generated from `src/` by `build.js`.

## What it does

```
MQTT Validation tab   raw -> validate -> validated/+ ----> InfluxDB storage tab (unchanged)
                                              |
                                              +--> LeafLimits tab
                                                     evaluate each reading against the limits
                                                     -> alert on microhydros/v1/devices/{id}/limits/alert
                                                     HTTP API + web app under /leaflimits/
                        limits kept as a retained MQTT message: microhydros/v1/devices/{id}/limits/config
```

- **Evaluation.** Each sensor is `ok`, `low`, `high` or `unknown` (no limit set). Three consecutive readings
  outside the limit raise it (15 s at a 5 s interval) and two consecutive readings back inside clear it. A value must
  come back 2% of the range inside the limit before it counts, so a value on the edge does not flap. An alert is
  published only when the state changes.
- **Storage.** The profile of a device is a retained MQTT message, so it survives a Node-RED restart with no change to
  the Node-RED settings. Publishing an empty retained message clears it.
- **Nothing is written to InfluxDB** by this tab. The latest values and states are held in memory and served through
  the status endpoint.

## HTTP API

All routes need `Authorization: Bearer <LEAFLIMITS_TOKEN>`. Bodies and answers are JSON. Errors are `{ "message": "..." }`.

| Route | Purpose |
|---|---|
| `GET /leaflimits/api/limits/:device` | Profile `{ device_id, plant, source, updated_at, limits }` (a default profile when none is saved) |
| `PUT /leaflimits/api/limits/:device` | Validate and save. 400 with a readable message for min >= max, values outside a sensor's plausible range, unknown sensors |
| `GET /leaflimits/api/status/:device` | Latest `{ value, unit, state, timestamp, age_seconds }` per sensor |
| `POST /leaflimits/api/suggest` | `{ image: <base64 jpeg>, media_type: "image/jpeg" }` -> `{ plant, confidence, notes, limits }`. Never saves. 503 without an API key, 429 over the hourly limit, 502 when the AI service fails |
| `GET /leaflimits`, `GET /leaflimits/:file` | The built Angular app from `LEAFLIMITS_APP_DIR` (no token needed) |

Sensor ranges (`water_temperature` 0 to 50, `internal_temperature` -10 to 60, `internal_humidity` 0 to 100,
`external_temperature` -40 to 60) are the same as `PLAUSIBLE_RANGES` in the validation flow. The AI answer is
clamped to them and invalid ranges are dropped.

## Tab variables (Edit tab, Environment Variables)

| Name | Type | Purpose |
|---|---|---|
| `LEAFLIMITS_TOKEN` | credential | Bearer token for the API. Use a long random value, for example `openssl rand -hex 24` |
| `ANTHROPIC_API_KEY` | credential | Key for `/api/suggest`. Leave empty to turn AI suggestions off (the app then asks for limits by hand) |
| `ANTHROPIC_MODEL` | string | Default `claude-sonnet-5` |
| `ANTHROPIC_API_URL` | string | Default `https://api.anthropic.com/v1/messages` |
| `SUGGEST_MAX_PER_HOUR` | number | Default 20, for the whole server |
| `LEAFLIMITS_APP_DIR` | string | Default `/data/leaflimits-app` |

Credential variables are stored encrypted by Node-RED and are **not** part of an export, so the flow file contains no secrets.
Changing them needs no change to the compose file or the Node-RED settings.

## Put it on the live Node-RED

Everything below touches only Node-RED and its own data folder. Mosquitto, InfluxDB, Grafana, the compose file and
`settings.js` stay as they are.

1. **Back up the current flows** (a read-only copy):
   ```bash
   docker cp microhydros-node-red:/data/flows.json ./flows-backup-$(date +%F).json
   docker cp microhydros-node-red:/data/flows_cred.json ./flows_cred-backup-$(date +%F).json
   ```
2. **Build the app and copy it in:**
   ```bash
   cd app && npm install --legacy-peer-deps && npx ng build --base-href /leaflimits/
   docker exec microhydros-node-red mkdir -p /data/leaflimits-app
   docker cp dist/leaflimits-app/browser/. microhydros-node-red:/data/leaflimits-app/
   ```
3. **Import the tab.** Node-RED editor, menu, Import, paste or select `docker/node-red/flows/leaflimits.json`,
   "Import to: new flow". The tab arrives **disabled**. It reuses the existing "Local Mosquitto" connection by its id
   (`6fcdce2f11ec0ec3`, the same on the live server), so no second broker connection is created.
4. **Set the variables.** Double-click the tab name, open Environment Variables, fill `LEAFLIMITS_TOKEN` and
   (optional) `ANTHROPIC_API_KEY`.
5. **Enable the tab** and press Deploy with the "Modified flows" option (not "Full"), so the other tabs and their MQTT
   connection are not restarted.
6. **Check it:**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" http://<server>:1881/leaflimits/api/limits/esp32s3-01
   curl -s -o /dev/null -w '%{http_code}\n' http://<server>:1881/leaflimits/          # 200
   ```
   Open `http://<server>:1881/leaflimits/` on the phone and enter the token under Settings.
7. **Roll back:** disable the LeafLimits tab and Deploy. The system is exactly as before. To remove it completely, delete the
   tab, or restore the backup from step 1.

The storage tab ("InfluxDB storage") must be enabled for readings to reach InfluxDB. That is independent of this tab.

## Try it locally before touching the server (demo runner)

`dev/demo.js` starts a private copy of the pipeline that lives only on the machine it runs on: an in-process MQTT broker
(no connection to any real server), Node-RED with the MQTT Validation flow and this tab already enabled, the Angular app at
`http://localhost:1880/leaflimits/` and a fake device that sends a reading every 5 seconds. The water temperature swings
between about 17 and 27 C every 2 minutes, so alerts fire once limits are set.

```bash
bash docker/node-red/leaflimits/dev/setup-demo.sh    # once: installs Node-RED, the broker and builds the app (about 3 min)
bash docker/node-red/leaflimits/dev/start-demo.sh    # start in the background
bash docker/node-red/leaflimits/dev/stop-demo.sh
```

Open the app, enter the token `demo` under Settings, and use the device `esp32s3-01`. Limits saved in the app live only while
the runner runs. Logs are in `/tmp/leaflimits-demo/` (`demo.out`, `node-red.log`). Everything is installed under
`$LL_DEMO_HOME` (default `/tmp/leaflimits-demo`), never inside the repo.

**Real AI.** If the file `.anthropic_key` exists in the ws folder (next to the repo folder, never inside it), the runner uses the
real Claude API, otherwise a fake answer. Save the key with the script. It works from any terminal on the phone, hides the input and
never prints the key:

```bash
bash docker/node-red/leaflimits/dev/save-key.sh
```

Check the key before starting the runner. The checker says in plain words whether the key is accepted, whether the account has credit and
whether the model is available (it never prints the key, and the test request costs almost nothing):

```bash
bash docker/node-red/leaflimits/dev/check-key.sh
```

The runner reads the file when it starts, so restart it after creating or changing the key. The key is handed to Node-RED only through
its process environment: it is never written to `flows.json`, a log or any other file, and never printed. Each suggestion is one
paid API request, and the tab limits them to 20 per hour.

Other settings (environment variables): `LL_DEMO_KEY_FILE`, `LL_DEMO_TOKEN`, `LL_DEMO_DEVICE`, `LL_DEMO_PORT`, `LL_DEMO_INTERVAL_MS`,
`LL_DEMO_PERIOD_S`, `LL_DEMO_HOME`, `LL_DEMO_MODULES`, `LL_DEMO_APP_DIR`.

## Where the live flows live, and rebuilding

The live Node-RED on Hetzner is not linked to any git repository. `/root/microhydros` is a one-time copy of the files, and
the running flows exist **only in the Docker volume** `docker_node_red_data` (mounted at `/data`). The tab, its variables
(in `flows_cred.json`) and the app files in `/data/leaflimits-app` are all inside that volume. So:

- A repository update never changes or overwrites them, and importing the tab does not touch the team repository.
- If the volume is deleted or replaced (for example `docker compose down -v`), the team's flows and this tab are gone
  together. Re-import the team flows, then `flows/leaflimits.json`, re-enter `LEAFLIMITS_TOKEN` and `ANTHROPIC_API_KEY`
  and copy the app files back (steps 2 to 5 above). Restoring the backup from step 1 does the same in one go.
- Keep the backup files from step 1 somewhere other than the server. A backup is only useful if it survives the server.

## Limits of this design

- It runs in the same Node-RED process as the validation flow. The functions are small and loop-free, but a mistake here
  could still slow the process down, which is why the tab starts disabled.
- The app and API use plain HTTP on the server's port. The token is sent in clear text, so use it only on a network you
  trust, or put HTTPS in front later. There is no PWA install without HTTPS.
- Limits are applied per device id. Node-RED memory holds the latest values, so they are empty for a few seconds after a restart.

## Build and test

```bash
node docker/node-red/leaflimits/build.js                        # regenerate flows/leaflimits.json
node --test docker/node-red/leaflimits/test/unit.test.js        # 51 tests, no dependencies
```

The unit tests run the exact function texts that end up in the flow. The integration test starts a real Node-RED 5.0.7
with the validation flow and this tab, an in-process MQTT broker (`aedes`) and a fake Claude API, and checks routes,
auth, persistence across a restart, alerts, the AI paths and the app hosting (13 tests):

```bash
# a folder whose node_modules has node-red@5.0.7, aedes and mqtt
LL_TEST_MODULES=/path/to/dir LL_TEST_APP_DIR=/path/to/app/dist/leaflimits-app/browser \
  node --test docker/node-red/leaflimits/test/integration.test.js
```

Change the code in `src/*.js`, never in the generated flow.
