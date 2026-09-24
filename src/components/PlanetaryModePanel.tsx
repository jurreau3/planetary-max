import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function PlanetaryModePanel() {
  const [mode, setMode] = useState<unknown>(null);

  useEffect(() => {
    api.planetary.mode().then(setMode).catch(console.error);
  }, []);

  return (
    <section>
      <h2>Planetary Mode</h2>
      <pre>{JSON.stringify(mode, null, 2)}</pre>
    </section>
  );
}
