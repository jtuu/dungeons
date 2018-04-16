import { Point, Triangle } from "./geometry";
import { distance2 } from "./math";
import { swap } from "./utils";

interface Node {
    i: number;
    t: number;
    p: Point;
    prev: Node | null;
    next: Node | null;
    removed: boolean;
}

class DelaunayTriangulator {
    private center: Point;
    private ids: Uint32Array;
    private hashSize: number;
    private hash: Array<Node>;
    public triangles: Uint32Array;
    private halfEdges: Int32Array;
    private trianglesLength = 0;
    private hull: Node;

    constructor(
        private points: Point[]
    ) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        const n = points.length;
        const ids = this.ids = new Uint32Array(n);

        for (let i = 0; i < n; i++) {
            const {x, y} = points[i];
            if (x < minX) { minX = x; }
            if (y < minY) { minY = y; }
            if (x > maxX) { maxX = x; }
            if (y > maxY) { maxY = y; }
            ids[i] = i;
        }

        const c = new Point((minX + maxX) / 2, (minY + maxY) / 2);

        let minDist = Infinity;
        let i0 = Infinity, i1 = Infinity, i2 = Infinity;

        for (let i = 0; i < n; i++) {
            const d = distance2(c, points[i]);
            if (d < minDist) {
                i0 = i;
                minDist = d;
            }
        }

        minDist = Infinity;

        for (let i = 0; i < n; i++) {
            if (i === i0) { continue; }
            const d = distance2(points[i0], points[i]);
            if (d < minDist && d > 0) {
                i1 = i;
                minDist = d;
            }
        }

        let minRadius = Infinity;

        for (let i = 0; i < n; i++) {
            if (i === i0 || i === i1) { continue; }
            const r = new Triangle(
                points[i0],
                points[i1],
                points[i]
            ).circumradius;

            if (r < minRadius) {
                i2 = i;
                minRadius = r;
            }
        }

        if (minRadius === Infinity) {
            throw new Error("No Delaunay triangulation exists for this input.");
        }

        if (new Triangle(points[i0], points[i1], points[i2]).area < 0) {
            const tmp = i1;
            i1 = i2;
            i2 = tmp;
        }

        const tr0 = new Triangle(
            points[i0],
            points[i1],
            points[i2]
        );

        this.center = tr0.circumcenter;
        this.sort(0, ids.length - 1);

        const maxTriangles = 2 * n - 5;
        this.hashSize = Math.ceil(Math.sqrt(n));
        this.hash = Array(this.hashSize).fill(null);
        this.triangles = new Uint32Array(maxTriangles * 3);
        this.halfEdges = new Int32Array(maxTriangles * 3);

        let e: Node | null = this.hull = this.insertNode(i0);

        this.hashEdge(e);
        e.t = 0;
        e = this.insertNode(i1, e);
        this.hashEdge(e);
        e.t = 1;
        e = this.insertNode(i2, e);
        this.hashEdge(e);
        e.t = 2;

        this.addTriangle(i0, i1, i2, -1, -1, -1);
        
        for (let k = 0, xp, yp; k < ids.length; k++) {
            const i = ids[k];
            const p = points[i];

            if (p.x === xp && p.y === yp) { continue; }
            xp = p.x;
            yp = p.y;

            if (
                (p.x === tr0.p0.x && p.y === tr0.p0.y) ||
                (p.x === tr0.p1.x && p.y === tr0.p1.y) ||
                (p.x === tr0.p2.x && p.y === tr0.p2.y)
            ) { continue; }

            const startKey = this.hashKey(p);
            let key: number = startKey;
            let start: Node;
            do {
                start = this.hash[key];
                key = (key + 1) % this.hashSize;
            } while ((!start || start.removed) && key !== startKey);

            e = start;
            while (new Triangle(p, e!.p, e!.next!.p).area >= 0) {
                e = e!.next;
                if (e === start) {
                    throw new Error("Invalid input points");
                }
            }

            if (!e) { break; }

            const walkBack = e === start;
            let t = this.addTriangle(e.i, i, e.next!.i, -1, -1, e.t);
            e.t = t;
            e = this.insertNode(i, e);

            e.t = this.legalize(t + 2);
            if (e.prev!.prev!.t === this.halfEdges[t + 1]) {
                e.prev!.prev!.t = t + 2;
            }

            let q = e.next!;
            while (new Triangle(p, q.p, q.next!.p).area < 0) {
                t = this.addTriangle(q.i, i, q.next!.i, q.prev!.t, -1, q.t);
                q.prev!.t = this.legalize(t + 2);
                this.hull = DelaunayTriangulator.removeNode(q);
                q = q.next!;
            }

            if (walkBack) {
                q = e.prev!;
                while (new Triangle(p, q.prev!.p, q.p).area < 0) {
                    t = this.addTriangle(q.prev!.i, i, q.i, - 1, q.t, q.prev!.t);
                    this.legalize(t + 2);
                    q.prev!.t = t;
                    this.hull = DelaunayTriangulator.removeNode(q);
                    q = q.prev!;
                }
            }

            this.hashEdge(e);
            this.hashEdge(e.prev!);
        }

        this.triangles = this.triangles.subarray(0, this.trianglesLength);
        this.halfEdges = this.halfEdges.subarray(0, this.trianglesLength);
    }

    private static compare(a: Point, b: Point, center: Point): number {
        const d1 = distance2(a, center);
        const d2 = distance2(b, center);
        const c = (d1 - d2) || (a.x - b.x) || (a.y - b.y);
        return c;
    }

    private sort(left: number, right: number) {
        const {ids, points, center} = this;
        let i = 0, j = 0, temp;

        if (right - left <= 20) {
            for (i = left + 1; i <= right; i++) {
                temp = ids[i];
                j = i - 1;
                while (j >= left && DelaunayTriangulator.compare(points[ids[j]], points[temp], center) > 0) {
                    ids[j + 1] = ids[j--];
                }
                ids[j + 1] = temp;
            }
        } else {
            const median = (left + right) >> 1;
            i = left + 1;
            j = right;
            swap(ids, median, i);
            if (DelaunayTriangulator.compare(points[ids[left]], points[ids[right]], center) > 0) {
                swap(ids, left, right);
            }
            if (DelaunayTriangulator.compare(points[ids[i]], points[ids[right]], center) > 0) {
                swap(ids, i, right);
            }
            if (DelaunayTriangulator.compare(points[ids[left]], points[ids[i]], center) > 0) {
                swap(ids, left, i);
            }

            temp = ids[i];
            while (true) {
                do {
                    i++;
                } while (DelaunayTriangulator.compare(points[ids[i]], points[temp], center) < 0);
                do {
                    j--;
                } while (DelaunayTriangulator.compare(points[ids[j]], points[temp], center) > 0);
                if (j < i) {
                    break;
                }
                swap(ids, i, j);
            }
            ids[left + 1] = ids[j];
            ids[j] = temp;

            if (right - i + 1 >= j - left) {
                this.sort(i, right);
                this.sort(left, j - 1);
            } else {
                this.sort(left, j - 1);
                this.sort(i, right);
            }
        }
    }

    public hashKey(p: Point): number {
        const dx = p.x - this.center.x;
        const dy = p.y - this.center.y;
        const a = 1 - dx / (Math.abs(dx) + Math.abs(dy));
        return Math.floor((2 + (dy < 0 ? -a : a)) / 4 * this.hashSize);
    }

    public hashEdge(e: Node) {
        this.hash[this.hashKey(e.p)] = e;
    }

    private link(a: number, b: number) {
        this.halfEdges[a] = b;
        if (b !== -1) {
            this.halfEdges[b] = a;
        }
    }

    private legalize(a: number): number {
        const b = this.halfEdges[a];

        const a0 = a - a % 3;
        const b0 = b - b % 3;

        const al = a0 + (a + 1) % 3;
        const ar = a0 + (a + 2) % 3;
        const bl = b0 + (b + 2) % 3;

        const p0 = this.triangles[ar];
        const pr = this.triangles[a];
        const pl = this.triangles[al];
        const p1 = this.triangles[bl];

        const illegal = new Triangle(
            this.points[p0],
            this.points[pr],
            this.points[pl]
        ).circumcircleContains(this.points[p1]);

        if (illegal) {
            this.triangles[a] = p1;
            this.triangles[b] = p0;

            this.link(a, this.halfEdges[bl]);
            this.link(b, this.halfEdges[ar]);
            this.link(ar, bl);

            const br = b0 + (b + 1) % 3;
            
            this.legalize(a);
            return this.legalize(br);
        }

        return ar;
    }

    private addTriangle(i0: number, i1: number, i2: number, a: number, b: number, c: number): number {
        const t = this.trianglesLength;
        this.triangles[t] = i0;
        this.triangles[t + 1] = i1;
        this.triangles[t + 2] = i2;
        this.link(t, a);
        this.link(t + 1, b);
        this.link(t + 2, c);
        this.trianglesLength += 3;
        return t;
    }

    private insertNode(i: number, prev: Node | null = null): Node {
        const node: Node = {
            i,
            p: this.points[i],
            t: 0,
            prev: null,
            next: null,
            removed: false
        };

        if (!prev) {
            node.prev = node;
            node.next = node;
        } else {
            node.next = prev.next;
            node.prev = prev;
            prev.next!.prev = node;
            prev.next = node;
        }
        return node;
    }

    private static removeNode(node: Node): Node {
        node.prev!.next = node.next;
        node.next!.prev = node.prev;
        node.removed = true;
        return node.prev!;
    }
}

export function delaunayTriangulate(points: Point[]): Triangle[] {
    const delaunay = new DelaunayTriangulator(points);
    const triangles: Triangle[] = [];
    for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const tri = new Triangle(
            points[delaunay.triangles[i]],
            points[delaunay.triangles[i + 1]],
            points[delaunay.triangles[i + 2]]
        );
        triangles.push(tri);
    }
    return triangles;
}
