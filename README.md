<p align="center">
  <img align="center" src="https://github.com/zheksoon/eveline/blob/main/assets/eveline-logo.svg?raw=true" width="350" alt="Eveline" /> 
</p>

<p align="center">☘️ Full-featured 1KB state management ☘️</p>

<p align="center">
  <a href="https://www.npmjs.com/package/eveline" > 
    <img src="https://badgen.net/npm/v/eveline?color=5fbfcd"/> 
  </a>
  <a href="https://bundlephobia.com/package/eveline" > 
    <img src="https://badgen.net/badgesize/gzip/file-url/unpkg.com/eveline/dist/eveline.js?color=5fbfcd&label=eveline/core"/> 
  </a>
  <a href="https://bundlephobia.com/package/eveline" > 
    <img src="https://badgen.net/badgesize/gzip/file-url/unpkg.com/eveline/react/dist/eveline-react.js?color=5fbfcd&label=eveline/react"/>
  </a>
  <a href="https://codecov.io/gh/zheksoon/eveline" > 
    <img src="https://badgen.net/codecov/c/github/zheksoon/eveline?color=5fbfcd"/> 
  </a>
  <a href="https://github.com/zheksoon/eveline/blob/main/LICENSE" > 
    <img src="https://badgen.net/github/license/zheksoon/eveline?color=5fbfcd"/> 
  </a>
</p>

* 🚀 Reactive observable and computed values - just like MobX, Solid.js or Preact Signals
* 👁 Transparency - no data glitches guaranteed
* 🔄 Transactional updates - no unexpected side-effects
* 🙈 Lazyness - nothing happens until you need a value
* 🤓 Value-checked computeds - easily optimize your re-renders
* ✅ Optimality - nothing can be done significantly better with all the guarantees
* ⚙️ Customizable reaction scheduler for async flows
* 🥏 Composable transparent models for convenient development
* 💾 IE11 support - just ES6 `Set` is required
* 💯 100% tests coverage with complex cases
* ⭐️ Full TypeScript support
* 📦 ...and all in 1KB package

## Installation
```
npm install --save eveline
yarn add eveline
```

## Table of contents

- [Basics](#basics)
- [Value-checked observables and computeds](#value-checked-observables-and-computeds)
- [Models](#models)
  * [Class models](#class-models)
- [Async actions and custom schedulers](#async-actions-and-custom-schedulers)
- [React bindings](#react-bindings)
- [API](#api)
  * [observable(value[, checkFn])](#observablevalue-checkfn)
  * [computed(fn[, checkFn])](#computedfn-checkfn)
  * [reaction(fn[, manager])](#reactionfn-manager)
  * [tx(thunk)](#txthunk)
  * [utx(fn)](#utxfn)
  * [action(fn)](#actionfn)
  * [makeModel(model)](#makemodelmodel)
  * [makeModel(target, model)](#makemodeltarget-model)
  * [makeObservable(instance)](#makeobservableinstance)
  * [makeObservable(target, instance)](#makeobservabletarget-instance)
  * [configure(config)](#configureconfig)

## Basics
```jsx
import { observable, computed, reaction, tx } from 'eveline';

// reactive observable value
const counter = observable(0);

// reactive computed value
const double = computed(() => counter.value * 2);

// side-effect (reaction)
const logger = reaction(() => {
  console.log(`Double value of ${counter.value} is ${double.value}`);
});

// prints "Double value of 1 is 2" and subscribes to observable/computed changes
logger.run();

counter.value = 2;  // Prints "Double value of 2 is 4", syncronously by default

// run modifications in transaction - will react to the latest value only
tx(() => {
  counter.value = 3;
  counter.value = 4;
});

// destroy reaction - no more logs after that
logger.destroy();
```

## Value-checked observables and computeds
```jsx
const check = Object.is;

// second argument to observable is value-check function (like Object.is)
const a = observable(5, check);
const b = observable(10, check);

// second argument for computed is value-check function too
const sum = computed(() => a.value + b.value, check);

// react to sum changes
reaction(() => {
  console.log(`Sum is ${sum.value}`);
}).run();

a.value = 5;  // value is the same - no reaction
a.value = 10; // logs "Sum is 20"
b.value = 20; // logs "Sum is 30"

tx(() => {
  a.value = 20;
  b.value = 10; // both values are changed, but sum did not change - no logs here
});
```

## Models

Easily make observable values transparent and collocate related computeds and actions in one place

```jsx
import { makeModel } from "eveline";
import { observer } from "eveline/react";

export const makeCounter = (initial) => {
  const self = makeModel({
    data: {
      count: initial
    },
    computed: {
      double() { return self.count * 2; }
    },
    actions: {
      inc() { self.count += 1; },
      dec() { self.count -= 1; }
    }
  });

  return self;
};

export const Counter = observer(({ model }) => {
  return (
    <>
      <button onClick={model.dec}>-</button>
      <button onClick={model.inc}>+</button>
      Double of {model.count} is {model.double}
    </>
  );
});

const counter = makeCounter(0);

ReactDOM.render(<Counter model={counter} />, document.body);
```

### Class models

Like classes and OOP? No problems!

```js
import { observable, computed, action, makeObservable } from 'eveline';

class CounterModel {
  count = observable.prop(0)
  double = computed.prop(() => this.count * 2)
  
  constructor() {
    makeObservable(this);
  }
  
  inc = action(() => {
    this.count += 1;
  })
  
  dec = action(() => {
    this.count -= 1;
  })
}

const counter = new CounterModel();
```

## Async actions and custom schedulers

By default, all effects in **Eveline** are syncronous, so for async actions you need to wrap every syncronous block into a transaction:

```js
import { action, utx } from 'eveline';

class Model {
  isFetching = observable.prop(false)
  data = observable.prop(null)
  error = observable.prop(null)
  
  fetchData = action(async () => {
    this.isFetching = true;
    
    try {
      const response = await fetch('someurl');
      const data = await response.json();
      
      utx(() => {
        this.isFetching = false;
        this.data = data;
      })
    } catch (err) {
      utx(() => {
        this.isFetching = false;
        this.error = err;
      })
    }
  })
}

```

Keeping writing `utx(() => {})` for every syncronous block is quite cumbersome, so there is a simpler way - to change a reaction runner to microtask:

```js
import { configure } from 'eveline';

configure({
  reactionRunner: (runner) => Promise.resolve().then(runner),
})
```

After that, all your observable changes will be automatically batched till the current microtask end, and reactions will run only after that. 
This enables writing transparent async code without worrying about sync/async blocks:

```js
class Model {
  isFetching = observable.prop(false)
  data = observable.prop(null)
  error = observable.prop(null)
  
  fetchData = action(async () => {
    this.isFetching = true;
    
    try {
      const response = await fetch('someurl');
      this.data = await response.json();
    } catch (err) {
      this.error = err;
    } finally {
      this.isFetching = false;
    }
  })
}
```

## React bindings

**Eveline** includes React bindings, ready for concurrent and Strict mode.

After wrapping a component in `observer`, it re-renders when any values it reads change.

```ts
import { observer } from 'eveline/react';

const Component = observer(({ model }) => {
  return <>Count is: {model.count}</>;
)}
```

Or alternatively, use `useObserver` inside of component to read reactive values:

```ts
import { useObserver } from 'eveline/react';

const Component = ({ model }) => {
  const [count, double] = useObserver(() => [model.count, model.double]);
  
  return <>Double of {count} is {double}</>;
)
```

For class components use `observerClass`:

```ts
class CounterComponent extends React.PureComponent {
  render() {
    const { model } = this.props;
    
    return <>Count is: {model.count}</>
  }
}

const Counter = observerClass(CounterComponent);
```

## API

### observable(value[, checkFn])

```ts
const checkFn = (prev: number, next: number) => prev === next;
const count = observable<number>(0, checkFn);

count.value;      // read value
count.value = 10; // write value

count.notify();   // notify about change without changing value;

count.$$observable === true;
```

### computed(fn[, checkFn])

```ts
const checkFn = (prev: number, next: number) => prev === next;
const double = computed(() => count.value * 2, checkFn);

double.value;     // read value
double.destroy(); // unsubscribe from dependencies and free cached value

double.$$computed === true;
```

### reaction(fn[, manager])

```ts
const log = reaction(() => {
  console.log('double is', double.value);
});

log.run();  // run reaction and subscribe to dependencies
log.run();  // run reaction again

log.run(1, 2, 3);  // pass arguments to reaction and return fn result

log.destroy();  // destroy reaction, unsubscribe from subscriptions

log.unsubscribe();  // unsubscribe from subscriptions, but keep them for future
log.subscribe();    // subscribe to stored subscriptions after unsubscribe

// manager usage
const asyncLog = reaction(
  () => console.log(double.value),
  () => setTimeout(asyncLog.run, 1000),
);

asyncLog.run(); // prints immediately

count.value = 100;  // prints after 1 second
```

### tx(thunk)

Batch observable changes and run reactions only after last transaction end

```ts
const a = observable(10);
const b = observable(20);

tx(() => {
  a.value = 100;
  b.value = 200;
});
```

### utx(fn)

The same as `tx(thunk)`, but do not track reads of observables inside of `thunk` and return `fn` result.

```ts
const r = reaction(() => {
  a.value;
  console.log(utx(() => b.value));
});

r.run();  // r depends on a, but not on b
```

### action(fn)

Returns a function wrapped in `utx`, that passes its argument to `fn` and returns its result

```ts
const inc = action((value) => {
  count.value += value;
})

inc(100);
```

### makeModel(model)
### makeModel(target, model)

Construct an observable model from model descriptor. If `target` parameter is given, all field declarations are done on it.

```ts
const model = makeModel({
  // data section is converted to observable fields with getters and setters
  // if a field is an observable, it's passed as is
  // the section can be a function returning an object
  data: {
    counter: 0,
    greeting: 'hello',
    increment: observable(0, checkFn),
  },
  // computed section is converted to getters
  // if a field is a computed, it's passed as is
  computed: {
    double() {
      return model.count * 2;
    },
    doubleGreeting: computed(() => {
      return model.greeting + ' ' + model.greeting;
    }, checkFn),
  },
  // actions section wraps every function to action
  actions: {
    inc() {
      model.counter += model.increment;
    },
    setGreeting(greeting: string) {
      model.greeting = greeting;
    },
  },
  // extra section is assigned to result as is
  extra: {
    id: uuid(),
  }
}

model.counter;  // returns 0
model.greeting; // returns 'hello'

model.counter = 100;

model.double; // returns 200

model.inc();  // perform action
model.setGreeting('hola');

model.id; // extra fields are accessable as is

model.$counter; // returns observable instance
model.$double;  // returns computed instance
```

### makeObservable(instance)
### makeObservable(target, instance)

Convert all observable and computed fields on `instance` to getters/setters. If `target` parameter is given, all declarations are done on it.

```ts
class Model {
  // use .prop to make Typescript think it's already a number, not observable
  counter = observable.prop(0);
  
  // the same for computed.prop
  double = computed.prop(() => this.counter * 2)
  
  constructor() {
    makeObservable(this);
  }
  
  inc = action(() => {
    this.counter += 1;
  })
}

const model = new Model();

model.counter;  // returns 0
model.counter = 100;

model.double;   // returns 200

model.inc();    // perform action
```

### configure(config)

```ts
const defaultConfig = {
  // default reaction runner, runs the `runner` fn immediately
  // see above for microtask runner for convenient async operations
  reactionRunner: (runner) => runner(),
  // cacheOnUntrackedRead allows to make computed values not to cache the result
  // when they are read in untracked context (utx, action) or without it
  // default value is true, but for real applications it's better to turn it off to prevent memory leaks
  cacheOnUntrackedRead: true,
}

configure(defaultConfig),
```
