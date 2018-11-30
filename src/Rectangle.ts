import { CellAutomaton, CellState } from "./cells";
import { Shape } from "./Shape";

export class Rectangle extends Shape {
    public readonly width: number;
    public readonly height: number;
    public readonly left: number;
    public readonly right: number;
    public readonly top: number;
    public readonly bottom: number;
    public readonly startIndex: number;
    public readonly centerX: number;
    public readonly centerY: number;
    public readonly area: number;

    constructor(
        system: CellAutomaton,
        public readonly x: number,
        public readonly y: number,
        width: number,
        height: number
    ) {
        super(system);
        const w = this.width = Math.max(1, width);
        const h = this.height = Math.max(1, height);
        this.left = x;
        this.right = x + w;
        this.top = y;
        this.bottom = y + h;
        this.startIndex = y * this.system.width + x;
        this.centerX = this.x + Math.floor(this.width / 2);
        this.centerY = this.y + Math.floor(this.height / 2);
        this.area = width * height;
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

    public translate(dx: number, dy: number): Rectangle {
        return new Rectangle(this.system, this.x + dx, this.y + dy, this.width, this.height);
    }

    public intersects(rect: Rectangle): boolean {
        return this.x < rect.right && this.right > rect.x &&
               this.y < rect.bottom && this.bottom > rect.y;
    }
}

export class RectangleFactory {
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
