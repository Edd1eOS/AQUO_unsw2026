/**
 * [DEV ONLY] Quick license reset button for testing the activation flow.
 * Rendered only when import.meta.env.DEV === true (stripped from production build).
 *
 * Removes the license record from chrome.storage.local, which triggers
 * useLicense's onChanged listener and immediately returns the UI to the
 * LicenseForm (activation screen) — no reload required.
 */

import { useState } from 'react';

export function DevDeactivateButton() {
  const [feedback, setFeedback] = useState<'idle' | 'done'>('idle');

  const handleReset = async () => {
    // Clear both license and cloud API key to force back through all onboarding gates
    await chrome.storage.local.remove([
      'dataplumber_license',
      'dataplumber_cloud_api_key',  // 旧版 key
      'dataplumber_cloud_config',   // 新版 CloudConfig key
    ]);
    setFeedback('done');
    setTimeout(() => setFeedback('idle'), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      style={{ zIndex: 9999 }}
      className="fixed bottom-2 right-2 text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors select-none"
    >
      {feedback === 'done' ? 'Reset ✓' : '[Test] Reset All'}
    </button>
  );
}
