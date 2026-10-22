import 'dart:convert';
import 'dart:typed_data';

const String _alphabet = '0123456789abcdef';

/// Shared instance of [HexCodec].
const hex = HexCodec();

/// Codec that converts between byte lists and hexadecimal strings.
class HexCodec extends Codec<List<int>, String> {
  const HexCodec();

  @override
  Converter<List<int>, String> get encoder => const HexEncoder();

  @override
  Converter<String, List<int>> get decoder => const HexDecoder();
}

/// Encodes a byte list to a lowercase hex string.
class HexEncoder extends Converter<List<int>, String> {
  final bool upperCase;
  const HexEncoder({this.upperCase = false});

  @override
  String convert(List<int> bytes) {
    final StringBuffer buffer = StringBuffer();

    for (final int part in bytes) {
      if (part & 0xff != part) {
        throw FormatException('Non-byte integer detected: $part');
      }

      buffer.write('${part < 16 ? '0' : ''}${part.toRadixString(16)}');
    }

    return upperCase ? buffer.toString().toUpperCase() : buffer.toString();
  }
}

/// Decodes a hex string to a byte list.
class HexDecoder extends Converter<String, List<int>> {
  const HexDecoder();

  @override
  List<int> convert(String hex) {
    String str = hex.replaceAll(' ', '').toLowerCase();
    if (str.length.isOdd) str = '0$str';

    final Uint8List result = Uint8List(str.length ~/ 2);

    for (int i = 0; i < result.length; i++) {
      final int first = _alphabet.indexOf(str[i * 2]);
      final int second = _alphabet.indexOf(str[i * 2 + 1]);

      if (first == -1 || second == -1) {
        throw FormatException('Non-hex character in: $hex');
      }

      result[i] = (first << 4) + second;
    }

    return result;
  }
}
