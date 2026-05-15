"""
PestEase - Inference Engine
ONNX Runtime version — drop-in replacement for the original PyTorch predictor.
Same class, same public methods, same return types.
"""

import io
import json
import base64
import time
import numpy as np
from PIL import Image
from dataclasses import dataclass
import onnxruntime as ort

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)

SEVERITY_LABELS = {
    0: "Healthy",
    1: "Mild Infection",
    2: "Moderate Infection",
    3: "Severe Infection",
}

SPRAY_DOSE_MAP = {0: 0, 1: 5, 2: 15, 3: 30}

DISEASE_SEVERITY = {
    "healthy": 0,
    "early_blight": 1,
    "powdery_mildew": 2,
    "late_blight": 3,
    "bacterial_spot": 2,
    "leaf_mold": 2,
    "septoria_leaf_spot": 2,
    "spider_mites": 2,
    "target_spot": 2,
    "mosaic_virus": 3,
    "yellow_leaf_curl_virus": 3,
    "common_rust": 2,
    "northern_leaf_blight": 3,
    "black_rot": 3,
    "esca": 3,
    "haunglongbing": 3,
    "cercospora_leaf_spot": 1,
}


@dataclass
class PredictionResult:
    disease_class:  str
    disease_label:  str
    crop_type:      str
    confidence:     float
    severity_level: int
    severity_label: str
    spray_dose_ml:  int
    top3:           list
    action:         str


class PestEasePredictor:
    def __init__(self, model_path: str, class_names_path: str):
        # Accept .pth path from old code — silently resolve to the ONNX file
        onnx_path = model_path
        if model_path.endswith(".pth"):
            onnx_path = model_path.replace("pestease_model.pth", "pestease_model_int8.onnx")

        print(f"[PestEase] Loading ONNX model from: {onnx_path}")
        self.session = ort.InferenceSession(
            onnx_path, providers=["CPUExecutionProvider"]
        )

        with open(class_names_path, "r") as f:
            raw = json.load(f)
            # Support both dict {"0": "Apple___..."} and list ["Apple___..."]
            if isinstance(raw, dict):
                self.class_names = {int(k): v for k, v in raw.items()}
            else:
                self.class_names = {i: v for i, v in enumerate(raw)}

        print(f"[PestEase] Model ready. Classes: {len(self.class_names)}")

    def _preprocess(self, image: Image.Image) -> np.ndarray:
        img = image.convert("RGB").resize((224, 224))
        arr = np.array(img, dtype=np.float32) / 255.0
        arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
        return arr.transpose(2, 0, 1)[np.newaxis]   # (1, 3, 224, 224)

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - np.max(x))
        return e / e.sum()

    @staticmethod
    def _parse_class_name(raw_class: str) -> tuple:
        parts = raw_class.split("___")
        crop    = parts[0].replace("_", " ") if parts else "Unknown"
        disease = parts[1].replace("_", " ").title() if len(parts) > 1 else "Unknown"
        return crop, disease

    def _get_severity(self, raw_class: str) -> int:
        disease_key = raw_class.split("___")[1].lower() if "___" in raw_class else raw_class.lower()
        for key, sev in DISEASE_SEVERITY.items():
            if key in disease_key:
                return sev
        print(f"[PestEase] WARNING: No severity mapping for '{disease_key}', defaulting to 2.")
        return 2

    def _build_action(self, severity: int, crop: str, disease: str, dose: int) -> str:
        if severity == 0:
            return f"✅ {crop} plant is healthy. No action required."
        elif severity == 1:
            return (f"⚠️ Mild {disease} detected on {crop}. "
                    f"Apply {dose} mL/m² of recommended fungicide. Monitor closely.")
        elif severity == 2:
            return (f"🔶 Moderate {disease} detected on {crop}. "
                    f"Apply {dose} mL/m² pesticide. Re-inspect in 3 days.")
        else:
            return (f"🚨 Severe {disease} detected on {crop}. "
                    f"Apply full dose ({dose} mL/m²) immediately. Isolate affected area.")

    def predict(self, image: Image.Image) -> PredictionResult:
        tensor = self._preprocess(image)
        outputs = self.session.run(["output"], {"input": tensor})[0]
        probs   = self._softmax(outputs[0])

        top_indices = np.argsort(probs)[::-1][:3]
        top3        = [(self.class_names[i], float(probs[i])) for i in top_indices]

        best_idx   = int(top_indices[0])
        best_class = self.class_names[best_idx]
        confidence = float(probs[best_idx])

        crop, disease_label = self._parse_class_name(best_class)
        severity = self._get_severity(best_class)
        dose     = SPRAY_DOSE_MAP[severity]
        action   = self._build_action(severity, crop, disease_label, dose)

        return PredictionResult(
            disease_class  = best_class,
            disease_label  = disease_label,
            crop_type      = crop,
            confidence     = confidence,
            severity_level = severity,
            severity_label = SEVERITY_LABELS[severity],
            spray_dose_ml  = dose,
            top3           = top3,
            action         = action,
        )

    def predict_from_path(self, image_path: str) -> PredictionResult:
        return self.predict(Image.open(image_path))

    def predict_from_bytes(self, image_bytes: bytes) -> PredictionResult:
        return self.predict(Image.open(io.BytesIO(image_bytes)))

    def predict_from_base64(self, b64_string: str) -> PredictionResult:
        return self.predict_from_bytes(base64.b64decode(b64_string))

    def result_to_dict(self, result: PredictionResult) -> dict:
        return {
            "disease_class":      result.disease_class,
            "disease_label":      result.disease_label,
            "crop_type":          result.crop_type,
            "confidence":         round(result.confidence * 100, 2),
            "severity_level":     result.severity_level,
            "severity_label":     result.severity_label,
            "spray_dose_ml_per_m2": result.spray_dose_ml,
            "top3_predictions":   [
                {"class": c, "confidence": round(p * 100, 2)} for c, p in result.top3
            ],
            "action": result.action,
        }


# ── CLI USAGE ──────────────────────────────────────────
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python predict.py <image_path>")
        sys.exit(1)

    predictor = PestEasePredictor(
        model_path="models/pestease_model.pth",       # auto-resolves to .onnx
        class_names_path="models/class_names.json",
    )

    result = predictor.predict_from_path(sys.argv[1])
    output = predictor.result_to_dict(result)

    print("\n" + "=" * 50)
    print("  PestEase Prediction Result")
    print("=" * 50)
    for k, v in output.items():
        print(f"  {k:28s}: {v}")
    print("=" * 50)