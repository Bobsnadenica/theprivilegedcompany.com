import 'dart:math' as math;

class StatFormatters {
  static String wholeNumber(int value) {
    final sign = value < 0 ? '-' : '';
    final digits = value.abs().toString();
    final buffer = StringBuffer();

    for (var index = 0; index < digits.length; index++) {
      final reverseIndex = digits.length - index;
      buffer.write(digits[index]);
      if (reverseIndex > 1 && reverseIndex % 3 == 1) {
        buffer.write(',');
      }
    }

    return '$sign$buffer';
  }

  static String compactCount(int value) {
    final absValue = value.abs();
    if (absValue >= 1000000) {
      return '${(value / 1000000).toStringAsFixed(absValue >= 10000000 ? 0 : 1)}M';
    }
    if (absValue >= 1000) {
      return '${(value / 1000).toStringAsFixed(absValue >= 10000 ? 0 : 1)}k';
    }
    return wholeNumber(value);
  }

  static String distanceKm(double kilometers, {int fractionDigits = 2}) {
    return '${kilometers.toStringAsFixed(fractionDigits)} km';
  }

  static String percent(
    double value, {
    int fractionDigits = 6,
    int maxFractionDigits = 12,
  }) {
    if (!value.isFinite) {
      return '0%';
    }

    final normalized = value == 0 ? 0.0 : value;
    var digits = fractionDigits < 0 ? 0 : fractionDigits;
    final cappedMax = maxFractionDigits < digits ? digits : maxFractionDigits;

    final absValue = normalized.abs();
    if (absValue > 0) {
      final leadingZeroDigits = (-math.log(absValue) / math.ln10).ceil();
      final precisionForTinyValue = leadingZeroDigits + 1;
      if (precisionForTinyValue > digits) {
        digits = precisionForTinyValue > cappedMax
            ? cappedMax
            : precisionForTinyValue;
      }
    }

    final formatted = normalized.toStringAsFixed(digits);
    if (normalized > 0 && double.parse(formatted) == 0 && digits >= cappedMax) {
      return '<${(1 / _powerOfTen(cappedMax)).toStringAsFixed(cappedMax)}%';
    }

    return '$formatted%';
  }

  static double _powerOfTen(int exponent) {
    var result = 1.0;
    for (var index = 0; index < exponent; index++) {
      result *= 10;
    }
    return result;
  }
}
