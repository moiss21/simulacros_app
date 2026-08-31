import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ExamData, ExamOption, ExamQuestion } from '../models/exam.model';
import { ExamService } from '../services/exam.service';

/**
 * Cómo se recorren las preguntas:
 * - `all`        todas en pantalla, se responden en el orden que se quiera.
 * - `one-by-one` una cada vez, con navegación anterior/siguiente.
 */
export type NavigationMode = 'all' | 'one-by-one';

/**
 * Cuándo se ve la corrección:
 * - `at-end`    al terminar y enviar el examen completo.
 * - `immediate` pregunta a pregunta, en cuanto se comprueba cada una.
 */
export type CorrectionMode = 'at-end' | 'immediate';

@Component({
  selector: 'app-exam',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exam.html',
  styleUrls: ['./exam.scss']
})
export class ExamComponent implements OnInit, OnDestroy {

  // ==========================================
  // 1. INYECCIONES DE DEPENDENCIAS
  // ==========================================
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private examService = inject(ExamService);

  // ==========================================
  // 2. SIGNALS DE ESTADO (STATE)
  // ==========================================
  examData = signal<ExamData | null>(null);
  hasStarted = signal(false);
  isFinished = signal(false);
  timeLeft = signal(0);
  score = signal(0);
  private timerRef: any;

  /** Modo de recorrido elegido antes de empezar. */
  navigationMode = signal<NavigationMode>('all');

  /** Momento de la corrección elegido antes de empezar. */
  correctionMode = signal<CorrectionMode>('at-end');

  /** Pregunta visible en el modo `one-by-one`. */
  currentIndex = signal(0);

  /**
   * Índices de las preguntas ya comprobadas en el modo `immediate`. Una vez
   * comprobada, la pregunta queda bloqueada: si se pudiera cambiar la
   * respuesta después de ver la solución, la nota final no significaría nada.
   */
  revealedQuestions = signal<ReadonlySet<number>>(new Set());

  /** Controla el modal que pregunta qué contenido llevará el PDF. */
  isPdfModalOpen = signal(false);

  /**
   * Si es true, el PDF incluye las notas de corrección (explicación de cada
   * opción marcada y nota general de la pregunta). Si es false, sólo se
   * imprimen el enunciado y las opciones con la selección marcada.
   */
  printWithNotes = signal(true);

  // ==========================================
  // 3. COMPUTED SIGNALS (DERIVED STATE)
  // ==========================================

  /** Formatea el tiempo restante en MM:SS */
  timeLeftFormatted = computed(() => {
    const m = Math.floor(this.timeLeft() / 60).toString().padStart(2, '0');
    const s = (this.timeLeft() % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  /** Determina si el usuario ha alcanzado la nota de corte */
  hasPassed = computed(() => {
    const data = this.examData();
    if (!data) return false;
    return this.currentPercentage() >= data.examProperties.examConfig.passingPercentage;
  });

  /** Calcula el número de preguntas necesarias para aprobar en base a la tanda actual */
  requiredHitsToPass = computed(() => {
    const total = this.totalQuestionsToDisplay();
    const percentage = this.examData()?.examProperties.examConfig.passingPercentage ?? 0;
    return Math.ceil((total * percentage) / 100);
  });

  /** Calcula el porcentaje de éxito actual (0-100) sobre la tanda */
  currentPercentage = computed(() => {
    const total = this.totalQuestionsToDisplay();
    if (total === 0) return 0;
    return (this.score() / total) * 100;
  });

  /** Nota final escalada a base 10 calculada sobre la tanda */
  finalGrade = computed(() => {
    const total = this.totalQuestionsToDisplay();
    if (total === 0) return 0;
    return (this.score() / total) * 10;
  });

  /** Indica si queda menos de un minuto de examen */
  isLowTime = computed(() => this.timeLeft() < 60 && this.hasStarted());

  /** Peso unitario de cada pregunta (base 1) */
  questionWeight = computed(() => 1);

  /** Cantidad de preguntas del banco total (sin recortar) obtenidos del JSON original */
  totalQuestions = computed(() => {
    return (this.examData() as any)?._absoluteTotal ?? 0;
  });

  /** Total de preguntas activas cargadas en la tanda elegida */
  totalQuestionsToDisplay = computed(() => this.examData()?.questions.length ?? 0);

  /** Cantidad de preguntas respondidas por el usuario */
  answeredCount = computed(() => {
    return this.examData()?.questions.filter(q => this.isAnyOptionSelected(q)).length ?? 0;
  });

  /** Cantidad de preguntas pendientes de respuesta en relación a la tanda */
  remainingCount = computed(() => this.totalQuestionsToDisplay() - this.answeredCount());

  /** Indica si la configuración del examen aplica penalización por respuestas vacías */
  wasPenaltyApplied = computed(() => {
    return this.examData()?.examProperties.examConfig.emptyAnswersCount ?? false;
  });

  /**
   * Al terminar siempre se listan todas las preguntas, aunque el examen se
   * haya hecho una a una: la revisión final y el PDF deben salir completos.
   */
  showAllQuestions = computed(
    () => this.navigationMode() === 'all' || this.isFinished()
  );

  /**
   * Preguntas que se pintan ahora mismo, con su índice real dentro de la
   * tanda para que la numeración y el bloqueo no dependan del orden de pintado.
   */
  visibleQuestions = computed<{ question: ExamQuestion; index: number }[]>(() => {
    const questions = this.examData()?.questions ?? [];

    if (this.showAllQuestions()) {
      return questions.map((question, index) => ({ question, index }));
    }

    const index = Math.min(this.currentIndex(), questions.length - 1);
    const question = questions[index];
    return question ? [{ question, index }] : [];
  });

  isFirstQuestion = computed(() => this.currentIndex() <= 0);

  isLastQuestion = computed(
    () => this.currentIndex() >= this.totalQuestionsToDisplay() - 1
  );

  /** Cuántas preguntas se han comprobado ya en el modo de corrección inmediata. */
  revealedCount = computed(() => this.revealedQuestions().size);

  // ==========================================
  // 4. CICLO DE VIDA (LIFECYCLE HOOKS)
  // ==========================================

  ngOnInit() {
    const fileName = this.route.snapshot.paramMap.get('id');

    if (fileName) {
      this.examService.getExamById(fileName).subscribe({
        next: (data) => {
          this.initExam({ ...data, fileName });
        },
        error: (err) => {
          console.error('Error cargando el examen:', err);
          this.goHome();
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
  }

  // ==========================================
  // 5. MÉTODOS PRIVADOS DE INICIALIZACIÓN
  // ==========================================

  private initExam(data: ExamData) {
  const config = data.examProperties.examConfig;
  const groupByUnit = config.groupByUnit;
  
  // 1. Guardamos de forma totalmente segura el total absoluto original
  // Usamos el operador de coalescencia por si acaso
  const absoluteTotal = data?.questions?.length ?? 0;

  // 2. Clonamos y barajamos para no mutar el objeto 'data' original por referencia
  let processedQuestions = this.shuffleArray(data.questions ?? []);

  // 3. Recortar según el tamaño de la tanda si se ha definido
  if (config.totalQuestionsToDisplay && config.totalQuestionsToDisplay > 0) {
    processedQuestions = processedQuestions.slice(0, config.totalQuestionsToDisplay);
  }

  // 4. Organizar las respuestas y aplicar la estructuración final
  if (groupByUnit) {
    processedQuestions.sort((a, b) => {
      const unitA = a.unit?.unitNumber || 0;
      const unitB = b.unit?.unitNumber || 0;
      return unitA - unitB;
    });

    let currentUnitNumber = -1;
    let localCounter = 0;

    processedQuestions = processedQuestions.map(q => {
      const uNum = q.unit?.unitNumber || 0;
      if (uNum !== currentUnitNumber) {
        currentUnitNumber = uNum;
        localCounter = 1;
      } else {
        localCounter++;
      }

      return {
        ...q,
        unitLocalIndex: localCounter,
        options: this.shuffleArray(q.options)
      };
    });
  } else {
    processedQuestions = processedQuestions.map(q => ({
      ...q,
      options: this.shuffleArray(q.options)
    }));
  }

  // 5. Persistir el estado del examen inyectando de forma limpia el metadato
  this.examData.set({
    ...data,
    questions: processedQuestions,
    // Aseguramos que se guarde el valor que capturamos en la línea 6
    ...({ _absoluteTotal: absoluteTotal } as any) 
  });

  // 6. Configurar la cuenta atrás si aplica
  const duration = config.examDurationMinutes;
  if (duration > 0) {
    this.timeLeft.set(duration * 60);
  }
}

  /** Algoritmo de barajado Fisher-Yates */
  private shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  // ==========================================
  // 6. LÓGICA DE CONTROL DEL EXAMEN
  // ==========================================

  shouldShowContent(): boolean {
    return this.hasStarted() || this.isFinished();
  }

  startExam() {
    if (this.hasStarted()) return;
    this.hasStarted.set(true);

    const props = this.examData()?.examProperties;
    if (props && props.examConfig.examDurationMinutes > 0) {
      this.timerRef = setInterval(() => {
        this.timeLeft.update(t => {
          if (t <= 1) {
            this.finishExam();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
  }

  /** True si la pregunta ya muestra su corrección (y por tanto está bloqueada). */
  isRevealed(index: number): boolean {
    return this.isFinished() || this.revealedQuestions().has(index);
  }

  /** True si toca ofrecer el botón de comprobar esta pregunta. */
  canRevealQuestion(question: ExamQuestion, index: number): boolean {
    return (
      this.correctionMode() === 'immediate' &&
      !this.isFinished() &&
      !this.revealedQuestions().has(index) &&
      this.isAnyOptionSelected(question)
    );
  }

  /** Corrige una sola pregunta y la deja bloqueada. */
  revealQuestion(index: number) {
    if (this.isFinished() || this.revealedQuestions().has(index)) return;

    this.revealedQuestions.update((revealed) => {
      const next = new Set(revealed);
      next.add(index);
      return next;
    });
  }

  goToQuestion(index: number) {
    const total = this.totalQuestionsToDisplay();
    if (total === 0) return;
    this.currentIndex.set(Math.min(Math.max(index, 0), total - 1));
  }

  previousQuestion() {
    this.goToQuestion(this.currentIndex() - 1);
  }

  nextQuestion() {
    this.goToQuestion(this.currentIndex() + 1);
  }

  selectOption(
    question: ExamQuestion,
    option: ExamOption,
    canChange: boolean,
    index: number
  ) {
    if (this.isFinished()) return;
    // Una pregunta ya comprobada no admite cambios.
    if (this.revealedQuestions().has(index)) return;

    if (question.type === 'single') {
      const anySelected = question.options.some(o => o.selected);
      if (!canChange && anySelected) return;
      question.options.forEach(o => o.selected = false);
      option.selected = true;
    } else {
      if (!canChange && option.selected) return;
      option.selected = !option.selected;
    }

    this.examData.update(current => current ? { ...current } : null);
  }

  finishExam() {
    if (this.isFinished()) return;
    clearInterval(this.timerRef);
    this.isFinished.set(true);
    this.calculateScore();
  }

  clearQuestion(question: ExamQuestion, index: number) {
    if (this.isFinished()) return;
    if (this.revealedQuestions().has(index)) return;

    question.options.forEach(o => o.selected = false);
    this.examData.update(current => current ? { ...current } : null);
  }

  goHome() {
    this.router.navigate(['/']);
  }

  // ==========================================
  // 7. LÓGICA DE CORRECCIÓN Y PUNTUACIÓN
  // ==========================================

  isAnyOptionSelected(question: ExamQuestion): boolean {
    return question.options.some(o => o.selected);
  }

  isQuestionFullyCorrect(question: ExamQuestion): boolean {
    const selectedOptions = question.options.filter(o => o.selected);
    const correctOptions = question.options.filter(o => o.isCorrect);

    if (selectedOptions.length !== correctOptions.length) return false;
    return selectedOptions.every(o => o.isCorrect);
  }

  getQuestionState(question: ExamQuestion): 'correct' | 'incorrect' | 'unanswered' {
    if (!this.isAnyOptionSelected(question)) return 'unanswered';
    const isCorrect = this.isQuestionFullyCorrect(question);
    return isCorrect ? 'correct' : 'incorrect';
  }

  getQuestionPoints(question: ExamQuestion): number {
    const config = this.examData()?.examProperties.examConfig;
    const penalty = config?.penaltyRate ?? 0;
    const hasSelection = this.isAnyOptionSelected(question);

    if (!hasSelection) {
      return config?.emptyAnswersCount ? -penalty : 0;
    }

    return this.isQuestionFullyCorrect(question) ? 1 : -penalty;
  }

  calculateScore() {
    const data = this.examData();
    if (!data) return;

    let rawScore = 0;
    data.questions.forEach(q => {
      rawScore += this.getQuestionPoints(q);
    });

    this.score.set(Math.max(0, rawScore));
  }

  // ==========================================
  // 8. FUNCIONES DE APOYO Y EXPORTACIÓN
  // ==========================================

  groupedQuestions = computed(() => {
    const data = this.examData();
    if (!data || !data.questions) return [];

    const groupsMap = new Map<number, { unit: any, questions: any[] }>();
    
    data.questions.forEach((q: any, index: number) => {
      q.globalIndex = index + 1; 
      const unitNum = q.unit?.unitNumber || 0;
      
      if (!groupsMap.has(unitNum)) {
        groupsMap.set(unitNum, { unit: q.unit, questions: [] });
      }
      groupsMap.get(unitNum)!.questions.push(q);
    });

    return Array.from(groupsMap.values()).sort((a, b) => {
      const numA = a.unit?.unitNumber || 0;
      const numB = b.unit?.unitNumber || 0;
      return numA - numB;
    });
  });

  fillCorrectly() {
    const data = this.examData();
    if (!data || this.isFinished()) return;

    data.questions.forEach((q, index) => {
      const config = data.examProperties.examConfig.canChangeResponse;
      q.options.forEach(opt => {
        if (opt.isCorrect) {
          this.selectOption(q, opt, config, index);
        } else if (q.type === 'single') {
          opt.selected = false;
        }
      });
    });
  }

  // ==========================================
  // 9. EXPORTACIÓN A PDF
  // ==========================================

  /** Abre el modal en lugar de imprimir directamente. */
  downloadPDF() {
    this.isPdfModalOpen.set(true);
  }

  closePdfModal() {
    this.isPdfModalOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isPdfModalOpen()) this.closePdfModal();
  }

  /**
   * Lanza el diálogo de impresión con o sin las notas de corrección.
   * @param includeNotes true → explicaciones de opciones y nota general.
   */
  generatePDF(includeNotes: boolean) {
    this.printWithNotes.set(includeNotes);
    this.isPdfModalOpen.set(false);

    const originalTitle = document.title;
    const examTitle = this.examData()?.examProperties.examTitle || 'Examen';
    document.title = `Resultado - ${examTitle}`;

    // Se cede un ciclo para que Angular cierre el modal y aplique la clase que
    // muestra u oculta las notas antes de que el navegador capture la página.
    setTimeout(() => {
      window.print();
      document.title = originalTitle;
    });
  }
}