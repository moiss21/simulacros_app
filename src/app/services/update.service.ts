import { Injectable, computed, signal } from '@angular/core';

/**
 * - `idle`             todavía no se ha comprobado nada
 * - `checking`         consulta en curso
 * - `update-available` hay una versión más reciente publicada
 * - `up-to-date`       ya se está en la última versión
 * - `no-releases`      el repositorio aún no ha publicado ningún Release
 * - `error`            sin conexión o GitHub no respondió
 * - `unsupported`      se está ejecutando en el navegador, no en el .exe
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'no-releases'
  | 'error'
  | 'unsupported';

export interface UpdateInfo {
  status: Exclude<UpdateStatus, 'idle' | 'checking' | 'unsupported'>;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  publishedAt?: string | null;
}

/** Última versión que el usuario descartó, para no repetirle el aviso. */
const DISMISSED_KEY = 'update-dismissed-version';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly api = (window as any).electronAPI;

  readonly status = signal<UpdateStatus>('idle');
  readonly info = signal<UpdateInfo | null>(null);

  private readonly dismissedVersion = signal<string | null>(
    localStorage.getItem(DISMISSED_KEY)
  );

  /** Solo se comprueba una vez por sesión salvo que se pida explícitamente. */
  private hasCheckedThisSession = false;

  /** Versión instalada. Vacía en el navegador, donde no hay puente de Electron. */
  readonly currentVersion = computed(() => this.info()?.currentVersion ?? '');

  /** El aviso se muestra si hay versión nueva y no se ha descartado ya. */
  readonly showUpdateBanner = computed(() => {
    const info = this.info();
    return (
      this.status() === 'update-available' &&
      !!info?.latestVersion &&
      info.latestVersion !== this.dismissedVersion()
    );
  });

  /** True cuando corremos dentro del ejecutable y se puede comprobar. */
  readonly isSupported = computed(() => this.status() !== 'unsupported');

  /**
   * Comprueba si hay una versión más reciente.
   * @param force fuerza la consulta aunque ya se hubiera hecho en esta sesión.
   */
  async check(force = false) {
    if (!this.api?.checkForUpdates) {
      this.status.set('unsupported');
      return;
    }

    if (this.hasCheckedThisSession && !force) return;
    if (this.status() === 'checking') return;

    this.hasCheckedThisSession = true;
    this.status.set('checking');

    const result: UpdateInfo = await this.api.checkForUpdates();

    this.info.set(result);
    this.status.set(result.status);

    // Una comprobación manual vuelve a mostrar el aviso aunque se descartara.
    if (force && result.status === 'update-available') {
      this.dismissedVersion.set(null);
      localStorage.removeItem(DISMISSED_KEY);
    }
  }

  /** Oculta el aviso hasta que se publique una versión distinta. */
  dismiss() {
    const version = this.info()?.latestVersion;
    if (!version) return;

    this.dismissedVersion.set(version);
    localStorage.setItem(DISMISSED_KEY, version);
  }

  /** Abre la página de descargas en el navegador del sistema. */
  openReleasePage() {
    this.api?.openReleasePage?.(this.info()?.releaseUrl);
  }
}
