import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { ResultsPageRoutingModule } from './results-routing.module';
import { ResultsPage } from './results.page';

@NgModule({
  imports: [SharedModule, ResultsPageRoutingModule],
  declarations: [ResultsPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ResultsPageModule {}
