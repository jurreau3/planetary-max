import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function Phase11Panel() {
  const [phase, setPhase] = useState<unknown>(null);

  useEffect(() => {
    api.phase.status().then(setPhase).catch(console.error);
  }, []);

  return (
    <section>
      <h2>Phase‑11</h2>
      <pre>{JSON.stringify(phase, null, 2)}</pre>
    </section>
  );
}
