import { useState } from 'react';
import { ThemeCustomizer } from './components/ThemeCustomizer';
import { ToastContainer } from './components/ToastContainer';
import { useGameSession } from './hooks/useGameSession';
import { useTheme } from './hooks/useTheme';
import { ModalShell } from './modals/ModalShell';
import { RoomRouterPage } from './pages/RoomRouterPage';

export function App() {
  const session = useGameSession();
  const themeState = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <>
      <RoomRouterPage session={session} onOpenTheme={() => setThemeOpen(true)} />

      {themeOpen && (
        <ModalShell
          title="Theme Customization"
          subtitle="Changes apply immediately and save to your browser"
          wide
          onClose={() => setThemeOpen(false)}
        >
          <ThemeCustomizer
            theme={themeState.theme}
            onSetMode={themeState.setMode}
            onUpdateField={themeState.updateField}
            onUpdateGroupColor={themeState.updateGroupColor}
            onReset={themeState.resetTheme}
          />
        </ModalShell>
      )}

      <ToastContainer toasts={session.toasts} onDismiss={session.dismissToast} />
    </>
  );
}

export default App;