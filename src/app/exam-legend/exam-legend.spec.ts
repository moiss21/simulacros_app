import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExamLegend } from './exam-legend';

describe('ExamLegend', () => {
  let component: ExamLegend;
  let fixture: ComponentFixture<ExamLegend>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExamLegend]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExamLegend);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
