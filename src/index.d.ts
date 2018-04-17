declare type Mutable<T> = {
    -readonly [P in keyof T]: T[P]
};

declare type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

declare type PropertyNamesOfType<O, T> = { [K in keyof O]: O[K] extends T ? K : never }[keyof O];
declare type PropertyNamesNotOfType<O, T> = { [K in keyof O]: O[K] extends T ? never : K }[keyof O];
