import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function StatePanel() {
  const [state, setState] = useState<unknown>(null);

  useEffect(() => {
    api.state.read().then(setState).catch(console.error);
  }, []);

  return (
    <section>
      <h2>MAXOS_STATE</h2>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </section>
  );
}
