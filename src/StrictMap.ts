export class StrictMap<K, V> extends Map<K, V> {
    constructor(entries?: ReadonlyArray<[K, V]>) {
        super(entries);
    }
  
    public get(key: K): V {
        const val = super.get(key);
        if (val === undefined) {
            throw new Error(`No such key "${key}".`);
        }
        return val;
    }
}
  