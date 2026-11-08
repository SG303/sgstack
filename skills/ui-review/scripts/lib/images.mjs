// PNG helpers: tiling tall screenshots for vision models, padding, side-by-side composites.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

export function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

export function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

// Splits a tall screenshot into tiles so vision models do not downscale it into mush.
// Returns the written tile paths (cached: existing tiles are reused).
export function tilePng(src, outDir, { tileHeight = 1600, maxTiles = 3 } = {}) {
  if (!fs.existsSync(src)) return [];
  const base = path.basename(src, ".png");
  const img = readPng(src);
  const count = Math.min(maxTiles, Math.ceil(img.height / tileHeight));
  const files = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(outDir, `${base}-tile${i + 1}.png`);
    files.push(file);
    if (fs.existsSync(file)) continue;
    const h = Math.min(tileHeight, img.height - i * tileHeight);
    const tile = new PNG({ width: img.width, height: h });
    PNG.bitblt(img, tile, 0, i * tileHeight, img.width, h, 0, 0);
    writePng(file, tile);
  }
  return files;
}

// Pads a PNG to the given size with a solid colour (default white).
export function padPng(img, width, height, rgba = [255, 255, 255, 255]) {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(rgba, i);
  PNG.bitblt(img, out, 0, 0, Math.min(img.width, width), Math.min(img.height, height), 0, 0);
  return out;
}
