// 📁 app/core/components/ImageCropper.tsx
import "react-image-crop/dist/ReactCrop.css";

import React, { useEffect, useRef, useState } from "react";
import ReactCrop, {
  type Crop,
  type PercentCrop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";

import { Button } from "./ui/button";

// 이미지에서 crop된 결과를 canvas로 렌더링하여 Blob으로 변환하는 함수
async function cropImageToBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = crop.width;
  canvas.height = crop.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
      },
      "image/jpeg",
      0.95,
    );
  });
}

type ImageCropperProps = {
  imageFile: File;
  onCancel: () => void;
  croppedImage: File | null;
  setCroppedImage: (image: File | null) => void;
  setShowCropper: (show: boolean) => void;
};

// 생략된 import 및 cropImageToBlob 함수는 기존 그대로 유지

export default function ImageCropper({
  imageFile,
  onCancel,
  croppedImage,
  setCroppedImage,
  setShowCropper,
}: ImageCropperProps) {
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    x: 10,
    y: 10,
    width: 60,
    height: 45,
  });
  const didSetInitialCrop = useRef(false);

  const imageUrl = URL.createObjectURL(imageFile);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (didSetInitialCrop.current) return;
    didSetInitialCrop.current = true;

    const { width, height } = e.currentTarget;
    const aspect = 4 / 3;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 50 }, aspect, width, height),
      width,
      height,
    );
    setCrop(initialCrop);
    setCompletedCrop(initialCrop);
  };

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop?.width || !completedCrop?.height) {
      console.warn("imgRef 또는 crop 정보가 부족합니다.");
      return;
    }

    try {
      const blob = await cropImageToBlob(imgRef.current, completedCrop);
      if (!blob) return;
      const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
      setCroppedImage(file);
      onCancel(); // 또는 setShowCropper(false);
    } catch (error) {
      console.error("handleSave 오류:", error);
    }
  };

  // ✅ ESC 키 누르면 닫히도록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[90vh] max-w-[90vw] flex-col gap-4 overflow-auto rounded-lg bg-white p-4 shadow-xl">
        <div className="overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            minWidth={20}
            minHeight={15}
            keepSelection={false}
            circularCrop={false}
            className="pointer-events-auto"
          >
            <img
              ref={imgRef}
              src={imageUrl}
              onLoad={onImageLoad}
              alt="Crop me"
              className="pointer-events-auto max-h-[70vh] max-w-full object-contain"
            />
          </ReactCrop>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave}>
            Crop Image
          </Button>
        </div>
      </div>
    </div>
  );
}
