import { Injectable, signal } from '@angular/core';

const DEFAULT_DURATION_MS = 4000;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly message = signal<string | null>(null);
  private dismissTimer?: ReturnType<typeof setTimeout>;

  show(message: string, durationMs = DEFAULT_DURATION_MS) {
    clearTimeout(this.dismissTimer);
    this.message.set(message);
    this.dismissTimer = setTimeout(() => this.message.set(null), durationMs);
  }
}
