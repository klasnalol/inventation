# Invitation Maker — React + Flask (Split Frontend/Backend)

This is a minimal invitation‑maker with login, premade templates, a canvas editor (Fabric.js), PNG export, and DB saves.

## Project Structure
```
invitation-maker/
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── models.py
│   ├── requirements.txt
│   ├── templates/           # premade background images (placeholders provided)
│   └── uploads/             # user uploaded photos (created at runtime)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── api.js
        ├── App.jsx
        ├── components/
        │   ├── TemplateCard.jsx
        │   ├── TemplateGallery.jsx
        │   └── CanvasEditor.jsx
        └── pages/
            ├── Login.jsx
            └── Editor.jsx
```

## Quickstart

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py    # http://localhost:5000
```

### Frontend
```bash
cd ../frontend
npm i
npm run dev      # http://localhost:5173
```

## Docker Setup
Build and run the full stack (Flask API, static frontend, nginx proxy) with Docker:
```bash
# optional: export a stronger JWT secret before building
# export JWT_SECRET_KEY="super-secret-value"
docker compose build
docker compose up
```

The frontend is served at http://localhost:8080 and proxies `/api`, `/uploads`, and `/static` to the Flask service. Uploaded
assets and the SQLite database persist in the `backend_data` named volume.

Stop the stack with `Ctrl+C` or `docker compose down`. To rebuild frontend assets after code changes, run `docker compose up --build`.

## Notes
- Replace the placeholder PNGs in `backend/templates` with your actual backgrounds and thumbnails, or keep them for testing.
- To export **PDF**, add jsPDF on the frontend or a Flask endpoint to convert PNG to PDF server-side.
- For production: use Postgres/S3 and set `JWT_SECRET_KEY` env var. Serve the frontend separately and point Vite proxy to the API.
