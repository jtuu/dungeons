import { MersenneTwister } from "./mt";

export interface RngState {
  mti: number;
  mt: number[];
}

export class Rng extends MersenneTwister {
  public static readonly max: number = 0xffffffff;
  public readonly seed: number;

  constructor(seed?: number) {
    if (seed === undefined) {
      seed = Date.now();
    }
    super(seed);
    this.seed = seed;
  }

  public random2(max: number = 0): number {
    max = max | 0;

    if (max <= 1) {
      return 0;
    }

    const partn = Rng.max / max;

    while (true) {
      const bits = this.genrand_int32();
      const val = bits / partn;

      if (val < max) {
        return val | 0;
      }
    }
  }

  public coinflip(): boolean {
    return Boolean(this.random2(2));
  }

  public pick<T>(arr: ArrayLike<T>): T {
    return arr[this.genrand_int32() % (arr.length - 1)];
  }

  public setState(newState: RngState) {
    this.setMtState(newState.mti, newState.mt);
  }

  public getState(): RngState {
    return this.getMtState();
  }

  public randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1) + min);
}

  public pickRandom<T>(arr: ArrayLike<T>): T | undefined {
    return arr[Math.floor(this.random() * arr.length)];
  }
}
