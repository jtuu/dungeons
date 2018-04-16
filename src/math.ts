import { Point } from "./geometry";

export function distance(p0: Point, p1: Point): number {
    return Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2);
}

export function distance2(p0: Point, p1: Point): number {
    const dx = p0.x - p1.x;
    const dy = p0.y - p1.y;
    return dx * dx + dy * dy;
}

export function lerp(p0: Point, p1: Point, t = 0.5): Point {
    return new Point(p0.x * t + p1.x * t, p0.y * t + p1.y * t);
}

export function segmentsCross(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
    const aSide = (b1.x - b0.x) * (a0.y - b0.y) - (b1.y - b0.y) * (a0.x - b0.x) > 0;
    const bSide = (b1.x - b0.x) * (a1.y - b0.y) - (b1.y - b0.y) * (a1.x - b0.x) > 0;
    const cSide = (a1.x - a0.x) * (b0.y - a0.y) - (a1.y - a0.y) * (b0.x - a0.x) > 0;
    const dSide = (a1.x - a0.x) * (b1.y - a0.y) - (a1.y - a0.y) * (b1.x - a0.x) > 0;
    return aSide !== bSide && cSide !== dSide;
}

export function segmentsCross1(a0: Point, a1: Point, b0: Point, b1: Point): boolean {
    const adx = a1.x - a0.x;
    const ady = a1.y - a0.y;
    const bdx = b1.x - b0.x;
    const bdy = b1.y - b0.y;

    const denom = adx * bdy - bdx * ady;

    if (denom === 0) {
        return false;
    }

    const abdx = a0.x - b0.x;
    const abdy = a0.y - b0.y;

    const anumer = adx * abdy - ady * abdx;
    if (anumer < 0 === denom > 0) {
        return false;
    }

    const bnumer = bdx * abdy - bdy * abdx;
    if (bnumer < 0) {
        return false;
    }

    if ((anumer > denom === denom > 0) || (bnumer > denom === denom > 0)) {
        return false;
    }

    return true;
}
