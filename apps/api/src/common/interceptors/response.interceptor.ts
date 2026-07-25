import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RequestWithUser } from '../decorators/current-user.decorator';

export interface SuccessResponseBody<T> {
  success: true;
  data: T;
  correlationId?: string;
}

/**
 * Wraps every successful response in a consistent envelope. Paginated payloads keep
 * their own `items`/`meta` shape inside `data`, so clients have one unwrap rule.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponseBody<T> | T> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponseBody<T> | T> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    return next.handle().pipe(
      map((data) => {
        // 204 and streamed responses have nothing to wrap.
        if (data === undefined || data === null) return data as T;
        return { success: true, data, correlationId: request.correlationId };
      }),
    );
  }
}
