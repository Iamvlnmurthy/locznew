import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ModelSuggestionsService } from './model-suggestions.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, ModelSuggestionsService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
