import { useEffect, useState } from 'react';
import { api } from '../api/client';

export function KernelPanel() {
  const [kernel, setKernel] = useState<unknown>(null);

  useEffect(() => {
    api.kernel.status().then(setKernel).catch(console.error);
  }, []);

  return (
    <section>
      <h2>PortalKernel</h2>
      <pre>{JSON.stringify(kernel, null, 2)}</pre>
    </section>
  );
}
