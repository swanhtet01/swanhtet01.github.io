import '../models/printer_connection_state.dart';

/// Base class for all unified_esc_pos_printer errors.
sealed class PrinterException implements Exception {
  const PrinterException(this.message, {this.cause});

  final String message;

  /// The underlying error or exception that caused this, if any.
  final Object? cause;

  @override
  String toString() =>
      '$runtimeType: $message${cause != null ? ' (cause: $cause)' : ''}';
}

/// The requested printer device was not found or has disappeared.
class PrinterNotFoundException extends PrinterException {
  const PrinterNotFoundException(super.message, {super.cause});
}

/// Connection attempt failed or timed out.
class PrinterConnectionException extends PrinterException {
  const PrinterConnectionException(super.message, {super.cause});
}

/// An operation was attempted from an invalid state.
class PrinterStateException extends PrinterException {
  const PrinterStateException(
    super.message, {
    required this.currentState,
    required this.requiredState,
    super.cause,
  });

  final PrinterConnectionState currentState;
  final PrinterConnectionState requiredState;
}

/// Writing data to the printer failed.
class PrinterWriteException extends PrinterException {
  const PrinterWriteException(super.message, {super.cause});
}

/// The OS denied a required permission (Bluetooth, USB, etc.).
class PrinterPermissionException extends PrinterException {
  const PrinterPermissionException(super.message, {super.cause});
}

/// A scan failed or completed with no results.
class PrinterScanException extends PrinterException {
  const PrinterScanException(super.message, {super.cause});
}
