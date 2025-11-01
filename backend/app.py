from __future__ import annotations
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash, check_password_hash
from pathlib import Path
import os, json

from config import Config
from models import Base, User, Template, Design, InvitationResponse, Guest

app = Flask(__name__, static_folder=None)
app.config.from_object(Config)
CORS(app, supports_credentials=True)
JWTManager(app)

# --- Database setup ---
engine = create_engine(app.config["SQLALCHEMY_DATABASE_URI"], future=True)
Base.metadata.create_all(engine)

# Ensure asset folders exist
Path(app.config["UPLOAD_DIR"]).mkdir(parents=True, exist_ok=True)
Path(app.config["TEMPLATE_DIR"]).mkdir(parents=True, exist_ok=True)


def ensure_sqlite_column(table: str, column: str, ddl: str) -> None:
    """Add missing column if the existing SQLite DB predates migrations."""
    with engine.begin() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        if not any(row[1] == column for row in rows):
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


ensure_sqlite_column("designs", "rsvp_fabric_json", "TEXT")
ensure_sqlite_column("invitation_responses", "message", "TEXT")

def dump_fabric(data):
    return json.dumps(data) if data is not None else None

def load_fabric(raw):
    return json.loads(raw) if raw else None

# --- Seed templates when table empty ---
def seed_templates():
    samples = [
        {
            "name": "Floral A6",
            "thumbnail_url": "/static/templates/floral-thumb.png",
            "image_url": "/static/templates/floral.png",
            "width": 1200,
            "height": 1800,
        },
        {
            "name": "Minimal Dark",
            "thumbnail_url": "/static/templates/minimal-thumb.png",
            "image_url": "/static/templates/minimal.png",
            "width": 1600,
            "height": 900,
        },
    ]
    with Session(engine) as s:
        existing = s.scalar(select(Template.id))
        if existing:
            return
        for t in samples:
            s.add(Template(**t))
        s.commit()


seed_templates()

# Serve static template files (thumbnails/backgrounds) from ./templates dir under /static/templates
@app.route('/static/templates/<path:filename>')
def serve_templates(filename):
    return send_from_directory(app.config["TEMPLATE_DIR"], filename)

# Serve uploaded images
@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config["UPLOAD_DIR"], filename)

# --- Auth ---
@app.post('/api/auth/register')
def register():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    if not email or not password:
        return jsonify({"error": "Email & password required"}), 400
    with Session(engine) as s:
        if s.scalar(select(User).where(User.email == email)):
            return jsonify({"error": "Email already registered"}), 409
        user = User(email=email, password_hash=generate_password_hash(password))
        s.add(user); s.commit()
        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": {"id": user.id, "email": user.email}})

@app.post('/api/auth/login')
def login():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    with Session(engine) as s:
        user = s.scalar(select(User).where(User.email == email))
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Invalid credentials"}), 401
        token = create_access_token(identity=str(user.id))
        return jsonify({"token": token, "user": {"id": user.id, "email": user.email}})

# --- Templates ---
@app.get('/api/templates')
def list_templates():
    with Session(engine) as s:
        rows = s.scalars(select(Template)).all()
        return jsonify([{
            "id": r.id,
            "name": r.name,
            "thumbnail_url": r.thumbnail_url,
            "image_url": r.image_url,
            "width": r.width,
            "height": r.height,
        } for r in rows])

# --- Image upload (for user photo overlays) ---
@app.post('/api/upload')
@jwt_required()
def upload():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files['file']
    ext = (Path(f.filename).suffix or '.png').lower()
    safe_name = f"u_{get_jwt_identity()}_{os.urandom(4).hex()}{ext}"
    dst = Path(app.config['UPLOAD_DIR']) / safe_name
    f.save(dst)
    return jsonify({"url": f"/uploads/{safe_name}"})

# --- Designs (save/load user work) ---
@app.post('/api/designs')
@jwt_required()
def create_design():
    data = request.get_json()
    title = data.get('title') or 'Untitled'
    template_id = int(data.get('template_id'))
    fabric_json = dump_fabric(data.get('fabric_json'))
    rsvp_fabric_json = dump_fabric(data.get('rsvp_fabric_json'))
    with Session(engine) as s:
        d = Design(
            user_id=int(get_jwt_identity()),
            template_id=template_id,
            title=title,
            fabric_json=fabric_json,
            rsvp_fabric_json=rsvp_fabric_json,
        )
        s.add(d); s.commit(); s.refresh(d)
        return jsonify({"id": d.id, "title": d.title})

@app.get('/api/designs')
@jwt_required()
def my_designs():
    with Session(engine) as s:
        rows = s.scalars(select(Design).where(Design.user_id == int(get_jwt_identity()))).all()
        return jsonify([
            {
                "id": r.id,
                "title": r.title,
                "template_id": r.template_id,
                "updated_at": r.updated_at.isoformat(),
                "has_rsvp_design": bool(r.rsvp_fabric_json),
            }
            for r in rows
        ])

@app.get('/api/designs/<int:design_id>')
@jwt_required()
def get_design(design_id: int):
    with Session(engine) as s:
        d = s.get(Design, design_id)
        if not d or d.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        return jsonify({
            "id": d.id,
            "title": d.title,
            "template_id": d.template_id,
            "fabric_json": load_fabric(d.fabric_json),
            "rsvp_fabric_json": load_fabric(d.rsvp_fabric_json),
        })

@app.put('/api/designs/<int:design_id>')
@jwt_required()
def update_design(design_id: int):
    data = request.get_json()
    with Session(engine) as s:
        d = s.get(Design, design_id)
        if not d or d.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        if 'title' in data: d.title = data['title']
        if 'fabric_json' in data: d.fabric_json = dump_fabric(data['fabric_json'])
        if 'rsvp_fabric_json' in data: d.rsvp_fabric_json = dump_fabric(data['rsvp_fabric_json'])
        s.commit()
        return jsonify({"ok": True})


@app.get('/api/designs/<int:design_id>/responses')
@jwt_required()
def list_responses(design_id: int):
    with Session(engine) as s:
        design = s.get(Design, design_id)
        if not design or design.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        rows = s.scalars(
            select(InvitationResponse)
            .where(InvitationResponse.design_id == design_id)
            .order_by(InvitationResponse.created_at.desc())
        ).all()
        return jsonify([
            {
                "id": r.id,
                "name": r.name,
                "phone": r.phone,
                "message": r.message,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ])


def serialize_guest(guest: Guest) -> dict:
    return {
        "id": guest.id,
        "design_id": guest.design_id,
        "name": guest.name,
        "contact": guest.contact,
        "comment": guest.comment,
        "is_confirmed": bool(guest.is_confirmed),
        "created_at": guest.created_at.isoformat(),
        "updated_at": guest.updated_at.isoformat(),
    }


@app.get('/api/designs/<int:design_id>/guests')
@jwt_required()
def list_guests(design_id: int):
    with Session(engine) as s:
        design = s.get(Design, design_id)
        if not design or design.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        rows = s.scalars(
            select(Guest)
            .where(Guest.design_id == design_id)
            .order_by(Guest.created_at.asc())
        ).all()
        return jsonify([serialize_guest(g) for g in rows])


@app.post('/api/designs/<int:design_id>/guests')
@jwt_required()
def create_guest(design_id: int):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Guest name is required"}), 400
    contact = (data.get('contact') or '').strip() or None
    comment = (data.get('comment') or '').strip() or None
    is_confirmed = bool(data.get('is_confirmed'))

    with Session(engine) as s:
        design = s.get(Design, design_id)
        if not design or design.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        guest = Guest(
            design_id=design_id,
            name=name,
            contact=contact,
            comment=comment,
            is_confirmed=is_confirmed,
        )
        s.add(guest)
        s.commit()
        s.refresh(guest)
        return jsonify(serialize_guest(guest)), 201


@app.patch('/api/guests/<int:guest_id>')
@jwt_required()
def update_guest(guest_id: int):
    data = request.get_json() or {}
    with Session(engine) as s:
        guest = s.get(Guest, guest_id)
        if not guest:
            return jsonify({"error": "Not found"}), 404
        design = s.get(Design, guest.design_id)
        if not design or design.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404

        if 'name' in data:
            name = (data.get('name') or '').strip()
            if not name:
                return jsonify({"error": "Guest name is required"}), 400
            guest.name = name
        if 'contact' in data:
            guest.contact = (data.get('contact') or '').strip() or None
        if 'comment' in data:
            guest.comment = (data.get('comment') or '').strip() or None
        if 'is_confirmed' in data:
            guest.is_confirmed = bool(data.get('is_confirmed'))

        s.commit()
        s.refresh(guest)
        return jsonify(serialize_guest(guest))


@app.delete('/api/guests/<int:guest_id>')
@jwt_required()
def delete_guest(guest_id: int):
    with Session(engine) as s:
        guest = s.get(Guest, guest_id)
        if not guest:
            return jsonify({"error": "Not found"}), 404
        design = s.get(Design, guest.design_id)
        if not design or design.user_id != int(get_jwt_identity()):
            return jsonify({"error": "Not found"}), 404
        s.delete(guest)
        s.commit()
        return jsonify({"ok": True})


@app.post('/api/rsvp/<int:design_id>')
def create_response(design_id: int):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    phone = (data.get('phone') or '').strip()
    message = (data.get('message') or '').strip()
    if not name or not phone:
        return jsonify({"error": "Name and phone are required"}), 400
    with Session(engine) as s:
        design = s.get(Design, design_id)
        if not design:
            return jsonify({"error": "Not found"}), 404
        resp = InvitationResponse(
            design_id=design_id,
            name=name,
            phone=phone,
            message=message or None,
        )
        s.add(resp)
        s.commit()
        s.refresh(resp)
        return jsonify(
            {
                "id": resp.id,
                "name": resp.name,
                "phone": resp.phone,
                "message": resp.message,
                "created_at": resp.created_at.isoformat(),
            }
        )


@app.get('/api/rsvp/<int:design_id>')
def get_rsvp_info(design_id: int):
    with Session(engine) as s:
        design = s.get(Design, design_id)
        if not design:
            return jsonify({"error": "Not found"}), 404
        template = s.get(Template, design.template_id)
        return jsonify(
            {
                "title": design.title,
                "template": template.name if template else None,
                "template_width": template.width if template else None,
                "template_height": template.height if template else None,
                "fabric_json": load_fabric(design.fabric_json),
                "rsvp_fabric_json": load_fabric(design.rsvp_fabric_json),
            }
        )

@app.get('/')
def root():
    return jsonify({"ok": True, "service": "Invitation Maker API"})

if __name__ == '__main__':
    app.run(debug=True)
