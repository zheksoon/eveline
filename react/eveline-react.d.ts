import type { ComponentClass } from "react";

interface IOptions {
    isSSR?: boolean;
}

export function configure(options: IOptions);

export function useObserver<T>(fn: () => T): T;

interface RenderFn extends Record<any, any> {
    (...args: any[]): JSX.Element | JSX.Element[] | null;
    displayName?: string;
}

export function observer<T extends RenderFn>(component: T): T;

export function observerClass<T extends ComponentClass<any, any>>(
    Component: T
): T;
