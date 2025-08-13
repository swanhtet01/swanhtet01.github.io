from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from datetime import timedelta
from app import db
from app.models.user import User

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(force=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    company_name = data.get('company_name')
    if not email or not password:
        return jsonify({"error": "email and password required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email already registered"}), 409
    user = User(email=email, company_name=company_name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "registered"}), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(force=True) or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "invalid credentials"}), 401
    token = create_access_token(identity=user.id, expires_delta=timedelta(hours=12))
    return jsonify({"access_token": token, "user": user.to_dict()})

@auth_bp.route('/profile', methods=['GET'])
@jwt_required()
def get_profile():
    uid = get_jwt_identity()
    user = User.query.get(uid)
    if not user:
        return jsonify({"error": "not found"}), 404
    return jsonify(user.to_dict())
