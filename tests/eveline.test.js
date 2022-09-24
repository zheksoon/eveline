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
    makeModel,
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

const getCheck = () => {
    const check = (a, b) => {
        trackUpdate(check);
        return a === b;
    };

    return check;
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

    it("caches result", () => {
        const o1 = observable("hello");
        const c1 = computed(() => ({ data: o1.value }));

        const res1 = c1.value;
        const res2 = c1.value;
        expect(res1).toStrictEqual({ data: "hello" });
        expect(res2).toBe(res1);
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

    describe("conditional dependencies", () => {
        it("unsubscribes from conditional dependency on invalidation - observable", () => {
            const o1 = observable(true);
            const o2 = observable(2);
            const o3 = observable(3);

            const c1 = computed(() => (o1.value ? o2.value : o3.value));

            expect(c1.value).toBe(2);
            expect(updates(c1)).toBe(1);

            o2.value = 20;
            expect(c1.value).toBe(20);
            expect(updates(c1)).toBe(2);

            o1.value = false;
            expect(c1.value).toBe(3);
            expect(updates(c1)).toBe(3);

            o2.value = 2;
            expect(c1.value).toBe(3);
            expect(updates(c1)).toBe(3);
        });

        it("unsubscribes from conditional dependency on invalidation - computed", () => {
            const cond0 = observable(false);
            const o1 = observable(5);
            const o2 = observable(10);
            const cond1 = computed(() => !cond0.value);
            const c1 = computed(() => o1.value + 1);
            const c2 = computed(() => o2.value + 1);
            const c3 = computed(() => (cond1.value ? c1.value : c2.value));

            expect(c3.value).toBe(6);
            expect(updates(c3)).toBe(1);

            // dependency - should update
            o1.value = 7;
            expect(c3.value).toBe(8);
            expect(updates(c3)).toBe(2);

            // no dependency - shouldn't update
            o2.value = 11;
            expect(c3.value).toBe(8);
            expect(updates(c3)).toBe(2);

            // dependency - should update
            cond0.value = true;
            expect(c3.value).toBe(12);
            expect(updates(c3)).toBe(3);

            // not a dependency now
            o1.value = 5;
            expect(c3.value).toBe(12);
            expect(updates(c3)).toBe(3);

            // dependency
            o2.value = 10;
            expect(c3.value).toBe(11);
            expect(updates(c3)).toBe(4);
        });

        it("invalidated by conditional computed dependence (many)", () => {
            const obs = new Array(128).fill(0).map((_, i) => observable(i));
            const comp = obs.map((o) => computed(() => o.value));
            const selector = observable(0);
            const value = computed(() => {
                return comp[selector.value].value;
            });

            for (let i = 0; i < 128; i++) {
                selector.value = i;
                expect(value.value).toBe(i);

                obs[(i - 1) & 127].value = i - 1;
                expect(value.value).toBe(i);

                obs[(i + 1) & 127].value = i + 1;
                expect(value.value).toBe(i);
            }
        });
    });

    describe("value-checked", () => {
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

        it("chain o -> c -> v -> r", () => {
            const check1 = getCheck();

            const o1 = observable(0);
            const c1 = computed(() => {
                return o1.value * 2;
            });

            const c2 = computed(() => {
                return c1.value * 2;
            }, check1);

            const r1 = reaction(() => {
                c2.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0; // same value
            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(1);

            o1.value = 1; // new value
            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(3);
            expect(updates(r1)).toBe(2);

            o1.value = 1; // same value after new value
            expect(updates(c1)).toBe(4);
            expect(updates(c2)).toBe(4);
            expect(updates(r1)).toBe(2);
        });

        it("chain o -> c -> v -> c -> r", () => {
            const check2 = getCheck();

            const o1 = observable(0);
            const c1 = computed(() => {
                return o1.value * 2;
            });

            const c2 = computed(() => {
                return c1.value * 2;
            }, check2);

            const c3 = computed(() => {
                return c2.value * 2;
            });

            const r1 = reaction(() => {
                c3.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(c3)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0; // same value
            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(c3)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 1; // new value
            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(3);
            expect(updates(c3)).toBe(2);
            expect(updates(r1)).toBe(2);

            o1.value = 1; // same value after new value
            expect(updates(c1)).toBe(4);
            expect(updates(c2)).toBe(4);
            expect(updates(c3)).toBe(2);
            expect(updates(r1)).toBe(2);
        });

        it("chain o -> v -> v -> r", () => {
            const check1 = getCheck();
            const check2 = getCheck();

            const o1 = observable(0);
            const c1 = computed(() => {
                return o1.value * 2;
            }, check1);

            const c2 = computed(() => {
                return c1.value * 2;
            }, check2);

            const r1 = reaction(() => {
                c2.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0;

            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 1;

            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(2);

            o1.value = 1;

            expect(updates(c1)).toBe(4);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(2);
        });

        it("chain o -> v -> v -> r (2)", () => {
            const check1 = getCheck();
            const check2 = getCheck();

            const o1 = observable(0);

            const c1 = computed(() => {
                return Math.abs(o1.value);
            }, check1);

            const c2 = computed(() => {
                return Math.abs(c1.value - 2);
            }, check2);

            const r1 = reaction(() => {
                c2.value;
            });
            r1.run();

            expect(c2.value).toBe(2);
            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 1;

            expect(c2.value).toBe(1);
            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(2);

            o1.value = -1;

            expect(c2.value).toBe(1);
            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(2);

            o1.value = 3;

            expect(c2.value).toBe(1);
            expect(updates(c1)).toBe(4);
            expect(updates(c2)).toBe(3);
            expect(updates(r1)).toBe(2);

            o1.value = 1;

            expect(c2.value).toBe(1);
            expect(updates(c1)).toBe(5);
            expect(updates(c2)).toBe(4);
            expect(updates(r1)).toBe(2);
        });

        it("transaction test 1", () => {
            const check1 = getCheck();

            const o1 = observable(0);
            const o2 = observable(1);

            const c1 = computed(() => {
                return o1.value + o2.value;
            }, check1);

            const r1 = reaction(() => {
                c1.value;
            });

            r1.run();

            expect(updates(r1)).toBe(1);
            expect(updates(c1)).toBe(1);

            tx(() => {
                o1.value = 1;
                o2.value = 2;
            });

            expect(updates(r1)).toBe(2);
            expect(updates(c1)).toBe(2);

            tx(() => {
                o1.value = 5;
                expect(c1.value).toBe(5 + 2);
                expect(updates(c1)).toBe(3);
                expect(updates(r1)).toBe(2);
                o2.value = 6;
            });

            expect(updates(c1)).toBe(4);
            expect(updates(r1)).toBe(3);

            // no change to sum
            tx(() => {
                o1.value = 6;
                o2.value = 5;
            });

            expect(updates(c1)).toBe(5);
            expect(updates(r1)).toBe(3);
        });

        it("observable branching 1", () => {
            const check1 = getCheck();

            const o1 = observable(0);
            const o2 = observable(1);

            const c1 = computed(() => {
                return o1.value * 2;
            }, check1);

            const c2 = computed(() => {
                return c1.value + o2.value;
            });

            const r1 = reaction(() => {
                c2.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0;

            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o2.value = 2;

            expect(updates(c1)).toBe(2);
            expect(updates(c1)).toBe(2);
            expect(updates(c1)).toBe(2);

            o1.value = 1;

            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(3);
            expect(updates(r1)).toBe(3);
        });

        it("diamond 1", () => {
            const check1 = getCheck();
            const check2 = getCheck();

            const o1 = observable(0);

            const c1 = computed(() => {
                return o1.value * 2;
            }, check1);

            const c2 = computed(() => {
                return o1.value + 1;
            }, check2);

            const r1 = reaction(() => {
                c1.value;
                c2.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0;

            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(1);

            o1.value = 1;

            expect(updates(c1)).toBe(3);
            expect(updates(c2)).toBe(3);
            expect(updates(r1)).toBe(2);
        });

        it("triangle 1", () => {
            const check1 = getCheck();
            const check2 = getCheck();

            const o1 = observable(0);

            const c1 = computed(() => {
                return o1.value * 2;
            }, check1);

            const c2 = computed(() => {
                return o1.value + c1.value;
            }, check2);

            const r1 = reaction(() => {
                c2.value;
            });
            r1.run();

            expect(updates(c1)).toBe(1);
            expect(updates(c2)).toBe(1);
            expect(updates(r1)).toBe(1);

            o1.value = 0;

            expect(updates(c1)).toBe(2);
            expect(updates(c2)).toBe(2);
            expect(updates(r1)).toBe(1);
        });
    });

    it("throws when has recursive dependencies", () => {
        const c1 = computed(() => {
            return c1.value * 2;
        });

        expect(() => {
            c1.value;
        }).toThrow();
    });

    it("throws when has recursive dependencies", () => {
        const c1 = computed(() => {
            return c2.value * 2;
        });

        const c2 = computed(() => {
            return c1.value + 1;
        });

        expect(() => {
            c1.value;
        }).toThrow();

        expect(() => {
            c2.value;
        }).toThrow();
    });

    it("rethrows exceptions", () => {
        const c1 = computed(() => {
            throw new Error("boom!");
        });

        expect(() => {
            c1.value;
        }).toThrow();
    });

    it("restores after exception", () => {
        const o1 = observable(10);
        const c1 = computed(() => {
            if (o1.value < 0) {
                throw new Error("less than zero");
            }
            return o1.value * 2;
        });

        expect(c1.value).toBe(20);

        o1.value = -1;
        expect(() => {
            c1.value;
        }).toThrow();
        // throws the second time as well
        expect(() => {
            c1.value;
        }).toThrow();

        // restores after exception
        o1.value = 5;
        expect(c1.value).toBe(10);
    });

    it("throws when trying to change observable inside of computed", () => {
        const o1 = observable(0);
        const o2 = observable(1);

        const c1 = computed(() => {
            o2.value = o1.value + o2.value;
        });

        expect(() => {
            c1.value;
        }).toThrow();
    });

    it("not propagates state when dirty", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const c1 = computed(() => Math.abs(o1.value), getCheck());
        const c2 = computed(() => Math.abs(o2.value), getCheck());
        const c3 = computed(() => c1.value + c2.value, getCheck());

        expect(c3.value).toBe(3);

        tx(() => {
            o1.value = 10;
            o2.value = 20;
        });

        expect(c3.value).toBe(30);
    });

    it(".destroy() method invalidates computed", () => {
        const o = observable(1);
        const c = computed(() => {
            return o.value + 1;
        });
        c.value;
        expect(updates(c)).toBe(1);
        c.destroy();
        expect(updates(c)).toBe(1);
        c.value;
        expect(updates(c)).toBe(2);
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

    it("throws when runs in infinite loop", () => {
        const o1 = observable(1);

        const r1 = reaction(() => {
            o1.value = o1.value + 1;
        });

        expect(() => r1.run()).toThrow();
    });

    it(".unsubscribe() remove all subscriptions and .subscribe() recovers them, observable", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const r1 = reaction(() => o1.value + o2.value);

        r1.run();

        expect(updates(r1)).toBe(1);

        r1.unsubscribe();

        o1.value = 10;
        o2.value = 20;

        expect(updates(r1)).toBe(1);

        r1.subscribe();

        o1.value = 1;

        expect(updates(r1)).toBe(2);

        o2.value = 2;

        expect(updates(r1)).toBe(3);
    });

    it(".unsubscribe() remove all subscriptions and .subscribe() recovers them, computed", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const c1 = computed(() => o1.value + 1);
        const c2 = computed(() => o2.value + 1);

        const r1 = reaction(() => c1.value + c2.value);

        r1.run();

        expect(updates(r1)).toBe(1);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        r1.unsubscribe();

        o1.value = 10;
        o2.value = 20;

        expect(updates(r1)).toBe(1);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        // r1 subscribes to c1 and c2, and they are already in dirty state, so they are recomputed
        r1.subscribe();

        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);

        // c1 repomutes again
        o1.value = 1;

        expect(updates(r1)).toBe(2);
        expect(updates(c1)).toBe(3);
        expect(updates(c2)).toBe(2);

        o2.value = 2;

        expect(updates(r1)).toBe(3);
        expect(updates(c1)).toBe(3);
        expect(updates(c2)).toBe(3);
    });

    it(".unsubscribe() remove all subscriptions and .subscribe() recovers them, computed case 2", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const c1 = computed(() => o1.value + 1);
        const c2 = computed(() => o2.value + 1);

        const r1 = reaction(() => c1.value + c2.value);
        const r2 = reaction(() => c1.value + c2.value);

        r1.run();
        r2.run();

        expect(updates(r1)).toBe(1);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        r1.unsubscribe();

        o1.value = 10;
        o2.value = 20;

        expect(updates(r1)).toBe(1);
        expect(updates(r2)).toBe(3);
        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);

        // r1 subscribes to c1 and c2, and they are already in dirty state, so they are recomputed
        r1.subscribe();

        expect(updates(c1)).toBe(2);
        expect(updates(c2)).toBe(2);

        // c1 repomutes again
        o1.value = 1;

        expect(updates(r1)).toBe(2);
        expect(updates(c1)).toBe(3);
        expect(updates(c2)).toBe(2);

        o2.value = 2;

        expect(updates(r1)).toBe(3);
        expect(updates(c1)).toBe(3);
        expect(updates(c2)).toBe(3);
    });

    describe("child reactions", () => {
        it("child reaction is disposed when parent runs", () => {
            const o1 = observable(1);
            const o2 = observable(2);

            let r1;
            const r2 = reaction(() => {
                o2.value;

                r1 = reaction(() => {
                    o1.value;
                });

                r1.run();
            });

            r2.run();

            expect(updates(r1)).toBe(1);
            expect(updates(r2)).toBe(1);

            o1.value = 20;

            expect(updates(r1)).toBe(2);
            expect(updates(r2)).toBe(1);

            const r1_old = r1;

            o2.value = 10;

            expect(updates(r1_old)).toBe(2);

            // r1 is a new reaction
            expect(updates(r1)).toBe(1);
            expect(updates(r2)).toBe(2);
        });
    });
});

describe("tx", () => {
    it("runs reactions after transaction is ended", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const r1 = reaction(() => o1.value + o2.value);

        r1.run();
        expect(updates(r1)).toBe(1);

        tx(() => {
            o1.value = 10;
            o2.value = 20;
        });

        expect(updates(r1)).toBe(2);
    });

    it("nested transactions", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const r1 = reaction(() => o1.value + o2.value);

        r1.run();
        expect(updates(r1)).toBe(1);

        tx(() => {
            o1.value = 10;

            tx(() => {
                o1.value = 100;
                o2.value = 200;
            });
            expect(updates(r1)).toBe(1);

            o2.value = 20;
        });

        expect(updates(r1)).toBe(2);
    });

    it("intermediate computed values are correct", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const c1 = computed(() => o1.value + o2.value);

        expect(c1.value).toBe(3);
        expect(updates(c1)).toBe(1);

        tx(() => {
            o1.value = 10;
            expect(c1.value).toBe(12);
            expect(updates(c1)).toBe(2);
            o2.value = 20;
            expect(c1.value).toBe(30);
            expect(updates(c1)).toBe(3);
        });

        expect(c1.value).toBe(30);
        expect(updates(c1)).toBe(3);
    });

    it("intermediate computed values are correct, value-checked computed", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const check = getCheck();
        const c1 = computed(() => o1.value + o2.value, check);

        expect(c1.value).toBe(3);
        expect(updates(c1)).toBe(1);

        tx(() => {
            o1.value = 10;
            expect(c1.value).toBe(12);
            expect(updates(c1)).toBe(2);
            o2.value = 20;
            expect(c1.value).toBe(30);
            expect(updates(c1)).toBe(3);
        });

        expect(c1.value).toBe(30);
        expect(updates(c1)).toBe(3);
    });
});

describe("utx", () => {
    it("works like transaction", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const r1 = reaction(() => o1.value + o2.value);

        r1.run();
        expect(updates(r1)).toBe(1);

        utx(() => {
            o1.value = 10;
            o2.value = 20;
        });

        expect(updates(r1)).toBe(2);
    });

    it("value access is untracked", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const r1 = reaction(() => {
            o1.value;
            utx(() => o2.value);
        });

        r1.run();

        expect(updates(r1)).toBe(1);

        o1.value = 10;

        expect(updates(r1)).toBe(2);

        o2.value = 20;

        expect(updates(r1)).toBe(2);
    });

    it("returns value from thunk", () => {
        const o1 = observable(1);

        expect(utx(() => o1.value)).toBe(1);
    });
});

describe("action", () => {
    it("creates usable function", () => {
        const a1 = action(() => {});

        expect(() => a1()).not.toThrow();
    });

    it("acts like utx", () => {
        const o1 = observable(1);
        const o2 = observable(2);

        const a1 = action(() => o2.value);

        expect(a1()).toBe(2);

        const r1 = reaction(() => {
            o1.value;
            a1();
        });

        r1.run();
        expect(updates(r1)).toBe(1);

        o2.value = 20;

        expect(updates(r1)).toBe(1);
    });

    it("passes arguments and returns value", () => {
        let _args;

        const a1 = action((...args) => {
            _args = args;
            return "hello";
        });

        expect(a1(1, "world")).toBe("hello");
        expect(_args).toStrictEqual([1, "world"]);
    });

    it("applies this", () => {
        let _this;

        const obj = {
            a: action(function () {
                _this = this;
            }),
        };

        obj.a();

        expect(_this).toBe(obj);
    });
});

describe("makeObservable", () => {
    it("creates getters and setters", () => {
        const o1 = observable(1);
        const c1 = computed(() => o1.value + 1);
        const a1 = action((value) => (o1.value = value));

        const target = {};

        const obj = {
            o1,
            c1,
            a1,
            a: 1,
            b: "string",
            c: {},
            d: [],
            e: null,
            f: undefined,
        };

        const res = makeObservable(target, obj);

        expect(res).toBe(target);
        expect(obj).toStrictEqual({
            o1,
            c1,
            a1,
            a: 1,
            b: "string",
            c: {},
            d: [],
            e: null,
            f: undefined,
        });

        // action is not copied into target
        expect(res.a1).toBe(undefined);
        expect(Object.keys(res)).toStrictEqual(["o1", "c1"]);

        expect(updates(c1)).toBe(0);

        expect(res.o1).toBe(o1.value);
        expect(res.c1).toBe(c1.value);

        expect(updates(c1)).toBe(1);

        res.o1 = 2;

        expect(res.c1).toBe(c1.value);
        expect(updates(c1)).toBe(2);
    });

    it("modifies target inplace if no second argument", () => {
        const o1 = observable(1);
        const c1 = computed(() => o1.value + 1);
        const a1 = action((value) => (o1.value = value));

        const obj = {
            o1,
            c1,
            a1,
        };

        makeObservable(obj);

        expect(Object.keys(obj)).toStrictEqual(["o1", "c1", "a1"]);

        expect(obj.o1).toBe(1);
        expect(obj.c1).toBe(2);
    });
});

describe("makeModel", () => {
    it("data section is converted to observables", () => {
        const data = {
            a: 1,
            b: "string",
            c: {},
            d: [],
            e: null,
            f: undefined,
        };
        const model = makeModel({
            data,
        });

        // props are getters of original values
        expect(model).toMatchObject(data);

        const c1 = computed(() => model.a + model.b);

        expect(c1.value).toBe("1string");

        model.a = 2;
        model.b = "hello";

        expect(c1.value).toBe("2hello");
    });

    it("data section can be a function", () => {
        const data = {
            a: 1,
            b: "string",
            c: {},
            d: [],
            e: null,
            f: undefined,
        };
        const model = makeModel({
            data() {
                return data;
            },
        });

        // props are getters of original values
        expect(model).toMatchObject(data);

        const c1 = computed(() => model.a + model.b);

        expect(c1.value).toBe("1string");

        model.a = 2;
        model.b = "hello";

        expect(c1.value).toBe("2hello");
    });

    it("data section preserves observable instances", () => {
        const o1 = observable(1);
        const o2 = observable(2, getCheck());

        const model = makeModel({ data: { o1, o2 } });

        expect(model.o1).toBe(1);
        expect(model.o2).toBe(2);

        expect(model.$o1).toBe(o1);
        expect(model.$o2).toBe(o2);
    });

    it("computed section is converted to computed", () => {
        const c1 = () => {
            trackUpdate(c1);
            return model.a + model.b;
        };
        const c2 = () => {
            trackUpdate(c2);
            return model.c1 + 1;
        };
        const model = makeModel({
            data: {
                a: 1,
                b: 2,
            },
            computed: {
                c1,
                c2,
            },
        });

        expect(model.c1).toBe(3);
        expect(model.c2).toBe(4);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);

        // cached
        expect(model.c1).toBe(3);
        expect(model.c2).toBe(4);
        expect(updates(c1)).toBe(1);
        expect(updates(c2)).toBe(1);
    });

    it("computed secion preserves computed instances", () => {
        const c1 = computed(() => model.a + model.b);
        const c2 = computed(() => model.c1 + 1, getCheck());
        const model = makeModel({
            data: {
                a: 1,
                b: 2,
            },
            computed: {
                c1,
                c2,
            },
        });

        expect(model.c1).toBe(3);
        expect(model.c2).toBe(4);
        expect(model.$c1).toBe(c1);
        expect(model.$c2).toBe(c2);
    });

    it("actions section is converted to actions", () => {
        const model = makeModel({
            data: {
                a: 1,
                b: 2,
            },
            computed: {
                c1: () => model.a + model.b,
                c2: () => model.c1 + 1,
            },
            actions: {
                a1() {
                    model.a = 10;
                },
                a2() {
                    model.a = model.b;
                    model.b = 200;
                },
            },
        });

        const r1 = reaction(() => {
            model.c1;
            model.c2;
        });

        r1.run();

        expect(updates(r1)).toBe(1);

        model.a1();

        expect(updates(r1)).toBe(2);

        model.a2();

        expect(updates(r1)).toBe(3);
    });

    it("extra section is copied as is", () => {
        const model = makeModel({
            extra: { a: 1, b: 2 },
        });

        expect(model).toMatchObject({ a: 1, b: 2 });
    });

    it("first argument is target object", () => {
        const target = {};

        const result = makeModel(target, {
            data: { a: 1 },
            computed: { b: () => result.a + 1 },
        });

        expect(result).toBe(target);
    });
});

describe("configure", () => {
    describe("reactionRunner", () => {
        it("sets custom reaction runner", () => {
            const custom = (runner) => {
                trackUpdate(custom);
                runner();
            };

            configure({ reactionRunner: custom });

            const o1 = observable(1);
            const r1 = reaction(() => o1.value);

            r1.run();

            expect(updates(custom)).toBe(0);

            o1.value = 2;

            expect(updates(custom)).toBe(1);

            configure({ reactionRunner: (runner) => runner() });
        });

        it("microtask runner works as expected", async () => {
            const microtask = (runner) => {
                trackUpdate(microtask);
                Promise.resolve().then(runner);
            };

            configure({ reactionRunner: microtask });

            const o1 = observable(1);
            const o2 = observable(2);

            const r1 = reaction(() => {
                o1.value + o2.value;
            });

            r1.run();

            expect(updates(r1)).toBe(1);
            expect(updates(microtask)).toBe(0);

            o1.value = 10;

            expect(updates(microtask)).toBe(1);

            o2.value = 20;

            // does not run syncronously
            expect(updates(r1)).toBe(1);
            expect(updates(microtask)).toBe(1);

            await Promise.resolve();

            expect(updates(r1)).toBe(2);
            expect(updates(microtask)).toBe(1);

            configure({ reactionRunner: (runner) => runner() });
        });
    });
});
