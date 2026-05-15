"""
PestEase - Plant Disease Detection Training Pipeline
Model: MobileNetV2 (Transfer Learning via torchvision)
Dataset: PlantVillage
Framework: PyTorch
"""

import os
import json
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms, models
import matplotlib.pyplot as plt
from datetime import datetime

# ── CONFIGURATION ──────────────────────────────────────
CONFIG = {
    "img_size": (224, 224),
    "batch_size": 32,
    "epochs_frozen": 10,
    "epochs_finetune": 15,
    "learning_rate": 1e-3,
    "finetune_lr": 1e-5,
    "dropout_rate": 0.3,
    "dense_units": 128,
    "val_split": 0.2,
    "model_save_path": "models/pestease_model.pth",
    "history_save_path": "models/training_history.json",
    "classes_save_path": "models/class_names.json",
    "data_dir": "data/PlantVillage",
    "seed": 42,
}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

SEVERITY_MAP = {
    "healthy": 0,
    "early_blight": 1,
    "late_blight": 3,
    "bacterial_spot": 2,
    "leaf_mold": 2,
    "septoria_leaf_spot": 2,
    "spider_mites": 2,
    "target_spot": 2,
    "mosaic_virus": 3,
    "yellow_leaf_curl_virus": 3,
    "powdery_mildew": 2,
    "cercospora_leaf_spot": 1,
    "common_rust": 2,
    "northern_leaf_blight": 3,
    "black_rot": 3,
    "esca": 3,
    "haunglongbing": 3,
}


# ── DATA PIPELINE ───────────────────────────────────────
def build_data_loaders(data_dir, img_size, batch_size, val_split, seed):
    train_tf = transforms.Compose([
        transforms.Resize(img_size),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(30),
        transforms.ColorJitter(brightness=0.2),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    val_tf = transforms.Compose([
        transforms.Resize(img_size),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    full_dataset = datasets.ImageFolder(data_dir, transform=train_tf)
    n_val = int(len(full_dataset) * val_split)
    n_train = len(full_dataset) - n_val
    generator = torch.Generator().manual_seed(seed)
    train_set, val_set = random_split(full_dataset, [n_train, n_val], generator=generator)

    # Apply val transforms to val split
    val_set.dataset = datasets.ImageFolder(data_dir, transform=val_tf)

    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True,
                              num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False,
                            num_workers=4, pin_memory=True)

    class_names = {v: k for k, v in full_dataset.class_to_idx.items()}
    return train_loader, val_loader, class_names


# ── MODEL BUILDER ───────────────────────────────────────
def build_model(num_classes, dropout_rate, dense_units):
    base = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
    # Freeze backbone
    for param in base.parameters():
        param.requires_grad = False

    in_features = base.classifier[1].in_features
    base.classifier = nn.Sequential(
        nn.Dropout(dropout_rate),
        nn.Linear(in_features, dense_units),
        nn.ReLU(),
        nn.Dropout(dropout_rate),
        nn.Linear(dense_units, num_classes),
    )
    return base.to(DEVICE)


def unfreeze_top_layers(model, num_layers=30):
    features = list(model.features.children())
    for layer in features[-num_layers:]:
        for param in layer.parameters():
            param.requires_grad = True
    print(f"  Unfrozen last {num_layers} feature layers of MobileNetV2 for fine-tuning.")


# ── TRAIN ONE EPOCH ─────────────────────────────────────
def run_epoch(model, loader, criterion, optimizer=None):
    training = optimizer is not None
    model.train() if training else model.eval()
    total_loss, correct, total = 0.0, 0, 0

    with torch.set_grad_enabled(training):
        for images, labels in loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            loss = criterion(outputs, labels)

            if training:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

            total_loss += loss.item() * images.size(0)
            preds = outputs.argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += images.size(0)

    return total_loss / total, correct / total


def top3_accuracy(model, loader):
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(DEVICE), labels.to(DEVICE)
            outputs = model(images)
            top3 = outputs.topk(3, dim=1).indices
            correct += (top3 == labels.unsqueeze(1)).any(dim=1).sum().item()
            total += images.size(0)
    return correct / total


# ── TRAINING LOOP ───────────────────────────────────────
def train(config):
    torch.manual_seed(config["seed"])
    np.random.seed(config["seed"])

    print("\n" + "=" * 60)
    print("  PestEase — Disease Detection Training Pipeline")
    print(f"  Device: {DEVICE}")
    print("=" * 60)

    print("\n[1/5] Loading dataset from:", config["data_dir"])
    train_loader, val_loader, class_names = build_data_loaders(
        config["data_dir"], config["img_size"],
        config["batch_size"], config["val_split"], config["seed"],
    )
    num_classes = len(class_names)
    print(f"  Classes detected  : {num_classes}")

    os.makedirs("models", exist_ok=True)
    with open(config["classes_save_path"], "w") as f:
        json.dump(class_names, f, indent=2)
    print(f"  Class map saved  → {config['classes_save_path']}")

    print("\n[2/5] Building MobileNetV2 model...")
    model = build_model(num_classes, config["dropout_rate"], config["dense_units"])
    criterion = nn.CrossEntropyLoss()

    history = {"accuracy": [], "val_accuracy": [], "loss": [], "val_loss": []}
    best_val_acc = 0.0

    print("\n[3/5] Phase 1 — Training classification head (backbone frozen)...")
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                           lr=config["learning_rate"])
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=3)

    for epoch in range(config["epochs_frozen"]):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, optimizer)
        vl_loss, vl_acc = run_epoch(model, val_loader, criterion)
        scheduler.step(vl_loss)
        history["loss"].append(tr_loss)
        history["accuracy"].append(tr_acc)
        history["val_loss"].append(vl_loss)
        history["val_accuracy"].append(vl_acc)
        print(f"  Epoch {epoch+1:02d}/{config['epochs_frozen']} | "
              f"loss={tr_loss:.4f} acc={tr_acc:.4f} | val_loss={vl_loss:.4f} val_acc={vl_acc:.4f}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), config["model_save_path"])

    print("\n[4/5] Phase 2 — Fine-tuning (unfreezing top MobileNet layers)...")
    unfreeze_top_layers(model)
    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                           lr=config["finetune_lr"])
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.5, patience=3)

    for epoch in range(config["epochs_finetune"]):
        tr_loss, tr_acc = run_epoch(model, train_loader, criterion, optimizer)
        vl_loss, vl_acc = run_epoch(model, val_loader, criterion)
        scheduler.step(vl_loss)
        history["loss"].append(tr_loss)
        history["accuracy"].append(tr_acc)
        history["val_loss"].append(vl_loss)
        history["val_accuracy"].append(vl_acc)
        print(f"  Epoch {epoch+1:02d}/{config['epochs_finetune']} | "
              f"loss={tr_loss:.4f} acc={tr_acc:.4f} | val_loss={vl_loss:.4f} val_acc={vl_acc:.4f}")
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            torch.save(model.state_dict(), config["model_save_path"])

    with open(config["history_save_path"], "w") as f:
        json.dump(history, f, indent=2)

    # Load best checkpoint for final eval
    model.load_state_dict(torch.load(config["model_save_path"], map_location=DEVICE))
    print("\n[5/5] Final evaluation on validation set...")
    _, val_acc = run_epoch(model, val_loader, criterion)
    top3 = top3_accuracy(model, val_loader)
    print(f"\n  ✓ Val Accuracy  : {val_acc*100:.2f}%")
    print(f"  ✓ Val Top-3 Acc : {top3*100:.2f}%")
    print(f"  ✓ Model saved   → {config['model_save_path']}")

    plot_training(history, config["epochs_frozen"])
    return model, history, class_names


# ── PLOT ────────────────────────────────────────────────
def plot_training(history, phase1_end):
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle("PestEase — Training History", fontsize=14, fontweight="bold")

    axes[0].plot(history["accuracy"], label="Train Accuracy", color="#2ecc71")
    axes[0].plot(history["val_accuracy"], label="Val Accuracy", color="#3498db")
    axes[0].axvline(x=phase1_end - 1, color="orange", linestyle="--", label="Fine-tuning starts")
    axes[0].set_title("Accuracy")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    axes[1].plot(history["loss"], label="Train Loss", color="#e74c3c")
    axes[1].plot(history["val_loss"], label="Val Loss", color="#9b59b6")
    axes[1].axvline(x=phase1_end - 1, color="orange", linestyle="--", label="Fine-tuning starts")
    axes[1].set_title("Loss")
    axes[1].set_xlabel("Epoch")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig("models/training_curves.png", dpi=150)
    print("  ✓ Training curves saved → models/training_curves.png")
    plt.show()


# ── ENTRY POINT ─────────────────────────────────────────
if __name__ == "__main__":
    model, history, class_names = train(CONFIG)
