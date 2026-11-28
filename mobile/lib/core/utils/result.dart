import 'package:flutter/foundation.dart';

/// Functional Result type inspired by the official Flutter Compass App architecture.
/// Forces explicit handling of success and failure without uncaught UI exceptions.
sealed class Result<T> {
  const Result();

  const factory Result.ok(T value) = Ok<T>;
  const factory Result.error(Object error) = Error<T>;

  bool get isOk => this is Ok<T>;
  bool get isError => this is Error<T>;

  T? get valueOrNull => switch (this) {
        Ok<T>(:final value) => value,
        Error<T>() => null,
      };

  Object? get errorOrNull => switch (this) {
        Ok<T>() => null,
        Error<T>(:final error) => error,
      };
}

final class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

final class Error<T> extends Result<T> {
  const Error(this.error);
  final Object error;
}

/// Reusable async command lifecycle (Compass App MVVM pattern).
/// Encapsulates running, completed, and error states for UI actions.
abstract class Command<T> extends ChangeNotifier {
  bool _running = false;
  Result<T>? _result;

  bool get running => _running;
  bool get completed => _result is Ok<T>;
  bool get hasError => _result is Error<T>;
  Result<T>? get result => _result;

  void clearResult() {
    _result = null;
    notifyListeners();
  }

  Future<Result<T>> _execute(Future<Result<T>> Function() action) async {
    if (_running) {
      return _result ?? Result.error(StateError('Action already running'));
    }
    _running = true;
    _result = null;
    notifyListeners();

    try {
      _result = await action();
    } catch (error) {
      _result = Result.error(error);
    } finally {
      _running = false;
      notifyListeners();
    }
    return _result!;
  }
}

final class Command0<T> extends Command<T> {
  Command0(this._action);
  final Future<Result<T>> Function() _action;

  Future<Result<T>> execute() => _execute(_action);
}

final class Command1<T, A> extends Command<T> {
  Command1(this._action);
  final Future<Result<T>> Function(A argument) _action;

  Future<Result<T>> execute(A argument) => _execute(() => _action(argument));
}
