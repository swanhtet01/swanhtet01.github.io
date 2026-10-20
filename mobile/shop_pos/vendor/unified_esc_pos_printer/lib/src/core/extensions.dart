extension EscPosStringExt on String {
  /// Split the string into chunks of [length] characters.
  ///
  /// If [ignoreEmpty] is true, whitespace-only chunks are omitted.
  List<String> splitByLength(int length, {bool ignoreEmpty = false}) {
    final List<String> pieces = [];
    for (int i = 0; i < this.length; i += length) {
      final int end = (i + length).clamp(0, this.length);
      String piece = substring(i, end);
      if (ignoreEmpty) {
        piece = piece.replaceAll(RegExp(r'\s+'), '');
      }
      pieces.add(piece);
    }
    return pieces;
  }
}

extension EscPosIntListExt on List<int> {
  /// Split the byte list into chunks of [length] bytes.
  List<List<int>> splitByLength(int length, {bool ignoreEmpty = false}) {
    final List<List<int>> pieces = [];
    for (int i = 0; i < this.length; i += length) {
      final int end = (i + length).clamp(0, this.length);
      pieces.add(sublist(i, end));
    }
    return pieces;
  }
}
