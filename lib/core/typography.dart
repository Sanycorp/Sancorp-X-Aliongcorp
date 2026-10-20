import 'package:flutter/material.dart';

/// Type system: Chakra Petch for interface steel, Share Tech Mono for data.
class T {
  const T._();

  static const String display = 'ChakraPetch';
  static const String mono = 'ShareTechMono';

  /// Oversized display / hero title.
  static TextStyle hero(double size, Color color) => TextStyle(
        fontFamily: display,
        fontSize: size,
        height: 0.96,
        letterSpacing: -0.4,
        fontWeight: FontWeight.w700,
        color: color,
      );

  /// Section / panel title.
  static TextStyle title(double size, Color color,
          {FontWeight weight = FontWeight.w700}) =>
      TextStyle(
        fontFamily: display,
        fontSize: size,
        height: 1.1,
        letterSpacing: 0.4,
        fontWeight: weight,
        color: color,
      );

  /// Micro label — uppercase, tracked.
  static TextStyle label(Color color,
          {double size = 10.5, double tracking = 1.8}) =>
      TextStyle(
        fontFamily: display,
        fontSize: size,
        height: 1.0,
        letterSpacing: tracking,
        fontWeight: FontWeight.w600,
        color: color,
      );

  /// Body copy.
  static TextStyle body(Color color,
          {double size = 13.0, double height = 1.35, FontWeight? weight}) =>
      TextStyle(
        fontFamily: display,
        fontSize: size,
        height: height,
        letterSpacing: 0.15,
        fontWeight: weight ?? FontWeight.w400,
        color: color,
      );

  /// Numeric / telemetry readout.
  static TextStyle metric(Color color,
          {double size = 13.0, double tracking = 0.6}) =>
      TextStyle(
        fontFamily: mono,
        fontSize: size,
        height: 1.0,
        letterSpacing: tracking,
        color: color,
      );
}
