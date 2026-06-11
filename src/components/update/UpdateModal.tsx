import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  version: string;
  highlights: string[];
  fullChangelog: Array<{ version: string; sections: Record<string, string[]> }>;
  onUpdateNow: () => void;
  onRemindLater: () => void;
  onIgnore: () => void;
}

export function UpdateModal({
  version,
  highlights,
  fullChangelog,
  onUpdateNow,
  onRemindLater,
  onIgnore,
}: Props) {
  const [showFull, setShowFull] = useState(false);

  return (
    <Dialog open>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Update to v{version}</DialogTitle>
        </DialogHeader>

        {highlights.length > 0 && (
          <ul className="space-y-1 text-sm">
            {highlights.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}

        {fullChangelog.length > 0 && (
          <div>
            <button
              className="text-sm text-muted-foreground underline underline-offset-2"
              onClick={() => setShowFull((v) => !v)}
            >
              {showFull ? 'Hide full changelog' : 'Show full changelog'}
            </button>
            {showFull && (
              <div className="mt-3 max-h-60 overflow-y-auto space-y-4 text-sm border rounded-md p-3">
                {fullChangelog.map(({ version: v, sections }) => (
                  <div key={v}>
                    <p className="font-semibold">v{v}</p>
                    {Object.entries(sections).map(([section, items]) =>
                      items.length > 0 ? (
                        <div key={section} className="mt-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {section}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {items.map((item, i) => (
                              <li key={i} className="flex gap-2 text-xs">
                                <span className="shrink-0 text-muted-foreground">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onIgnore}>
            Ignore update
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRemindLater}>
              Remind me later
            </Button>
            <Button size="sm" onClick={onUpdateNow}>
              Update now
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
