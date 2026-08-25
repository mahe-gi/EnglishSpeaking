import React from "react";
import { Text, TextProps, StyleSheet } from "react-native";

export interface AppTextProps extends TextProps {
  variant?: "title" | "subtitle" | "body" | "caption";
  weight?: "regular" | "medium" | "semibold";
  color?: string;
}

export const AppText: React.FC<AppTextProps> = ({
  children,
  variant = "body",
  weight = "regular",
  color = "#111827",
  style,
  ...props
}) => {
  return (
    <Text
      style={[
        styles.base,
        styles[variant],
        styles[weight],
        { color },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    fontFamily: "System",
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
  },
  regular: {
    fontWeight: "400",
  },
  medium: {
    fontWeight: "500",
  },
  semibold: {
    fontWeight: "600",
  },
});
