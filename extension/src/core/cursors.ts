/** The arrow tip and every other cursor's center share the 19,19 hit point. */
export const cursorPaths = {
  arrow: "M19 19 V32 L23 28 L27 36 L31 34 L27 26 H33 Z",
  crosshair: "M19 7 V13 M19 25 V31 M7 19 H13 M25 19 H31",
  spark: "M19 8 Q21 17 30 19 Q21 21 19 30 Q17 21 8 19 Q17 17 19 8 Z",
} as const;
