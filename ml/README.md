# 🌿 FarmEase — AI/ML Pipeline
### Smart India Hackathon 2025 | Team ByteBrawlers | PS-25015

---

## Overview

This module is the **AI/ML core** of FarmEase — an intelligent pesticide spraying system
that detects plant diseases from camera images and determines the severity of infection
to control precise pesticide dosing on an autonomous rover.

**Model:** MobileNetV2 (Transfer Learning)  
**Dataset:** PlantVillage (~54,000 images, 38 disease classes)  
**Framework:** TensorFlow 2.x  
**Target Device:** Raspberry Pi 4 (runs inference on the rover)

---

## Project Structure

```
farmease_ml/
├── train.py                  # ← Main training script (run this first)
├── predict.py                # ← Inference engine (used by RPi + Django)
├── requirements.txt          # ← Python dependencies
├── utils/
│   ├── dataset_setup.py      # ← Download & organize PlantVillage
│   ├── evaluate.py           # ← Confusion matrix, metrics, curves
│   └── django_api_view.py    # ← Drop-in Django REST view
├── models/                   # ← Created after training
│   ├── farmease_disease_detector.keras
│   ├── class_names.json
│   ├── training_history.json
│   ├── training_curves.png
│   └── classification_report.txt
└── data/
    └── PlantVillage/         # ← Place dataset here
        ├── Tomato___Late_blight/
        ├── Apple___Apple_scab/
        └── ...
```

---

## Quick Start

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Download PlantVillage dataset

**Option A — Kaggle API (recommended):**
```bash
pip install kaggle
# Place your kaggle.json in ~/.kaggle/
python utils/dataset_setup.py --source kaggle
```

**Option B — Manual download:**
1. Go to: https://www.kaggle.com/datasets/emmarex/plantdisease
2. Download the zip
3. Run:
```bash
python utils/dataset_setup.py --source local --zip data/plantdisease.zip
```

**Verify dataset:**
```bash
python utils/dataset_setup.py --source verify
```

### 3. Train the model
```bash
python train.py
```
Training runs in **2 phases**:
- **Phase 1** (10 epochs): Trains only the classification head. MobileNetV2 backbone is frozen.
- **Phase 2** (15 epochs): Unfreezes the last 30 MobileNet layers for fine-tuning.

Outputs saved to `models/`:
- `farmease_disease_detector.keras` — best model checkpoint
- `class_names.json` — class index → label mapping
- `training_history.json` — epoch-by-epoch metrics
- `training_curves.png` — accuracy/loss plots

### 4. Run inference
```bash
python predict.py path/to/leaf_image.jpg
```

**Expected output:**
```
==================================================
  FarmEase Prediction Result
==================================================
  disease_class              : Tomato___Late_blight
  disease_label              : Late Blight
  crop_type                  : Tomato
  confidence                 : 97.43
  severity_level             : 3
  severity_label             : Severe Infection
  spray_dose_ml_per_m2       : 30
  action                     : 🚨 Severe Late Blight detected...
==================================================
```

### 5. Evaluate the trained model
```bash
python utils/evaluate.py
```
Generates:
- Accuracy/loss curves
- Confusion matrix (normalized, top 20 classes)
- Per-class precision, recall, F1 (`classification_report.txt`)

---

## Integration

### With Django Backend
Copy `utils/django_api_view.py` into your Django app and add these URL patterns:
```python
# urls.py
from .views import predict_disease, health_check
urlpatterns = [
    path("api/predict/", predict_disease),
    path("api/health/",  health_check),
]
```

**POST /api/predict/** — Send an image, get disease + severity JSON back.

### With Raspberry Pi (Rover)
```python
from predict import FarmEasePredictor

predictor = PestEasePredictor(
    model_path="models/pestease_model.keras",
    class_names_path="models/class_names.json",
)

# Called in the rover's camera loop:
result = predictor.predict_from_bytes(camera.capture_bytes())
print(result.severity_level)      # 0-3
print(result.spray_dose_ml)       # mL/m² → controls solenoid valve
```

---

## Severity & Spray Dose Logic

| Level | Label             | Spray Dose |
|-------|-------------------|------------|
| 0     | Healthy           | 0 mL/m²   |
| 1     | Mild Infection    | 5 mL/m²   |
| 2     | Moderate Infection| 15 mL/m²  |
| 3     | Severe Infection  | 30 mL/m²  |

---

## Expected Performance (PlantVillage)

| Metric           | Target  |
|------------------|---------|
| Validation Acc.  | ~92-96% |
| Top-3 Accuracy   | ~99%    |
| Training Time    | ~2-4 hrs (GPU) |
| Inference Time   | ~200ms (RPi 4) |

---

## Next Steps

After the ML pipeline, the remaining FarmEase modules are:
1. **IoT Rover Firmware** — ESP32 + RPi camera capture + solenoid valve control
2. **NodeJS Backend** — REST API + PostgreSQL + AWS deployment
3. **React Dashboard** — Real-time farm map, alerts, farmer/pathologist portal

---

