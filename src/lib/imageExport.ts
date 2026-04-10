function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable.");
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

export async function imageDataToPngBuffer(imageData: ImageData): Promise<ArrayBuffer> {
  const canvas = imageDataToCanvas(imageData);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }

      reject(new Error("Failed to encode PNG data."));
    }, "image/png");
  });

  return blob.arrayBuffer();
}
