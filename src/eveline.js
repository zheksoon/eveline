const States = {
    NOT_INITIALIZED: 0,
    CLEAN: 1,
    MAYBE_DIRTY: 2,
    DIRTY: 3,
    COMPUTING: 4,
};

const apply = (fn) => fn();

let txDepth = 0;
let subscriber;
let subscriberChecks = [];
let reactionsScheduled = false;
let reactionsQueue = [];
let reactionsRunner = apply;
let stateActualizationQueue = [];
let cacheOnUntrackedRead = true;

function configure(options) {
    if (options.reactionRunner !== undefined) {
        reactionsRunner = options.reactionRunner;
    }
    if (options.cacheOnUntrackedRead !== undefined) {
        cacheOnUntrackedRead = options.cacheOnUntrackedRead;
    }
}

function tx(fn) {
    ++txDepth;
    try {
        fn();
    } finally {
        if (!--txDepth) endTx();
    }
}

function utx(fn) {
    const oldSubscriber = subscriber;
    subscriber = undefined;
    ++txDepth;
    try {
        return fn();
    } finally {
        subscriber = oldSubscriber;
        if (!--txDepth) endTx();
    }
}

function action(fn) {
    return function () {
        const oldSubscriber = subscriber;
        subscriber = undefined;
        ++txDepth;
        try {
            return fn.apply(this, arguments);
        } finally {
            subscriber = oldSubscriber;
            if (!--txDepth) endTx();
        }
    };
}

function endTx() {
    const shouldRunReactions =
        reactionsQueue.length || stateActualizationQueue.length;
    if (!reactionsScheduled && shouldRunReactions) {
        reactionsScheduled = true;
        reactionsRunner(runReactions);
    }
}

function runReactions() {
    try {
        let i = 100;
        while (reactionsQueue.length || stateActualizationQueue.length) {
            let comp;
            while ((comp = stateActualizationQueue.pop())) {
                comp._actualizeAndRecompute();
            }

            while (reactionsQueue.length && --i) {
                const reactions = reactionsQueue;
                reactionsQueue = [];
                reactions.forEach(apply);
            }
            if (!i) {
                throw new Error("infinite reactions loop");
            }
        }

        let check;
        while ((check = subscriberChecks.pop())) {
            check();
        }
    } finally {
        reactionsScheduled = false;
        reactionsQueue = [];
    }
}

function observable(value, checkFn) {
    let subscribers = new Set();

    checkFn = checkFn && action(checkFn);

    const self = {
        _addSubscriber(subscriber) {
            subscribers.add(subscriber);
        },
        _removeSubscriber(subscriber) {
            subscribers.delete(subscriber);
        },
    };

    const notify = () => {
        subscribers.forEach((subs) => subs._notify(States.DIRTY, self));
        !txDepth && endTx();
    };

    return {
        get value() {
            if (subscriber && !subscribers.has(subscriber)) {
                subscribers.add(subscriber);
                subscriber._addSubscription(self);
            }
            return value;
        },
        set value(_value) {
            if (subscriber && subscriber._actualizeAndRecompute) {
                throw new Error("changing observable inside of computed");
            }
            if (checkFn && checkFn(value, _value)) {
                return;
            }
            value = _value;
            notify();
        },
        notify,
        $$observable: true,
    };
}

function computed(fn, checkFn) {
    let value;
    let state = States.NOT_INITIALIZED;
    let subscriptions = [];
    let subscriptionsToActualize = [];
    let subscribers = new Set();

    checkFn = checkFn && action(checkFn);

    const removeSubscriptions = () => {
        subscriptions.forEach((subs) => subs._removeSubscriber(self));
        subscriptions = [];
        subscriptionsToActualize = [];
    };

    const destroy = () => {
        state = States.NOT_INITIALIZED;
        value = undefined;
        removeSubscriptions();
    };

    const notify = (state) => {
        subscribers.forEach((subs) => subs._notify(state, self));
    };

    const self = {
        _addSubscription(subscription) {
            subscriptions.push(subscription);
        },
        _addSubscriber(subscriber) {
            if (state !== States.CLEAN) {
                self._actualizeAndRecompute();
            }
            subscribers.add(subscriber);
        },
        _removeSubscriber(subscriber) {
            subscribers.delete(subscriber);
            if (!subscribers.size) {
                subscriberChecks.push(() => !subscribers.size && destroy());
            }
        },
        _notify(_state, subscription) {
            if (state >= _state) return;

            if (checkFn) {
                if (state === States.CLEAN) notify(States.MAYBE_DIRTY);
            } else {
                notify(_state);
            }

            state = _state;

            if (state === States.MAYBE_DIRTY) {
                subscriptionsToActualize.push(subscription);
            } else {
                removeSubscriptions();
            }
        },
        _actualizeAndRecompute() {
            if (state === States.MAYBE_DIRTY) {
                const isClean = subscriptionsToActualize.every((subs) => {
                    subs._actualizeAndRecompute();
                    return state === States.MAYBE_DIRTY;
                });
                isClean && (state = States.CLEAN);
                subscriptionsToActualize = [];
            }

            if (state !== States.CLEAN) {
                const oldState = state;
                const oldValue = value;
                const oldSubscriber = subscriber;
                subscriber = (cacheOnUntrackedRead || oldSubscriber) && self;
                state = States.COMPUTING;
                try {
                    value = fn();
                    state =
                        cacheOnUntrackedRead || oldSubscriber
                            ? States.CLEAN
                            : States.NOT_INITIALIZED;
                } catch (e) {
                    destroy();
                    throw e;
                } finally {
                    subscriber = oldSubscriber;
                }

                if (checkFn && oldState !== States.NOT_INITIALIZED) {
                    if (checkFn(oldValue, value)) {
                        value = oldValue;
                    } else {
                        notify(States.DIRTY);
                    }
                }
            }
        },
    };

    return {
        get value() {
            if (state === States.COMPUTING) {
                throw new Error("recursive computed call");
            }

            self._actualizeAndRecompute();

            if (subscriber && !subscribers.has(subscriber)) {
                subscribers.add(subscriber);
                subscriber._addSubscription(self);
            }

            return value;
        },
        destroy,
        $$computed: true,
    };
}

observable.prop = observable;
computed.prop = computed;

function reaction(fn, manager) {
    let subscriptions = [];
    let children = [];
    let isDestroyed = false;

    const unsubscribe = () => {
        subscriptions.forEach((subs) => subs._removeSubscriber(self));
        subscriptions = [];

        children.forEach((child) => child._destroy());
        children = [];
    }

    const destroy = () => {
        unsubscribe();
        isDestroyed = true;
    };

    function run() {
        unsubscribe();

        subscriber && subscriber._addChild(self);

        const oldSubscriber = subscriber;
        subscriber = self;
        ++txDepth;
        try {
            isDestroyed = false;
            return fn.apply(undefined, arguments);
        } finally {
            subscriber = oldSubscriber;
            if (!--txDepth) endTx();
        }
    }

    const self = {
        _addSubscription(subscription) {
            subscriptions.push(subscription);
        },
        _addChild(child) {
            children.push(child);
        },
        _notify(state, subscription) {
            if (state === States.MAYBE_DIRTY) {
                stateActualizationQueue.push(subscription);
            } else {
                unsubscribe();
                reactionsQueue.push(() => !isDestroyed && (manager || run)());
            }
        },
        _destroy: destroy,
    };

    return {
        run,
        destroy,
        unsubscribe() {
            subscriptions.forEach((subs) => subs._removeSubscriber(self));
        },
        subscribe() {
            subscriptions.forEach((subs) => subs._addSubscriber(self));
        },
    };
}

function makeModel(_this, model) {
    if (!model) {
        model = _this;
        _this = {};
    }

    const fields = {};

    if (model.data) {
        const data =
            typeof model.data === "function" ? model.data() : model.data;
        Object.keys(data).forEach((key) => {
            const val = data[key];
            const obs =
                val && typeof val === "object" && val.$$observable
                    ? val
                    : observable(val);
            fields[key] = obs;
            _this["$" + key] = obs;
        });
    }

    if (model.computed) {
        Object.keys(model.computed).forEach((key) => {
            const val = model.computed[key];
            const comp =
                val && typeof val === "object" && val.$$computed
                    ? val
                    : computed(val);
            fields[key] = comp;
            _this["$" + key] = comp;
        });
    }

    makeObservable(_this, fields);

    if (model.actions) {
        Object.keys(model.actions).forEach((key) => {
            _this[key] = action(model.actions[key]);
        });
    }

    if (model.extra) {
        Object.assign(_this, model.extra);
    }

    return _this;
}

function makeObservable(_this, obj) {
    if (!obj) obj = _this;

    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (val && typeof val === "object") {
            if (val.$$observable) {
                Object.defineProperty(_this, key, {
                    enumerable: true,
                    get() {
                        return val.value;
                    },
                    set(value) {
                        val.value = value;
                    },
                });
            } else if (val.$$computed) {
                Object.defineProperty(_this, key, {
                    enumerable: true,
                    get() {
                        return val.value;
                    },
                });
            }
        }
    });

    return _this;
}

export {
    observable,
    computed,
    reaction,
    tx,
    utx,
    action,
    configure,
    makeModel,
    makeObservable,
};
