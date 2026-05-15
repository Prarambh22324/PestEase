import os
import sys
import zipfile
import shutil
import argparse
from pathlib import Path


DATA_DIR = Path("data/PlantVillage")
KAGGLE_DATASET = "emmarex/plantdisease"


def download_kaggle(data_dir: Path):
    try:
        import kaggle
    except ImportError:
        print("❌ kaggle package not found. Run: pip install kaggle")
        sys.exit(1)

    print(f"[1/3] Downloading PlantVillage from Kaggle...")
    os.makedirs("data/raw", exist_ok=True)
    kaggle.api.authenticate()
    kaggle.api.dataset_download_files(
        KAGGLE_DATASET,
        path="data/raw",
        unzip=True,
    )
    print("[2/3] Download complete.")
    _organize(Path("data/raw"), data_dir)


def extract_local_zip(zip_path: str, data_dir: Path):
    print(f"[1/3] Extracting {zip_path}...")
    os.makedirs("data/raw", exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall("data/raw")
    print("[2/3] Extraction complete.")
    _organize(Path("data/raw"), data_dir)


def _organize(raw_dir: Path, target_dir: Path):
    """
    Searches raw_dir for image class folders and moves them under target_dir.
    Supports both flat and nested PlantVillage structures.
    """
    print(f"[3/3] Organizing dataset into: {target_dir}")
    target_dir.mkdir(parents=True, exist_ok=True)

    # Find all leaf class directories (contain .jpg files)
    moved = 0
    for root, dirs, files in os.walk(raw_dir):
        images = [f for f in files if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        if len(images) > 10:   # Likely a class folder
            class_name = Path(root).name
            dest = target_dir / class_name
            if not dest.exists():
                shutil.copytree(root, dest)
                moved += 1
                print(f"  ✓ {class_name}: {len(images)} images")

    print(f"\n✅ Dataset ready: {moved} classes in {target_dir}")
    _print_stats(target_dir)


def _print_stats(data_dir: Path):
    total = 0
    classes = sorted(data_dir.iterdir())
    print(f"\n{'Class':<45} {'Images':>8}")
    print("-" * 55)
    for cls in classes:
        if cls.is_dir():
            count = len(list(cls.glob("*.*")))
            total += count
            print(f"  {cls.name:<43} {count:>8}")
    print("-" * 55)
    print(f"  {'TOTAL':<43} {total:>8}")


def verify_dataset(data_dir: Path = DATA_DIR):
    if not data_dir.exists():
        print(f"❌ Dataset not found at: {data_dir}")
        print("   Run this script first to download/organize the dataset.")
        return False

    classes = [d for d in data_dir.iterdir() if d.is_dir()]
    total_images = sum(len(list(c.glob("*.*"))) for c in classes)

    print(f"✅ Dataset found: {len(classes)} classes, {total_images:,} images")
    print(f"   Path: {data_dir.resolve()}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FarmEase Dataset Setup")
    parser.add_argument("--source", choices=["kaggle", "local", "verify"],
                        default="verify", help="Data source")
    parser.add_argument("--zip", type=str, default=None,
                        help="Path to local zip file (used with --source local)")
    args = parser.parse_args()

    if args.source == "kaggle":
        download_kaggle(DATA_DIR)
    elif args.source == "local":
        if not args.zip:
            print("❌ Provide --zip path when using --source local")
            sys.exit(1)
        extract_local_zip(args.zip, DATA_DIR)
    else:
        verify_dataset(DATA_DIR)
