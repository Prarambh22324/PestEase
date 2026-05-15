"""
PestEase — Camera Capture Module
Supports: Raspberry Pi Camera Module v2 (picamera2) and USB webcam fallback (OpenCV)
"""

import io
import time
import logging
import os
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("Camera")

# Try picamera2 first (RPi camera), fall back to OpenCV (USB webcam / dev)
try:
    from picamera2 import Picamera2
    PICAMERA_AVAILABLE = True
    logger.info("picamera2 available — using RPi Camera Module")
except ImportError:
    PICAMERA_AVAILABLE = False
    logger.warning("picamera2 not found — falling back to OpenCV (USB webcam)")

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False


class CameraCapture:
    """
    Captures 224×224 JPEG frames for AI inference.

    On Raspberry Pi with Camera Module v2:
        Uses picamera2 (fast, no preview needed)

    On dev machine / USB webcam:
        Falls back to OpenCV
    """

    def __init__(self, resolution=(224, 224), save_dir="/tmp/pestease_scans"):
        self.resolution = resolution
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)
        self._camera = None
        self._init_camera()

    def _init_camera(self):
        if PICAMERA_AVAILABLE:
            try:
                self._camera = Picamera2()
                config = self._camera.create_still_configuration(
                    main={"size": self.resolution, "format": "RGB888"},
                    lores={"size": (160, 120)},
                    display="lores",
                )
                self._camera.configure(config)
                self._camera.start()
                time.sleep(1.0)   # Warm-up
                self._mode = "picamera2"
                logger.info(f"Camera ready (picamera2) @ {self.resolution}")
                return
            except Exception as e:
                logger.warning(f"picamera2 init failed: {e}")

        if OPENCV_AVAILABLE:
            self._camera = cv2.VideoCapture(0)
            self._camera.set(cv2.CAP_PROP_FRAME_WIDTH,  self.resolution[0])
            self._camera.set(cv2.CAP_PROP_FRAME_HEIGHT, self.resolution[1])
            if self._camera.isOpened():
                self._mode = "opencv"
                logger.info(f"Camera ready (OpenCV/USB) @ {self.resolution}")
                return

        logger.error("No camera available!")
        self._mode = None

    def capture(self) -> bytes | None:
        """
        Captures a single frame and returns JPEG bytes.
        Also saves the image to save_dir for audit trail.
        """
        if self._mode is None:
            return self._dummy_capture()

        try:
            if self._mode == "picamera2":
                return self._capture_picamera()
            elif self._mode == "opencv":
                return self._capture_opencv()
        except Exception as e:
            logger.error(f"Capture error: {e}")
            return None

    def _capture_picamera(self) -> bytes:
        import numpy as np
        from PIL import Image

        frame = self._camera.capture_array()    # Returns numpy RGB888 array
        img = Image.fromarray(frame, "RGB")
        img = img.resize(self.resolution)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        img_bytes = buf.getvalue()

        self._save_image(img_bytes)
        return img_bytes

    def _capture_opencv(self) -> bytes | None:
        import cv2
        import numpy as np
        from PIL import Image

        ret, frame = self._camera.read()
        if not ret:
            logger.warning("OpenCV frame capture failed")
            return None

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(frame_rgb).resize(self.resolution)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        img_bytes = buf.getvalue()

        self._save_image(img_bytes)
        return img_bytes

    def _dummy_capture(self) -> bytes:
        """Returns a blank JPEG for testing without hardware."""
        from PIL import Image
        import io
        img = Image.new("RGB", self.resolution, color=(34, 85, 34))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()

    def _save_image(self, img_bytes: bytes):
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        path = self.save_dir / f"scan_{ts}.jpg"
        with open(path, "wb") as f:
            f.write(img_bytes)
        # Keep only last 200 images to avoid filling SD card
        images = sorted(self.save_dir.glob("scan_*.jpg"))
        if len(images) > 200:
            for old in images[:-200]:
                old.unlink()

    def release(self):
        if self._mode == "picamera2" and self._camera:
            self._camera.stop()
        elif self._mode == "opencv" and self._camera:
            self._camera.release()
        logger.info("Camera released.")
