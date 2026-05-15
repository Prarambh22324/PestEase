import torch
import torch.nn as nn
import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType
from torchvision import models

# ── CONFIG ────────────────────────────────────────────────────────────────────
MODEL_PATH     = r"D:\PlantVillage\models\pestease_model.pth"
ONNX_FP32_PATH = r"D:\PlantVillage\models\pestease_model_fp32.onnx"
ONNX_INT8_PATH = r"D:\PlantVillage\models\pestease_model_int8.onnx"
NUM_CLASSES    = 38
DENSE_UNITS    = 128
DROPOUT_RATE   = 0.3
# ─────────────────────────────────────────────────────────────────────────────

def build_model(num_classes, dropout_rate, dense_units):
    base = models.mobilenet_v2(weights=None)
    in_features = base.classifier[1].in_features
    base.classifier = nn.Sequential(
        nn.Dropout(dropout_rate),
        nn.Linear(in_features, dense_units),
        nn.ReLU(),
        nn.Dropout(dropout_rate),
        nn.Linear(dense_units, num_classes),
    )
    return base

# Step 1: Load model (plain FP32, no PyTorch quantization)
model = build_model(NUM_CLASSES, DROPOUT_RATE, DENSE_UNITS)
model.load_state_dict(
    torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
)
model.eval()
print("Model loaded OK.")

# Step 2: Export plain FP32 to ONNX — no quantization here
dummy_input = torch.randn(1, 3, 224, 224)

torch.onnx.export(
    model,
    dummy_input,
    ONNX_FP32_PATH,
    export_params=True,
    opset_version=11,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input":  {0: "batch_size"},
        "output": {0: "batch_size"},
    }
)
print(f"FP32 ONNX export done → {ONNX_FP32_PATH}")

# Step 3: Quantize using ONNX Runtime (this works, unlike PyTorch's quantize_dynamic)
quantize_dynamic(
    model_input=ONNX_FP32_PATH,
    model_output=ONNX_INT8_PATH,
    weight_type=QuantType.QUInt8,
)
print(f"INT8 quantization done → {ONNX_INT8_PATH}")

# Step 4: Validate both models give same results
test_img = np.random.randn(1, 3, 224, 224).astype(np.float32)

fp32_session = ort.InferenceSession(ONNX_FP32_PATH)
int8_session = ort.InferenceSession(ONNX_INT8_PATH)

fp32_out = fp32_session.run(["output"], {"input": test_img})[0]
int8_out = int8_session.run(["output"], {"input": test_img})[0]

max_diff = np.max(np.abs(fp32_out - int8_out))
print(f"Max difference FP32 vs INT8: {max_diff:.6f}")
if max_diff < 0.5:
    print("Validation passed — INT8 model is good to deploy.")
else:
    print("WARNING: large difference — check model.")