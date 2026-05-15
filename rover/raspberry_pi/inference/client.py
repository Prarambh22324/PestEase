"""
PestEase — Inference Client
Runs AI disease detection either locally (on RPi) or via HTTP to Node.js backend.

"local" mode: imports PestEasePredictor directly from pestease_ml/predict.py
"http"  mode: POSTs base64 image to Node.js backend → /api/predict/base64
"""

import base64
import json
import logging
import sys
from pathlib import Path

import requests

logger = logging.getLogger("Inference")


class InferenceClient:
    def __init__(
        self,
        mode: str = "local",
        model_path: str = "",
        class_names_path: str = "",
        http_url: str = "http://localhost:5000/api/predict/base64",
        rover_id: str = "ROVER-01",
        farm_id: str = "farm-001",
        jwt_token: str = "",
    ):
        self.mode = mode
        self.http_url = http_url
        self.rover_id = rover_id
        self.farm_id = farm_id
        self.jwt_token = jwt_token
        self._predictor = None

        if mode == "local":
            self._load_local_model(model_path, class_names_path)
        else:
            logger.info(f"Inference mode: HTTP → {http_url}")

    def _load_local_model(self, model_path: str, class_names_path: str):
        """
        Load PestEasePredictor directly.
        Best for offline / low-latency use on RPi 4.
        MobileNetV2 runs ~200ms per inference on RPi 4.
        """
        try:
            # Add pestease_ml to path
            ml_dir = str(Path(__file__).parent.parent.parent.parent / "pestease_ml")
            if ml_dir not in sys.path:
                sys.path.insert(0, ml_dir)

            from predict import PestEasePredictor
            self._predictor = PestEasePredictor(
                model_path=model_path,
                class_names_path=class_names_path,
            )
            logger.info("Local inference model loaded (MobileNetV2).")
        except Exception as e:
            logger.error(f"Failed to load local model: {e}")
            logger.warning("Falling back to HTTP inference mode.")
            self.mode = "http"

    def predict(self, image_bytes: bytes) -> dict | None:
        """
        Run inference on a JPEG image (bytes).
        Returns prediction dict or None on failure.
        """
        if self.mode == "local":
            return self._predict_local(image_bytes)
        else:
            return self._predict_http(image_bytes)

    def _predict_local(self, image_bytes: bytes) -> dict | None:
        if self._predictor is None:
            return None
        try:
            result = self._predictor.predict_from_bytes(image_bytes)
            return self._predictor.result_to_dict(result)
        except Exception as e:
            logger.error(f"Local inference error: {e}")
            return None

    def _predict_http(self, image_bytes: bytes) -> dict | None:
        try:
            b64 = base64.b64encode(image_bytes).decode("utf-8")
            headers = {"Content-Type": "application/json"}
            if self.jwt_token:
                headers["Authorization"] = f"Bearer {self.jwt_token}"

            payload = {
                "image_base64": b64,
                "rover_id": self.rover_id,
                "farm_id": self.farm_id,
            }
            resp = requests.post(
                self.http_url,
                json=payload,
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.ConnectionError:
            logger.error("Cannot reach backend — is Node.js server running?")
        except requests.exceptions.Timeout:
            logger.error("Inference HTTP request timed out")
        except Exception as e:
            logger.error(f"HTTP inference error: {e}")
        return None
