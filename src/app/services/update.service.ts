import { Injectable, computed, signal } from '@angular/core';

/**
 * - `idle`             todavía no se ha comprobado nada
 * - `checking`         consulta en curso
 * - `downloading`      descargando la actualización en segundo plano
 * - `ready-to-install` descargada: se aplica al reiniciar la aplicación
 * - `update-available` hay una versión más reciente publicada, pero esta
 *                      instalación no puede actualizarse sola (build portable o
 *                      ejecución sin empaquetar): hay que descargarla a mano
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
  | 'downloading'
  | 'ready-to-install'
  | 'update-available'
  | 'up-to-date'
  | 'no-releases'
  | 'repo-unavailable'
  | 'error'
  | 'unsupported';

export interface UpdateInfo {
  status: Exclude<UpdateStatus, 'unsupported'>;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  publishedAt?: string | null;
  /** Porcentaje descargado (0-100) mientras el estado es 'downloading'. */
  percent?: number;
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

  /** Versión que se descargó o se ofrece, si la hay. */
  private readonly pendingVersion = computed(() => this.info()?.latestVersion ?? null);

  /** True si el aviso de esta versión concreta ya se descartó. */
  private readonly isDismissed = computed(
    () => !!this.pendingVersion() && this.pendingVersion() === this.dismissedVersion()
  );

  /**
   * Aviso de que hay versión nueva pero esta instalación NO se actualiza sola:
   * el único camino es abrir la página de descargas.
   */
  readonly showUpdateBanner = computed(
    () => this.status() === 'update-available' && !!this.pendingVersion() && !this.isDismissed()
  );

  /** Descarga en curso en segundo plano. */
  readonly showDownloadBanner = computed(() => this.status() === 'downloading');

  /** Descargada y a la espera de que el usuario decida cuándo reiniciar. */
  readonly showInstallBanner = computed(
    () => this.status() === 'ready-to-install' && !this.isDismissed()
  );

  /** Porcentaje descargado, 0 si todavía no ha empezado. */
  readonly downloadPercent = computed(() => this.info()?.percent ?? 0);

  /** True mientras hay una comprobación o una descarga en marcha. */
  readonly isBusy = computed(
    () => this.status() === 'checking' || this.status() === 'downloading'
  );

  /** True cuando corremos dentro del ejecutable y se puede comprobar. */
  readonly isSupported = computed(() => this.status() !== 'unsupported');

  constructor() {
    // El proceso principal empuja cada cambio (progreso de descarga incluido),
    // así que la interfaz no depende de que la llamada a check() haya vuelto.
    this.api?.onUpdateState?.((state: UpdateInfo) => this.apply(state));

    // Si la ventana se recarga en mitad de una descarga, el estado sigue vivo
    // en el proceso principal: se recupera en lugar de empezar de cero.
    this.api?.getUpdateState?.().then((state: UpdateInfo | null) => {
      if (state && state.status !== 'idle') this.apply(state);
    });
  }

  private apply(state: UpdateInfo) {
    this.info.set(state);
    this.status.set(state.status);
  }

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
    if (this.isBusy()) return;

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

    // Los eventos del proceso principal pueden haber adelantado el estado
    // mientras se esperaba (la descarga arranca sola): en ese caso mandan ellos.
    if (this.status() === 'checking') this.apply(result);

    // Una comprobación manual vuelve a mostrar el aviso aunque se descartara.
    if (force && result.status === 'update-available') {
      this.dismissedVersion.set(null);
      localStorage.removeItem(DISMISSED_KEY);
    }
  }

  /** Oculta el aviso hasta que se publique una versión distinta. */
  dismiss() {
    const version = this.pendingVersion();
    if (!version) return;

    this.dismissedVersion.set(version);
    localStorage.setItem(DISMISSED_KEY, version);
  }

  /**
   * Cierra la aplicación e instala la actualización ya descargada. No se pide
   * confirmación aquí: el botón que llama a esto ya dice lo que va a pasar.
   */
  installUpdate() {
    this.api?.installUpdate?.();
  }

  /** Abre la página de descargas en el navegador del sistema. */
  openReleasePage() {
    this.api?.openReleasePage?.(this.info()?.releaseUrl);
  }
}
