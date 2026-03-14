/**
 * License Key input form
 * Shown when the user has no valid license or it has expired.
 *
 * Device_ID is read silently from Chrome storage and appended to outbound
 * URLs — it is never rendered in the UI.
 */

import { useState, useEffect } from 'react';
import { KeyRound, Loader2, ExternalLink, FlaskConical } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Alert, AlertDescription } from './ui/alert';
import type { LicenseState } from '../types/license';

/** Lemon Squeezy checkout URL for Purchase CTA. Set VITE_LS_CHECKOUT_URL in .env.local. */
const LS_CHECKOUT_URL: string =
  (import.meta.env as unknown as Record<string, string | undefined>)['VITE_LS_CHECKOUT_URL'] ?? '';

const DEMO_LICENSE_KEY = 'DEV-PASS-2026';

const DEVICE_ID_KEY = 'dataplumber_device_id';

async function readDeviceId(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(DEVICE_ID_KEY);
    return (result[DEVICE_ID_KEY] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

interface LicenseFormProps {
  licenseState: LicenseState;
  onSubmit: (licenseKey: string) => void;
}

export function LicenseForm({ licenseState, onSubmit }: LicenseFormProps) {
  const [inputKey, setInputKey] = useState('');
  // Device_ID is held in state only for URL construction — never rendered.
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    readDeviceId().then(setDeviceId);
  }, []);

  const isChecking = licenseState.status === 'checking';
  const hasError =
    licenseState.status === 'invalid' ||
    licenseState.status === 'expired' ||
    !!licenseState.errorMessage;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed || isChecking) return;
    onSubmit(trimmed);
  };

  /** Fills the demo key and immediately triggers activation. */
  const handleUseDemoLicense = () => {
    setInputKey(DEMO_LICENSE_KEY);
    onSubmit(DEMO_LICENSE_KEY);
  };

  /** Opens the Lemon Squeezy checkout (Purchase CTA). */
  const handlePurchase = () => {
    if (!LS_CHECKOUT_URL) return;
    chrome.tabs.create({ url: LS_CHECKOUT_URL });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 space-y-6">
      {/* Logo */}
      <div className="flex flex-col items-center space-y-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">Aquo</h1>
        <p className="text-sm text-muted-foreground max-w-[220px]">
          Enter your License Key to activate. Privacy-first — local processing only.
        </p>
      </div>

      {/* License key input + activate */}
      <form onSubmit={handleSubmit} className="w-full space-y-3">
        <Input
          type="text"
          placeholder="Paste your License Key here"
          value={inputKey}
          onChange={(e) => setInputKey(e.target.value)}
          disabled={isChecking}
          className="text-center font-mono text-sm tracking-wider"
          autoComplete="off"
          spellCheck={false}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={!inputKey.trim() || isChecking}
        >
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying…
            </>
          ) : (
            'Activate'
          )}
        </Button>
      </form>

      {/* Error message */}
      {hasError && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">
            {licenseState.status === 'expired'
              ? 'Your license has expired. Please renew and re-activate.'
              : licenseState.errorMessage || 'Invalid license key. Please check and try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Plan CTAs */}
      <div className="w-full space-y-2 pt-2 border-t border-border">
        <p className="text-xs text-center text-muted-foreground mb-3">
          Don't have a license yet?
        </p>

        {/* Demo shortcut — only in development */}
        {import.meta.env.DEV && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleUseDemoLicense}
            disabled={isChecking}
          >
            <FlaskConical className="h-4 w-4 mr-2" />
            Use Demo License
          </Button>
        )}

        {/* Purchase — Lemon Squeezy checkout */}
        <div className="space-y-1">
          <Button
            type="button"
            className="w-full"
            onClick={handlePurchase}
            disabled={!LS_CHECKOUT_URL}
          >
            Purchase
            <ExternalLink className="h-3 w-3 ml-2 opacity-80" />
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            One-time payment. No subscriptions.
          </p>
        </div>
      </div>
    </div>
  );
}
