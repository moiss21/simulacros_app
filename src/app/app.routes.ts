import { Routes } from '@angular/router';
import { HomeComponent } from './home/home';
import { ExamComponent } from './exam/exam';
import { ExamLegendComponent } from './exam-legend/exam-legend';

export const routes: Routes = [
  // Ruta por defecto (Home)
  { path: '', component: HomeComponent },

  { path: 'legend', component: ExamLegendComponent }, // <--- NUEVA RUTA
  
  // Ruta dinámica: :id será el nombre del archivo (ej: angular-basics.json)
  { path: 'exam/:id', component: ExamComponent },
  
  // Redirigir cualquier ruta desconocida al home
  { path: '**', redirectTo: '' }
];