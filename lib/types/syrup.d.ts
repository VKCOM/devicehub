declare module '@devicefarmer/stf-syrup' {
    import Bluebird from 'bluebird'
    type extractDesRet<RetT> = RetT extends SyrupI<never, never, infer RetX>
        ? RetX
        : unknown;
    type extractBluebirdReturnR<RetT> = RetT extends Bluebird<infer RetX>
        ? RetX
        : RetT extends Promise<infer RetX> ? RetX : RetT;
    export class SyrupI<
        OptionsT extends object = any, // TODO: find a way to remove any. Maybe we union all the options that are needed for each dependency?
        DepsT extends SyrupI[] = [],
        RetT = unknown | void,
        DepsRetsT extends (unknown | void)[] = [] // TODO: maybe we can extract DepsRetsT somehow?
    > {
        constructor(options: OptionsT | null);
        define<
            BodyT extends (options: OptionsT, ...deps: DepsRetsT) => unknown
        >(
            body: BodyT
        ): SyrupI<
            OptionsT,
            DepsT,
            extractBluebirdReturnR<ReturnType<typeof body>>,
            DepsRetsT
        >;
        dependency<DepT extends SyrupI<never, never>>(
            dep: DepT
        ): SyrupI<
            OptionsT,
            [...DepsT, DepT],
            RetT,
            [...DepsRetsT, extractDesRet<DepT>]
        >;
        consume<NewOptionsT extends OptionsT>(
            overrides: NewOptionsT
        ): Bluebird<RetT>;
        invoke(overrides: OptionsT, ...args: DepsT[]): RetT;
    }
    export type ParallelSyrup = <OptionsT extends object>(
        options?: OptionsT
    ) => SyrupI;
    export namespace ParallelSyrup {
        const Syrup: SyrupI
    }

    export type SerialSyrup = ParallelSyrup;
    export namespace SerialSyrup {
        const Syrup: SyrupI
    }

    export type Syrup = ParallelSyrup;
    export namespace Syrup {
        const serial: SerialSyrup
    }

    export default Syrup
}
