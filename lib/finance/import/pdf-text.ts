/** Ensure pdfjs-dist has DOMMatrix on Node/Vercel (not available in all runtimes). */
function ensureDomMatrixPolyfill(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
    is2D = true;
    isIdentity = true;

    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = init[0];
        this.m12 = init[1];
        this.m21 = init[2];
        this.m22 = init[3];
        this.m41 = init[4];
        this.m42 = init[5];
        this.isIdentity = init.every((v, i) => (i === 0 || i === 3 ? v === 1 : v === 0));
      }
    }

    scaleSelf(x = 1, y = x): this {
      this.a *= x;
      this.d *= y;
      this.m11 *= x;
      this.m22 *= y;
      this.isIdentity = false;
      return this;
    }

    translateSelf(x = 0, y = 0): this {
      this.e += x;
      this.f += y;
      this.m41 += x;
      this.m42 += y;
      this.isIdentity = false;
      return this;
    }

    multiplySelf(): this {
      return this;
    }

    invertSelf(): this {
      return this;
    }

    transformPoint(point?: { x: number; y: number }) {
      return point ?? { x: 0, y: 0 };
    }
  }

  globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof DOMMatrix;
}

/** Extract plain text from a PDF buffer (Node-only). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  ensureDomMatrixPolyfill();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text ?? "";
}
