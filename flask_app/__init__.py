from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import LoginManager
from flask_cors import CORS
from flask_migrate import Migrate 
import os


db = SQLAlchemy()
bcrypt = Bcrypt()
login_manager = LoginManager()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    CORS(app)
    app.config['SECRET_KEY'] = os.getenv("SECRET_KEY")
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
        "SQLALCHEMY_DATABASE_URI",
        "postgresql://root:root@localhost:5432/default_db"  
        )

    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    login_manager.init_app(app)


    # Import and register blueprints
    from flask_app.routes.auth import auth
    from flask_app.routes.main import main
    from flask_app.routes.pad import pad  
    app.register_blueprint(main)  
    app.register_blueprint(auth, url_prefix='/auth')
    app.register_blueprint(pad)

    # Configure Flask-Login
    login_manager.login_view = 'auth.login' 
    login_manager.login_message = "Please log in to access this page."  
    login_manager.login_message_category = "info" 


    # Set up user_loader inside this function to avoid circular imports
    from flask_app.models import User 
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
    
    from flask_login import current_user
    @app.context_processor
    def inject_user():
        return dict(current_user=current_user)
    
    with app.app_context():
        db.create_all()

    return app
