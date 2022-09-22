const {
    observable,
    computed: _computed,
    reaction: _reaction,
    tx,
    utx,
    action,
    configure,
    model,
    makeObservable,
} = require("../src/eveline");

const updatesMap = new WeakMap();

const updates = (val) => updatesMap.get(val) ?? 0;

const trackUpdate = (val) => updatesMap.set(val, updates(val) + 1);

const computed = (fn, checkFn) => {
    const comp = _computed(() => {
        trackUpdate(comp);
        return fn();
    }, checkFn);

    return comp;
};

const reaction = (fn, manager) => {
    const r = _reaction(function () {
        trackUpdate(r);
        return fn.apply(undefined, arguments);
    }, manager);

    return r;
};

describe("observable", () => {
    it("creates observable value", () => {
        expect(() => {
            const o1 = observable(1);
        }).not.toThrow();
    });

    it("reads and writes observable value", () => {
        const o1 = observable(1);

        expect(o1.value).toBe(1);

        o1.value = 2;

        expect(o1.value).toBe(2);
    });

    it("calls checkFn on value set", () => {
        const check = (a, b) => {
            trackUpdate(check);
            return a === b;
        };

        const o1 = observable(1, check);

        const r1 = reaction(() => o1.value);

        r1.run();

        expect(updates(r1)).toBe(1);
        expect(updates(check)).toBe(0);

        o1.value = 2;

        expect(updates(r1)).toBe(2);
        expect(updates(check)).toBe(1);

        o1.value = 2;

        expect(updates(r1)).toBe(2);
        expect(updates(check)).toBe(2);

        r1.destroy();
    });
});

describe("computed", () => {
    it("creates computed", () => {
        expect(() => {
            computed(() => true);
        }).not.toThrow();
    });

    it("reads computed value", () => {
        const c1 = computed(() => 1);

        expect(updates(c1)).toBe(0);
        expect(c1.value).toBe(1);
        expect(updates(c1)).toBe(1);

        expect(c1.value).toBe(1);
        expect(updates(c1)).toBe(1);
    });

    it("invalidates on observable changes", () => {
        const o1 = observable(5);

        const c1 = computed(() => o1.value);

        expect(c1.value).toBe(5);
        expect(updates(c1)).toBe(1);

        o1.value = 10;

        expect(c1.value).toBe(10);
        expect(updates(c1)).toBe(2);

        o1.value = 10;

        expect(c1.value).toBe(10);
        expect(updates(c1)).toBe(3);
    });

    it("does not cache when cacheOnUntrackedRead = false", () => {
        configure({ cacheOnUntrackedRead: false });

        const o1 = observable(1);

        const c1 = computed(() => o1.value * 2);

        expect(c1.value).toBe(2);
        expect(updates(c1)).toBe(1);

        expect(c1.value).toBe(2);
        expect(updates(c1)).toBe(2);

        o1.value = 2;

        expect(c1.value).toBe(4);
        expect(updates(c1)).toBe(3);

        configure({ cacheOnUntrackedRead: true });
    });

    it("triangle 1", () => {
        const o1 = observable(2);
        const c1 = computed(() => o1.value * 2);
        const c2 = computed(() => o1.value * c1.value);

        expect(c1.value).toBe(4);
        expect(c2.value).toBe(8);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        o1.value = 1;

        expect(c1.value).toBe(2);
        expect(c2.value).toBe(2);
        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);
    });

    it("triangle 2", () => {
        const o1 = observable(2);
        const c1 = computed(() => o1.value * 2);
        const c2 = computed(() => c1.value * 2);
        const c3 = computed(() => o1.value * c2.value);

        expect(c1.value).toBe(4);
        expect(c2.value).toBe(8);
        expect(c3.value).toBe(16);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);
        expect(updates(c3)).toBe(1);

        o1.value = 1;

        expect(c1.value).toBe(2);
        expect(c2.value).toBe(4);
        expect(c3.value).toBe(4);
        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);
        expect(updates(c3)).toBe(2);
    });

    it("diamond 1", () => {
        const o1 = observable(1);
        const c1 = computed(() => o1.value * 2);
        const c2 = computed(() => o1.value * 3);
        const c3 = computed(() => c1.value + c2.value);

        expect(c3.value).toBe(5);
        expect(c2.value).toBe(3);
        expect(c1.value).toBe(2);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);
        expect(updates(c3)).toBe(1);

        o1.value = 2;

        expect(c3.value).toBe(10);
        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);
        expect(updates(c3)).toBe(2);
    });

    it("diamond 2", () => {
        const o1 = observable(1);
        const c11 = computed(() => o1.value * 2);
        const c12 = computed(() => o1.value * 3);
        const c21 = computed(() => c11.value * 2);
        const c22 = computed(() => c12.value * 2);
        const c3 = computed(() => c21.value + c22.value);

        expect(c3.value).toBe(10);
        expect(updates(c3)).toBe(1);
        expect(updates(c21)).toBe(1);
        expect(updates(c22)).toBe(1);
        expect(updates(c11)).toBe(1);
        expect(updates(c12)).toBe(1);

        o1.value = 2;

        expect(c3.value).toBe(20);
        expect(updates(c3)).toBe(2);
        expect(updates(c21)).toBe(2);
        expect(updates(c22)).toBe(2);
        expect(updates(c11)).toBe(2);
        expect(updates(c12)).toBe(2);
    });

    describe("value-checked", () => {
        const getCheck = () => {
            const check = (a, b) => {
                trackUpdate(check);
                return a === b;
            };

            return check;
        };

        it("calls checkFn on dependency update", () => {
            const check = getCheck();

            const o1 = observable(1);
            const c1 = computed(() => Math.abs(o1.value), check);

            expect(c1.value).toBe(1);
            expect(updates(c1)).toBe(1);
            expect(updates(check)).toBe(0);

            o1.value = 2;

            expect(c1.value).toBe(2);
            expect(updates(c1)).toBe(2);
            expect(updates(check)).toBe(1);

            o1.value = -2;

            expect(c1.value).toBe(2);
            expect(updates(c1)).toBe(3);
            expect(updates(check)).toBe(2);
        });

        it("next computed in chain not recomputed when value does not change, o -> v -> c", () => {
            const check = getCheck();

            const o1 = observable(1);
            const c1 = computed(() => Math.abs(o1.value), check);
            const c2 = computed(() => c1.value * 2);

            expect(c2.value).toBe(2);
            expect(updates(c2)).toBe(1);
            expect(updates(c1)).toBe(1);
            expect(updates(check)).toBe(0);

            o1.value = 2;

            expect(c2.value).toBe(4);
            expect(updates(c2)).toBe(2);
            expect(updates(c1)).toBe(2);
            expect(updates(check)).toBe(1);

            o1.value = -2;

            expect(c2.value).toBe(4);
            expect(updates(c2)).toBe(2);
            expect(updates(c1)).toBe(3);
            expect(updates(check)).toBe(2);
        });

        it("next computed in chain not recomputed when value does not change, o -> v -> c -> c", () => {
            const check = getCheck();

            const o1 = observable(1);
            const c1 = computed(() => Math.abs(o1.value), check);
            const c2 = computed(() => c1.value * 2);
            const c3 = computed(() => c2.value);

            expect(c3.value).toBe(2);
            expect(updates(c3)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(c1)).toBe(1);
            expect(updates(check)).toBe(0);

            o1.value = 2;

            expect(c3.value).toBe(4);
            expect(updates(c3)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(c1)).toBe(2);
            expect(updates(check)).toBe(1);

            o1.value = -2;

            expect(c3.value).toBe(4);
            expect(updates(c3)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(c1)).toBe(3);
            expect(updates(check)).toBe(2);
        });

        it("next computed in chain not recomputed when value does not change, o -> v -> v", () => {
            const check1 = getCheck();
            const check2 = getCheck();

            const o1 = observable(1);
            const c1 = computed(() => Math.abs(o1.value) - 2, check1);
            const c2 = computed(() => Math.abs(c1.value) - 2, check2);

            expect(c2.value).toBe(-1);
            expect(c1.value).toBe(-1);
            expect(updates(c2)).toBe(1);
            expect(updates(c1)).toBe(1);
            expect(updates(check1)).toBe(0);
            expect(updates(check2)).toBe(0);

            // c1 recalculates, c2 not, no changes
            o1.value = -1;

            expect(c2.value).toBe(-1);
            expect(c1.value).toBe(-1);
            expect(updates(c2)).toBe(1);
            expect(updates(c1)).toBe(2);
            expect(updates(check1)).toBe(1);
            expect(updates(check2)).toBe(0);

            // c1 and c2 recalculate, c1 changes
            o1.value = 3;

            expect(c2.value).toBe(-1);
            expect(c1.value).toBe(1);
            expect(updates(c2)).toBe(2);
            expect(updates(c1)).toBe(3);
            expect(updates(check1)).toBe(2);
            expect(updates(check2)).toBe(1);

            // c1 and c2 recalculate, c1 and c2 change
            o1.value = 5;

            expect(c2.value).toBe(1);
            expect(c1.value).toBe(3);
            expect(updates(c2)).toBe(3);
            expect(updates(c1)).toBe(4);
            expect(updates(check1)).toBe(3);
            expect(updates(check2)).toBe(2);
        });
    });
});

describe("reaction", () => {
    it("reacts to observable changes", () => {
        const o1 = observable(1);

        const r1 = reaction(() => o1.value);

        expect(() => r1.run()).not.toThrow();
        expect(updates(r1)).toBe(1);

        o1.value = 2;

        expect(updates(r1)).toBe(2);

        o1.value = 2;

        expect(updates(r1)).toBe(3);

        r1.destroy();
    });

    it("reacts to computed changes", () => {
        const o1 = observable(1);

        const c1 = computed(() => o1.value * 2);

        const r1 = reaction(() => c1.value);

        r1.run();

        expect(updates(c1)).toBe(1);
        expect(updates(r1)).toBe(1);

        o1.value = 2;

        expect(updates(c1)).toBe(2);
        expect(updates(r1)).toBe(2);

        o1.value = 2;

        expect(updates(c1)).toBe(3);
        expect(updates(r1)).toBe(3);

        r1.run();

        expect(updates(c1)).toBe(3);
        expect(updates(r1)).toBe(4);

        r1.destroy();
    });

    it("reacts to computed changes, 2 computeds chain", () => {
        const o1 = observable(1);

        const c1 = computed(() => o1.value * 2);

        const c2 = computed(() => c1.value * 2);

        expect(c1.value).toBe(2);
        expect(c2.value).toBe(4);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        o1.value = 2;

        expect(c1.value).toBe(4);
        expect(c2.value).toBe(8);
        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);

        c2.value;

        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);
    });
});
