/**
 * BulkDataPreview — 批量提取结果展示组件
 *
 * - invalidFields: string[] 精确标记出问题的字段 key
 * - 编辑器直接遍历 Object.entries(record.data)，零硬编码字段名
 * - invalidFields.includes(key) 时红色边框 + "格式有误"提示
 * - 字段内容变化时立即重算 invalidFields；数组变空时行警告自动消失
 */

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from './ui/card';
import { Badge } from './ui/badge';
import type { BulkRecord, BulkResult, SceneMode, SceneConfig } from '../types/bulk';
import { getSceneConfig, getDataKeys, evaluateInvalidFields, normalizeBulkRecord } from '../types/bulk';

// ── 内联编辑器 ────────────────────────────────────────────────────────────────

interface RecordEditorProps {
  record: BulkRecord;
  sceneConfig: SceneConfig;
  onSave: (updated: BulkRecord) => void;
  onClose: () => void;
}

function RecordEditor({ record, sceneConfig, onSave, onClose }: RecordEditorProps) {
  const [draft, setDraft] = useState<BulkRecord>(record);

  const handleFieldChange = (key: string, value: string) => {
    setDraft(prev => {
      const newData = { ...prev.data, [key]: value };
      const tempRecord: BulkRecord = { ...prev, data: newData };
      return {
        ...prev,
        data: newData,
        invalidFields: evaluateInvalidFields(tempRecord, sceneConfig),
      };
    });
  };

  const baseClass =
    'w-full rounded-md border bg-background px-2 py-1 text-xs ' +
    'focus:outline-none focus:ring-1 placeholder:text-muted-foreground ';

  return (
    <div className="border rounded-md p-3 space-y-2 text-xs bg-muted/40 mt-1 ml-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground">Edit entry #{record.index + 1}</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>

      <div className="space-y-1.5">
        {Object.entries(draft.data).map(([key, value]) => {
          const isInvalid = draft.invalidFields.includes(key);
          const fieldDef = sceneConfig.fields.find(f => f.key === key);
          const label = fieldDef?.label ?? key;
          const isMultiline = fieldDef?.multiline === true;
          const borderClass = isInvalid
            ? 'border-red-500 focus:ring-red-500'
            : 'border-input focus:ring-ring';

          return (
            <div key={key}>
              <label className={`block ${isInvalid ? 'text-red-500' : 'text-muted-foreground'}`}>
                {label}
              </label>
              {isMultiline ? (
                <textarea
                  className={baseClass + borderClass + ' resize-none'}
                  rows={3}
                  placeholder="—"
                  value={value}
                  onChange={e => handleFieldChange(key, e.target.value)}
                />
              ) : (
                <input
                  className={baseClass + borderClass}
                  placeholder="—"
                  value={value}
                  onChange={e => handleFieldChange(key, e.target.value)}
                />
              )}
              {isInvalid && (
                <span className="text-[10px] text-red-500 mt-0.5 block">Invalid format</span>
              )}
            </div>
          );
        })}

        {draft.data['URL'] && (
          <p className="truncate">
            <a
              href={draft.data['URL']}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {draft.data['URL']}
            </a>
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-6 text-[11px] px-3" onClick={() => onSave(draft)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] px-3" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface BulkDataPreviewProps {
  result: BulkResult;
}

function safeRecords(arr: BulkResult['records'] | undefined): BulkRecord[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(r => ({
    index: r.index ?? 0,
    invalidFields: r.invalidFields ?? [],
    data: r.data && typeof r.data === 'object' ? r.data : {},
  }));
}

export function BulkDataPreview({ result }: BulkDataPreviewProps) {
  const [records, setRecords] = useState<BulkRecord[]>(() => safeRecords(result.records));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [synced, setSynced] = useState(false);
  const [highlightPending, setHighlightPending] = useState(false);

  const pendingCount = records.filter(r => (r.invalidFields?.length ?? 0) > 0).length;
  const sceneConfig = getSceneConfig(result.sceneMode as SceneMode | undefined);
  const dataKeys = getDataKeys(records);
  const primaryKey =
    dataKeys.length > 0 && dataKeys.includes(sceneConfig.primaryFieldKey)
      ? sceneConfig.primaryFieldKey
      : dataKeys[0];

  useEffect(() => {
    const list = Array.isArray(result.records) ? result.records : [];
    setRecords(list.map(r => normalizeBulkRecord({ ...r, invalidFields: r.invalidFields ?? [] } as Parameters<typeof normalizeBulkRecord>[0])));
    setEditingIndex(null);
    setHighlightPending(false);
    setSynced(false);
    setExporting(false);
  }, [result]);

  const handleSave = (updated: BulkRecord) => {
    setRecords(prev => prev.map(r => (r.index === updated.index ? updated : r)));
    setEditingIndex(null);
  };

  const toggleRow = (idx: number) =>
    setEditingIndex(prev => (prev === idx ? null : idx));

  const handleExport = () => {
    if (pendingCount > 0) {
      const confirmed = window.confirm(
        `There are still ${pendingCount} unverified rows. Export anyway?`,
      );
      if (!confirmed) {
        setHighlightPending(true);
        return;
      }
    }

    setHighlightPending(false);
    setExporting(true);

    const keysForExport = getDataKeys(records);
    const rows = records.map(r => ({
      'No.': r.index + 1,
      ...keysForExport.reduce<Record<string, string>>(
        (acc, k) => ({ ...acc, [k]: r.data[k] ?? '' }),
        {},
      ),
      'Needs review': (r.invalidFields?.length ?? 0) > 0 ? '⚠ Yes' : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ws as any)['!cols'] = [
      { wch: 5 },
      ...keysForExport.map(k => (k === 'URL' ? { wch: 40 } : { wch: 24 })),
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BulkResults');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `Aquo_Bulk_${ts}.xlsx`);

    setExporting(false);
    setSynced(true);
    setTimeout(() => setSynced(false), 2500);
  };

  return (
    <div className="p-3 space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Channel results</CardTitle>
            <div className="flex items-center gap-1.5">
              {pendingCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-0.5"
                  style={{ borderColor: '#f59e0b', color: '#d97706' }}
                >
                  ⚠️ {pendingCount} need review
                </Badge>
              )}
              <Badge
                variant={result.mode === 'rule' ? 'default' : 'secondary'}
                className="text-[10px]"
              >
                {result.mode === 'rule' ? (result.ruleKey ?? 'Rule') : 'Fallback'}
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs">
            {result.source} · {records.length} rows ·{' '}
            {new Date(result.extractedAt).toLocaleTimeString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full h-8 text-xs gap-1.5"
            onClick={handleExport}
            disabled={exporting || synced || records.length === 0}
          >
            <Download className="h-3 w-3" />
            {synced ? 'Exported to spreadsheet' : exporting ? 'Exporting…' : `Export to spreadsheet (${records.length} rows)`}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-1">
        {records.map(record => {
          const isPending = (record.invalidFields?.length ?? 0) > 0;
          const isHighlighted = highlightPending && isPending;

          return (
            <div key={record.index}>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-muted transition-colors text-left border"
                style={{
                  backgroundColor: isPending ? '#fef3c7' : undefined,
                  borderColor: isPending ? (isHighlighted ? '#f59e0b' : '#fcd34d') : 'transparent',
                }}
                onClick={() => toggleRow(record.index)}
              >
                <span className="text-[10px] text-muted-foreground w-5 flex-shrink-0 tabular-nums text-right">
                  {record.index + 1}
                </span>

                {isPending && (
                  <span className="flex-shrink-0" style={{ fontSize: '13px' }}>⚠️</span>
                )}

                <span className="flex-1 text-xs font-medium truncate">
                  {(primaryKey && record.data[primaryKey]) || '(Primary field empty — add value)'}
                </span>

                {dataKeys.length > 0 && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {dataKeys.filter(k => record.data[k]?.trim()).length}/{dataKeys.length}
                  </span>
                )}

                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground flex-shrink-0 transition-transform duration-150 ${
                    editingIndex === record.index ? 'rotate-90' : ''
                  }`}
                />
              </button>

              {editingIndex === record.index && (
                <RecordEditor
                  record={record}
                  sceneConfig={sceneConfig}
                  onSave={handleSave}
                  onClose={() => setEditingIndex(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {records.length === 0 && (
        <div className="text-center py-8 text-xs text-muted-foreground">
          No list items detected on this page
          <br />
          Try a search results page or check your network
        </div>
      )}
    </div>
  );
}
