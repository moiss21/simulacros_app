import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Clave de localStorage y clase que activa el tema oscuro en <html>. */
const THEME_STORAGE_KEY = 'theme';
const DARK_CLASS = 'dark-theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('simulacros');

  /** Único indicador de tema. Los estilos leen la clase en <html>. */
  isDarkMode = signal(false);

  ngOnInit() {
    this.initTheme();
  }

  /** Restaura la preferencia guardada; si no hay ninguna, sigue al sistema. */
  initTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.applyTheme(savedTheme ? savedTheme === 'dark' : prefersDark);
  }

  toggleTheme() {
    const next = !this.isDarkMode();
    this.applyTheme(next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
  }

  private applyTheme(dark: boolean) {
    this.isDarkMode.set(dark);
    document.documentElement.classList.toggle(DARK_CLASS, dark);
  }
}
