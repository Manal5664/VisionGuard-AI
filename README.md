# VisionGuard

> AI-assisted restricted-zone monitoring for images, recorded video, and local webcams.

VisionGuard is a full-stack computer-vision security prototype. It combines YOLO object detection, persistent object tracking, rectangular restricted zones, annotated media, and a React command-center interface. Detected activity is stored in PostgreSQL so operators can review events, dashboard totals, and persistent video or live-camera intrusion notifications.

VisionGuard is a portfolio project and local-development prototype. It is **not production-ready** and should not be treated as a replacement for a professionally designed security system.

## Live demo and current deployment status

**Live frontend demo:** [https://vision-guard-ai-seven.vercel.app](https://vision-guard-ai-seven.vercel.app)

_Status verified August 18, 2026._

| Component | Status | Details |
| --- | --- | --- |
| Frontend | **Successfully deployed** | Production URL: [https://vision-guard-ai-seven.vercel.app](https://vision-guard-ai-seven.vercel.app) |
| Backend | **Not currently deployed** | FastAPI is Docker-ready and verified locally, but it is not deployed to Railway, Render, FastAPI Cloud, or any other public cloud host. |
| Database | **Created and initialized** | Neon PostgreSQL is ready for backend access and is not exposed directly to the browser. |
| Public demo | **Frontend/UI only** | Backend-dependent features are not available in the public Vercel demo because the backend is not publicly deployed. |

Detection, events, zones, cameras, notifications, API health, and generated media require the backend. Full functionality remains available when the backend is run locally, as described below.

## Key features

- **Image detection:** upload an image, run YOLO11n inference, inspect bounding boxes and confidence scores, and view an annotated result.
- **Recorded-video analysis:** submit MP4, MOV, AVI, MKV, or WebM video as a background job, follow frame-level progress, and play the browser-compatible annotated result.
- **Live webcam monitoring:** configure local webcam indexes, start and stop monitors, view an MJPEG stream, and receive live intrusion events over Server-Sent Events (SSE).
- **Restricted zones:** draw rectangular global zones on reference images or camera-specific zones directly over a live feed; edit and delete global zones from the UI.
- **Tracked intrusion events:** a detection counts as an intrusion only when it is a `person` whose bounding-box center falls inside the active zone.
- **YOLO tracking and deduplication:** persistent track IDs distinguish people across frames; entry episodes and cooldown rules reduce repeated alerts for the same person.
- **Security alerts:** video and camera intrusions are stored as durable event records. Live camera alerts include an annotated snapshot; recorded-video alerts retain the event timestamp and open playback near the detection.
- **Operator dashboard:** event totals, today's activity, active cameras, recent alerts, API health, filters, cursor pagination, and quick actions.
- **Three UI themes:** Dark, Light, and Midnight themes persist in browser storage.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Computer vision | Ultralytics YOLO11n and tracking, OpenCV, PyTorch |
| Backend | Python, FastAPI, Pydantic, SQLAlchemy, Uvicorn |
| Persistence | PostgreSQL; generated images, videos, and camera snapshots on local disk |
| Frontend | React 19, Vite 6, JavaScript, CSS |
| Media delivery | H.264 MP4, MJPEG streaming, Server-Sent Events |
| Tests | Python `unittest`, Node.js built-in test runner |

## System architecture

```mermaid
flowchart LR
    UI[React + Vite UI] <-->|REST / multipart| API[FastAPI API]
    UI <-->|MJPEG frames + SSE alerts| API
    API --> DET[YOLO11n detection<br/>Persistent track IDs]
    DET --> RULES[Zone rules +<br/>IntrusionTracker]
    API --> MEDIA[OpenCV processing<br/>H.264 transcoding]
    RULES --> DB[(PostgreSQL)]
    MEDIA --> FILES[(outputs/)]
    DB --> API
    FILES --> API
```

The React client uses `VITE_API_BASE_URL`, defaulting to `http://127.0.0.1:8000`. FastAPI exposes REST endpoints, static generated media under `/outputs`, MJPEG camera streams, and SSE camera events. SQLAlchemy persists cameras, zones, and events in PostgreSQL; uploaded source files are temporary, while annotated results and camera event snapshots remain under `outputs/`.

## How VisionGuard works

1. An operator selects an image, a recorded video, or a configured local webcam.
2. YOLO11n detects objects. Video and webcam frames use Ultralytics tracking with persistent IDs.
3. VisionGuard compares the center of each detected person's bounding box with the active rectangular zone.
4. Intrusions are annotated and deduplicated before event records are written to PostgreSQL.
5. The UI presents processed media, event history, dashboard summaries, and security notifications.

### Live Camera Monitoring workflow

1. Add a camera name and non-negative local webcam index on the **Cameras** page.
2. Open its monitor and start the webcam. On Windows, the backend tries DirectShow first and falls back to OpenCV's default capture backend.
3. Optionally drag over the live feed, name the rectangle, and save a camera-specific zone. Monitoring can run without a zone, but it will not create intrusion events.
4. The backend runs detection and tracking for each frame, publishes the annotated feed as MJPEG, and sends persisted intrusion payloads over SSE.
5. The active monitor displays a visual alert and optional Web Audio beep. Each saved camera event includes an annotated JPEG snapshot.
6. Stop monitoring to release the webcam.

### Restricted Zones

Zones use pixel coordinates (`x1`, `y1`, `x2`, `y2`) relative to the analyzed media. Global zones are created from a reference image and are used by image detection; the current image workflow uses the first saved global zone. A video submission can include one zone drawn on its first frame. Live cameras use the most recently saved zone for that camera.

Only a detected `person` is considered an intrusion, and only when the center of that person's bounding box lies within the zone.

### Image Detection

The image workflow posts one file to `/api/detect`, runs YOLO inference, applies the current global restricted zone when available, stores one event per detection, and returns detection metadata plus an annotated JPEG. Image events appear in the event history; the notification feed intentionally contains only video and camera intrusions.

### Video Detection

The video workflow extracts a first-frame preview in the browser so the operator can draw a job-specific zone. The API validates the extension, queues an in-process background job, and exposes polling data such as status, progress, frame count, duration, intrusion-frame count, and event count. OpenCV writes an annotated intermediate video, which `imageio-ffmpeg` converts to H.264 MP4 for browser playback.

Completed jobs include an intrusion timeline. During result playback, the frontend raises an alert as the playhead crosses each persisted event time; rewinding rearms later playback alerts.

### YOLO tracking, ByteTrack status, and intrusion deduplication

`Detector.detect_frame()` calls Ultralytics `model.track(..., persist=True)` and consumes the persistent IDs returned by the tracker. The current code does **not** pass `tracker='bytetrack.yaml'`, so ByteTrack is available through Ultralytics but is not explicitly selected by VisionGuard; runtime behavior follows the installed Ultralytics default tracker configuration. `IntrusionTracker` then applies source-specific event rules:

- **Recorded video:** emit on zone entry and, while the same tracked person remains inside, no more than once per 10-second cooldown. Leaving and re-entering starts a new episode.
- **Live webcam:** emit once for an entry episode and rearm only after exit. Untracked detections are also treated as an episode rather than an alert on every frame.
- **Database protection:** video events receive a `(job_id, event_sequence)` unique index to prevent duplicate persisted notifications for the same job sequence.

### Security alerts and persistent notifications

Video and camera intrusion records persist in PostgreSQL and are returned newest-first by `/api/notifications`. The notification center deduplicates by event ID and can reopen the recorded video at the saved timestamp or display the saved live-camera snapshot. Read/unread IDs are browser-local and persist through `localStorage`; they are not shared between browsers or users.

### Dashboard and multi-theme UI

The dashboard combines event summaries, today's intrusions, configured zones, running webcam monitors, and recent security alerts. The event view supports event-type, source, and date filters with cursor-based Load more pagination. Dark, Light, and Midnight themes are selectable from the top bar and persist locally.

### PostgreSQL persistence

SQLAlchemy models store:

- `cameras`: local webcam configuration and enabled state;
- `zones`: global or camera-scoped rectangular coordinates;
- `events`: detection/intrusion metadata, source, confidence, track/frame data, media path, zone, camera, job sequence, and video time.

Generated media is not stored in PostgreSQL. It remains on the local filesystem under `outputs/` and is served by FastAPI.

## Installation and local setup

Run backend commands from the repository root unless a step says otherwise.

### Prerequisites

- Python 3.10 or newer
- Node.js 18, 20, or 22+ with npm (the versions accepted by the checked-in Vite 6 lockfile)
- PostgreSQL
- A local webcam only if you want to use live monitoring

### 1. Python virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Database and environment

Create an empty PostgreSQL database, for example:

```sql
CREATE DATABASE visionguard;
```

Create a repository-root `.env` file. Use your own local values; never commit this file.

```dotenv
DATABASE_URL=postgresql+psycopg2://YOUR_USER:YOUR_PASSWORD@localhost:5432/visionguard
VISIONGUARD_FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
```

Create the current schema and apply the repository's idempotent PostgreSQL migration statements:

```powershell
python create_tables.py
python migrate.py
```

`VISIONGUARD_FRONTEND_ORIGINS` is optional; its comma-separated values replace the default Vite development origins. Keep the list explicit because API CORS credentials are enabled. The checked-in `.gitignore` excludes local `.env` files, model weights, generated outputs, virtual environments, and frontend build artifacts.

The detector expects `yolo11n.pt` in the repository root. Ultralytics can fetch standard model weights on first use when they are not already present, which requires network access for that first run.

### 3. Start the backend

From the repository root:

```powershell
uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`; interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 4. Start the frontend

In a second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite. The backend allows `localhost` and `127.0.0.1` on ports `5173` and `5174` by default, so Vite's first fallback port also works. To point the frontend at another API, copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`.

Without `frontend/.env`, the Vite development server proxies `/api` and `/outputs` to `http://127.0.0.1:8000`. This keeps local startup behavior while ensuring a localhost API URL is not embedded in the production browser bundle.

## Future Railway deployment with Docker

> **Current status:** The backend is not deployed on Railway. These instructions are retained for a possible future deployment and have not been applied to a live service.

The root `Dockerfile` packages only the FastAPI backend on Python 3.12. It installs ffmpeg and the shared libraries required by OpenCV, selects CPU-only PyTorch and torchvision wheels, and downloads `yolo11n.pt` during the image build. The detector still constructs the YOLO model lazily on the first inference request, and webcam capture still starts only when requested, so local webcam behavior is unchanged.

The container creates `outputs/` and `data/uploads/`, runs one Uvicorn process, and listens on Railway's injected `PORT` when deployed there (or port `8000` elsewhere). Its lightweight Docker health check calls `/api/health` without loading YOLO or querying the database.

### Future Railway deployment steps

1. Create a Railway project and add a service from this repository.
2. Keep the service root directory at the repository root. Railway detects the root `Dockerfile`; no custom build or start command is needed.
3. Add these service variables in Railway:

   ```dotenv
   DATABASE_URL=postgresql://USER:PASSWORD@NEON_HOST/DATABASE?sslmode=require&channel_binding=require
   VISIONGUARD_FRONTEND_ORIGINS=https://YOUR_FRONTEND_DOMAIN
   ```

   Use the Neon connection string supplied for the existing database. Store it only as a Railway secret, and do not pass it as a Docker build argument. The image contains no database URL or other application secret. `VISIONGUARD_FRONTEND_ORIGINS` accepts a comma-separated list of exact origins without trailing slashes.

4. Do not add `PORT`; Railway supplies it at runtime.
5. Generate a Railway public domain for the backend, then set the frontend deployment's existing `VITE_API_BASE_URL` to that HTTPS origin.
6. Configure Railway's HTTP health-check path as `/api/health` if platform-level health checks are desired.

The container deliberately does not run `create_tables.py` or `migrate.py` at startup, so deploying it does not modify Neon schema or data. Use one replica: video jobs and camera state are process-local, and additional replicas would split that state and duplicate YOLO memory.

A Railway container's filesystem would be ephemeral. Files under `outputs/` and in-process video job state could disappear after a restart or redeploy, while Neon rows would remain durable. A Railway volume mounted at `/app/outputs` can preserve generated media if needed; adding object storage remains the more scalable option.

### Build and verify locally

The local health smoke test can use a disposable SQLite URL because `/api/health` does not access application data:

```powershell
docker build -t visionguard-backend .
docker run --rm -d --name visionguard-health -p 8000:8000 -e DATABASE_URL=sqlite:////tmp/visionguard-health.db visionguard-backend
Invoke-RestMethod http://127.0.0.1:8000/api/health
docker stop visionguard-health
```

This container-only check neither reads nor writes Neon. Normal non-Docker local development remains the same as described above.

## Optional future backend deployment reference: Vercel + Render + Neon

The frontend is currently deployed on Vercel, and the Neon PostgreSQL database has been created and initialized. The FastAPI backend is **not deployed on Render, Railway, FastAPI Cloud, or any other public cloud host**. This section is retained as an optional future backend topology and does not describe the current public demo.

If Render is selected for a future backend deployment, the application could use this split:

- **Vercel:** the deployed static Vite/React frontend from `frontend/`;
- **Render:** an optional CPU-only FastAPI web service from the repository root;
- **Neon:** the initialized PostgreSQL database for persistent cameras, zones, and events;
- **Render filesystem:** temporary uploads and generated annotated media if the backend is deployed there.

Under that future topology, the browser would talk directly to the Render API for REST requests, uploads, Server-Sent Events, MJPEG streams, and `/outputs` media. Vercel would not proxy production API traffic.

### Future Render environment variables

| Platform | Variable | Value |
| --- | --- | --- |
| Render | `DATABASE_URL` | Secret direct Neon URL with `sslmode=require` (and the Neon-provided `channel_binding` option when present) |
| Render | `VISIONGUARD_FRONTEND_ORIGINS` | Exact Vercel production origin, without a trailing slash |
| Vercel | `VITE_API_BASE_URL` | Public Render service URL, without a trailing slash |

A future Render service would supply `PORT`; do not set it manually. `VITE_API_BASE_URL` is public build-time configuration, not a secret. Do not put a database URL or any other credential in a `VITE_` variable.

### 1. Neon status and initialization reference

The current Neon database is already created and initialized. The following steps are retained for recreating the setup in a new environment. Do not rerun them against the current database unless a schema change is intentional:

1. Create a Neon project, database, and role.
2. Copy a **direct** connection string from Neon. Use the direct URL for the schema scripts; pooled PgBouncer URLs can be unsuitable for schema migration tools.
3. Set that value as `DATABASE_URL` in a temporary terminal environment. Do not paste it into a tracked file.
4. From the repository root, initialize the empty Neon database:

   ```powershell
   python create_tables.py
   python migrate.py
   ```

5. Remove the temporary terminal value and add the same connection string to Render as the secret `DATABASE_URL`.

Both scripts are additive: `create_tables.py` creates missing current tables and `migrate.py` applies PostgreSQL `IF NOT EXISTS` additions and indexes. Do not point these commands at a database you do not intend to change.

### 2. Prepare a future Render web service

The root `render.yaml` records the intended Free web-service configuration without containing credentials. Applying the Blueprint will create/deploy a service, so do not apply it until deployment is approved.

Equivalent dashboard settings are:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Runtime | Python |
| Instance | Free (initial portfolio target) |
| Health check | `/api/health` |
| Build command | See below |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Build command:

```bash
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.13.0 torchvision==0.28.0 && pip install -r requirements.txt && python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"
```

The first command selects CPU PyTorch wheels. The last command downloads the current YOLO11n weights into the build artifact, avoiding a model download on every runtime cold start. `.python-version` pins Python 3.12 for compatible binary wheels.

For a future Render deployment, set these environment values before deployment:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@NEON_HOST/DATABASE?sslmode=require&channel_binding=require
VISIONGUARD_FRONTEND_ORIGINS=https://YOUR_VERCEL_PROJECT.vercel.app
```

Use exactly one Uvicorn worker. Video jobs and camera state are stored in-process, and extra workers would duplicate YOLO memory and split job state.

### 3. Vercel frontend status and configuration

The frontend is live at [https://vision-guard-ai-seven.vercel.app](https://vision-guard-ai-seven.vercel.app) with these Vercel settings:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework | Vite |
| Install command | Detected from `package-lock.json` |
| Build command | `npm run build` |
| Output directory | `dist` |

If a public backend is deployed later, set the production environment variable to that backend's public origin and redeploy the frontend:

```dotenv
VITE_API_BASE_URL=https://YOUR_RENDER_SERVICE.onrender.com
```

For a future Render deployment, set `VISIONGUARD_FRONTEND_ORIGINS` to `https://vision-guard-ai-seven.vercel.app` exactly. Preview deployment hostnames are different and must be added explicitly if preview builds need API access; wildcard origins remain disabled because credentials are enabled.

No `vercel.json` is needed because VisionGuard uses in-page navigation instead of URL-based client routes, and Vercel detects the Vite build output.

### Ephemeral media on Render

There is no current Render backend filesystem because the backend is not deployed there. In a future Render deployment, the database would remain durable in Neon, while the initial configuration below would not add object storage or a persistent disk.

| Path/state | Behavior | Lost after restart, spin-down, or redeploy? |
| --- | --- | --- |
| `data/uploads/` | Temporary image/video upload sources | Yes; completed image uploads are already deleted after each request |
| `outputs/detections/` | Annotated image results | Yes |
| `outputs/videos/` | Browser-compatible annotated video results | Yes |
| `outputs/cameras/events/` | Annotated local-camera event snapshots | Yes |
| Video job registry/progress | In-process background-job state | Yes |
| Camera monitors and SSE subscribers | In-process local webcam state | Yes |
| Cameras, zones, events | Neon PostgreSQL rows | No |

With that deployment model, an event row could outlive its referenced annotated file, and an older **View Detection** link could return 404 after the backend lifecycle resets. S3-compatible object storage is the intended later upgrade, but is not part of the current repository setup.

### YOLO and Render Free expectations

YOLO11n remains unchanged and uses CPU inference only. Model/PyTorch import and model loading are lazy, so `/api/health`, event history, zones, and other lightweight API features can start without eagerly allocating the inference stack. Image inference runs outside the async event loop; if model loading or execution fails, `/api/detect` returns a controlled `503` instead of crashing the API.

A future Render Free instance would have very limited CPU and memory. Inference could be slow, video analysis could take a long time, and the process could be terminated if PyTorch exceeds the instance memory limit. The UI reports failed jobs and explains that CPU-hosted processing can be slow. A hosted backend would remain a portfolio demonstration, not a performance guarantee.

### Webcam behavior in cloud and local environments

Live camera monitoring remains available when FastAPI runs on a computer with a connected webcam. Capture is opened only after an operator starts a monitor; it is not touched during cloud application startup. If no device is available, the monitor enters an error state without terminating the API.

A future Render backend could not access a webcam connected to a visitor's browser or computer. The Cameras page states this limitation and directs users to run the backend locally. RTSP/IP camera support is not included.

## Main API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/detect` | Upload and analyze one image |
| `POST` | `/api/video-detect` | Queue an uploaded-video analysis job |
| `GET` | `/api/video-jobs/{job_id}` | Poll video status and retrieve results |
| `GET` | `/api/events` | Filter and paginate persisted events |
| `GET` | `/api/events/summary` | Dashboard event counts |
| `GET` | `/api/notifications` | Persisted video and camera intrusion feed |
| `GET`, `POST` | `/api/zones` | List or create global zones |
| `PATCH`, `DELETE` | `/api/zones/{zone_id}` | Update or delete a zone |
| `GET`, `POST` | `/api/cameras` | List or create local webcam configurations |
| `GET`, `PATCH` | `/api/cameras/{camera_id}` | Read or update a camera |
| `GET`, `POST` | `/api/cameras/{camera_id}/zones` | List or create camera-specific zones |
| `POST` | `/api/cameras/{camera_id}/monitor/start` | Start webcam monitoring |
| `POST` | `/api/cameras/{camera_id}/monitor/stop` | Stop webcam monitoring |
| `GET` | `/api/cameras/{camera_id}/monitor/status` | Read monitor state and counters |
| `GET` | `/api/cameras/{camera_id}/monitor/stream` | Read the annotated MJPEG feed |
| `GET` | `/api/cameras/{camera_id}/events/stream` | Subscribe to live intrusion events over SSE |

## Running tests

Backend tests use the Python standard library and in-memory SQLite fixtures:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
```

Frontend utility tests use Node's built-in test runner:

```powershell
cd frontend
npm test
```

To validate a production frontend bundle locally:

```powershell
cd frontend
npm run build
```

## Project structure

```text
VisionGuard/
|-- app/
|   |-- api/                 # FastAPI routes: cameras, zones, media, events, health
|   |-- core/database.py     # SQLAlchemy engine and sessions
|   |-- models/              # Camera, RestrictedZone, and Event tables
|   `-- services/            # YOLO, tracking, intrusion rules, annotation, media processing
|-- frontend/
|   |-- src/components/      # Layout, security, and reusable UI components
|   |-- src/styles/          # Theme tokens and component/page styling
|   |-- src/*.jsx            # Dashboard, cameras, zones, events, image/video workflows
|   |-- src/*.test.js        # Frontend utility tests
|   `-- package.json
|-- tests/                   # Backend unit and service/API tests
|-- data/                    # Temporary image/video uploads at runtime
|-- outputs/                 # Generated annotations, videos, and camera snapshots
|-- models/                  # Local model asset directory (currently unused by Detector)
|-- create_tables.py         # Create the current SQLAlchemy schema
|-- migrate.py               # Apply PostgreSQL schema additions and indexes
|-- Dockerfile               # Python 3.12 production backend image
|-- .dockerignore            # Excludes secrets, local artifacts, and frontend files
|-- requirements.txt
`-- yolo11n.pt               # Model path expected by Detector (ignored by Git)
```

## Screenshots

Screenshots will be added after the interface is finalized.

| View | Placeholder |
| --- | --- |
| Dashboard | _Dashboard overview screenshot_ |
| Live Camera Monitoring | _Annotated webcam feed and active alert screenshot_ |
| Restricted Zones | _Zone drawing and management screenshot_ |
| Image Detection | _Annotated image result screenshot_ |
| Video Detection | _Processing progress and intrusion timeline screenshot_ |
| Events and Notifications | _Filtered event history and notification center screenshot_ |

## Known limitations

- Live monitoring supports local webcams only. RTSP/IP cameras are not implemented.
- Authentication, users, roles, and access control are not implemented.
- The frontend API URL and backend CORS origins default to local development values; deployments must configure `VITE_API_BASE_URL` and `VISIONGUARD_FRONTEND_ORIGINS` explicitly.
- Video job state and live monitor state are in process and are lost when the backend restarts; video jobs are serialized by a process lock rather than a durable queue.
- Each analysis uses one rectangular zone: the first global zone for images, one submitted zone for a video, or the latest camera-specific zone for a webcam.
- ByteTrack is not explicitly selected in `Detector`; tracking currently follows the installed Ultralytics default configuration.
- Notification read/unread state is browser-local, and generated output files have no retention or cleanup policy.
- A future Render or similar hosted filesystem would be ephemeral unless persistent storage is added; database rows could outlive annotated media files.
- Model quality, inference speed, and webcam frame rate depend on hardware, footage, and the YOLO11n weights. The project has not been hardened, load-tested, or secured for production deployment.

## Roadmap (planned, not implemented)

- RTSP/IP CCTV stream support
- SMS, WhatsApp, and email alert integrations
- Authentication, users, and role-based access
- Public backend hosting and live frontend/API integration
- Durable cloud media storage and production hardening
