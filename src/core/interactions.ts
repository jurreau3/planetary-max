// FIXED: Constrain T to HTMLElement so DOM methods are allowed
export function attachInteraction<T extends HTMLElement>(node: T) {
  node.removeEventListener("click", () => {});
  node.removeEventListener("pointerdown", () => {});
}

export function detachInteraction<T extends HTMLElement>(node: T) {
  node.removeEventListener("click", () => {});
  node.removeEventListener("pointerdown", () => {});
}
