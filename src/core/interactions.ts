export interface PortalInteractionHandler {
  onHover?: (state: string) => void;
  onClick?: (state: string) => void;
  onEvent?: (event: string) => void;
}

export function bindInteractions<T extends EventTarget>(
  target: T,
  handlers: PortalInteractionHandler = {},
) {
  const onHover = () => {
    handlers.onHover?.('hover');
    handlers.onEvent?.('pointerover');
  };
  const onClick = () => {
    handlers.onClick?.('click');
    handlers.onEvent?.('pointerdown');
  };

  target.addEventListener('pointerover', onHover);
  target.addEventListener('pointerdown', onClick);

  return () => {
    target.removeEventListener('pointerover', onHover);
    target.removeEventListener('pointerdown', onClick);
  };
}
