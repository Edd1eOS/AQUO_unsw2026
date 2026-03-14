/**
 * License 授权拦截器 HOC
 * 包裹整个 Side Panel UI，根据授权状态决定渲染内容或授权表单
 *
 * 状态机：
 * - 'checking'   → 显示 Skeleton（正在检查本地缓存）
 * - 'valid'      → 渲染子内容（主应用 UI）
 * - 'unchecked'  → 显示 LicenseForm（未激活）
 * - 'invalid'    → 显示 LicenseForm + 错误提示
 * - 'expired'    → 显示 LicenseForm + 过期提示
 */

import { Skeleton } from './ui/skeleton';
import { LicenseForm } from './LicenseForm';
import { useLicense } from '../hooks/useLicense';

interface LicenseGateProps {
  children: React.ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
  const { licenseState, validateLicense } = useLicense();

  // 正在检查授权：显示骨架屏
  if (licenseState.status === 'checking') {
    return (
      <div className="flex flex-col h-full p-4 space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // 已授权：渲染主应用
  if (licenseState.status === 'valid') {
    return <>{children}</>;
  }

  // 未授权 / 无效 / 过期：显示 License 表单
  return (
    <LicenseForm
      licenseState={licenseState}
      onSubmit={validateLicense}
    />
  );
}
