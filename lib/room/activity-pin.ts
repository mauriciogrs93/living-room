/** The selected agent is the first Activity row. Everyone else keeps their order. */
export function orderAgents<T extends { id: string }>(agents: T[], selectedId: string | null): T[] {
  if (!selectedId) return agents;
  const index = agents.findIndex((agent) => agent.id === selectedId);
  if (index <= 0) return agents;
  return [agents[index]!, ...agents.slice(0, index), ...agents.slice(index + 1)];
}
