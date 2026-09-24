import type { Bindings, KernelEnvelope } from './contracts';

export async function callKernel(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  const timeoutMs = Number(env.KERNEL_TIMEOUT_MS ?? 5000);
  const request = new Request('https://portal-kernel/api/kernel/message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope),
  });
  if (!env.PORTAL_KERNEL) throw new Error('PORTAL_KERNEL binding is not configured');
  const id = env.PORTAL_KERNEL.idFromName('portal-kernel');
  const response = env.PORTAL_KERNEL.get(id).fetch(request);
  return Promise.race([
    response,
    new Promise<Response>((_, reject) => setTimeout(() => reject(new Error(`Kernel timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}
