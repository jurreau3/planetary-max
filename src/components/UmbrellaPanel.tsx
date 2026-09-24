import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function UmbrellaPanel() {
  const [umbrella, setUmbrella] = useState<unknown>(null);

  useEffect(() => {
    api.umbrella.status().then(setUmbrella).catch(console.error);
  }, []);

  return (
    <section className="panel">
      <h2>Umbrella Enforcement</h2>
      <pre>{JSON.stringify(umbrella, null, 2)}</pre>
    </section>
  );
}
