import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { ExamData } from '../models/exam.model';

@Injectable({ providedIn: 'root' })
export class ExamService {
  private http = inject(HttpClient);
  
  // Almacenamos los exámenes externos aquí
  private externalExams = signal<ExamData[] | null>(null);

  // Esta función llama a Electron
  async loadFromExternalFolder() {
    const api = (window as any).electronAPI;
    if (api) {
      const exams = await api.openFolder();
      if (exams) {
        this.externalExams.set(exams);
        return true;
      }
    }
    return false;
  }

  // En tu ExamService
getExamById(fileName: string): Observable<ExamData> {
  const external = this.externalExams();
  
  if (external) {
    // Buscamos en el signal de externos que ya cargamos antes
    const found = external.find(e => e.fileName === fileName);
    return found ? of(found) : throwError(() => new Error('Examen no encontrado en carpeta externa'));
  }

  // Si no hay externos, seguimos buscando en assets (comportamiento original)
  return this.http.get<ExamData>(`assets/local-exams/${fileName}`);
}

  getAllExams(): Observable<ExamData[]> {
    const external = this.externalExams();
    
    // Si hay externos cargados, devolvemos esos directamente
    if (external) {
      return of(external);
    }

    // Si no, cargamos los de assets por defecto
    return this.http.get<string[]>('assets/exams/index.json').pipe(
      switchMap(fileNames => {
        const requests = fileNames.map(fileName => 
          this.http.get<ExamData>(`assets/local-exams/${fileName}`).pipe(
            map(data => ({ ...data, fileName }))
          )
        );
        return forkJoin(requests);
      })
    );
  }
}