String shopCopy(bool myanmar, String english, String burmese) {
  return myanmar ? burmese : english;
}

String shopNumber(int value, {bool myanmar = false}) {
  final negative = value < 0;
  final digits = (negative ? -value : value).toString();
  final output = StringBuffer();
  const burmeseDigits = '၀၁၂၃၄၅၆၇၈၉';
  for (var index = 0; index < digits.length; index++) {
    if (index > 0 && (digits.length - index) % 3 == 0) output.write(',');
    final digit = digits[index];
    output.write(myanmar ? burmeseDigits[int.parse(digit)] : digit);
  }
  return '${negative ? '-' : ''}$output';
}

String shopMmk(int amount, {bool myanmar = false}) =>
    '${shopNumber(amount, myanmar: myanmar)} ${myanmar ? 'ကျပ်' : 'MMK'}';

const shopMaximumMmk = 200000000000000;

/// Parses one non-negative whole-MMK amount without changing its meaning.
///
/// Myanmar digits are accepted, but grouping or decimal punctuation is not
/// silently removed. Callers can therefore show an invalid pasted value back
/// to the operator instead of recording a different number.
int? parseShopMmkInput(String? value, {int maximum = shopMaximumMmk}) {
  final input = value?.trim() ?? '';
  if (input.isEmpty || maximum < 0 || !RegExp(r'^[0-9၀-၉]+$').hasMatch(input)) {
    return null;
  }
  final normalized = String.fromCharCodes(
    input.runes.map(
      (digit) =>
          digit >= 0x1040 && digit <= 0x1049 ? digit - 0x1040 + 0x30 : digit,
    ),
  );
  final amount = int.tryParse(normalized);
  return amount != null && amount <= maximum ? amount : null;
}
