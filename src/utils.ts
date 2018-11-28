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

export function swap(arr: Mutable<ArrayLike<any>>, i: number, j: number) {
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

function memoizeMethod(descriptor: TypedPropertyDescriptor<any>) {
    const originalValue = descriptor.value;
    const returnedValues: WeakMap<object, any> = new WeakMap();
  
    descriptor.value = function(...args: any[]) {
        let val;
        if (returnedValues.has(this)) {
            val = returnedValues.get(this);
        } else {
            val = originalValue.apply(this, args);
            returnedValues.set(this, val);
        }
        return val;
    };
}
  
function memoizeGetAccessor(descriptor: TypedPropertyDescriptor<any>) {
    const originalGet = descriptor.get;
    const originalSet = descriptor.set;
    const returnedValues: WeakMap<object, any> = new WeakMap();
  
    if (originalGet !== undefined) {
        descriptor.get = function(...args: any[]) {
            let val;
            if (returnedValues.has(this)) {
                val = returnedValues.get(this);
            } else {
                val = originalGet.apply(this, args);
                returnedValues.set(this, val);
            }
            return val;
        };
    }
  
    if (originalSet !== undefined) {
        descriptor.set = function(...args: any[]) {
            returnedValues.delete(this);
            return originalSet.apply(this, args);
        };
    }
}
  
export function Memoize<T extends object, K extends keyof T>(_target: T, _propertyName: K, descriptor: TypedPropertyDescriptor<T[K]>) {
    if (descriptor.value !== undefined) {
        memoizeMethod(descriptor);
    } else if (descriptor.get !== undefined) {
        memoizeGetAccessor(descriptor);
    } else {
        throw new Error("Only methods or getters can be decorated with Memoize.");
    }
}

export function timeFunction(fn: Function, ...args: any[]): number {
    const t = performance.now();
    fn(...args);
    return performance.now() - t;
}

export function benchmark(iter = 100, fn: Function, ...args: any[]) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    
    for (let i = 0; i < iter; i++) {
        const t = timeFunction(fn, ...args);
        min = Math.min(min, t);
        max = Math.max(max, t);
        sum += t;
    }

    const avg = sum / iter;

    console.table([{
        name: fn.name,
        iter, min, max, avg
    }]);
}

export function assertNotNull<T>(thing: T | null): T {
    if (thing === null) {
        throw new Error("Assert failed: is null");
    }
    return thing;
}

export function Bind<T extends Function>(_target: object, propName: string | symbol, descriptor: TypedPropertyDescriptor<T>): TypedPropertyDescriptor<T> {
    return {
        get(this: T): T {
            const bound = descriptor.value!.bind(this);
            Object.defineProperty(this, propName, Object.assign({}, descriptor, {
                value: bound
            }));
            return bound;
        }
    };
}

export function enumValues<T>(e: T): Array<T[keyof T]> {
    return Object.values(e).filter(v => !isNaN(v));
}

export function floatEquals(a: number, b: number) {
    return Math.abs(a - b) < Number.EPSILON;
}
