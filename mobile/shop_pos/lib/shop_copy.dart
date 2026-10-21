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
