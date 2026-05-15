# PestEase

An autonomous agricultural rover that detects plant diseases from camera images using AI and triggers precision pesticide spraying to reduce chemical usage and improve crop health.

## Features

- Autonomous rover-based crop monitoring
- Real-time plant disease detection
- ONNX Runtime optimized inference
- Precision pesticide spraying
- React dashboard for monitoring and alerts
- Raspberry Pi and ESP32 hardware integration
- Modular service-based architecture

## Overview

PestEase combines computer vision, edge computing, and rover hardware to automate plant disease detection in agricultural fields. A camera-equipped rover scans crops, runs inference on-device, and sprays pesticide only where disease is detected.

## System Architecture

```text
Camera (Rover)
    ↓
Raspberry Pi
    ↓
Flask Inference Server (Port 8000)
    ↓
Node.js Backend
    ↓
React Dashboard
```

Each subsystem communicates through lightweight REST APIs using base64-encoded image payloads and JSON prediction responses.

## Tech Stack

| Layer | Technology |
|---|---|
| ML Model | MobileNetV2 with custom classifier head |
| ML Runtime | ONNX Runtime INT8 |
| Inference Server | Python, Flask |
| Backend | Node.js, Express |
| Frontend | React |
| Hardware | Raspberry Pi, ESP32 |

## Project Structure

```text
pestease/
├── ml/
│   ├── inference_server.py
│   ├── predict.py
│   ├── train.py
│   ├── export_onnx.py
│   ├── requirements.txt
│   ├── utils/
│   └── models/
│
├── backend/
│   ├── routes/
│   ├── middleware/
│   ├── config/
│   └── server.js
│
├── dashboard/
│   ├── public/
│   └── src/
│
└── rover/
    ├── raspberry_pi/
    └── esp32/
```

## ML Pipeline

- Dataset: PlantVillage dataset containing 54,000 images across 38 disease classes and 14 crop species
- Model: MobileNetV2 backbone with a custom classifier head
- Export Pipeline:
  - PyTorch model
  - FP32 ONNX export
  - INT8 quantized ONNX model
- Runtime: ONNX Runtime for lightweight deployment without PyTorch dependency

### Quantization Note

PyTorch's native `quantize_dynamic` produces operators that are incompatible with ONNX opset 11. The correct deployment workflow is:

```text
PyTorch → FP32 ONNX → ONNX Runtime INT8 Quantization
```

## Setup

### Clone Repository

```bash
git clone https://github.com/<username>/PestEase.git
cd PestEase
```

## Running the Inference Server

```bash
cd ml
pip install -r requirements.txt
python inference_server.py
```

The inference server runs on:

```text
http://localhost:8000
```

Send a POST request containing a base64-encoded image and receive a predicted disease class with confidence score.

## Running the Backend

```bash
cd backend
npm install
npm start
```

## Running the Dashboard

```bash
cd dashboard
npm install
npm start
```

## Hardware

### Raspberry Pi
- On-device inference
- Rover navigation
- Camera handling
- Communication with backend services

### ESP32
- Motor control
- Spraying mechanism control
- Peripheral device management

## Future Improvements

- GPS-assisted field mapping
- Live video stream inference
- Solar-powered rover charging
- Cloud dashboard deployment
- Multi-disease treatment recommendations
- Autonomous path planning

## Acknowledgements

Dataset used for training:

PlantVillage Dataset  
https://www.kaggle.com/datasets/vipoooool/new-plant-diseases-dataset