import { Point } from "./geometry";

export const neighborhoodOffsets8 = [
    [-1, -1], [ 0, -1], [ 1, -1],
    [-1,  0],           [ 1,  0],
    [-1,  1], [ 0,  1], [ 1,  1]
];

export const neighborhoodOffsets4 = [
              [ 0, -1],
    [-1,  0],           [ 1,  0],
              [ 0,  1]
];

export type Color = [number, number, number, number];
export const Black: Color = [0, 0, 0, 255];
export const White: Color = [255, 255, 255, 255];
export const Red: Color = [255, 0, 0, 255];
export const Green: Color = [0, 255, 0, 255];
export const Blue: Color = [0, 0, 255, 255];
export const Cyan: Color = [0, 255, 255, 255];
export const Magenta: Color = [255, 0, 255, 255];
export const Yellow: Color = [255, 255, 0, 255];

export function swap(arr: TypedArray, i: number, j: number) {
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
}

type IterableArrayLike<T> = ArrayLike<T> & {[Symbol.iterator](): IterableIterator<T>};

export function* reverseIterator<T>(arr: IterableArrayLike<T>): IterableIterator<T> {
    for (let i = arr.length - 1; i >= 0; i--) {
        yield arr[i];
    }
}

export function identityIterator<T>(arr: IterableArrayLike<T>): IterableIterator<T> {
    return arr[Symbol.iterator]();
}

export function* range(a: number, b: number): IterableIterator<number> {
    const step = a < b ? 1 : -1;
    for (let i = a; i !== b; i += step) {
        yield i;
    }
}

interface Drawable {
    draw(ctx: CanvasRenderingContext2D): void;
}

export function drawPoints(ctx: CanvasRenderingContext2D, points: Point[], color = Black) {
    const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const point of points) {
        const i = (Math.round(point.y) * ctx.canvas.width + Math.round(point.x)) * 4;
        imgData.data[i + 0] = color[0];
        imgData.data[i + 1] = color[1];
        imgData.data[i + 2] = color[2];
        imgData.data[i + 3] = color[3];
    }
    ctx.putImageData(imgData, 0, 0);
}

export function drawSequentially(ctx: CanvasRenderingContext2D, items: Drawable[], delay = 300, idx = 0) {
    if (idx < items.length) {
        items[idx].draw(ctx);
        setTimeout(drawSequentially.bind(null, ctx, items, delay, ++idx), delay);
    }
}
