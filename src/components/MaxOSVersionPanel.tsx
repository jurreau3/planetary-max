import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function MaxOSVersionPanel() {
  const [version, setVersion] = useState<unknown>(null);

  useEffect(() => {
    api.version.read().then(setVersion).catch(console.error);
  }, []);

  return (
    <section>
      <h2>MAX‑OS‑1 Version</h2>
      <pre>{JSON.stringify(version, null, 2)}</pre>
    </section>
  );
}
