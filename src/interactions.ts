// FIXED: Constrain T to HTMLElement so cloneNode + replaceWith work
export function swapNode<T extends HTMLElement>(node: T) {
  const clone = node.cloneNode(true) as HTMLElement;
  node.replaceWith(clone);
}

export function cloneAndReplace<T extends HTMLElement>(node: T) {
  const clone = node.cloneNode(true) as HTMLElement;
  node.replaceWith(clone);
}
