# VisionGuard

> AI-assisted restricted-zone monitoring for images, recorded video, and local webcams.

VisionGuard is a full-stack computer-vision security prototype. It combines YOLO object detection, persistent object tracking, rectangular restricted zones, annotated media, and a React command-center interface. Detected activity is stored in PostgreSQL so operators can review events, dashboard totals, and persistent video or live-camera intrusion notifications.

VisionGuard is a portfolio project and local-development prototype. It is **not production-ready** and should not be treated as a replacement for a professionally designed security system.

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
pip install SQLAlchemy python-dotenv psycopg2-binary
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install SQLAlchemy python-dotenv psycopg2-binary
```

> **Current setup caveat:** `requirements.txt` contains the vision and API packages but does not currently list SQLAlchemy, `python-dotenv`, or a PostgreSQL driver, even though the backend imports them. The explicit install command above is therefore required for a clean environment.

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
- The image API generates an annotated JPEG, but the current frontend concatenates its returned relative path without a separating slash, so the annotated preview URL may fail to load.
- Notification read/unread state is browser-local, and generated output files have no retention or cleanup policy.
- The Python dependency manifest is incomplete as noted in the setup section.
- Model quality, inference speed, and webcam frame rate depend on hardware, footage, and the YOLO11n weights. The project has not been hardened, load-tested, or secured for production deployment.

## Roadmap (planned, not implemented)

- RTSP/IP CCTV stream support
- SMS, WhatsApp, and email alert integrations
- Authentication, users, and role-based access
- Cloud deployment and production infrastructure
