import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ExamService } from '../services/exam.service';
import { UpdateService } from '../services/update.service';
import { ExamData, ExamProperties } from '../models/exam.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule], // Necesario para @if y @for
  templateUrl: './home.html', // Vinculamos el HTML separado
  styleUrls: ['./home.scss']   // Vinculamos el CSS separado
})
export class HomeComponent {
  private examService = inject(ExamService);
  private router = inject(Router);

  // Público: la plantilla lee sus signals para pintar el aviso de versión nueva
  update = inject(UpdateService);

  // Usamos un signal para que la UI reaccione al cambio de carpeta
  exams = signal<ExamData[]>([]);
  isExternal = signal(false);


  ngOnInit() {
    this.loadExams();
    // No se espera: si no hay conexión el aviso simplemente no aparece.
    this.update.check();
  }


  loadExams() {
    this.examService.getAllExams().subscribe(data => {
      this.exams.set(data);
    });
  }

  async selectFolder() {
    const success = await this.examService.loadFromExternalFolder();
    if (success) {
      this.isExternal.set(true);
      this.loadExams();
    }
  }

  // AQUÍ ESTÁ LA CONEXIÓN:
  // No llamamos al componente, navegamos a la RUTA configurada en app.routes.ts
  goToExam(exam: ExamData) {
    console.log(exam.examProperties.id)
    this.router.navigate(['/exam', exam.examProperties.id]);
  }

  goToLegend() {
    this.router.navigate(['/legend']);
  }

  // Devuelve el color del JSON si existe, de lo contrario deja que actúe el CSS
  getBadgeColor(properties?: ExamProperties): string | null {
    return properties?.subjectColor || null;
  }

}