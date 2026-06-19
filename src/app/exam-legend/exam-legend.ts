import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-exam-legend',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './exam-legend.html',
  styleUrls: ['./exam-legend.scss']
})
export class ExamLegendComponent {
  private router = inject(Router);

  goBack() {
    this.router.navigate(['/']);
  }
}