from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import os
import time
from app.services.openai_service import OpenAIService

content_bp = Blueprint('content', __name__)
openai_service = OpenAIService()

@content_bp.route('/linkedin/generate', methods=['POST'])
@jwt_required()
def generate_linkedin():
    data = request.get_json(force=True) or {}
    topic = data.get('topic') or 'AI strategy update'
    audience = data.get('audience') or 'B2B professionals'
    brand = data.get('brand') or 'Super Mega Inc'
    t0 = time.time()
    result = openai_service.generate_linkedin_post(topic=topic, audience=audience, brand=brand)
    elapsed_ms = int((time.time() - t0) * 1000)
    return jsonify({"elapsed_ms": elapsed_ms, **result})
