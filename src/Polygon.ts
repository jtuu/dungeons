import { CellAutomaton, CellState } from "./cells";
import { angleBetween, Vec2 } from "./geometry";
import { Rectangle } from "./Rectangle";
import { Shape } from "./Shape";
import { floatEquals, range } from "./utils";

export class Polygon extends Shape {
    public readonly vertices: Array<Vec2>;

    constructor(
        system: CellAutomaton,
        vertices: Array<Vec2> = []
    ) {
        super(system);
        this.vertices = vertices;
    }

    private static optimizeHelper(oldVerts: Array<Vec2>): Array<Vec2> {
        const first = oldVerts[0];
        const last = oldVerts[oldVerts.length - 1];
        const newVerts = [last];
        let numChanged = 0;
        let prevAngle = angleBetween(last, first);
        for (let i = 1; i < oldVerts.length; i++) {
            const a = oldVerts[i - 1];
            const b = oldVerts[i];
            const curAngle = angleBetween(a, b);
            if (floatEquals(curAngle, prevAngle)) {
                numChanged++;
            } else {
                newVerts.push(a);
            }
            prevAngle = curAngle;
        }
        if (numChanged > 0) {
            return Polygon.optimizeHelper(newVerts);
        } else {
            return newVerts;
        }
    }
    
    public optimize() {
        const verts = this.vertices.slice();
        this.vertices.length = 0;
        this.vertices.push(...Polygon.optimizeHelper(verts));
    }

    public getBoundingBox(): Rectangle {
        let top: number = Infinity,
            bottom: number = -Infinity,
            left: number = Infinity,
            right: number = -Infinity;
        for (const [x, y] of this.vertices) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
        }
        return new Rectangle(
            this.system,
            left,
            top,
            right - left,
            bottom - top
        );
    }
    
    public fill(value: CellState) {
        for (let pxy = this.system.bounds.top; pxy < this.system.bounds.bottom; pxy++) {
            const nodeX: Array<number> = [];
            let j = this.vertices.length - 1;
            for (let i = 0; i < this.vertices.length; i++) {
               const [xi, yi] = this.vertices[i];
               const [xj, yj] = this.vertices[j];
               if (yi < pxy && yj >= pxy || yj < pxy && yi >= pxy) {
                   nodeX.push(Math.floor(xi + (pxy - yi) / (yj - yi) * (xj - xi)));
                }
                j = i;
            }
            nodeX.sort((a, b) => a - b);
            for (let i = 0; i < nodeX.length; i += 2) {
                if (nodeX[i] >= this.system.bounds.right) { break; }
                if (nodeX[i + 1] > this.system.bounds.left) {
                    if (nodeX[i] < this.system.bounds.left) {
                        nodeX[i] = this.system.bounds.left;
                    }
                    if (nodeX[i + 1] > this.system.bounds.right) {
                        nodeX[i + 1] = this.system.bounds.right;
                    }
                    for (let pxx = nodeX[i], j = 0; pxx < nodeX[i + 1]; pxx++, j++) {
                        this.system.grid[pxy * this.system.width + pxx] = value;
                    }
                }
            }
        }
    }

    private static rasterizeHelperLow(p0: Vec2, p1: Vec2, rasterized: Array<Vec2>) {
        const dx = p1[0] - p0[0];
        let dy = p1[1] - p0[1];
        let yi = 1;
        
        if (dy < 0) {
            yi = -1;
            dy = -dy;
        }
        
        let D = 2 * dy - dx;
        let y = p0[1];
        for (const x of range(p0[0], p1[0])) {
            rasterized.push([x, y]);
            if (D > 0) {
                y += yi;
                D -= 2 * dx;
            }
            D += 2 * dy;
        }
    }
    
    private static rasterizeHelperHigh(p0: Vec2, p1: Vec2, rasterized: Array<Vec2>) {
        let dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        let xi = 1;
        
        if (dx < 0) {
            xi = -1;
            dx = -dx;
        }
        
        let D = 2 * dx - dy;
        let x = p0[0];
        for (const y of range(p0[1], p1[1])) {
            rasterized.push([x, y]);
            if (D > 0) {
                x += xi;
                D -= 2 * dy;
            }
            D += 2 * dx;
        }
    }
    
    public getOutline(): Array<Vec2> {
        const rasterized: Array<Vec2> = [];
        let p0 = this.vertices[this.vertices.length - 1];
        for (let i = 0; i < this.vertices.length; i++) {
            const p1 = this.vertices[i];
            if (Math.abs(p1[1] - p0[1]) < Math.abs(p1[0] - p0[0])) {
                if (p0[0] > p1[0]) {
                    Polygon.rasterizeHelperLow(p1, p0, rasterized);
                } else {
                    Polygon.rasterizeHelperLow(p0, p1, rasterized);
                }
            } else {
                if (p0[1] > p1[1]) {
                    Polygon.rasterizeHelperHigh(p1, p0, rasterized);
                } else {
                    Polygon.rasterizeHelperHigh(p0, p1, rasterized);
                }
            }
            p0 = p1;
        }
        return rasterized;
    }

    public outline(value: CellState) {
        const outline = this.getOutline();
        for (const [x, y] of this.vertices) {
            this.system.grid[y * this.system.width + x] = value;
        }
        for (const [x, y] of outline) {
            this.system.grid[y * this.system.width + x] = value;
        }
    }

    public clone(): Polygon {
        return new Polygon(this.system, this.vertices.slice());
    }

    public translate(dx: number, dy: number): Polygon {
        for (const vert of this.vertices) {
            vert[0] += dx;
            vert[1] += dy;
        }
        return this;
    }

    public scale(mulx: number, muly: number, ox?: number, oy?: number) {
        if (ox === undefined || oy === undefined) {
            const bb = this.getBoundingBox();
            ox = bb.x;
            oy = bb.y;
        }
        for (const vert of this.vertices) {
            const dx = (vert[0] - ox) * mulx;
            const dy = (vert[1] - oy) * muly;
            vert[0] = ox + dx;
            vert[1] = oy + dy;
        }
    }

    public centerAt(cx: number, cy: number) {
        const bb = this.getBoundingBox();
        const dx = cx - bb.x - Math.floor(bb.width / 2);
        const dy = cy - bb.y - Math.floor(bb.height / 2);
        this.translate(dx, dy);
    }
}

export class PolygonFactory {
    constructor(private readonly system: CellAutomaton) {}

    public regular(cx: number, cy: number, n: number, r: number): Polygon {
        const verts: Array<Vec2> = [];
        const step = Math.PI * 2 / n;
        for (let i = 0, a = 0; i < n; i++, a += step) {
            const x = Math.floor(cx + Math.cos(a) * r);
            const y = Math.floor(cy + Math.sin(a) * r);
            verts.push([x, y]);
        }
        return new Polygon(this.system, verts);
    }
}
