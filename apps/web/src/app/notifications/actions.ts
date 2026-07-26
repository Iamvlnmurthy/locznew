'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import type { NotificationChannel, NotificationType } from './types';

function refreshNotificationViews(): void {
  revalidatePath('/notifications');
  revalidatePath('/dashboard');
}

function safeDestination(destination: string): string {
  return destination.startsWith('/') && !destination.startsWith('//')
    ? destination
    : '/notifications';
}

export async function markReadAndOpenAction(
  notificationId: string,
  destination: string,
): Promise<never> {
  await api(`/notifications/${notificationId}/read`, { method: 'POST', auth: true });
  refreshNotificationViews();
  redirect(safeDestination(destination));
}

export async function markAllReadAction(): Promise<void> {
  await api('/notifications/read-all', { method: 'POST', auth: true });
  refreshNotificationViews();
}

export async function updateNotificationPreferenceAction(
  type: NotificationType,
  channel: NotificationChannel,
  enabled: boolean,
): Promise<void> {
  await api('/notifications/preferences', {
    method: 'PUT',
    auth: true,
    body: { type, channel, enabled },
  });
  revalidatePath('/notifications');
}
