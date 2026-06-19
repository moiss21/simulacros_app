export interface ExamOption {
  text: string;
  isCorrect: boolean;
  explanation?: string;
  selected?: boolean;
}

export interface MultiAnswerConfig {
  isAllOrNothing: boolean;
  multiPenaltyRate: number;
  emptyAnswersCount: boolean; // Penalizar opciones correctas no marcadas en Multi
}

export interface ExamConfig {
  penaltyRate: number;
  examDurationMinutes: number;
  canChangeResponse: boolean;
  passingPercentage: number;
  totalQuestionsToDisplay: number;
  emptyAnswersCount: boolean;
  groupByUnit?: boolean;
}

export interface ExamProperties {
  id: string;
  subjectName: string;
  examTitle: string;
  examSummary: string;
  subjectColor?: string; // Campo opcional (Hexadecimal o nombre de color CSS)
  examConfig: ExamConfig;
  examUnits?: string[];
}

export interface ExamQuestion {
  id: number;
  text: string;
  type: 'single' | 'multi';
  generalExplanation?: string;
  options: ExamOption[];
  unit?: {
    unitNumber: number,
    unitName: string;
  };
  //Para conteo de preguntas cuando estan ordenadas por unidad
  unitLocalIndex?: number;
}

export interface ExamData {
  fileName?: string;
  examProperties: ExamProperties;
  questions: ExamQuestion[];
}