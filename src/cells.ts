import { Black, Palette, Red, White } from "./color";
import { CommandRunner } from "./CommandRunner";
import { Vec2 } from "./geometry";
import { linearScale } from "./math";
import { MersenneTwister } from "./mt";
import { Polygon, PolygonFactory } from "./Polygon";
import { Rectangle, RectangleFactory } from "./Rectangle";
import { Shape } from "./Shape";
import { StrictMap } from "./StrictMap";
import { assertNotNull, enumValues } from "./utils";

const TILE_SZ = 32;

export enum CellState {
    Dead,
    MIN = Dead,
    Dying,
    Alive,
    MAX = Alive
}

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
    Shrink,
    Invert,
    Dunno
}

type Cell = [/*x*/number, /*y*/number, CellState];

enum DrawStyle {
    Fill,
    Outline
}

export class CellAutomaton {
    protected readonly ruleMap: StrictMap<RuleKind, Rule> = new StrictMap([
        [RuleKind.VichniacVote, this.ruleVichniacVote],
        [RuleKind.Grow, this.ruleGrow],
        [RuleKind.Shrink, this.ruleShrink],
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
    protected width_: number;
    protected height_: number;
    protected grid1: Grid;
    protected grid2: Grid;
    protected readGrid: Grid;
    protected writeGrid: Grid;
    protected centerX_: number;
    protected centerY_: number;
    public readonly rectangle: RectangleFactory = new RectangleFactory(this);
    public readonly polygon: PolygonFactory = new PolygonFactory(this);
    public ctx?: CanvasRenderingContext2D;
    public palette?: Palette;
    protected bounds_: Rectangle;
    protected cellStorage: StrictMap<string, CellAutomaton> = new StrictMap();
    protected shapeStorage: StrictMap<string, Shape> = new StrictMap();

    constructor(
        width: number,
        height: number,
        grid?: Grid
    ) {
        this.width_ = width;
        this.height_ = height;
        this.rule = this.ruleVichniacVote;
        if (grid === undefined) {
            this.grid1 = new Grid(width * height);
        } else {
            this.grid1 = grid;
        }
        this.grid2 = new Grid(width * height);
        this.readGrid = this.grid1;
        this.writeGrid = this.grid2;
        this.centerX_ = Math.floor(width / 2);
        this.centerY_ = Math.floor(height / 2);
        this.bounds_ = new Rectangle(this, 0, 0, width, height);
    }

    public get width(): number {
        return this.width_;
    }

    public get height(): number {
        return this.height_;
    }

    public get centerX(): number {
        return this.centerX_;
    }

    public get centerY(): number {
        return this.centerY_;
    }

    public get bounds(): Rectangle {
        return this.bounds_;
    }

    public get grid(): Grid {
        return this.readGrid;
    }

    public withinBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    public clear() {
        this.readGrid.fill(CellState.Dead);
    }

    public setIndices(indices: Array<number>, value: CellState) {
        for (const i of indices) {
            this.writeGrid[i] = value;
        }
        this.swapGrids();
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
        for (const [, , n] of this.vonNeumannNeighbors(this.readGrid, x, y)) {
            if (n !== CellState.Dead) {
                return CellState.Alive;
            }
        }
        return CellState.Dead;
    }

    protected ruleShrink(idx: number, x: number, y: number): CellState {
        const state = this.readGrid[idx];
        if (state === CellState.Dead) {
            return CellState.Dead;
        }
        for (const [, , n] of this.vonNeumannNeighbors(this.readGrid, x, y)) {
            if (n === CellState.Dead) {
                return CellState.Dead;
            }
        }
        return state;
    }

    protected ruleInvert(idx: number, _x: number, _y: number): CellState {
        return this.readGrid[idx] ^ 1;
    }

    protected ruleDunno(idx: number, x: number, y: number): CellState {
        const state = this.readGrid[idx];
        let numAlive = 0;
        for (const [, , n] of this.mooreNeighbors(this.readGrid, x, y)) {
            if (n !== CellState.Dead) {
                numAlive++;
            }
        }
        if (state === CellState.Alive) {
            if (numAlive > 3) {
                return CellState.Alive;
            } else {
                return CellState.Dead;
            }
        } else {
            if (numAlive > 4) {
                return CellState.Alive;
            }
        }
        return state;
    }

    public useRule(kind: RuleKind, n: number = 0) {
        this.rule = this.ruleMap.get(kind);
        if (n > 0) {
            this.update(n);
        }
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

    public subtract(subtrahend: CellAutomaton, ox: number = 0, oy: number = 0) {
        const ex = ox + subtrahend.width;
        const ey = oy + subtrahend.height;
        for (let y = oy, i = 0; y < ey; y++) {
            for (let x = ox; x < ex; x++, i++) {
                const j = y * this.width + x;
                this.readGrid[j] = Math.max(this.readGrid[j] - subtrahend.grid[i], CellState.MIN);
            }
        }
    }

    public add(addend: CellAutomaton, ox: number = 0, oy: number = 0) {
        const ex = ox + addend.width;
        const ey = oy + addend.height;
        for (let y = oy, i = 0; y < ey; y++) {
            for (let x = ox; x < ex; x++, i++) {
                const j = y * this.width + x;
                this.readGrid[j] = Math.min(this.readGrid[j] + addend.grid[i], CellState.MAX);
            }
        }
    }

    public xor(other: CellAutomaton, ox: number = 0, oy: number = 0) {
        const ex = ox + other.width;
        const ey = oy + other.height;
        for (let y = oy, i = 0; y < ey; y++) {
            for (let x = ox; x < ex; x++, i++) {
                const j = y * this.width + x;
                this.readGrid[j] = Math.min(this.readGrid[j] ^ other.grid[i], CellState.MAX);
            }
        }
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

    public getBoundingBox(exclude: CellState): Rectangle {
        const w = this.width;
        const h = this.height;
        const data = this.readGrid;
        const len = data.length;
        let top: number = 0,
            bottom: number = w * (h - 1),
            left: number = 0,
            right: number = w - 1;
        for (let i = 0; i < len; i++) {
            if (data[i] !== exclude) {
                top = i;
                break;
            }
        }
        for (let i = len - 1; i >= 0; i--) {
            if (data[i] !== exclude) {
                bottom = i;
                break;
            }
        }
        left_loop:
        for (let x = 0; x < w; x++) {
            for (let i = x; i < len; i += w) {
                if (data[i] !== exclude) {
                    left = i;
                    break left_loop;
                }
            }
        }
        right_loop:
        for (let x = w - 1; x >= 0; x--) {
            for (let i = x; i < len; i += w) {
                if (data[i] !== exclude) {
                    right = i;
                    break right_loop;
                }
            }
        }
        const x1 = left % w;
        const y1 = Math.floor(top / w);
        const x2 = right % w;
        const y2 = Math.floor(bottom / w);
        return new Rectangle(
            this,
            x1,
            y1,
            x2 - x1 + 1,
            y2 - y1 + 1
        );
    }

    public getOutline(exclude: CellState, bounds: Rectangle = this.bounds): Array<number> {
        const outline: Array<number> = [];
        const data = this.readGrid;
        const width = this.width;
        const first = bounds.startIndex;
        const x2 = first + bounds.width + 1;
        const offsetRight = bounds.width;
        const offsetBottom = width * bounds.height;
        const lastRow = first + width * bounds.height;
        const stack: Array<number> = [];
        const visited: Set<number> = new Set();
        for (let top = first; top < x2; top++) {
            const bottom = top + offsetBottom;
            visited.add(top);
            visited.add(bottom);
            if (data[top] === exclude) {
                stack.push(top);
            } else {
                outline.push(top);
            }
            if (data[bottom] === exclude) {
                stack.push(bottom);
            } else {
                outline.push(bottom);
            }
        }
        for (let left = first + width; left < lastRow; left += width) {
            const right = left + offsetRight;
            visited.add(left);
            visited.add(right);
            if (data[left] === exclude) {
                stack.push(left);
            } else {
                outline.push(left);
            }
            if (data[right] === exclude) {
                stack.push(right);
            } else {
                outline.push(right);
            }
        }
        while (stack.length > 0) {
            const i = stack.pop()!;
            const n = i - width;
            const e = i + 1;
            const s = i + width;
            const w = i - 1;
            const dirs = [n, e, s, w];
            for (const dir of dirs) {
                if (!visited.has(dir)) {
                    const x = dir % width;
                    const y = Math.floor(dir / width);
                    if (x >= bounds.x && x < bounds.right && y >= bounds.y && y < bounds.bottom) {
                        visited.add(dir);
                        if (data[dir] === exclude) {
                            stack.push(dir);
                        } else {
                            outline.push(dir);
                        }
                    }
                }
            }
        }
        const start = outline[0];
        const sorted: Array<number> = [start];
        visited.delete(start);
        let cur = start;
        sort_loop:
        while (outline.length > 0) {
            const n = cur - width;
            const ne = n + 1;
            const e = cur + 1;
            const se = e + width;
            const s = cur + width;
            const sw = s - 1;
            const w = cur - 1;
            const nw = w - width;
            const dirs = [n, ne, e, se, s, sw, w, nw];
            for (const dir of dirs) {
                let idx;
                if (visited.has(dir) && (idx = outline.indexOf(dir)) > -1) {
                    sorted.push(dir);
                    visited.delete(dir);
                    outline.splice(idx, 1);
                    cur = dir;
                    continue sort_loop;
                }
            }
            for (const dir of dirs) {
                if (dir === start) {
                    sorted.push(dir);
                    break sort_loop;
                }
            }
        }
        return sorted;
    }

    public polygonize(exclude: CellState, bounds: Rectangle = this.getBoundingBox(exclude)): Polygon {
        const poly = new Polygon(this);
        const outline = this.getOutline(exclude, bounds);
        for (const i of outline) {
            const x = i % this.width;
            const y = Math.floor(i / this.width);
            poly.vertices.push([x, y]);
        }
        poly.optimize();
        return poly;
    }

    public storeCells(name: string) {
        this.cellStorage.set(name, this.clone());
    }

    public storeShape(name: string, shape: Shape) {
        this.shapeStorage.set(name, shape);
    }

    public loadCells(name: string): CellAutomaton {
        return this.cellStorage.get(name);
    }

    public loadShape(name: string): Shape {
        return this.shapeStorage.get(name);
    }

    public margin(marginSize: number) {
        const clone = this.clone();
        const m2 = marginSize * 2;
        this.width_ += m2;
        this.height_ += m2;
        const size = this.width_ * this.height_;
        this.grid1 = new Grid(size);
        this.grid2 = new Grid(size);
        this.readGrid = this.grid1;
        this.writeGrid = this.grid2;
        this.centerX_ = Math.floor(this.width_ / 2);
        this.centerY_ = Math.floor(this.height_ / 2);
        this.bounds_ = new Rectangle(this, 0, 0, this.width_, this.height_);
        this.add(clone, marginSize, marginSize);
        if (this.ctx !== undefined) {
            this.ctx.canvas.width = this.width_ * TILE_SZ;
            this.ctx.canvas.height = this.height_ * TILE_SZ;
            this.ctx.scale(TILE_SZ, TILE_SZ);
        }
    }

    public partition(minArea: number, minRatio: number, sizeVar: number, placeFreq: number, margin: number, style: DrawStyle, value: CellState): Array<Rectangle> {
        const drawn: Array<Rectangle> = [];
        const stack: Array<Rectangle> = [this.bounds.shrink(1)];
        while (stack.length > 0) {
            const rect = stack.pop()!;
            if (rect.area >= minArea) {
                if (rect.width > rect.height) {
                    const halfw = rect.width / 2;
                    const variance = Math.floor(halfw * sizeVar);
                    const splitw = Math.floor(halfw + (this.rng.genrand_int32() % (variance + 1)) - (variance / 2));
                    const left = this.rectangle.at(rect.x, rect.y, splitw - margin, rect.height);
                    const right = this.rectangle.at(rect.x + splitw, rect.y, rect.width - splitw, rect.height);
                    if (this.rng.genrand_int32() % 2) {
                        stack.push(left, right);
                    } else {
                        stack.push(right, left);
                    }
                } else {
                    const halfh = rect.height / 2;
                    const variance = Math.floor(halfh * sizeVar);
                    const splith = Math.floor(halfh + (this.rng.genrand_int32() % (variance + 1)) - (variance / 2)) ;
                    const top = this.rectangle.at(rect.x, rect.y, rect.width, splith - margin);
                    const bottom = this.rectangle.at(rect.x, rect.y + splith, rect.width, rect.height - splith);
                    if (this.rng.genrand_int32() % 2) {
                        stack.push(top, bottom);
                    } else {
                        stack.push(bottom, top);
                    }
                }
            } else if (Math.min(rect.width / rect.height, rect.height / rect.width) > minRatio) {
                if (this.rng.random() < placeFreq) {
                    switch (style) {
                    case DrawStyle.Fill:
                        rect.fill(value);
                        break;
                    case DrawStyle.Outline:
                        rect.outline(value);
                        break;
                    }
                    drawn.push(rect);
                }
            }
        }
        return drawn;
    }

    public random(freq: number, value: CellState) {
        for (let i = 0; i < this.readGrid.length; i++) {
            if (this.rng.random() < freq) {
                this.readGrid[i] = value;
            }
        }
    }

    // nearest neighbor
    public scale(scale: number) {
        const clone = this.clone();
        this.width_ = Math.floor(this.width_ * scale);
        this.height_ = Math.floor(this.height_ * scale);
        const size = this.width_ * this.height_;
        this.grid1 = new Grid(size);
        this.grid2 = new Grid(size);
        this.readGrid = this.grid1;
        this.writeGrid = this.grid2;
        this.centerX_ = Math.floor(this.width_ / 2);
        this.centerY_ = Math.floor(this.height_ / 2);
        this.bounds_ = new Rectangle(this, 0, 0, this.width_, this.height_);
        for (let y = 0; y < this.height_; y++) {
            const sy = Math.floor(y / scale);
            for (let x = 0; x < this.width_; x++) {
                const sx = Math.floor(x / scale);
                const i = y * this.width_ + x;
                const si = sy * clone.width_ + sx;
                this.readGrid[i] = clone.grid[si];
            }
        }
        if (this.ctx !== undefined) {
            this.ctx.canvas.width = this.width_ * TILE_SZ;
            this.ctx.canvas.height = this.height_ * TILE_SZ;
            this.ctx.scale(TILE_SZ, TILE_SZ);
        }
    }
}

const container = document.body.appendChild(document.createElement("div"));
container.style.display = "inline-block";
function village(): [CellAutomaton, CommandRunner] {
    const palette = [Black, Red, White];
    const ca = new CellAutomaton(30, 30);
    const canvas = container.appendChild(document.createElement("canvas"));
    canvas.style.backgroundColor = Black;
    const ctx = assertNotNull(canvas.getContext("2d"));
    canvas.width = ca.width * TILE_SZ;
    canvas.height = ca.height * TILE_SZ;
    ctx.scale(TILE_SZ, TILE_SZ);
    ca.bindParams(ctx, palette);

    const margin = 60;
    const commands = new CommandRunner([
        () => {
            ca.bounds.shrink(ca.rng.genrand_int32() % 5).fill(CellState.Alive);
            ca.draw();
            ca.storeCells("border");
            ca.clear();
        },
        () => {
            let entrance: Rectangle;
            const entranceSize = ca.rng.genrand_int32() % 2 + 6;
            const entranceSizeHalf = Math.floor(entranceSize / 2);
            const entranceLengthMul = 3;
            if (ca.rng.genrand_int32() % 2) {
                const len = ca.width * entranceLengthMul;
                entrance = ca.rectangle.at(
                    ca.centerX - ca.rng.genrand_int32() % 2 * len,
                    ca.centerY - entranceSizeHalf,
                    len,
                    entranceSize
                );
            } else {
                const len = ca.width * entranceLengthMul;
                entrance = ca.rectangle.at(
                    ca.centerX - entranceSizeHalf,
                    ca.centerY - ca.rng.genrand_int32() % 2 * (len),
                    entranceSize,
                    len
                );
            }
            ca.storeShape("entrance", entrance);
            let partition: Array<Rectangle>;
            do {
                partition = ca.partition(
                    ca.rng.genrand_int32() % 150 + 40,
                    ca.rng.random() * 0.5 + 0.2,
                    0.1,
                    ca.rng.random() + 0.3,
                    ca.rng.genrand_int32() % 4 + 7 + ca.rng.genrand_int32() % 3,
                    DrawStyle.Fill,
                    CellState.Alive
                );
                const touchEntrance: Array<number> = [];
                for (let i = 0; i < partition.length; i++) {
                    const rect = partition[i];
                    if (rect.intersects(entrance)) {
                        rect.fill(CellState.Dead);
                        touchEntrance.push(i);
                    }
                }
                for (const i of touchEntrance) {
                    partition.splice(i, 1);
                }
            } while (partition.length < 3);
            if (ca.rng.genrand_int31() % 3) {
                for (const rect of partition) {
                    rect.translate(
                        ca.rng.genrand_int32() % 2 - 1,
                        ca.rng.genrand_int32() % 2 - 1
                    ).outline(CellState.Alive);
                }
            }
            ca.draw();
            return () => {
                ca.margin(margin);
                ca.draw();
                return () => {
                    ca.useRule(RuleKind.VichniacVote, ca.rng.genrand_int32() % 3);
                    ca.useRule(RuleKind.Grow, 1);
                    ca.draw();
                    ca.storeCells("houseinteriors");
                    return () => {
                        ca.useRule(RuleKind.Grow, 2);
                        ca.draw();
                        ca.storeCells("housewalls");
                        return () => {
                            for (const rect of partition) {
                                ca.rectangle.around(
                                    margin + rect.centerX,
                                    margin + rect.centerY,
                                    ca.rng.genrand_int32() % Math.floor(rect.height / 2) + rect.height,
                                    ca.rng.genrand_int32() % Math.floor(rect.width / 2) + rect.width
                                ).outline(CellState.Alive);
                            }
                            ca.draw();
                        };
                    };
                };
            };
        },
        () => {
            ca.add(ca.loadCells("border"), margin, margin);
            ca.draw();
        },
        () => {
            ca.useRule(RuleKind.Grow, ca.rng.genrand_int32() % 3 + 3);
            ca.useRule(RuleKind.VichniacVote, ca.rng.genrand_int32() % 2);
            ca.useRule(RuleKind.Grow, 1);
            ca.draw();
            ca.storeCells("villageinterior");
        },
        () => {
            ca.useRule(RuleKind.Grow, ca.rng.genrand_int32() % 2 + 4);
            ca.draw();
        },
        () => {
            ca.subtract(ca.loadCells("villageinterior"));
            ca.draw();
        },
        () => {
            ca.loadShape("entrance").translate(margin, margin).fill(CellState.Dead);
            ca.draw();
        },
        () => {
            ca.useRule(RuleKind.VichniacVote, 2);
            ca.quantize(2);
            ca.draw();
        },
        () => {
            ca.add(ca.loadCells("housewalls"));
            ca.draw();
        },
        () => {
            ca.subtract(ca.loadCells("houseinteriors"));
            ca.draw();
        },
        () => {
            const entrance = ca.loadShape("entrance").translate(margin, margin);
            if (entrance instanceof Rectangle) {
                entrance.shrink(2).fill(CellState.Alive);
            }
            ca.draw();
        }
    ]);

    return [ca, commands];
}

function forestvillage() {
    const vill = village();
    vill[1].run();

    const palette = [Black, Red, White];
    const ca = new CellAutomaton(30, 30);
    const canvas = container.appendChild(document.createElement("canvas"));
    canvas.style.backgroundColor = Black;
    const ctx = assertNotNull(canvas.getContext("2d"));
    canvas.width = ca.width * TILE_SZ;
    canvas.height = ca.height * TILE_SZ;
    ctx.scale(TILE_SZ, TILE_SZ);
    ca.bindParams(ctx, palette);

    const commands = new CommandRunner([
        () => {
            ca.rectangle.around(ca.centerX, ca.centerY, ca.width - 19, ca.height - 11).fill(CellState.Alive);
            ca.rectangle.around(ca.centerX, ca.centerY, ca.width - 11, ca.height - 19).outline(CellState.Alive);
            ca.draw();
        },
        () => {
            ca.useRule(RuleKind.VichniacVote, 10);
            ca.draw();
        },
        () => {
            ca.random(0.40, CellState.Alive);
            ca.draw();
        },
        () => {
            ca.margin(10);
            ca.draw();
        },
        () => {
            ca.random(0.40, CellState.Alive);
            ca.draw();
        },
        () => {
            ca.margin(10);
            ca.draw();
        },
        () => {
            ca.useRule(RuleKind.Dunno, 10);
            ca.draw();
            ca.storeCells("pathinner");
        },
        () => {
            ca.useRule(RuleKind.Grow, 1);
            ca.draw();
        },
        () => {
            ca.subtract(ca.loadCells("pathinner"));
            ca.draw();
            ca.storeCells("central");
        },
        () => {
            const central = ca.clone();
            central.floodFill(ca.centerX, ca.centerY, CellState.Alive);
            central.subtract(ca);
            ca.clear();
            ca.add(central);
            ca.useRule(RuleKind.Grow, 1);
            ca.draw();
        },
        () => {
            ca.subtract(ca.loadCells("pathinner"));
            ca.draw();
        },
        () => {
            ca.scale(3);
            ca.draw();
        },
        () => {
            ca.useRule(RuleKind.VichniacVote, 10);
            ca.quantize(2);
            ca.draw();
            ca.storeCells("path");
        },
        () => {
            ca.useRule(RuleKind.Shrink, 1);
            ca.draw();
        },
        () => {
            ca.add(vill[0], ca.centerX - Math.floor(vill[0].width / 2), ca.centerY - Math.floor(vill[0].height / 2));
            ca.draw();
        },
        () => {
            const path = ca.loadCells("path");
            const clone = path.clone();
            clone.floodFill(0, 0, CellState.Alive);
            clone.subtract(path);
            ca.subtract(clone);
            ca.draw();
        }
    ]);

    commands.run();
}

forestvillage();
