// Canvas creation behind one seam so the same art code runs in the browser and in unit tests (@napi-rs/canvas).

export type ArtCanvas = {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D | null;
};

type CanvasFactory = (w: number, h: number) => ArtCanvas;

let factory: CanvasFactory = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function setCanvasFactory(next: CanvasFactory): void {
  factory = next;
}

export function makeCanvas(w: number, h: number): ArtCanvas {
  return factory(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function ctx2d(c: ArtCanvas): CanvasRenderingContext2D {
  const g = c.getContext("2d");
  if (!g) throw new Error("2d canvas context is not available");
  return g;
}

export function asImage(c: ArtCanvas): CanvasImageSource {
  return c as unknown as CanvasImageSource;
}
