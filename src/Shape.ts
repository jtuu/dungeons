import { CellAutomaton, CellState } from "./cells";

export abstract class Shape {
    private static idCounter = 0;
    public readonly id: number = Shape.idCounter++;

    constructor(
        protected readonly system: CellAutomaton
    ) {}

    public abstract fill(value: CellState): void;
    public abstract outline(value: CellState): void;
    public abstract clone(): Shape;
    public clear() {
        this.fill(CellState.Dead);
    }
}
