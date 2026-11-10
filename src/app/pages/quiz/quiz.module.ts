import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { QuizPageRoutingModule } from './quiz-routing.module';
import { QuizPage } from './quiz.page';

@NgModule({
  imports: [SharedModule, QuizPageRoutingModule],
  declarations: [QuizPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class QuizPageModule {}
