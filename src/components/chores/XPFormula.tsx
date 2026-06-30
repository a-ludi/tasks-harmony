import type { XPSize, XPSettings } from '@/types';
import { getXPBase } from '@/xp/calculator';
import { toRepetitionFactor } from '@/xp/xpPreview';

interface MultiplierConfig {
  xpPerUnit: number;
}

interface XPFormulaProps {
  xpSize: XPSize | number;
  settings: XPSettings;
  multiplier?: MultiplierConfig;
  streakEnabled: boolean;
  decayEnabled: boolean;
}

function Factor({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-sm">{value}</span>
      <span className="text-xs text-muted-foreground leading-none">{label}</span>
    </div>
  );
}

function Op({ children }: { children: string }) {
  return <span className="font-mono text-sm pb-4">{children}</span>;
}

export default function XPFormula({
  xpSize,
  settings,
  multiplier,
  streakEnabled,
  decayEnabled,
}: XPFormulaProps) {
  const base = getXPBase(xpSize);
  const streakRange = `1×–${settings.maxStreakMultiplier}×`;
  const decayRange = `${settings.decayFloor}×–1×`;

  return (
    <div className="flex flex-wrap items-end gap-1.5 rounded-md bg-muted/40 px-3 py-2">
      <Factor value="XP" label="" />
      <Op>=</Op>
      <Factor value={String(base)} label="base" />
      {multiplier && (
        <>
          <Op>×</Op>
          <Factor value="ans" label="answer" />
          <Op>÷</Op>
          <Factor value={String(toRepetitionFactor(multiplier.xpPerUnit))} label="rep. factor" />
        </>
      )}
      {streakEnabled && <Factor value={`× ${streakRange}`} label="streak" />}
      {decayEnabled && <Factor value={`× ${decayRange}`} label="decay" />}
    </div>
  );
}
