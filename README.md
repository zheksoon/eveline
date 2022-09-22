<h1 align="center">Eveline</h1>

<p align="center">☘️ Full-featured 1KB state management (WIP) ☘️</p>

* 🚀 Reactive observable and computed values - just like MobX or Preact Signals
* 👁 Transparency - no data glitches guaranteed
* 🔄 Transactional updates - no unexpected side-effects
* 🙈 Lazyness - nothing happens until you need a value
* 🤓 Value-checked computeds - easily optimize your re-renders
* ✅ Optimality - nothing can be done significantly better with all the guarantees
* ⚙️ Customizable reaction scheduler for async flows
* 🥏 Composable transparent models for convenient development
* ⭐️ Full TypeScript support 
* 📦 ...and all in 1KB package

## Installation
```
npm install --save eveline
yarn add eveline
```

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
import { makeModel } from 'eveline';
import { reactive } from 'eveline/react';

const makeCounter = (initial) => {
  const self = makeModel({
    data: {
      count: initial,
    },
    computed: {
      double() { return self.count * 2; },
    },
    actions: {
      inc() { self.count += 1; },
      dec() { self.count -= 1; },
    },
  }
  
  return self;
}

const Counter = reactive(({ model }) => {
  return <>
    Double of {model.count} is {model.double}
    <button onClick={model.inc}>+</button>
    <button onClick={model.dec}>-</button>
  </>
});

const counter = makeCounter(0);

ReactDOM.render(<Counter model={counter} />, document.body);
```
