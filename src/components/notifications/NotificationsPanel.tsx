import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';

export function NotificationsPanel() {
  const { supported, permission, loading, requestPermission, sendTest } = usePushNotifications();

  return (
    <section className="rounded-lg border border-border bg-background p-4 shadow-sm space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>

      {!supported && (
        <p className="text-sm text-muted-foreground">
          Push notifications require the app to be installed. Add it to your home screen, then return here.
        </p>
      )}

      {supported && permission === 'denied' && (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked. Enable them in your browser or OS settings.
        </p>
      )}

      {supported && permission === 'default' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Enable push notifications to receive reminders for due chores.
          </p>
          <Button onClick={requestPermission} disabled={loading} size="sm">
            {loading ? 'Enabling…' : 'Enable notifications'}
          </Button>
        </div>
      )}

      {supported && permission === 'granted' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Notifications are enabled.</p>
          <Button variant="outline" size="sm" onClick={sendTest}>
            Send test notification
          </Button>
        </div>
      )}
    </section>
  );
}
