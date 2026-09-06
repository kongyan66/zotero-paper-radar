export interface CollectionNode {
  readonly key: string;
  readonly name: string;
  readonly parentKey?: string | false;
}

export function expandExcludedCollectionKeys(
  collections: readonly CollectionNode[],
  excludedRoots: readonly string[],
): ReadonlySet<string> {
  const children = new Map<string, string[]>();
  for (const collection of collections) {
    if (!collection.parentKey) continue;
    const entries = children.get(collection.parentKey) ?? [];
    entries.push(collection.key);
    children.set(collection.parentKey, entries);
  }
  const excluded = new Set<string>();
  const queue = [...excludedRoots];
  while (queue.length) {
    const key = queue.shift()!;
    if (excluded.has(key)) continue;
    excluded.add(key);
    queue.push(...(children.get(key) ?? []));
  }
  return excluded;
}

export function buildCollectionPathMap(
  collections: readonly CollectionNode[],
): ReadonlyMap<string, readonly string[]> {
  const byKey = new Map(
    collections.map((collection) => [collection.key, collection]),
  );
  const paths = new Map<string, readonly string[]>();
  for (const collection of collections) {
    const names: string[] = [];
    const visited = new Set<string>();
    let current: CollectionNode | undefined = collection;
    while (current && !visited.has(current.key)) {
      visited.add(current.key);
      names.unshift(current.name);
      current = current.parentKey ? byKey.get(current.parentKey) : undefined;
    }
    paths.set(collection.key, names);
  }
  return paths;
}
