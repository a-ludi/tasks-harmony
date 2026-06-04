export function resolveChoreIdCollision(
  baseChoreId: string,
  baseTitle: string,
  existingChoreIds: Set<string>,
): { choreId: string; title: string } {
  if (!existingChoreIds.has(baseChoreId)) {
    return { choreId: baseChoreId, title: baseTitle };
  }
  let n = 2;
  while (existingChoreIds.has(`${baseChoreId}-${n}`)) n++;
  return { choreId: `${baseChoreId}-${n}`, title: `${baseTitle} ${n}` };
}
