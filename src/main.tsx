import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KernelPanel } from './components/KernelPanel';
import { StatePanel } from './components/StatePanel';
import { UmbrellaPanel } from './components/UmbrellaPanel';
import { Phase11Panel } from './components/Phase11Panel';
import { PlanetaryModePanel } from './components/PlanetaryModePanel';
import { MaxOSVersionPanel } from './components/MaxOSVersionPanel';
import './styles.css';

function App() {
  return (
    <>
      <h1>Portal-OS Console</h1>
      <KernelPanel />
      <StatePanel />
      <UmbrellaPanel />
      <Phase11Panel />
      <PlanetaryModePanel />
      <MaxOSVersionPanel />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
