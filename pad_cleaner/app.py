import uuid
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_session import Session
from pymongo import MongoClient
from redis import Redis
from apscheduler.schedulers.background import BackgroundScheduler

# Flask app and database setup
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = "postgresql://root:root@postgres:5432/root"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your_secret_key'

# Redis setup for sessions and metadata
app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_REDIS'] = Redis(host='redis_pad', port=6380, password='root')
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_PERMANENT'] = False

# Initialize Flask extensions
db = SQLAlchemy(app)
Session(app)
redis_client = Redis(host='redis_pad', port=6380, password='root', decode_responses=True)

# MongoDB setup
mongo_client = MongoClient("mongodb://mongo-router:27017")
mongo_db = mongo_client['document_db']

# Scheduler setup
scheduler = BackgroundScheduler()


# Database models
class Pad(db.Model):
    __tablename__ = 'pads'
    id = db.Column(db.String, primary_key=True)  # UUID as a string
    title = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())
    expires_at = db.Column(db.DateTime, nullable=False)


# Task to delete expired pads
def delete_expired_pads():
    """Deletes expired pads based on Redis metadata."""
    now = datetime.utcnow()
    expired_pad_ids = redis_client.zrangebyscore("pad_expirations", "-inf", now.timestamp())

    with app.app_context():
        for pad_id in expired_pad_ids:
            mongo_db.examples.delete_one({"_id": pad_id})

            pad = Pad.query.filter_by(id=pad_id).first()
            if pad:
                db.session.delete(pad)

            redis_client.zrem("pad_expirations", pad_id)

        db.session.commit()
        print(f"Deleted {len(expired_pad_ids)} expired pads at {now}")


# Schedule the cleanup task every hour
scheduler.add_job(
    func=delete_expired_pads,
    trigger='interval',
    minutes=60,
    id='delete_expired_pads',
    replace_existing=True,
)
scheduler.start()

if __name__ == '__main__':
    with app.app_context():
        db.create_all()  
    app.run(host='127.0.0.1', port=5002)  
