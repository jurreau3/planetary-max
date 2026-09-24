import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KernelPanel } from './components/KernelPanel';
import { StatePanel } from './components/StatePanel';
import { UmbrellaPanel } from './components/UmbrellaPanel';
import './styles.css';

function App() {
  return (
    <>
      <h1>Portal-OS Console</h1>
      <KernelPanel />
      <StatePanel />
      <UmbrellaPanel />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
