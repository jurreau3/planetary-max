import { KernelPanel } from './components/KernelPanel';
import { StatePanel } from './components/StatePanel';
import { UmbrellaPanel } from './components/UmbrellaPanel';
import { Phase11Panel } from './components/Phase11Panel';
import { PlanetaryModePanel } from './components/PlanetaryModePanel';
import { MaxOSVersionPanel } from './components/MaxOSVersionPanel';

export default function App() {
  return (
    <>
      <h1>Portal‑OS Console Dashboard</h1>
      <div className="dashboard">
        <KernelPanel />
        <StatePanel />
        <UmbrellaPanel />
        <Phase11Panel />
        <PlanetaryModePanel />
        <MaxOSVersionPanel />
      </div>
    </>
  );
}
