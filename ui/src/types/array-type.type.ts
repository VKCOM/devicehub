export type ArrayType<T> = T extends (infer Item)[] ? Item : T
