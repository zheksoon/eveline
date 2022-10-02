import { useState, useRef, useMemo, useEffect } from "react";
import { reaction } from "eveline";

const EMPTY_ARR = [];

const ABANDONED_RENDERER_CHECK_INTERVAL = 10_000;

let isSSR = false;

export function configure(options) {
    if (options.isSSR !== undefined) {
        isSSR = !!options.isSSR;
    }
}

function createDebounceQueueCheckStrategy() {
    let currentItems = new Set();
    let futureItems = new Set();
    let timeout;

    function process() {
        timeout = null;

        const currentQueue = currentItems;

        currentItems = futureItems;
        futureItems = new Set();

        currentQueue.forEach((reaction) => {
            reaction.destroy();
        });

        if (currentItems.size > 0) {
            triggerTimeout();
        }
    }

    function triggerTimeout() {
        if (!timeout) {
            timeout = setTimeout(process, ABANDONED_RENDERER_CHECK_INTERVAL);
        }
    }

    return {
        _add(_referencedObject, reaction) {
            futureItems.add(reaction);
            currentItems.delete(reaction);

            triggerTimeout();
        },
        _remove(_referencedObject, reaction) {
            futureItems.delete(item);
            currentItems.delete(item);
        },
    };
}

function createFinalizationRegistryCheckStrategy() {
    registry = new FinalizationRegistry((reaction) => {
        reaction.destroy();
    });

    return {
        _add(referencedObject, reaction) {
            registry.register(referencedObject, reaction, referencedObject);
        },
        _remove(referencedObject, reaction) {
            registry.unregister(referencedObject);
        },
    };
}

const abandonedRendererCheckStrategy =
    typeof FinalizationRegistry !== "undefined"()
        ? createFinalizationRegistryCheckStrategy()
        : createDebounceQueueCheckStrategy();

class RetainedObject {
    static factory() {
        return new RetainedObject();
    }
}

export function useObserver(fn) {
    if (isSSR) {
        return fn();
    }

    const [, triggerUpdate] = useState(null);
    const [retainedObject] = useState(RetainedObject.factory);

    const fnRef = useRef(fn);
    fnRef.current = fn;

    const r = useMemo(() => {
        const forceUpdate = () => triggerUpdate({});
        const reactionFn = () => fnRef.current();
        return reaction(reactionFn, forceUpdate);
    }, EMPTY_ARR);

    const isEffectCleanupExecuted = useRef(false);

    abandonedRendererCheckStrategy.add(retainedObject, r);

    useEffect(() => {
        abandonedRendererCheckStrategy.remove(retainedObject, r);

        if (isEffectCleanupExecuted.current) {
            r.subscribe();
        }

        return () => {
            r.unsubscribe();
            isEffectCleanupExecuted.current = true;
        };
    }, EMPTY_ARR);

    return r.run();
}

// see https://github.com/mobxjs/mobx-react-lite/blob/master/src/observer.ts
const hoistBlackList = {
    $$typeof: true,
    render: true,
    compare: true,
    type: true,
};

function copyStaticProperties(base, target) {
    Object.keys(base).forEach((key) => {
        if (!hoistBlackList[key]) {
            const descriptor = Object.getOwnPropertyDescriptor(base, key);
            Object.defineProperty(target, key, descriptor);
        }
    });
}

export function observer(component) {
    const wrapped = function (props, contextOrRef) {
        return useObserver(() => component(props, contextOrRef));
    };

    copyStaticProperties(component, wrapped);

    wrapped.displayName = component.displayName || component.name;

    return wrapped;
}

function shouldConstruct(Component) {
    const prototype = Component.prototype;
    return !!(prototype && prototype.isReactComponent);
}

export function observerClass(Component) {
    if (!shouldConstruct(Component)) {
        throw new Error("observerClass must receive only class component");
    }

    const wrapped = class extends Component {
        _retainedObject = new RetainedObject();

        _reaction = reaction(
            () => super.render(),
            () => this.forceUpdate()
        );

        componentWillUnmount() {
            if (super.componentWillUnmount) {
                super.componentWillUnmount();
            }

            this._reaction.destroy();
        }

        componentDidMount() {
            abandonedRendererCheckStrategy.remove(
                this._retainedObject,
                this._reaction
            );

            if (super.componentDidMount) {
                super.componentDidMount();
            }
        }

        render() {
            if (isSSR) {
                return super.render();
            }

            abandonedRendererCheckStrategy.add(
                this._retainedObject,
                this._reaction
            );

            return this._reaction.run();
        }
    };

    wrapped.displayName = Component.displayName || Component.name;

    return wrapped;
}
