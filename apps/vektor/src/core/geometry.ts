export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 2D-Affintransformation, Spaltenkonvention wie Canvas setTransform(a, b, c, d, e, f):
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export class Matrix {
  constructor(
    public a = 1,
    public b = 0,
    public c = 0,
    public d = 1,
    public e = 0,
    public f = 0,
  ) {}

  static identity(): Matrix {
    return new Matrix();
  }

  static translation(tx: number, ty: number): Matrix {
    return new Matrix(1, 0, 0, 1, tx, ty);
  }

  static scaling(sx: number, sy: number): Matrix {
    return new Matrix(sx, 0, 0, sy, 0, 0);
  }

  clone(): Matrix {
    return new Matrix(this.a, this.b, this.c, this.d, this.e, this.f);
  }

  /** this ∘ m — m wird zuerst angewendet: (this.multiply(m)).apply(p) === this.apply(m.apply(p)) */
  multiply(m: Matrix): Matrix {
    return new Matrix(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f,
    );
  }

  invert(): Matrix {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return Matrix.identity();
    const inv = 1 / det;
    return new Matrix(
      this.d * inv,
      -this.b * inv,
      -this.c * inv,
      this.a * inv,
      (this.c * this.f - this.d * this.e) * inv,
      (this.b * this.e - this.a * this.f) * inv,
    );
  }

  apply(p: Point): Point {
    return {
      x: this.a * p.x + this.c * p.y + this.e,
      y: this.b * p.x + this.d * p.y + this.f,
    };
  }

  translate(tx: number, ty: number): Matrix {
    return this.multiply(Matrix.translation(tx, ty));
  }

  scale(sx: number, sy: number): Matrix {
    return this.multiply(Matrix.scaling(sx, sy));
  }

  toCanvasArgs(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }
}

export function rectFromPoints(p1: Point, p2: Point): Rect {
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p1.x - p2.x),
    height: Math.abs(p1.y - p2.y),
  };
}

export function rectUnion(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function inflateRect(r: Rect, amount: number): Rect {
  return { x: r.x - amount, y: r.y - amount, width: r.width + amount * 2, height: r.height + amount * 2 };
}

/** Achsenparalleles Umschließungsrechteck eines transformierten Rechtecks. */
export function transformRect(m: Matrix, r: Rect): Rect {
  const corners = [
    m.apply({ x: r.x, y: r.y }),
    m.apply({ x: r.x + r.width, y: r.y }),
    m.apply({ x: r.x, y: r.y + r.height }),
    m.apply({ x: r.x + r.width, y: r.y + r.height }),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
