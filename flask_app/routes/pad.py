from flask import Blueprint, request, jsonify, url_for, render_template
from flask_app.models import Pad, db
from flask_login import login_required, current_user
from redis import Redis
import uuid
from datetime import datetime, timedelta
import os

redis_client = Redis(host='redis_pad', port=6379, password='root', decode_responses=True)

pad = Blueprint('pad', __name__)

@pad.route('/create', methods=['POST'])
def create_pad():
    """Create a new pad with a user-defined expiration."""
    data = request.json
    title = data.get('title', 'Untitled Pad')
    duration = int(data.get('duration', 7))  

    if duration < 1 or duration > 365:
        return jsonify({'error': 'Duration must be between 1 and 365 days'}), 400

    pad_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=duration)
    new_pad = Pad(id=pad_id, title=title, expires_at=expires_at)

    redis_client.zadd("pad_expirations", {pad_id: expires_at.timestamp()})

    db.session.add(new_pad)
    db.session.commit()

    return jsonify({
        'id': pad_id,
        'url': url_for('pad.view_pad', pad_id=pad_id, _external=True),
        'expires_at': expires_at.strftime('%Y-%m-%d %H:%M:%S')
    })

@pad.route('/pad/<pad_id>', methods=['GET'])
@login_required
def view_pad(pad_id):
    """View or edit an existing pad."""
    pad = Pad.query.get(pad_id)
    
    if not pad:
        return "Pad not found.", 404

    if pad.expires_at and pad.expires_at < datetime.utcnow():
        return "Pad has expired.", 404

    username = current_user.username

    return render_template(
        'pad.html',
        pad_id=pad.id,
        title=pad.title,
        pad=pad,
        username=username,
        express_ws_url=os.getenv("EXPRESS_WS_URL", "ws://127.0.0.1:8081")  
    )
