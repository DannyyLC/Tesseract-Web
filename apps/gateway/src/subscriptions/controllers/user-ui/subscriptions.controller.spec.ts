import { Test, TestingModule } from '@nestjs/testing';
import { \controllers\userUi\subscriptionsController } from './.\controllers\user-ui\subscriptions.controller';

describe('\controllers\userUi\subscriptionsController', () => {
  let controller: \controllers\userUi\subscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [\controllers\userUi\subscriptionsController],
    }).compile();

    controller = module.get<\controllers\userUi\subscriptionsController>(\controllers\userUi\subscriptionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
