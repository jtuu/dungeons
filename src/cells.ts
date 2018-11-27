import { Black, Palette, White } from "./color";
import { linearScale } from "./math";
import { MersenneTwister } from "./mt";
import { StrictMap } from "./StrictMap";
import { assertNotNull, enumValues } from "./utils";

const TILE_SZ = 4;

enum CellState {
    Dead,
    MIN = Dead,
    Dying,
    Alive,
    MAX = Alive
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
    
    public fill(value: CellState) {
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
        this.fill(CellState.Dead);
    }

    public outline(value: CellState) {
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

    public fill(x: number, y: number, w: number, h: number, value: CellState): Rectangle {
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

type Rule = (idx: number, x: number, y: number) => CellState;

enum RuleKind {
    VichniacVote,
    Grow,
    Invert,
    Dunno
}

type Cell = [/*x*/number, /*y*/number, CellState];

class CellAutomaton {
    protected readonly ruleMap: StrictMap<RuleKind, Rule> = new StrictMap([
        [RuleKind.VichniacVote, this.ruleVichniacVote],
        [RuleKind.Grow, this.ruleGrow],
        [RuleKind.Invert, this.ruleInvert],
        [RuleKind.Dunno, this.ruleDunno]
    ]);
    protected static readonly mooreOffsets: Array<Vec2> = [
        NW,  N, NE,
         W,      E,
        SW,  S, SE
    ];
    protected static readonly vonNeumannOffsets: Array<Vec2> = [
             N,
         W,      E,
             S
    ];
    public readonly rng: MersenneTwister = new MersenneTwister();
    public rule: Rule;
    protected readonly grid1: Grid;
    protected readonly grid2: Grid;
    protected readGrid: Grid;
    protected writeGrid: Grid;
    public readonly centerX: number;
    public readonly centerY: number;
    public readonly rectangle: RectangleFactory = new RectangleFactory(this);
    public ctx?: CanvasRenderingContext2D;
    public palette?: Palette;

    constructor(
        public readonly width: number,
        public readonly height: number,
        grid?: Grid
    ) {
        this.rule = this.ruleVichniacVote;
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

    protected *neighbors(grid: Grid, cx: number, cy: number, offsets: Array<Vec2>): IterableIterator<Cell> {
        for (const [ox, oy] of offsets) {
            const x = cx + ox;
            const y = cy + oy;
            if (this.withinBounds(x, y)) {
                yield [x, y, grid[y * this.width + x]];
            }
        }
    }

    protected mooreNeighbors(grid: Grid, cx: number, cy: number): IterableIterator<Cell> {
        return this.neighbors(grid, cx, cy, CellAutomaton.mooreOffsets);
    }

    protected vonNeumannNeighbors(grid: Grid, cx: number, cy: number): IterableIterator<Cell> {
        return this.neighbors(grid, cx, cy, CellAutomaton.vonNeumannOffsets);
    }

    protected async drawWith(ctx: CanvasRenderingContext2D, palette: Palette, async: boolean = false) {
        for (let y = 0; y < this.height; y++) {
            ctx.clearRect(0, y, ctx.canvas.width, 1);
            for (let x = 0; x < this.width; x++) {
                const value = this.readGrid[y * this.width + x];
                if (value !== CellState.Dead) {
                    const color = palette[value % palette.length];
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            if (async && y % 2 === 0) {
                await new Promise(resolve => {
                    requestAnimationFrame(resolve);
                });
            }
        }
    }

    public async draw(ctx: CanvasRenderingContext2D | undefined = this.ctx, palette: Palette | undefined = this.palette) {
        if (ctx === undefined || palette === undefined) {
            throw new Error("Parameters not bound and arguments missing");
        }
        this.drawWith(ctx, palette);
    }

    public async drawAsync() {
        if (this.ctx === undefined || this.palette === undefined) {
            throw new Error("Parameters not bound");
        }
        return this.drawWith(this.ctx, this.palette, true);
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

    protected ruleVichniacVote(idx: number, x: number, y: number): CellState {
        const state = this.readGrid[idx];
        let nextState = CellState.Dead;
        let numAlive = 0;
        if (state !== CellState.Dead) {
            numAlive++;
        }
        for (const [, , n] of this.mooreNeighbors(this.readGrid, x, y)) {
            if (n !== CellState.Dead) {
                numAlive++;
            }
        }
        if (numAlive <= 4) {
            nextState = CellState.Dead;
        } else {
            nextState = CellState.Alive;
        }
        if (numAlive === 4 || numAlive === 5) {
            nextState ^= 1;
        }
        return nextState;
    }

    protected ruleGrow(idx: number, x: number, y: number): CellState {
        const state = this.readGrid[idx];
        if (state !== CellState.Dead) {
            return CellState.Alive;
        }
        for (const [, , n] of this.mooreNeighbors(this.readGrid, x, y)) {
            if (n !== CellState.Dead) {
                return CellState.Alive;
            }
        }
        return CellState.Dead;
    }

    protected ruleInvert(idx: number, _x: number, _y: number): CellState {
        return this.readGrid[idx] ^ 1;
    }

    protected ruleDunno(idx: number, _x: number, _y: number): CellState {
        const state = this.readGrid[idx];
        return state;
    }

    public useRule(kind: RuleKind) {
        this.rule = this.ruleMap.get(kind);
    }

    public updateOnce() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                const nextState = this.rule(idx, x, y);
                this.writeGrid[idx] = nextState;
            }
        }
    }

    public update(n: number) {
        for (let i = 0; i < n; i++) {
            this.updateOnce();
            this.swapGrids();
        }
    }

    public bindParams(ctx: CanvasRenderingContext2D, palette: Palette) {
        this.ctx = ctx;
        this.palette = palette;
    }

    public run(ctx: CanvasRenderingContext2D | undefined = this.ctx, palette: Palette | undefined = this.palette) {
        if (ctx === undefined || palette === undefined) {
            throw new Error("Parameters not bound and arguments missing");
        }
        const loop = () => {
            this.drawWith(ctx, palette);
            this.updateOnce();
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

    public subtract(subtrahend: CellAutomaton) {
        for (let i = 0; i < this.writeGrid.length; i++) {
            this.writeGrid[i] = Math.max(this.readGrid[i] - subtrahend.grid[i], CellState.MIN);
        }
        this.swapGrids();
    }

    public async floodFill(x0: number, y0: number, value: CellState, animate: boolean = false) {
        let i = 0;
        const stack: Array<Cell> = [[x0, y0, this.readGrid[y0 * this.width + x0]]];
        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const idx = y * this.width + x;
            const state = this.readGrid[idx];
            if (state < value) {
                this.readGrid[idx] = value;
                for (const n of this.vonNeumannNeighbors(this.readGrid, x, y)) {
                    if (n[2] < value) {
                        stack.push(n);
                    }
                }
                if (animate && ++i % 500 === 0) {
                    await new Promise(resolve => {
                        this.draw();
                        requestAnimationFrame(resolve);
                    });
                }
            }
        }
    }

    public quantize(n: number) {
        const origCount = CellState.MAX - CellState.MIN;
        const newCount = Math.max(1, n - 1);
        const sampleMap: Array<CellState> = [];
        for (const val of enumValues(CellState)) {
            sampleMap[val] = linearScale(Math.floor(linearScale(val, 0, origCount, 0, newCount)), 0, newCount, 0, origCount);
        }
        for (let i = 0; i < this.readGrid.length; i++) {
            this.readGrid[i] = sampleMap[this.readGrid[i]];
        }
    }

    public findNearest(x0: number, y0: number, value: CellState): Cell | null {
        const stack: Array<Cell> = [[x0, y0, this.readGrid[y0 * this.width + x0]]];
        while (stack.length > 0) {
            const cell = stack.pop()!;
            if (cell[2] === value) {
                return cell; 
            } else {
                stack.push(...this.vonNeumannNeighbors(this.readGrid, cell[0], cell[1]));
            }
        }
        return null;
    }
}

type Command = () => void | Command;

function* processCommands(commands: Array<Command>): IterableIterator<void> {
    let cmd;
    while ((cmd = commands.shift()) !== undefined) {
        const subcmd = cmd();
        yield;
        if (typeof subcmd === "function") {
            commands.unshift(subcmd);
        }
    }
}

function runCommands(commands: Array<Command>) {
    const iter = processCommands(commands);
    let cur;
    do {
        cur = iter.next();
    } while (!cur.done);
}

function clickCommands(commands: Array<Command>) {
    const iter = processCommands(commands);
    window.addEventListener("click", () => {
        iter.next();
    });
}

const container = document.body.appendChild(document.createElement("div"));
container.style.display = "inline-block";
function main() {
    const numPerSide = 4;
    const palette = [Black, White, White];
    const ca = new CellAutomaton(50 * numPerSide, 50 * numPerSide);
    const canvas = container.appendChild(document.createElement("canvas"));
    canvas.style.backgroundColor = Black;
    const ctx = assertNotNull(canvas.getContext("2d"));
    canvas.width = ca.width * TILE_SZ;
    canvas.height = ca.height * TILE_SZ;
    ctx.scale(TILE_SZ, TILE_SZ);
    ca.bindParams(ctx, palette);

    const draw = ca.draw.bind(ca);
    const commands = [
        () => {
            const roomAreaSize = ca.width / numPerSide;
            const roomAreaSizeHalf = roomAreaSize / 2;
            for (let j = 0; j < numPerSide * numPerSide; j++) {
                let ox = roomAreaSize * j + roomAreaSizeHalf;
                let oy = Math.floor(j / numPerSide) * roomAreaSize + roomAreaSizeHalf;
                for (let i = 0; i < 3; i++) {
                    const dx = ca.rng.genrand_int32() % 10 - 5;
                    const dy = ca.rng.genrand_int32() % 10 - 5;
                    const x = ox + dx;
                    const y = oy + dy;
                    ox = x;
                    oy = y;
                    const w = ca.rng.genrand_int32() % (10 - Math.floor(Math.abs(dx / 2))) + 5;
                    const h = ca.rng.genrand_int32() % (10 - Math.floor(Math.abs(dy / 2))) + 5;
                    const rect = ca.rectangle.around(x, y, w, h);
                    rect.fill(CellState.Alive);
                    rect.shrink(2).outline(CellState.Dead);
                    rect.grow(4).outline(CellState.Alive);
                }
            }
            draw();
        },
        ...Array(4).fill(() => {
            ca.useRule(RuleKind.VichniacVote);
            ca.update(1);
            draw();
        }),
        () => {
            const clone = ca.clone();
            ca.useRule(RuleKind.Grow);
            ca.update(1);
            draw();
            return () => {
                ca.useRule(RuleKind.VichniacVote);
                ca.update(1);
                draw();
                return () => {
                    ca.quantize(2);
                    clone.quantize(2);
                    ca.subtract(clone);
                    draw();
                };
            };
        },
        () => {
            ca.floodFill(0, 0, CellState.Alive).then(() => {
                ca.draw();
            });
        },
        () => {
            ca.useRule(RuleKind.Invert);
            ca.update(1);
            draw();
        }
    ];

    runCommands(commands);
}

main();
