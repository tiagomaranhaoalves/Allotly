import { useEffect, useState } from "react";
import { ArenaSessionProvider, useArenaSession, getRememberedKey, clearRememberedKey } from "./session";
import { PersistentHeader } from "./components/persistent-header";
import { Splash } from "./components/splash";
import { KeyEntry } from "./components/key-entry";
import { AllocationScreen } from "./components/allocation-screen";
import { DualRoleStep } from "./components/dual-role-step";
import { ModePicker } from "./components/mode-picker";
import { PersonaArena } from "./components/persona-arena";
import { SecretKeeper } from "./components/secret-keeper";
import { ExhaustionScreen } from "./components/exhaustion-screen";
import { LiveToggleModal } from "./components/live-toggle-modal";
import { HowThisWorksDrawer } from "./components/how-this-works-drawer";
import { ShareForwardPanel } from "./components/share-forward-panel";
import { validateAllotlyKey } from "./engine/live";
import type { PersonaOrSecretKeeper, Persona } from "./types";

type Screen = "splash" | "key-entry" | "allocation" | "setup" | "mode-picker" | "mode" | "exhausted";

function ArenaInner() {
  const { state, setLiveKey, enterMode, reset } = useArenaSession();
  const [screen, setScreen] = useState<Screen>("splash");
  const [pendingMode, setPendingMode] = useState<PersonaOrSecretKeeper>("marketing");
  const [liveToggleOpen, setLiveToggleOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [rememberedKey] = useState<string | null>(() => getRememberedKey());

  useEffect(() => {
    if (state.isExhausted && screen !== "splash") {
      setScreen("exhausted");
    }
  }, [state.isExhausted, screen]);

  function handleStartCached() {
    reset();
    setScreen("allocation");
  }

  function handleEnterKey() {
    setScreen("key-entry");
  }

  async function handleResumeRemembered() {
    if (!rememberedKey) return;
    const res = await validateAllotlyKey(rememberedKey);
    if (!res.valid) {
      clearRememberedKey();
      return;
    }
    setLiveKey({
      keyValue: rememberedKey,
      keyType: res.keyType,
      totalBudgetUSD: res.budgetRemainingUSD,
      expiresAt: res.expiresAt,
      remember: true,
    });
    setScreen("allocation");
  }

  function handleValidated() {
    setScreen("allocation");
  }

  function handleAllocConfirm(mode: PersonaOrSecretKeeper) {
    setPendingMode(mode);
    setScreen("setup");
  }

  function handleSetupConfirm() {
    enterMode(pendingMode);
    setScreen("mode");
  }

  function handleSwitchMode() {
    setScreen("mode-picker");
  }

  function handlePickModeFromPicker(mode: PersonaOrSecretKeeper) {
    enterMode(mode);
    setScreen("mode");
  }

  function handleEndSession() {
    setScreen("exhausted");
  }

  function handleStartFresh() {
    reset();
    setScreen("splash");
  }

  function handleLiveFromExhausted() {
    setLiveToggleOpen(true);
  }

  function handlePasteKeyFromModal() {
    setLiveToggleOpen(false);
    setScreen("key-entry");
  }

  function handleCreateAccountFromModal() {
    setLiveToggleOpen(false);
    window.location.href = "/signup?return=/arena";
  }

  const showModeSwitch = screen === "mode" && state.allocationConfirmed && !state.isExhausted;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <PersistentHeader
        onOpenLiveToggle={() => setLiveToggleOpen(true)}
        onOpenHowItWorks={() => setHowOpen(true)}
        onSwitchMode={handleSwitchMode}
        showModeSwitch={showModeSwitch}
      />

      {screen === "splash" && (
        <Splash
          onStartCached={handleStartCached}
          onEnterKey={handleEnterKey}
          hasRememberedKey={!!rememberedKey}
          onResumeRemembered={handleResumeRemembered}
        />
      )}

      {screen === "key-entry" && (
        <KeyEntry
          onValidated={handleValidated}
          onFallbackToCached={handleStartCached}
          onCancel={() => setScreen("splash")}
        />
      )}

      {screen === "allocation" && (
        <AllocationScreen onConfirm={handleAllocConfirm} />
      )}

      {screen === "setup" && (
        <DualRoleStep onConfirm={handleSetupConfirm} />
      )}

      {screen === "mode-picker" && (
        <ModePicker onPick={handlePickModeFromPicker} />
      )}

      {screen === "mode" && state.currentMode && !state.isExhausted && (
        state.currentMode === "secret-keeper" ? (
          <SecretKeeper onSwitchMode={handleSwitchMode} onEndSession={handleEndSession} />
        ) : (
          <PersonaArena
            persona={state.currentMode as Persona}
            onSwitchMode={handleSwitchMode}
            onEndSession={handleEndSession}
          />
        )
      )}

      {screen === "exhausted" && (
        <ExhaustionScreen
          onStartFresh={handleStartFresh}
          onSwitchToLive={handleLiveFromExhausted}
          onShare={() => setShareOpen(true)}
        />
      )}

      <LiveToggleModal
        open={liveToggleOpen}
        onOpenChange={setLiveToggleOpen}
        onPasteKey={handlePasteKeyFromModal}
        onCreateAccount={handleCreateAccountFromModal}
      />
      <HowThisWorksDrawer open={howOpen} onOpenChange={setHowOpen} />
      <ShareForwardPanel open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}

export default function ArenaPage() {
  return (
    <ArenaSessionProvider>
      <ArenaInner />
    </ArenaSessionProvider>
  );
}
