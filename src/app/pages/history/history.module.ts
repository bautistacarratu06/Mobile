import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { HistoryPageRoutingModule } from './history-routing.module';
import { HistoryPage } from './history.page';

@NgModule({
  imports: [SharedModule, HistoryPageRoutingModule],
  declarations: [HistoryPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HistoryPageModule {}
