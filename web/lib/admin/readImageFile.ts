/** An image file the admin picked, as the upload call takes it: base64 without the data: prefix, and its extension. */
export async function readImageFile(file: File): Promise<{ base64: string; ext: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Could not read that image.");
  const fromType = file.type.startsWith("image/") ? file.type.slice("image/".length) : "";
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "";
  const ext = (fromType || fromName || "jpg").toLowerCase().replace("svg+xml", "svg");
  return { base64: dataUrl.slice(comma + 1), ext };
}
