// ------------------------------
// MAX-OS Interactive State
// ------------------------------
private interactive = {
  windows: [] as Array<{
    id: string;
    title: string;
    kind: string;
    active: boolean;
    openedAt: number;
    z: number;
  }>,
  focusHistory: [] as Array<{ id: string; at: number }>,
  layout: [] as Array<{ id: string; x: number; y: number; w: number; h: number }>,
  windowTimeline: [] as Array<{ type: string; id: string; at: number }>,
  portal: {
    open: false,
    surface: null as string | null,
    timeline: [] as Array<{ type: string; surface: string; at: number }>,
  },
};
