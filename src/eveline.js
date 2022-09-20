const NOTIFY = Symbol();
const ADD_SUBSCRIPTION = Symbol();
const ADD_SUBSCRIBER = Symbol();
const REMOVE_SUBSCRIBER = Symbol();
const ACTUALIZE_AND_RECOMPUTE = Symbol();
const ADD_CHILD = Symbol();

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

function setRunner(runner) {
    reactionsRunner = runner;
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
        fn();
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
    if (!reactionsScheduled) {
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
                comp[ACTUALIZE_AND_RECOMPUTE]();
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
    }
}

function observable(value, checkFn) {
    let subscribers = new Set();

    const self = {
        get value() {
            if (subscriber && !subscribers.has(subscriber)) {
                subscribers.add(subscriber);
                subscriber[ADD_SUBSCRIPTION](self);
            }
            return value;
        },
        set value(_value) {
            if (checkFn && checkFn(value, _value)) {
                return;
            }
            value = _value;
            self.notify();
        },
        notify() {
            subscribers.forEach((subs) => subs[NOTIFY](States.DIRTY, self));
            !txDepth && endTx();
        },
        [ADD_SUBSCRIBER]: (subscriber) => {
            subscribers.add(subscriber);
        },
        [REMOVE_SUBSCRIBER]: (subscriber) => {
            subscribers.delete(subscriber);
        },
    };

    return self;
}

function computed(fn, checkFn) {
    let value;
    let state = States.NOT_INITIALIZED;
    let subscriptions = [];
    let subscriptionsToActualize = [];
    let subscribers = new Set();

    const removeSubscriptions = () => {
        subscriptions.forEach((subs) => subs[REMOVE_SUBSCRIBER](self));
        subscriptions = [];
        subscriptionsToActualize = [];
    };

    const destroy = () => {
        state = States.NOT_INITIALIZED;
        value = undefined;
        removeSubscriptions();
    };

    const notify = (state) => {
        subscribers.forEach((subs) => subs[NOTIFY](state, self));
    };

    const actualizeAndRecompute = () => {
        if (state === States.MAYBE_DIRTY) {
            const isClean = subscriptionsToActualize.every((subs) => {
                subs[ACTUALIZE_AND_RECOMPUTE]();
                return state === States.MAYBE_DIRTY;
            });
            isClean && (state = States.CLEAN);
            subscriptionsToActualize = [];
        }

        if (state === States.DIRTY || state === States.NOT_INITIALIZED) {
            const oldState = state;
            const oldValue = value;
            const oldSubscriber = subscriber;
            subscriber = self;
            state = States.COMPUTING;
            try {
                value = fn();
                state = States.CLEAN;
            } catch (e) {
                destroy();
                throw e;
            } finally {
                subscriber = oldSubscriber;
            }

            if (checkFn && oldState !== States.NOT_INITIALIZED) {
                if (!checkFn(oldValue, value)) {
                    value = oldValue;
                    return;
                }
                notify(States.DIRTY);
            }
        }
    };

    const self = {
        get value() {
            if (state === States.COMPUTING) {
                throw new Error("recursive computed call");
            }

            actualizeAndRecompute();

            if (subscriber && !subscribers.has(subscriber)) {
                subscribers.add(subscriber);
                subscriber[ADD_SUBSCRIPTION](self);
            }

            return value;
        },
        [ADD_SUBSCRIPTION]: (subscription) => {
            subscriptions.push(subscription);
        },
        [ADD_SUBSCRIBER]: (subscriber) => {
            subscribers.add(subscriber);
        },
        [REMOVE_SUBSCRIBER]: (subscriber) => {
            subscribers.delete(subscriber);
            !subscribers.size &&
                subscriberChecks.push(() => !subscribers.size && destroy());
        },
        [NOTIFY]: (_state, subscription) => {
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
        [ACTUALIZE_AND_RECOMPUTE]: actualizeAndRecompute,
    };

    return self;
}

function reaction(fn, _this, manager) {
    let subscriptions = [];
    let children = [];
    let willRun = true;

    const destroy = () => {
        subscriptions.forEach((subs) => subs[REMOVE_SUBSCRIBER](self));
        subscriptions = [];

        children.forEach((child) => child.destroy());
        children = [];

        willRun = false;
    };

    function run() {
        if (!willRun) return;

        destroy();

        subscriber && subscriber[ADD_CHILD](self);

        const oldSubscriber = subscriber;
        subscriber = self;
        ++txDepth;
        try {
            return fn.apply(_this, arguments);
        } finally {
            subscriber = oldSubscriber;
            if (!--txDepth) endTx();
        }
    }

    const self = {
        run,
        destroy,
        unsubscribe() {
            subscriptions.forEach((subs) => subs[REMOVE_SUBSCRIBER](self));
        },
        subscribe() {
            subscriptions.forEach((subs) => subs[ADD_SUBSCRIBER](self));
        },
        [ADD_SUBSCRIPTION]: (subscription) => {
            subscriptions.push(subscription);
        },
        [ADD_CHILD]: (child) => {
            children.push(child);
        },
        [NOTIFY]: (state, subscription) => {
            if (state === States.MAYBE_DIRTY) {
                stateActualizationQueue.push(subscription);
            } else if (!willRun) {
                destroy();
                willRun = true;
                reactionsQueue.push(manager || run);
            }
        },
    };

    return self;
}

function model(_this, model) {
    if (!model) {
        model = _this;
        _this = {};
    }

    if (model.data) {
        const data =
            typeof model.data === "function" ? model.data() : model.data;
        Object.keys(data).forEach((key) => {
            const val = data[key];
            const obs =
                val && typeof val === "object" && val[REMOVE_SUBSCRIBER]
                    ? val
                    : observable(val);
            Object.defineProperty(_this, key, {
                enumerable: true,
                get() {
                    return obs.value;
                },
                set(value) {
                    obs.value = value;
                },
            });
            _this["$" + key] = obs;
        });
    }

    if (model.computed) {
        Object.keys(model.computed).forEach((key) => {
            const val = model.computed[key];
            const comp =
                val && typeof val === "object" && val[REMOVE_SUBSCRIBER]
                    ? val
                    : computed(val);
            Object.defineProperty(_this, key, {
                enumerable: true,
                get() {
                    return comp.value;
                },
            });
            _this["$" + key] = comp;
        });
    }

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

module.exports = {
    observable,
    computed,
    reaction,
    tx,
    utx,
    action,
    setRunner,
    model,
};
