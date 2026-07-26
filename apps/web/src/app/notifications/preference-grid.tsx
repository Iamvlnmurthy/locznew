import { Icon } from '@/components/icons';
import { updateNotificationPreferenceAction } from './actions';
import { labelForType } from './notification-item';
import type { NotificationChannel, NotificationPreference, NotificationType } from './types';

const CHANNELS: Array<{
  channel: NotificationChannel;
  labelKey: string;
  descriptionKey: string;
  icon: string;
}> = [
  { channel: 'IN_APP', labelKey: 'channelInApp', descriptionKey: 'channelInAppBody', icon: 'bell' },
  { channel: 'PUSH', labelKey: 'channelPush', descriptionKey: 'channelPushBody', icon: 'phone' },
  {
    channel: 'EMAIL',
    labelKey: 'channelEmail',
    descriptionKey: 'channelEmailBody',
    icon: 'message',
  },
  { channel: 'SMS', labelKey: 'channelSms', descriptionKey: 'channelSmsBody', icon: 'phone' },
];

const TYPES: NotificationType[] = [
  'NEW_ENQUIRY',
  'NEW_MESSAGE',
  'LISTING_APPROVED',
  'LISTING_REJECTED',
  'LISTING_EXPIRING',
  'LISTING_EXPIRED',
  'SAVED_SEARCH_MATCH',
  'NEARBY_OFFER',
  'JOB_ENQUIRY',
  'BUSINESS_VERIFICATION_UPDATE',
  'REPORT_RESOLUTION',
  'SECURITY_ALERT',
];

export function PreferenceGrid({
  preferences,
  labels,
}: {
  preferences: NotificationPreference[];
  labels: Record<string, string>;
}) {
  const enabled = new Set(
    preferences
      .filter((preference) => preference.enabled)
      .map((preference) => `${preference.type}:${preference.channel}`),
  );

  return (
    <section className="notification-preferences" id="preferences">
      <div className="notification-preferences__heading">
        <div>
          <span className="section-kicker">{labels.preferencesKicker}</span>
          <h2>{labels.preferencesTitle}</h2>
          <p>{labels.preferencesBody}</p>
        </div>
        <span className="notification-preferences__privacy">
          <Icon name="shield" /> {labels.preferencesPrivacy}
        </span>
      </div>

      <div
        className="notification-preference-grid"
        role="table"
        aria-label={labels.preferencesAria}
      >
        <div className="notification-preference-grid__head" role="row">
          <span role="columnheader">{labels.activity}</span>
          {CHANNELS.map((channel) => (
            <span key={channel.channel} role="columnheader">
              <Icon name={channel.icon} />
              <strong>{labels[channel.labelKey]}</strong>
              <small>{labels[channel.descriptionKey]}</small>
            </span>
          ))}
        </div>

        {TYPES.map((type) => (
          <div className="notification-preference-grid__row" role="row" key={type}>
            <span role="rowheader">{labelForType(type, labels)}</span>
            {CHANNELS.map(({ channel, labelKey }) => {
              const isEnabled = enabled.has(`${type}:${channel}`);
              return (
                <form
                  key={channel}
                  role="cell"
                  action={updateNotificationPreferenceAction.bind(null, type, channel, !isEnabled)}
                >
                  <button
                    type="submit"
                    className={`notification-toggle${isEnabled ? ' is-enabled' : ''}`}
                    role="switch"
                    aria-checked={isEnabled}
                    aria-label={labels.preferenceToggle
                      .replace('{type}', labelForType(type, labels))
                      .replace('{channel}', labels[labelKey])}
                  >
                    <span />
                  </button>
                </form>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
