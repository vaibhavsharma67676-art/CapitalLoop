import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeCustomizer } from './components/ThemeCustomizer';
import { ToastContainer } from './components/ToastContainer';
import { useGameSession } from './hooks/useGameSession';
import { useTheme } from './hooks/useTheme';
import { AboutLegalModal, type InfoModalTab } from './modals/AboutLegalModal';
import { ModalShell } from './modals/ModalShell';
import { RoomRouterPage } from './pages/RoomRouterPage';

export function App() {
  const session = useGameSession();
  const themeState = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<InfoModalTab | null>(null);

  return (
    <ErrorBoundary>
      <RoomRouterPage
        session={session}
        onOpenTheme={() => setThemeOpen(true)}
        onOpenInfo={(tab = 'about') => setInfoTab(tab)}
      />

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

      {infoTab && (
        <AboutLegalModal
          initialTab={infoTab}
          discordInviteUrl={session.publicConfig.discord.inviteUrl}
          onClose={() => setInfoTab(null)}
        />
      )}

      <ToastContainer toasts={session.toasts} onDismiss={session.dismissToast} />
    </ErrorBoundary>
  );
}

export default App;
