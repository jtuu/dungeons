import { delaunayTriangulate } from "./delaunay";
import { CubicBezierCurve, Path, Point, Rectangle } from "./geometry";
import { Rng } from "./random";
import { identityIterator, reverseIterator } from "./utils";

export const rng = new Rng();
console.log(rng.seed);
const canvas = document.body.appendChild(document.createElement("canvas"));
const ctx = canvas.getContext("2d");
if (!ctx) {
    throw new Error("Could not get canvas context");
}
const worldW = canvas.width = 300;
const worldH = canvas.height = 300;

class Room extends Rectangle {
  constructor(x: number, y: number, w: number, h: number) {
        super(x, y, w, h);
    }
    
    public draw(ctx: CanvasRenderingContext2D) {
        const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        const i0 = (this.y * ctx.canvas.width + this.x) * 4;
        const i1 = ((this.y + 1) * ctx.canvas.width + this.x) * 4;
        const roomW = this.w * 4;
        const rowW = ctx.canvas.width * 4;
        const i0end = i0 + roomW;
        // draw first row
        for (let i = i0; i < i0end; i += 4) {
            imgData.data[i + 0] = 0;
            imgData.data[i + 1] = 0;
            imgData.data[i + 2] = 0;
            imgData.data[i + 3] = 255;
        }
        // copy the rest
        for (let i = i1; i < i1 + rowW * this.h - rowW; i += rowW) {
            imgData.data.copyWithin(i, i0, i0end);
        }
        ctx.putImageData(imgData, 0, 0);
    }

    public randomFacePoint(dir: Direction): Point {
        switch (dir) {
            case Direction.N:
                return new Point(rng.randomInt(this.x + 1, this.right - 1), this.y);
            case Direction.E:
                return new Point(this.right, rng.randomInt(this.y + 1, this.bottom - 1));
            case Direction.S:
                return new Point(rng.randomInt(this.x + 1, this.right - 1), this.bottom);
            case Direction.W:
                return new Point(this.x, rng.randomInt(this.y + 1, this.bottom - 1));
        }
    } 
}

class Grid {
    public readonly size: number;
    protected readonly items: Uint8Array;
    
    constructor(public readonly w: number, public readonly h: number) {
        this.size = w * h;
        this.items = new Uint8Array(this.size);
    }
    
    public set(x: number, y: number) {
        this.items[y * this.w + x] = 1;
    }
    
    public unset(x: number, y: number) {
        this.items[y * this.w + x] = 0;
    }
    
    public get(x: number, y: number): number {
        return this.items[y * this.w + x];
    }

    public get [Symbol.iterator]() {
        return this.items[Symbol.iterator];
    }
    
    public *rows(start: number = 0, end: number = this.h - 1): IterableIterator<Uint8Array> {
        for (let i = start * this.w; i < end * this.w; i += this.w) {
            yield this.items.subarray(i, i + this.w);
        }
    }
    
    public *columns(start: number = 0, end: number = this.w - 1): IterableIterator<Uint8Array> {
        for (let x = start; x <= end; x++) {
            const col = new Uint8Array(this.h);
            for (let y = 0; y < this.h; y++) {
                col[y] = this.get(x, y);
            }
            yield col;
        }
    }
}

enum Direction {
    N, E, S, W
}

const directions = [Direction.N, Direction.E, Direction.S, Direction.W];

type Corridor = Path | CubicBezierCurve;

class Dungeon {
    protected center = new Point(worldW / 2 | 0, worldH / 2 | 0);
    protected grid = new Grid(worldW, worldH);
    protected dirtyBounds = new Rectangle(this.center.x, this.center.y, 0, 0) as Mutable<Rectangle>;
    public rooms: Room[] = [];
    public doors: Point[] = [];
    public corridors: Corridor[] = [];

    protected static minRoomSize = 10;
    protected static minFaceLength = Dungeon.minRoomSize + 1;
    protected static maxRoomSize = 20;
    protected static roomSpacing = 2;
    protected static layers = 6;
    
    constructor() {
        const firstRoom = Dungeon.getRandomRoom(this.center.x, this.center.y);
        this.addRoom(firstRoom);

        for (let i = 0; i < Dungeon.layers; i++) {
            for (const dir of directions) {
                this.placeRooms(dir);
            }
        }

        const doorMap: WeakMap<Room, Point[]> = new WeakMap();
        for (const room of this.rooms) {
            const pts = directions.map(dir => room.randomFacePoint(dir));
            this.doors.push(...pts);
            doorMap.set(room, pts);
        }
        
        const tris = delaunayTriangulate(this.doors);

        const usedPoints: WeakSet<Point> = new WeakSet();
        for (const room of this.rooms) {
            const doors = doorMap.get(room);
            if (!doors) { continue; }

            tri_loop:
            for (const tri of tris) {
                let i = 0;
                // find triangles that only have one point on this room
                for (const triPt of tri.points) {
                    for (let dir = 0; dir < doors.length; dir++) {
                        const door = doors[dir];
                        // too horizontal
                        if ((dir === Direction.N || dir === Direction.S) && tri.points.some(other => other.x !== triPt.x && other.y === triPt.y)) {
                            continue tri_loop;
                        }
                        // too vertical
                        if ((dir === Direction.E || dir === Direction.W) && tri.points.some(other => other.y !== triPt.y && other.x === triPt.x)) {
                            continue tri_loop;
                        }
                        if (triPt.is(door)) {
                            i++;
                        }
                    }
                }
                if (i === 1) {
                    const good = tri.sides.filter(side => {
                        for (const otherRoom of this.rooms) {
                            if (otherRoom.intersectsPath(side)) {
                                return false;
                            }
                        }
                        return true;
                    }).sort((a, b) => b.length - a.length);
                    if (good.length) {
                        const path = good[0];
                        if (!path.first.is(path.last) && !usedPoints.has(path.first)) {
                            if (path.length > 15) {
                                this.corridors.push(CubicBezierCurve.between(path.first, path.last));
                            } else {
                                this.corridors.push(path);
                            }
                            usedPoints.add(path.last);
                        }
                    }
                }
            }
        }
    }

    private createFace(rot90: boolean, flip: boolean, a0: number, b0: number, a1: number, b1: number): Path {
        const m = [
            [b0, a0],
            [b1, a1]
        ];
        if (flip) {
            m[0][0] = this.grid.w - m[0][0] - 1;
            m[1][0] = this.grid.w - m[1][0] - 1;
        }
        if (rot90) {
            m[0].reverse();
            m[1].reverse();
        }
        return new Path(
            new Point(m[0][0], m[0][1]),
            new Point(m[1][0], m[1][1])
        );
    }
    
    protected findFaces(dir: Direction): Path[] {
        const rot90 = dir === Direction.N || dir === Direction.S;
        const flip = dir === Direction.E || dir === Direction.S;
        const sequences = rot90 ?
              this.grid.columns(this.dirtyBounds.x - 1, this.dirtyBounds.x + this.dirtyBounds.w + 1) :
              this.grid.rows(this.dirtyBounds.y - 1, this.dirtyBounds.y + this.dirtyBounds.h + 1);
        const iterate = flip ? reverseIterator : identityIterator;
        const createFace: (a0: number, b0: number, a1: number, b1: number) => Path = this.createFace.bind(this, rot90, flip);
        
        const faces: Path[] = [];
        const maxDepth = rot90 ? this.grid.h : this.grid.w;
        let i = rot90 ? this.dirtyBounds.x - 1 : this.dirtyBounds.y - 1;
        let startFound = false;
        let a0 = -1, b0 = -1; // orientation agnostic "x" and "y"
        // go through rows/cols depth-first
        for (const seq of sequences) {
            let depth = 0;
            // go through elements of row/col
            for (const val of iterate(seq)) {
                // did we hit a wall
                if (val) {
                    // are we already tracing a face
                    if (startFound) {
                        // if this wall is not at the same depth as the face
                        // that we're tracing then mark this as the end of the face
                        if (depth !== b0) {
                            faces.push(createFace(a0, b0, i - 1, b0));
                            
                            // also start tracing the next face
                            a0 = i;
                            b0 = depth;
                        }
                    } else {
                        // start tracing a new face
                        a0 = i;
                        b0 = depth;
                        startFound = true;
                    }
                    break;
                } else if (startFound && depth + 1 >= maxDepth) {
                    // hit max depth i.e. fell of the face
                    faces.push(createFace(a0, b0, i - 1, b0));
                    startFound = false;
                    break;
                }
                depth++;
            }
            i++;
        }
        
        return faces;
    }

    protected placeRooms(dir: Direction) {
        const justOne = true;
        const faces = this.findFaces(dir);

        if (justOne) {
            const face = rng.pickRandom(faces.filter(face => face.length > Dungeon.minFaceLength));
            if (face) {
                this.placeRoomOnFace(face, dir);
            }
        } else {
            for (const face of faces) {
                if (face.length > Dungeon.minFaceLength) {
                    this.placeRoomOnFace(face, dir);
                }
            }
        }
    }

    protected placeRoomOnFace(face: Path, faceDir: Direction) {
        let x = 0;
        let y = 0;
        let w = 0;
        let h = 0;
        switch (faceDir) {
            case Direction.N:
                w = rng.randomInt(Dungeon.minRoomSize, face.last.x - face.first.x);
                h = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
                x = rng.randomInt(face.first.x, face.last.x - w);
                y = face.first.y - h - Dungeon.roomSpacing + 1;
                break;
            case Direction.E:
                w = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
                h = rng.randomInt(Dungeon.minRoomSize, face.last.y - face.first.y);
                x = face.first.x + Dungeon.roomSpacing;
                y = rng.randomInt(face.first.y, face.last.y - h);
                break;
            case Direction.S:
                w = rng.randomInt(Dungeon.minRoomSize, face.last.x - face.first.x);
                h = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
                x = rng.randomInt(face.first.x, face.last.x - w);
                y = face.first.y + Dungeon.roomSpacing;
                break;
            case Direction.W:
                w = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
                h = rng.randomInt(Dungeon.minRoomSize, face.last.y - face.first.y);
                x = face.first.x - w - Dungeon.roomSpacing + 1;
                y = rng.randomInt(face.first.y, face.last.y - h);
                break;
        }
        const room = new Room(x, y, w, h);
        // reject room if it touches another room
        const outline = new Rectangle(x - 1, y - 1, w + 2, h + 2);
        for (const otherRoom of this.rooms) {
            if (outline.intersects(otherRoom)) {
                return;
            }
        }
        this.addRoom(room);
    }
    
    protected addRoom(room: Room) {
        this.rooms.push(room);
        
        for (let y = room.y; y < room.bottom; y++) {
            for (let x = room.x; x < room.right; x++) {
                this.grid.set(x, y);
            }
        }
        
        if (room.x < this.dirtyBounds.x) {
            this.dirtyBounds.w += this.dirtyBounds.x - room.x;
            this.dirtyBounds.x = room.x;
        }
        if (room.y < this.dirtyBounds.y) {
            this.dirtyBounds.h += this.dirtyBounds.y - room.y;
            this.dirtyBounds.y = room.y;
        }
        if (room.right > this.dirtyBounds.x + this.dirtyBounds.w) {
            this.dirtyBounds.w = room.right - this.dirtyBounds.x; 
        }
        if (room.bottom > this.dirtyBounds.y + this.dirtyBounds.h) {
            this.dirtyBounds.h = room.bottom - this.dirtyBounds.y; 
        }
    }

    protected static getRandomRoom(cx?: number, cy?: number): Room {
        const w = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
        const h = rng.randomInt(Dungeon.minRoomSize, Dungeon.maxRoomSize);
        if (typeof cx === "number" && typeof cy === "number") {
            return new Room(cx - w / 2 | 0, cy - h / 2 | 0, w, h);
        }
        return new Room(rng.randomInt(0, worldW - w), rng.randomInt(0, worldH - h), w, h);
    }

    public draw(ctx: CanvasRenderingContext2D) {
        this.rooms.forEach(room => room.draw(ctx));
        this.corridors.forEach(corr => corr.draw(ctx));
    }
}

for (let i = 0; i < 10; i++) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let d: Dungeon;
    try {
        d = new Dungeon();
    } catch (err) {
        continue;
    }
    
    if (d.rooms.length < 2 || d.corridors.length < d.rooms.length) {
        continue;
    }
    
    d.draw(ctx);

    break;
}
