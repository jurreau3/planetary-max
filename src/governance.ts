export function defaultGovernance(mode: string) {
  return {
    mode,
    decision: mode === "strict" ? "allowed" : "advisory",
  };
}
