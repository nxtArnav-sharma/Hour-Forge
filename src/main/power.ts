import { powerMonitor, powerSaveBlocker } from 'electron';

export class PowerManager {
  private blockerId: number | null = null;
  private onSuspendCallback?: () => void;
  private onResumeCallback?: () => void;

  constructor(onSuspend?: () => void, onResume?: () => void) {
    this.onSuspendCallback = onSuspend;
    this.onResumeCallback = onResume;

    powerMonitor.on('suspend', () => {
      this.onSuspendCallback?.();
    });

    powerMonitor.on('resume', () => {
      this.onResumeCallback?.();
    });
  }

  setKeepAwake(enable: boolean): void {
    if (enable && this.blockerId === null) {
      this.blockerId = powerSaveBlocker.start('prevent-app-suspension');
    } else if (!enable && this.blockerId !== null) {
      if (powerSaveBlocker.isStarted(this.blockerId)) {
        powerSaveBlocker.stop(this.blockerId);
      }
      this.blockerId = null;
    }
  }
}

