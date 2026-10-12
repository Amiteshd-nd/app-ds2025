import { createRoot } from 'react-dom/client';
import { SaveManager } from '../systems/SaveManager';
import { PLAYGROUND_SAVE_NAMESPACE } from '../dev/devApi';
import Playground from './Playground';
import './playground.css';

// Playground saves never touch the player's real slot — set before anything can autosave.
SaveManager.useNamespace(PLAYGROUND_SAVE_NAMESPACE);

// Theme colours come from the dev-tool tokens (ADR-108); Playground applies them.

// No StrictMode: its double-mount would boot two Phaser games.
createRoot(document.getElementById('playground')!).render(<Playground />);
