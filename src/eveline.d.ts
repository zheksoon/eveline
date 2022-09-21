type FunctionRecord = Record<any, (...args: any[]) => any>;

type ReturnTypes<R> = R extends FunctionRecord
    ? {
          readonly [Prop in keyof R]: ReturnType<R[Prop]>;
      }
    : never;

type Model<Data = any, Computed = any, Actions = any, Extra = any> = {
    data: Data extends (...args: any[]) => infer R ? R : Data;
    computed?: Computed;
    actions?: Actions;
    extra?: Extra;
};

type FlatModel<Data, Computed, Actions, Extra> = Data &
    ReturnTypes<Computed> &
    Actions &
    Extra;

type ReturnModel<T> = T extends Model<
    infer Data,
    infer Computed,
    infer Actions,
    infer Extra
>
    ? FlatModel<Data, Computed, Actions, Extra>
    : never;

declare module eveline {
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
        $$computed: true;
    }

    export interface IReaction<Args, Result> {
        run: (...args: Args) => Result;
        destroy: () => void;
        unsubscribe: () => void;
        subscribe: () => void;
    }

    export function configure(config: IConfig): void;

    export function observable<T>(
        value: T,
        checkFn?: (prev: T, next: T) => boolean
    ): IObservable<T>;

    declare module observable {
        export function prop<T>(
            value: T,
            checkFn?: (prev: T, next: T) => boolean
        ): T;
    }

    export function computed<T>(
        fn: () => T,
        checkFn?: (prev: T, next: T) => boolean
    ): IComputed<T>;

    declare module computed {
        export function prop<T>(
            fn: () => T,
            checkFn?: (prev: T, next: T) => boolean
        ): T;
    }

    export function reaction<Args, Result>(
        fn: (...args: Args) => Result,
        manager?: () => void
    ): IReaction<Args, Result>;

    export function tx(thunk: () => void): void;

    export function utx<T>(fn: () => T): T;

    export function action<Args, Result>(
        fn: (...args: Args) => Result
    ): (...args: Args) => Result;

    export function model<T extends Model>(_model: T): ReturnModel<T>;
    export function model<T extends Model, S extends ReturnModel<T>>(
        _this: S,
        _model: T
    ): S;

    export function makeObservable<T>(_this: T): T;
    export function makeObservable<T, S extends T>(_this: S, obj: T): S;
}
