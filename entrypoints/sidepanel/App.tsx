/**
 * Side Panel 主应用入口
 * 唯一入口：批量列表抓取（Bulk Extract）
 */

import { useState } from 'react';
import { ScanText, Loader2, List } from 'lucide-react';
import { LicenseGate } from '../../components/LicenseGate';
import { DevDeactivateButton } from '../../components/DevDeactivateButton';
import { BulkDataPreview } from '../../components/BulkDataPreview';
import { Button } from '../../components/ui/button';
import { useBulkResult } from '../../hooks/useBulkResult';
import { useBulkExtract } from '../../hooks/useBulkExtract';
import { SCENE_CONFIGS, type SceneMode } from '../../types/bulk';

// ── 空状态 ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-6 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <List className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">No data extracted yet</p>
        <p className="text-xs text-muted-foreground">
          Select a scenario, then click &quot;Extract&quot; to run the channel and get list data.
        </p>
      </div>
    </div>
  );
}

// ── 加载状态 ───────────────────────────────────────────────────────────────────

function ExtractingState() {
  return (
    <div className="flex items-center gap-2.5 p-6 text-xs text-muted-foreground">
      <div className="h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
      Extracting list data — within seconds…
    </div>
  );
}

// ── 主体内容区 ─────────────────────────────────────────────────────────────────

function MainContent() {
  const { bulkState, resetBulk } = useBulkResult();
  const { triggerBulkExtract, isTriggering } = useBulkExtract();
  const [sceneMode, setSceneMode] = useState<SceneMode>('b2b');

  const isProcessing = bulkState.status === 'extracting' || isTriggering;

  const handleBulkExtract = async () => {
    resetBulk();
    await triggerBulkExtract(sceneMode);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between border-b px-3 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
            <ScanText className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold">Aquo</span>
        </div>

        <Button
          size="sm"
          onClick={handleBulkExtract}
          disabled={isProcessing}
          className="h-7 text-xs gap-1.5"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Extracting
            </>
          ) : (
            <>
              <List className="h-3 w-3" />
              Extract
            </>
          )}
        </Button>
      </header>

      {/* 主内容区（可滚动） */}
      <main className="flex-1 overflow-y-auto">
        {/* 场景模式选择 */}
        <div className="border-b px-3 py-2 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Scenario</span>
            <select
              className="h-7 min-w-[160px] rounded-md border bg-background px-2 text-xs"
              value={sceneMode}
              onChange={e => {
                setSceneMode(e.target.value as SceneMode);
                resetBulk();
              }}
            >
              <option value="b2b">B2B Leads · Directory / LinkedIn</option>
              <option value="local_travel">Local / Travel · Reviews &amp; ratings</option>
              <option value="ecommerce">E-commerce · Products &amp; competitors</option>
              <option value="real_estate">Real Estate · Listings &amp; rentals</option>
              <option value="social_chat">Social / Chat · Chat history</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {SCENE_CONFIGS[sceneMode].description}
          </p>
        </div>

        {/* 空状态 */}
        {bulkState.status === 'idle' && <EmptyState />}

        {/* 加载状态 */}
        {bulkState.status === 'extracting' && <ExtractingState />}

        {/* 结果展示 */}
        {bulkState.status === 'complete' && bulkState.result && (
          <BulkDataPreview
            key={`${bulkState.result.sceneMode}-${bulkState.result.extractedAt}`}
            result={bulkState.result}
          />
        )}

        {/* 错误状态 */}
        {bulkState.status === 'error' && (
          <div className="p-4 text-xs text-destructive">
            {bulkState.error}
          </div>
        )}
      </main>
    </div>
  );
}

// ── 应用根组件 ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
      <LicenseGate>
        <MainContent />
      </LicenseGate>
      {import.meta.env.DEV && <DevDeactivateButton />}
    </>
  );
}
