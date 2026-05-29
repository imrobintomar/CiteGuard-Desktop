import { useEffect, useState, useCallback } from "react";
import { Settings, LogOut, Crown, Sun, Moon, BookOpen, Bell, Zap } from "lucide-react";

import { ChatWindow }              from "./components/chat/ChatWindow";
import { ConversationList }        from "./components/chat/ConversationList";
import { CitationSidebar }         from "./components/citations/CitationSidebar";
import { CitationLibraryPanel }    from "./components/library/CitationLibraryPanel";
import { FirstLaunchWizard }       from "./components/setup/FirstLaunchWizard";
import { SettingsPanel }           from "./components/settings/SettingsPanel";

import { bridge }                  from "./lib/tauri-bridge";
import { loadConversations }       from "./lib/persistence";
import { useChatStore }            from "./stores/chatStore";
import { useModelStore }           from "./stores/modelStore";
import { useModelManager }         from "./hooks/useModelManager";
import { useAuthStore }            from "./stores/authStore";
import { AuthScreen }              from "./components/auth/AuthScreen";
import { VerifyEmailScreen }       from "./components/auth/VerifyEmailScreen";
import { logOut, refreshProfile } from "./lib/firebase";
import { useThemeStore, initTheme } from "./stores/themeStore";
import { useRetractionAlerts }     from "./hooks/useRetractionAlerts";
import { UpgradeModal }            from "./components/upgrade/UpgradeModal";

// Apply saved theme before first render
initTheme();

export default function App() {
  const [setupDone, setSetupDone]       = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showLibrary, setShowLibrary]   = useState(false);
  const [showUpgrade, setShowUpgrade]   = useState(false);
  const [alerts, setAlerts]             = useState<{ title: string; doi: string }[]>([]);

  const { hydrate }                     = useChatStore();
  const { setActiveModel, setAvailableModels } = useModelStore();
  const { session, profile, loading: authLoading, setProfile } = useAuthStore();
  const { theme, toggle: toggleTheme }  = useThemeStore();
  const { newConversation, setActive }  = useChatStore();
  useModelManager();

  // Retraction alert handler
  useRetractionAlerts((title, doi) => {
    setAlerts((prev) => [...prev, { title, doi }]);
  });

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const settings = await bridge.getSettings();
        setActiveModel(settings.active_model);
        setSetupDone(settings.setup_complete);
        const convs = await loadConversations();
        if (convs.length > 0) hydrate(convs);
        // Populate available models list
        const models = await bridge.listModels();
        setAvailableModels(models.map((m) => m.name));
      } catch {
        setSetupDone(false);
      }
    })();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    switch (e.key) {
      case "n":
        e.preventDefault();
        { const id = newConversation(); setActive(id); }
        break;
      case "k":
        e.preventDefault();
        setShowSettings((v) => !v);
        break;
      case "l":
        e.preventDefault();
        setShowLibrary((v) => !v);
        break;
      case "d":
        e.preventDefault();
        toggleTheme();
        break;
    }
  }, [newConversation, setActive, toggleTheme]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Auth / setup guards ─────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-cs-base flex items-center justify-center">
        <div className="text-cs-steel text-sm animate-pulse">Loading…</div>
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  if (!session.emailVerified) return <VerifyEmailScreen />;
  if (setupDone === null) {
    return (
      <div className="min-h-screen bg-cs-base flex items-center justify-center">
        <div className="text-cs-steel text-sm animate-pulse">Loading…</div>
      </div>
    );
  }
  if (!setupDone) return <FirstLaunchWizard onComplete={() => setSetupDone(true)} />;

  const DEV_EMAILS = new Set(["aiimsgenomics@gmail.com"]);
  const isDevOrLifetime = profile?.tier === "lifetime" || DEV_EMAILS.has(session?.email ?? "");
  const verificationsLeft = Math.max(0, 20 - (profile?.verificationsToday ?? 0));

  return (
    <div className="flex h-screen overflow-hidden bg-cs-base text-cs-text">
      <ConversationList />

      <div className="flex-1 flex flex-col min-w-0 relative">
        <ChatWindow />

        {/* Top-right toolbar */}
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          {/* Retraction alert bell */}
          {alerts.length > 0 && (
            <div className="relative group">
              <button className="p-1.5 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition">
                <Bell size={14} />
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {alerts.length}
                </span>
              </button>
              <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-72 bg-cs-surface border border-orange-500/40 rounded-xl shadow-xl z-50 p-3">
                <p className="text-xs font-bold text-orange-400 mb-2">Retraction Alerts</p>
                {alerts.map((a, i) => (
                  <div key={i} className="text-xs text-cs-text2 mb-1.5 pb-1.5 border-b border-cs-border last:border-0">
                    <p className="font-medium text-orange-300 line-clamp-1">{a.title}</p>
                    {a.doi && (
                      <a href={`https://doi.org/${a.doi}`} target="_blank" rel="noopener noreferrer"
                        className="text-cs-sky hover:text-white transition">
                        doi:{a.doi}
                      </a>
                    )}
                  </div>
                ))}
                <button onClick={() => setAlerts([])} className="text-xs text-cs-steel hover:text-white transition mt-1">
                  Dismiss all
                </button>
              </div>
            </div>
          )}

          {/* Tier badge */}
          {profile && (
            isDevOrLifetime ? (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                <Crown size={10} />Lifetime
              </span>
            ) : (
              <button
                onClick={() => setShowUpgrade(true)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-cs-hover text-cs-steel border border-cs-hover hover:border-yellow-500/50 hover:text-yellow-400 transition"
                title="Upgrade to Lifetime"
              >
                <Zap size={10} />
                Free · {verificationsLeft}/20
              </button>
            )
          )}

          {/* Model switcher */}
          <ModelSwitcher />

          {/* Library */}
          <button
            onClick={() => { setShowLibrary((v) => !v); setShowSettings(false); }}
            className={`p-1.5 rounded-lg transition ${showLibrary ? "bg-cs-cobalt text-white" : "hover:bg-cs-hover text-cs-steel hover:text-white"}`}
            title="Citation library (Cmd+L)"
          >
            <BookOpen size={16} />
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg hover:bg-cs-hover text-cs-steel hover:text-white transition"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (Cmd+D)`}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Settings */}
          <button
            onClick={() => { setShowSettings((v) => !v); setShowLibrary(false); }}
            className={`p-1.5 rounded-lg transition ${showSettings ? "bg-cs-cobalt text-white" : "hover:bg-cs-hover text-cs-steel hover:text-white"}`}
            title="Settings (Cmd+K)"
          >
            <Settings size={16} />
          </button>

          {/* Sign out */}
          <button
            onClick={logOut}
            className="p-1.5 rounded-lg hover:bg-cs-hover text-cs-steel hover:text-white transition"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-64 shrink-0">
        {showSettings
          ? <SettingsPanel onClose={() => setShowSettings(false)} />
          : showLibrary
          ? <CitationLibraryPanel onClose={() => setShowLibrary(false)} />
          : <CitationSidebar />}
      </div>

      {/* Upgrade modal */}
      {showUpgrade && session && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onUpgraded={async () => {
            const updated = await refreshProfile(session);
            if (updated) setProfile(updated);
            setShowUpgrade(false);
          }}
          session={session}
        />
      )}
    </div>
  );
}

// ── Model Switcher ────────────────────────────────────────────────────────────

function ModelSwitcher() {
  const { activeModel, availableModels, setActiveModel } = useModelStore();
  const [open, setOpen] = useState(false);

  if (!availableModels || availableModels.length <= 1) {
    return (
      <span className="text-xs text-cs-sky font-mono bg-cs-hover px-2.5 py-1 rounded-md border border-cs-border font-semibold">
        {activeModel}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-cs-sky font-mono bg-cs-hover px-2.5 py-1 rounded-md border border-cs-border font-semibold hover:border-cs-cobalt transition"
        title="Switch model"
      >
        {activeModel} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-cs-surface border border-cs-border rounded-xl shadow-xl z-50 overflow-hidden">
          {availableModels.map((m) => (
            <button
              key={m}
              onClick={() => { setActiveModel(m); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition ${
                m === activeModel
                  ? "bg-cs-cobalt text-white"
                  : "text-cs-text2 hover:bg-cs-hover hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
