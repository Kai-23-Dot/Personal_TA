interface ModuleNamedSource {
  chunk: { moduleName?: string | null };
}

/**
 * Keep multi-unit practice context balanced so one content-heavy Canvas module
 * cannot crowd every other selected module out of the generation prompt.
 */
export function selectBalancedModuleSources<T extends ModuleNamedSource>(
  sources: readonly T[],
  selectedModuleNames: readonly string[],
  limit: number
): T[] {
  if (limit <= 0) return [];
  const names = [...new Set(selectedModuleNames.map((name) => name.trim()).filter(Boolean))];
  if (names.length <= 1) return sources.slice(0, limit);

  const buckets = names.map((name) => {
    const key = name.toLowerCase();
    return sources.filter(
      (source) => source.chunk.moduleName?.trim().toLowerCase() === key
    );
  });
  const selected: T[] = [];
  const selectedSet = new Set<T>();
  let bucketIndex = 0;

  while (selected.length < limit) {
    let added = false;
    for (const bucket of buckets) {
      const candidate = bucket[bucketIndex];
      if (!candidate || selectedSet.has(candidate)) continue;
      selected.push(candidate);
      selectedSet.add(candidate);
      added = true;
      if (selected.length >= limit) break;
    }
    if (!added) break;
    bucketIndex += 1;
  }

  for (const source of sources) {
    if (selected.length >= limit) break;
    if (selectedSet.has(source)) continue;
    selected.push(source);
    selectedSet.add(source);
  }
  return selected;
}
