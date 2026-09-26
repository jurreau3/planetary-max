// ADD AT TOP WITH OTHER IMPORTS
import {
  loadScheduler,
  saveScheduler,
  generateTick,
  toSchedulerEnvelope,
} from "../do/PortalScheduler";

// ADD TO SWITCH
case "portal:scheduler":
  return this.handlePortalScheduler();

// ADD HANDLER
async handlePortalScheduler(): Promise<Response> {
  let scheduler = await loadScheduler(this.state);
  const quantum = await loadQuantum(this.state);
  const advisory = await loadAdvisory(this.state);
  const identitySurface = await loadIdentitySurface(this.state);

  const tick = generateTick(quantum, advisory, identitySurface);

  scheduler = {
    ticks: [...scheduler.ticks, tick],
    lastTick: tick.timestamp,
  };

  await saveScheduler(this.state, scheduler);

  return Response.json(toSchedulerEnvelope(scheduler));
}
