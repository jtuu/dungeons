export type Command = () => void | Command;

export class CommandRunner {
    public readonly commands: Array<Command>;

    constructor(commands: Array<Command> = []) {
        this.commands = commands;
    }

    protected static *processCommands(commands: Array<Command>): IterableIterator<void> {
        let cmd;
        while ((cmd = commands.shift()) !== undefined) {
            const subcmd = cmd();
            yield;
            if (typeof subcmd === "function") {
                commands.unshift(subcmd);
            }
        }
    }

    public run() {
        const iter = CommandRunner.processCommands(this.commands);
        let cur;
        do {
            cur = iter.next();
        } while (!cur.done);
    }

    public interactive() {
        const iter = CommandRunner.processCommands(this.commands);
        window.addEventListener("click", () => {
            iter.next();
        });
    }
}
