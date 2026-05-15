"""
PestEase - Model Evaluation
Generates:
  - Accuracy / Loss curves
  - Confusion matrix (top 20 classes)
  - Per-class precision, recall, F1
  - Classification report
"""

import json
import numpy as np
import torch
import torch.nn as nn
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from sklearn.metrics import classification_report, confusion_matrix
from torchvision import datasets, transforms, models
from torch.utils.data import DataLoader, random_split

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _build_mobilenetv2(num_classes, dropout_rate=0.3, dense_units=128):
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


def load_artifacts(model_path: str, class_names_path: str, history_path: str):
    with open(class_names_path) as f:
        class_names = {int(k): v for k, v in json.load(f).items()}
    with open(history_path) as f:
        history = json.load(f)

    model = _build_mobilenetv2(len(class_names))
    model.load_state_dict(torch.load(model_path, map_location=DEVICE))
    model.to(DEVICE)
    model.eval()
    return model, class_names, history


def build_val_loader(data_dir: str, val_split=0.2, batch_size=32, seed=42):
    tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    full = datasets.ImageFolder(data_dir, transform=tf)
    n_val = int(len(full) * val_split)
    n_train = len(full) - n_val
    _, val_set = random_split(full, [n_train, n_val],
                              generator=torch.Generator().manual_seed(seed))
    return DataLoader(val_set, batch_size=batch_size, shuffle=False,
                      num_workers=4, pin_memory=True)


def plot_curves(history: dict, save_path="models/training_curves.png"):
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.patch.set_facecolor("#0f1117")
    for ax in axes:
        ax.set_facecolor("#1a1d27")
        ax.tick_params(colors="white")
        for spine in ax.spines.values():
            spine.set_edgecolor("#333")
        ax.xaxis.label.set_color("white")
        ax.yaxis.label.set_color("white")
        ax.title.set_color("white")

    epochs = range(1, len(history["accuracy"]) + 1)
    axes[0].plot(epochs, history["accuracy"],     color="#2ecc71", linewidth=2, label="Train")
    axes[0].plot(epochs, history["val_accuracy"], color="#3498db", linewidth=2, label="Validation")
    axes[0].set_title("Accuracy"); axes[0].set_xlabel("Epoch"); axes[0].set_ylabel("Accuracy")
    axes[0].legend(facecolor="#2a2d3a", labelcolor="white"); axes[0].grid(alpha=0.15)

    axes[1].plot(epochs, history["loss"],     color="#e74c3c", linewidth=2, label="Train")
    axes[1].plot(epochs, history["val_loss"], color="#9b59b6", linewidth=2, label="Validation")
    axes[1].set_title("Loss"); axes[1].set_xlabel("Epoch"); axes[1].set_ylabel("Loss")
    axes[1].legend(facecolor="#2a2d3a", labelcolor="white"); axes[1].grid(alpha=0.15)

    fig.suptitle("PestEase — Training History", color="white", fontsize=15, fontweight="bold")
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    print(f"✓ Training curves → {save_path}")
    plt.show()


def plot_confusion_matrix(y_true, y_pred, class_names: dict, top_n=20,
                          save_path="models/confusion_matrix.png"):
    labels = list(range(len(class_names)))
    label_names = [class_names[i].split("___")[-1].replace("_", " ") for i in labels]

    if len(labels) > top_n:
        from collections import Counter
        top_classes = [cls for cls, _ in Counter(y_true).most_common(top_n)]
        mask = np.isin(y_true, top_classes)
        y_true = np.array(y_true)[mask]
        y_pred = np.array(y_pred)[mask]
        labels = top_classes
        label_names = [class_names[i].split("___")[-1].replace("_", " ") for i in labels]

    cm = confusion_matrix(y_true, y_pred, labels=labels)
    cm_norm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, ax = plt.subplots(figsize=(16, 14))
    fig.patch.set_facecolor("#0f1117")
    ax.set_facecolor("#0f1117")
    sns.heatmap(cm_norm, annot=True, fmt=".0%",
                xticklabels=label_names, yticklabels=label_names,
                cmap="YlOrRd", ax=ax, linewidths=0.3, linecolor="#222",
                annot_kws={"size": 7})
    ax.set_title("Confusion Matrix (Normalized)", color="white", fontsize=14, pad=15)
    ax.set_xlabel("Predicted", color="white", fontsize=11)
    ax.set_ylabel("True", color="white", fontsize=11)
    ax.tick_params(colors="white", labelsize=8)
    plt.xticks(rotation=45, ha="right"); plt.yticks(rotation=0)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight", facecolor="#0f1117")
    print(f"✓ Confusion matrix → {save_path}")
    plt.show()


def evaluate(
    model_path="models/pestease_model.pth",
    class_names_path="models/class_names.json",
    history_path="models/training_history.json",
    data_dir="data/PlantVillage",
):
    print("\n" + "=" * 55)
    print("  PestEase — Model Evaluation")
    print("=" * 55)

    model, class_names, history = load_artifacts(model_path, class_names_path, history_path)
    val_loader = build_val_loader(data_dir)

    print("\n[1/4] Plotting training curves...")
    plot_curves(history)

    print("[2/4] Generating predictions...")
    y_pred, y_true = [], []
    with torch.no_grad():
        for images, labels in val_loader:
            images = images.to(DEVICE)
            outputs = model(images)
            preds = outputs.argmax(dim=1).cpu().numpy()
            y_pred.extend(preds)
            y_true.extend(labels.numpy())

    y_pred = np.array(y_pred)
    y_true = np.array(y_true)

    print("[3/4] Classification Report:")
    label_names = [class_names[i].split("___")[-1].replace("_", " ")
                   for i in sorted(class_names.keys())]
    report = classification_report(y_true, y_pred, target_names=label_names, digits=3)
    print(report)
    with open("models/classification_report.txt", "w") as f:
        f.write(report)
    print("  ✓ Saved → models/classification_report.txt")

    print("[4/4] Plotting confusion matrix...")
    plot_confusion_matrix(y_true, y_pred, class_names)

    acc = np.mean(y_pred == y_true)
    print(f"\n{'='*55}")
    print(f"  Overall Accuracy : {acc*100:.2f}%")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    evaluate()
