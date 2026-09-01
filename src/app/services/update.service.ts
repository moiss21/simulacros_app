import { Injectable, computed, signal } from '@angular/core';

/**
 * - `idle`             todavía no se ha comprobado nada
 * - `checking`         consulta en curso
 * - `update-available` hay una versión más reciente publicada
 * - `up-to-date`       ya se está en la última versión
 * - `no-releases`      el repositorio aún no ha publicado ningún Release
 * - `repo-unavailable` GitHub no da acceso público al repositorio (privado,
 *                      renombrado o movido): la comprobación no puede funcionar
 * - `error`            sin conexión o GitHub no respondió
 * - `unsupported`      se está ejecutando en el navegador, no en el .exe
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'no-releases'
  | 'repo-unavailable'
  | 'error'
  | 'unsupported';

export interface UpdateInfo {
  status: Exclude<UpdateStatus, 'idle' | 'checking' | 'unsupported'>;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  publishedAt?: string | null;
  /** Código HTTP devuelto por GitHub, sólo para diagnosticar un fallo. */
  httpStatus?: number;
  /** Causa del fallo de red: 'timeout' o 'network'. */
  reason?: string;
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

  /**
   * Sólo se comprueba una vez por sesión salvo que se pida explícitamente. Un
   * intento fallido no marca la sesión: si no, un corte de red momentáneo al
   * arrancar dejaría la comprobación desactivada hasta reiniciar la aplicación.
   */
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

    this.status.set('checking');

    let result: UpdateInfo;
    try {
      result = await this.api.checkForUpdates();
    } catch {
      // El canal IPC no debería fallar, pero si lo hace no puede dejarse el
      // estado en 'checking': la pantalla se quedaría con el botón bloqueado.
      result = { status: 'error', currentVersion: this.info()?.currentVersion ?? '' };
    }

    // Un fallo no cuenta como comprobación hecha: se reintenta al volver aquí.
    this.hasCheckedThisSession =
      result.status !== 'error' && result.status !== 'repo-unavailable';

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
