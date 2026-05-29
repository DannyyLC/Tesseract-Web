import { HttpStatus } from '@nestjs/common';
import { AppException } from '../base/app.exception';
import { ErrorCode } from '../base/error-codes.enum';

/**
 * Excepción: Tag no encontrado
 * Se lanza cuando el tag solicitado no existe
 */
export class TagNotFoundException extends AppException {
  constructor(tagId: string) {
    super(ErrorCode.TAG_NOT_FOUND, `Tag with ID "${tagId}" not found`, HttpStatus.NOT_FOUND, {
      tagId,
    });
  }
}

/**
 * Excepción: Tag ya existe
 * Se lanza cuando intentan crear un tag con un nombre que ya existe
 */
export class TagAlreadyExistsException extends AppException {
  constructor(name: string) {
    super(
      ErrorCode.TAG_ALREADY_EXISTS,
      `A tag with the name "${name}" already exists`,
      HttpStatus.CONFLICT,
      { name },
    );
  }
}

/**
 * Excepción: Error al asociar tags
 * Se lanza cuando hay un error al asociar tags a un workflow
 */
export class TagAssociationErrorException extends AppException {
  constructor(reason: string) {
    super(
      ErrorCode.TAG_ASSOCIATION_ERROR,
      `Failed to associate tags: ${reason}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      { reason },
      false,
    );
  }
}

/**
 * Excepción: Tag en uso
 * Se lanza cuando intentan eliminar un tag que está asociado a workflows
 */
export class TagInUseException extends AppException {
  constructor(tagId: string, workflowCount: number) {
    super(
      ErrorCode.TAG_IN_USE,
      `Cannot delete tag "${tagId}". It is currently used by ${workflowCount} workflow(s).`,
      HttpStatus.CONFLICT,
      { tagId, workflowCount },
    );
  }
}
