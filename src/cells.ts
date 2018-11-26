import { Black, Palette, White } from "./color";
import { MersenneTwister } from "./mt";
import { assertNotNull } from "./utils";

const TILE_SZ = 16;

enum Cell {
    Dead,
    Alive
}

class Rectangle {
    public readonly width: number;
    public readonly height: number;
    public readonly left: number;
    public readonly right: number;
    public readonly top: number;
    public readonly bottom: number;
    public readonly startIndex: number;

    constructor(
        private readonly system: CellAutomaton,
        public readonly x: number,
        public readonly y: number,
        width: number,
        height: number
    ) {
        const w = this.width = Math.max(1, width);
        const h = this.height = Math.max(1, height);
        this.left = x;
        this.right = x + w;
        this.top = y;
        this.bottom = y + h;
        this.startIndex = y * this.system.width + x;
    }
    
    public fill(value: Cell) {
        const first = this.startIndex;
        const rowEnd = first + this.width;
        for (let i = first; i < rowEnd; i++) {
            this.system.grid[i] = value;
        }
        if (this.height > 1) {
            const stride = this.system.width;
            const second = this.startIndex + stride;
            const colEnd = this.startIndex + stride * this.height;
            for (let i = second; i < colEnd; i += stride) {
                this.system.grid.copyWithin(i, first, rowEnd);
            }
        }

    }

    public clear() {
        this.fill(Cell.Dead);
    }

    public outline(value: Cell) {
        const first = this.startIndex;
        const rowEnd = first + this.width;
        for (let i = first; i < rowEnd; i++) {
            this.system.grid[i] = value;
        }
        const stride = this.system.width;
        if (this.height > 1) {
            const lastStart = this.startIndex + stride * (this.height - 1);
            this.system.grid.copyWithin(lastStart, first, rowEnd);
        }

        const colEnd = this.y + this.height - 1;
        const rightOffset = this.x + this.width - 1;
        for (let y = this.y + 1; y < colEnd; y++) {
            const row = y * stride;
            this.system.grid[row + this.x] = value;
            this.system.grid[row + rightOffset] = value;
        }
    }

    public grow(amount: number): Rectangle {
        const amount2 = amount * 2;
        return new Rectangle(
            this.system,
            this.x - amount,
            this.y - amount,
            this.width + amount2,
            this.height + amount2
        );
    }

    public shrink(amount: number): Rectangle {
        const amount2 = amount * 2;
        return new Rectangle(
            this.system,
            this.x + amount,
            this.y + amount,
            this.width - amount2,
            this.height - amount2
        );
    }

    public clone(): Rectangle {
        return new Rectangle(this.system, this.x, this.y, this.width, this.height);
    }
}

class RectangleFactory {
    constructor(private readonly system: CellAutomaton) {}

    public at(x: number, y: number, width: number, height: number): Rectangle {
        return new Rectangle(this.system, x, y, width, height);
    }

    public around(cx: number, cy: number, width: number, height: number): Rectangle {
        const x = cx - Math.floor(width / 2);
        const y = cy - Math.floor(height / 2);
        return new Rectangle(this.system, x, y, width, height);
    }

    public fill(x: number, y: number, w: number, h: number, value: Cell): Rectangle {
        const rect = new Rectangle(this.system, x, y, w, h);
        rect.fill(value);
        return rect;
    }
}

type Vec2 = [number, number];

const  N: Vec2 = [ 0, -1];
const NE: Vec2 = [ 1, -1];
const  E: Vec2 = [ 1,  0];
const SE: Vec2 = [ 1,  1];
const  S: Vec2 = [ 0,  1];
const SW: Vec2 = [-1,  1];
const  W: Vec2 = [-1,  0];
const NW: Vec2 = [-1, -1];

type Grid = Int32Array;
const Grid = Int32Array;

class CellAutomaton {
    protected static readonly neighborOffsets: Array<Vec2> = [
        NW,  N, NE,
         W,      E,
        SW,  S, SE
    ];
    protected readonly rng: MersenneTwister = new MersenneTwister();
    protected readonly grid1: Grid;
    protected readonly grid2: Grid;
    protected readGrid: Grid;
    protected writeGrid: Grid;
    public readonly centerX: number;
    public readonly centerY: number;
    public readonly rectangle: RectangleFactory = new RectangleFactory(this);

    constructor(
        public readonly width: number,
        public readonly height: number,
        grid?: Grid
    ) {
        if (grid === undefined) {
            this.grid1 = new Grid(width * height);
        } else {
            this.grid1 = grid;
        }
        this.grid2 = new Grid(width * height);
        this.readGrid = this.grid1;
        this.writeGrid = this.grid2;
        this.centerX = Math.floor(width / 2);
        this.centerY = Math.floor(height / 2);
    }

    public get grid(): Grid {
        return this.readGrid;
    }

    public withinBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    protected *neighbors(grid: Grid, cx: number, cy: number): IterableIterator<Cell> {
        for (const [ox, oy] of CellAutomaton.neighborOffsets) {
            const x = cx + ox;
            const y = cy + oy;
            if (this.withinBounds(x, y)) {
                yield grid[y * this.width + x];
            }
        }
    }

    public draw(ctx: CanvasRenderingContext2D, palette: Palette) {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const value = this.readGrid[y * this.width + x];
                if (value !== Cell.Dead) {
                    const color = palette[value % palette.length];
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    }

    protected swapGrids() {
        if (this.readGrid === this.grid1) {
            this.grid1.set(this.grid2);
            this.readGrid = this.grid2;
            this.writeGrid = this.grid1;
        } else {
            this.grid2.set(this.grid1);
            this.readGrid = this.grid1;
            this.writeGrid = this.grid2;
        }
        this.writeGrid.fill(0);
    }

    public update() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                const state = this.readGrid[idx];
                let nextState = Cell.Dead;
                let numAlive = 0;
                if (state !== Cell.Dead) {
                    numAlive++;
                }
                for (const n of this.neighbors(this.readGrid, x, y)) {
                    if (n !== Cell.Dead) {
                        numAlive++;
                    }
                }
                if (numAlive <= 4) {
                    nextState = Cell.Dead;
                } else {
                    nextState = Cell.Alive;
                }
                if (numAlive === 4 || numAlive === 5) {
                    nextState ^= 1;
                }
                this.writeGrid[idx] = nextState;
            }
        }
    }

    public run(ctx: CanvasRenderingContext2D, palette: Palette) {
        const loop = () => {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            this.draw(ctx, palette);
            this.update();
            this.swapGrids();
            requestAnimationFrame(loop);
        };
        loop();
    }

    public clone(): CellAutomaton {
        const newGrid = new Grid(this.grid.length);
        newGrid.set(this.grid);
        return new CellAutomaton(this.width, this.height, newGrid);
    }
}

function main() {
    const palette = [Black, White];
    const ca = new CellAutomaton(100, 100);
    const canvas = document.body.appendChild(document.createElement("canvas"));
    canvas.style.backgroundColor = Black;
    const ctx = assertNotNull(canvas.getContext("2d"));
    canvas.width = ca.width * TILE_SZ;
    canvas.height = ca.height * TILE_SZ;
    ctx.scale(TILE_SZ, TILE_SZ);
    
    ca.rectangle.around(45, 40, 10, 20).fill(Cell.Alive);
    ca.rectangle.around(ca.centerX, ca.centerY, 9, 9).fill(Cell.Alive);
    ca.rectangle.around(ca.centerX - 6, ca.centerY + 5, 9, 9).outline(Cell.Alive);

    ca.run(ctx, palette);
}

main();
