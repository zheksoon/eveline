type FunctionRecord = Record<any, (...args: any[]) => any>;

type Model<Data = any, Computed = any, Actions = any, Extra = any> = {
    data?: Data extends (...args: any[]) => infer R ? R : Data;
    computed?: Computed;
    actions?: Actions;
    extra?: Extra;
};

type FlatModel<Data, Computed, Actions, Extra> = Computed extends FunctionRecord
    ? Data & {
          readonly [Prop in keyof Computed]: ReturnType<Computed[Prop]>;
      } & Actions &
          Extra &
          (Data extends Record<any, any>
              ? {
                    [Prop in keyof Data as `$${Prop}`]: IObservable<Data[Prop]>;
                }
              : unknown) &
          (Computed extends Record<any, any>
              ? {
                    [Prop in keyof Computed as `$${Prop}`]: IComputed<
                        Computed[Prop]
                    >;
                }
              : unknown)
    : Data &
          Actions &
          Extra &
          (Data extends Record<any, any>
              ? {
                    [Prop in keyof Data as `$${Prop}`]: IObservable<Data[Prop]>;
                }
              : unknown);

type ReturnModel<T> = T extends Model<
    infer Data,
    infer Computed,
    infer Actions,
    infer Extra
>
    ? FlatModel<Data, Computed, Actions, Extra>
    : never;

export interface IConfig {
    reactionRunner?: (runner: () => void) => void;
    cacheOnUntrackedRead?: boolean;
}

export interface IObservable<T> {
    value: T;
    notify: () => void;
    $$observable: true;
}

export interface IComputed<T> {
    readonly value: T;
    destroy: () => void;
    $$computed: true;
}

export interface IReaction<Args extends any[], Result> {
    run: (...args: Args) => Result;
    destroy: () => void;
    unsubscribe: () => void;
    subscribe: () => void;
}

export function configure(config: IConfig): void;

export function observable<T, S = T>(
    value: T,
    checkFn?: (prev: S, next: S) => boolean
): IObservable<T>;

export declare module observable {
    export function prop<T, S = T>(
        value: T,
        checkFn?: (prev: S, next: S) => boolean
    ): T;
}

export function computed<T, S = T>(
    fn: () => T,
    checkFn?: (prev: S, next: S) => boolean
): IComputed<T>;

export declare module computed {
    export function prop<T, S = T>(
        fn: () => T,
        checkFn?: (prev: S, next: S) => boolean
    ): T;
}

export function reaction<Args extends any[], Result>(
    fn: (...args: Args) => Result,
    manager?: () => void
): IReaction<Args, Result>;

export function tx(thunk: () => void): void;

export function utx<T>(fn: () => T): T;

export function action<Args extends any[], Result>(
    fn: (...args: Args) => Result
): (...args: Args) => Result;

export function makeModel<T extends Model>(_model: T): ReturnModel<T>;
export function makeModel<T extends Model, S extends ReturnModel<T>>(
    _this: S,
    _model: T
): S;

export function makeObservable<T extends Record<any, any>>(obj: T): T;
export function makeObservable<T, S extends T>(_this: S, obj: T): S;
