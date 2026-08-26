import React from "react";
import { Text, TextProps, StyleSheet, TextStyle } from "react-native";
import { typography, TypographyVariant, colors, ColorToken } from "../theme";

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  weight?: "regular" | "medium" | "semibold";
  color?: string | ColorToken;
  align?: "left" | "center" | "right";
  style?: TextStyle | TextStyle[];
}

export const AppText: React.FC<AppTextProps> = ({
  children,
  variant = "body",
  weight,
  color,
  align,
  style,
  ...props
}) => {
  const typographyStyle = typography[variant] || typography.body;

  let resolvedColor: string = colors.textPrimary;
  if (color) {
    resolvedColor = (colors as Record<string, string>)[color] || color;
  }

  const weightOverride = weight ? weightMap[weight] : undefined;

  return (
    <Text
      style={[
        styles.base,
        typographyStyle,
        weightOverride && { fontWeight: weightOverride },
        { color: resolvedColor },
        align ? { textAlign: align } : undefined,
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const weightMap = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
};

const styles = StyleSheet.create({
  base: {
    fontFamily: "System",
    includeFontPadding: false,
  },
});
