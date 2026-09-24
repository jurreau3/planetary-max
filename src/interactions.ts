export function detach(target: Element) {
  target.replaceWith(target.cloneNode(true));
}

export function swapNode<T extends Element>(node: T) {
  node.replaceWith(node.cloneNode(true));
}

export function cloneAndReplace<T extends Element>(node: T) {
  node.replaceWith(node.cloneNode(true));
}
