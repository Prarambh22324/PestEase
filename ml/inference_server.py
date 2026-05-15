"""
PestEase — Flask Inference Server
Wraps the PestEasePredictor and exposes it over HTTP.
Called by the Node.js backend at POST /predict.

Run: python inference_server.py
"""

from flask import Flask, request, jsonify
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from predict import PestEasePredictor

app = Flask(__name__)

predictor = PestEasePredictor(
    model_path="models/pestease_model_int8.onnx",
    class_names_path="models/class_names.json",
)


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    b64 = data.get("image_base64")
    if not b64:
        return jsonify({"success": False, "error": "Missing image_base64"}), 400
    try:
        result = predictor.predict_from_base64(b64)
        return jsonify({"success": True, **predictor.result_to_dict(result)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "model": "pestease_model.pth",
        "classes": len(predictor.class_names),
    })


if __name__ == "__main__":
    print("[PestEase] Inference server starting on port 8000...")
    app.run(host="0.0.0.0", port=8000, debug=False)
