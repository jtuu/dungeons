import { distance, lerp, segmentsCross } from "./math";
import { Color, drawPoints, Memoize, neighborhoodOffsets4, range } from "./utils";

export class Point {
    constructor(public readonly x: number, public readonly y: number) {}
    
    public distance(p: Point): number {
        return distance(this, p);
    }
    
    public is(point: Point): boolean {
        return this.x === point.x && this.y === point.y;
    }
    
    public draw(ctx: CanvasRenderingContext2D) {
        drawPoints(ctx, [this]);
    }
}

export class Triangle {
    constructor(
        public readonly p0: Point,
        public readonly p1: Point,
        public readonly p2: Point
    ) {}
    
    public get points(): Point[] {
        return [this.p0, this.p1, this.p2];
    }
    
    public get sides(): Path[] {
        return [
            new Path(this.p0, this.p1),
            new Path(this.p1, this.p2),
            new Path(this.p2, this.p0),
        ];
    }
    
    public get circumradius(): number {
        const dx = this.p1.x - this.p0.x;
        const dy = this.p1.y - this.p0.y;
        const ex = this.p2.x - this.p0.x;
        const ey = this.p2.y - this.p0.y;
        
        const bl = dx * dx + dy * dy;
        const cl = ex * ex + ey * ey;
        const d = dx * ey - dy * ex;
        
        const x = (ey * bl - dy * cl) * 0.5 / d;
        const y = (dx * cl - ex * bl) * 0.5 / d;
        
        return bl && cl && d && (x * x + y * y) || Infinity;
    }
    
    public get area(): number {
        const area = (this.p1.y - this.p0.y) * (this.p2.x - this.p1.x) - (this.p1.x - this.p0.x) * (this.p2.y - this.p1.y);
        return area;
    }
    
    public get circumcenter(): Point {
        const dx = this.p1.x - this.p0.x;
        const dy = this.p1.y - this.p0.y;
        const ex = this.p2.x - this.p0.x;
        const ey = this.p2.y - this.p0.y;
        
        const bl = dx * dx + dy * dy;
        const cl = ex * ex + ey * ey;
        const d = dx * ey - dy * ex;
        
        const x = this.p0.x + (ey * bl - dy * cl) * 0.5 / d;
        const y = this.p0.y + (dx * cl - ex * bl) * 0.5 / d;
        
        return new Point(x, y);
    }
    
    public circumcircleContains(point: Point): boolean {
        const dx = this.p0.x - point.x;
        const dy = this.p0.y - point.x;
        const ex = this.p1.x - point.x;
        const ey = this.p1.y - point.y;
        const fx = this.p2.x - point.x;
        const fy = this.p2.y - point.y;
        
        const ap = dx * dx + dy * dy;
        const bp = ex * ex + ey * ey;
        const cp = fx * fx + fy * fy;
        
        return dx * (ey * cp - bp * fy) -
        dy * (ex * cp - bp * fx) +
        ap * (ex * fy - ey * fx) < 0;
    }
    
    public draw(ctx: CanvasRenderingContext2D) {
        new Path(this.p0, this.p1, this.p2, this.p0).draw(ctx);
    }
}

export class Path {
    public readonly points: Point[];
    constructor(...points: Point[]) {
        this.points = points;
    }
    
    public get length(): number {
        if (this.points.length < 2) {
            return 0;
        }
        
        let sum = 0;
        for (let i = 1; i < this.points.length; i++) {
            sum += distance(this.points[i], this.points[i - 1]);
        }
        return sum;
    }
    
    public thicken(iter = 1) {
        for (let x = 0; x < iter; x++) {
            const len = this.points.length;
            for (let i = 0; i < len; i++) {
                const point = this.points[i];
                for (const offset of neighborhoodOffsets4) {
                    const newPoint = new Point(point.x + offset[0], point.y + offset[1]);
                    if (!this.points.find(p => p.x === newPoint.x && p.y === newPoint.y)) {
                        this.points.push(newPoint);
                    }
                }
            }
        }
    }
    
    public get first(): Point {
        return this.points[0];
    }
    
    public get last(): Point {
        return this.points[this.points.length - 1];
    }
    
    private static rasterizeHelperLow(p0: Point, p1: Point, rasterized: Point[]) {
        const dx = p1.x - p0.x;
        let dy = p1.y - p0.y;
        let yi = 1;
        
        if (dy < 0) {
            yi = -1;
            dy = -dy;
        }
        
        let D = 2 * dy - dx;
        let y = p0.y;
        for (const x of range(p0.x, p1.x)) {
            rasterized.push(new Point(Math.floor(x), Math.floor(y)));
            if (D > 0) {
                y += yi;
                D -= 2 * dx;
            }
            D += 2 * dy;
        }
    }
    
    private static rasterizeHelperHigh(p0: Point, p1: Point, rasterized: Point[]) {
        let dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        let xi = 1;
        
        if (dx < 0) {
            xi = -1;
            dx = -dx;
        }
        
        let D = 2 * dx - dy;
        let x = p0.x;
        for (const y of range(p0.y, p1.y)) {
            rasterized.push(new Point(Math.floor(x), Math.floor(y)));
            if (D > 0) {
                x += xi;
                D -= 2 * dy;
            }
            D += 2 * dx;
        }
    }
    
    public rasterize(): Point[] {
        const rasterized: Point[] = [this.first, this.last];
        let p0 = this.points[0];
        for (let i = 1; i < this.points.length; i++) {
            const p1 = this.points[i];
            if (Math.abs(p1.y - p0.y) < Math.abs(p1.x - p0.x)) {
                if (p0.x > p1.x) {
                    Path.rasterizeHelperLow(p1, p0, rasterized);
                } else {
                    Path.rasterizeHelperLow(p0, p1, rasterized);
                }
            } else {
                if (p0.y > p1.y) {
                    Path.rasterizeHelperHigh(p1, p0, rasterized);
                } else {
                    Path.rasterizeHelperHigh(p0, p1, rasterized);
                }
            }
            p0 = p1;
        }
        return rasterized;
    }
    
    public draw(ctx: CanvasRenderingContext2D, color?: Color) {
        drawPoints(ctx, this.rasterize(), color);
    }
}

export class CubicBezierCurve {
    constructor(
        public readonly p0: Point,
        public readonly p1: Point,
        public readonly p2: Point,
        public readonly p3: Point
    ) {}
    
    @Memoize
    public get points(): Point[] {
        return [this.p0, this.p1, this.p2, this.p3];
    }
    
    public eval(t: number): Point {
        if (t < 0 || t > 1) {
            throw new TypeError("t must be in range [0, 1]");
        }
        const {p0, p1, p2, p3} = this;
        const x = (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t ** 2 * p2.x + t ** 3 * p3.x;
        const y = (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t ** 2 * p2.y + t ** 3 * p3.y;
        return new Point(x, y);
    }
    
    public get naiveLength(): number {
        return distance(this.p0, this.p3);
    }
    
    public subdivide(): [CubicBezierCurve, CubicBezierCurve] {
        const {p0, p1, p2, p3} = this;
        const p4 = lerp(p0, p1);
        const p5 = lerp(p1, p2);
        const p6 = lerp(p2, p3);
        const p7 = lerp(p4, p5);
        const p8 = lerp(p5, p6);
        const p9 = lerp(p7, p8);
        return [
            new CubicBezierCurve(p0, p4, p7, p9),
            new CubicBezierCurve(p9, p8, p6, p3)
        ];
    }
    
    private static rasterizeHelper(subdivisionMinLength: number, straightnessTreshold: number, curve: CubicBezierCurve, rasterized: Point[]) {
        const adjustedLength = curve.naiveLength - straightnessTreshold;
        if (adjustedLength <= subdivisionMinLength) {
            return;
        }
        
        const subs = curve.subdivide();
        
        let sum = 0;
        for (const sub of subs) {
            sum += sub.naiveLength;
        }
        
        if (sum > adjustedLength) {
            for (const sub of subs) {
                rasterized.push(sub.eval(0.5));
                CubicBezierCurve.rasterizeHelper(subdivisionMinLength, straightnessTreshold, sub, rasterized);
            }
        }
    }
    
    public rasterize(subdivisionMinLength = 0.5, straightnessTreshold = 0.5): Point[] {
        const rasterized: Point[] = [this.p0, this.p3];
        CubicBezierCurve.rasterizeHelper(subdivisionMinLength, straightnessTreshold, this, rasterized);
        return rasterized;
    }
    
    public draw(ctx: CanvasRenderingContext2D) {
        drawPoints(ctx, this.rasterize());
    }
    
    public static between(p0: Point, p1: Point): CubicBezierCurve {
        const a = (p1.x < p0.x && p1.y < p0.y) ? p1 : p0;
        const b = (p1.x < p0.x && p1.y < p0.y) ? p0 : p1;
        const dx = a.x - b.x;
        const dy = Math.abs(a.y - b.y);
        return new CubicBezierCurve(a, new Point(a.x + dx / 2, a.y), new Point(b.x, a.y + dy / 2), b);
    }
}

export class Rectangle {
    constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly w: number,
        public readonly h: number
    ) {}
    
    public get right(): number {
        return this.x + this.w;
    }
    
    public get bottom(): number {
        return this.y + this.h;
    }
    
    public get topRight(): Point {
        return new Point(this.right, this.y);
    }
    
    public get bottomRight(): Point {
        return new Point(this.right, this.bottom);
    }
    
    public get bottomLeft(): Point {
        return new Point(this.x, this.bottom);
    }
    
    public get topLeft(): Point {
        return new Point(this.x, this.y);
    }
    
    @Memoize
    public get outline(): Path {
        return new Path(
            this.topRight,
            this.bottomRight,
            this.bottomLeft,
            this.topLeft,
            this.topRight
        );
    }
    
    @Memoize
    public get sides() : Path[] {
        return [
            new Path(this.topRight, this.bottomRight),
            new Path(this.bottomRight, this.bottomLeft),
            new Path(this.bottomLeft, this.topLeft),
            new Path(this.topLeft, this.topRight)
        ];
    }
    
    public get perimeter(): number {
        return this.outline.length;
    }
    
    public intersectsRectangle(rect: Rectangle): boolean {
        return this.x < rect.right && this.right > rect.x &&
        this.y < rect.bottom && this.bottom > rect.y;
    }
    
    public intersectsPoint(point: Point): boolean {
        return point.x >= this.x && point.x <= this.right &&
        point.y >= this.y && point.y <= this.bottom;
    }
    
    public intersectsPath(path: Path): boolean {
        const sides = this.sides;
        let p0 = path.points[0];
        for (let i = 1; i < path.points.length; i++) {
            const p1 = path.points[i];
            for (const side of sides) {
                if (segmentsCross(side.first, side.last, p0, p1)) {
                    return true;
                }
            }
            p0 = p1;
        }
        return false;
    }
    
    public intersects(obj: Rectangle | Point | Path): boolean {
        if (obj instanceof Rectangle) {
            return this.intersectsRectangle(obj);
        } else if (obj instanceof Point) {
            return this.intersectsPoint(obj);
        } else if (obj instanceof Path) {
            return this.intersectsPath(obj);
        }
        throw new TypeError(`Can't intersect ${obj} with ${this}`);
    }
    
    public draw(ctx: CanvasRenderingContext2D) {
        const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const row = ctx.canvas.width * 4;
        const top = this.y * row;
        const bot = (this.bottom) * row;
        for (let ix = this.x * 4; ix <= this.right * 4; ix += 4) {
            const ixtop = top + ix;
            const ixbot = bot + ix;
            imgData.data[ixtop + 0] = 0;
            imgData.data[ixtop + 1] = 0;
            imgData.data[ixtop + 2] = 255;
            imgData.data[ixtop + 3] = 255;
            
            imgData.data[ixbot + 0] = 0;
            imgData.data[ixbot + 1] = 0;
            imgData.data[ixbot + 2] = 255;
            imgData.data[ixbot + 3] = 255;
        }
        
        const left = this.x * 4;
        const right = (this.right) * 4;
        for (let iy = top + row; iy < bot; iy += row) {
            const iyleft = left + iy;
            const iyright = right + iy;
            imgData.data[iyleft + 0] = 0;
            imgData.data[iyleft + 1] = 0;
            imgData.data[iyleft + 2] = 255;
            imgData.data[iyleft + 3] = 255;
            
            imgData.data[iyright + 0] = 0;
            imgData.data[iyright + 1] = 0;
            imgData.data[iyright + 2] = 255;
            imgData.data[iyright + 3] = 255;
        }
        
        ctx.putImageData(imgData, 0, 0);
    }
}

export type Vec2 = [number, number];

export function angleBetween(a: Vec2, b: Vec2) {
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
